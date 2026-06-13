import { Chess } from "chess.js";
import { decodeMoveLog, idxToAlg, promotionCodeToSAN, type DecodedMove } from "./decoder";
import { computeScore, TIMER_PRESETS } from "./score";
import type { ReplayInput, Validator, Verdict } from "../types";
import { verdictFail, verdictOk } from "../types";

const DEFAULT_BOT_ELO = 1500;
const DEFAULT_TURN_TIME = 5;
const MAX_BOT_ELO = 2400;
const MIN_DELTA_MS = 200;
const MIN_MEDIAN_DELTA_SEC = 0.5;
const DURATION_DEVIATION_TOL_SEC = 10;

interface VariantParsed {
  botElo: number | null;
  turnTimeSec: number | null;
}

function parseVariant(variant: string): VariantParsed {
  // Format: "<botId>|<turnTimeSec>" e.g. "zero|5". Older saves: "default".
  const parts = variant.split("|");
  if (parts.length < 2) return { botElo: null, turnTimeSec: null };
  const botId = parts[0].toLowerCase();
  const turnTime = parseInt(parts[1], 10);
  const ELO_BY_ID: Record<string, number> = {
    molty: 600, coral: 900, shadow: 1200, neon: 1600, quantum: 2000, zero: 2400,
  };
  const botElo = ELO_BY_ID[botId] ?? null;
  const validTimer = TIMER_PRESETS.find(p => p.sec === turnTime);
  return { botElo, turnTimeSec: validTimer ? turnTime : null };
}

function median(xs: number[]): number {
  if (xs.length === 0) return 0;
  const sorted = [...xs].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 0 ? (sorted[mid - 1] + sorted[mid]) / 2 : sorted[mid];
}

function statisticalTimingCheck(moves: DecodedMove[], claimedDuration: number): string[] {
  // Only the player's moves are interesting for timing analysis — bot
  // moves are deterministic Stockfish output (delta is local engine time).
  // Player moves are at index 0, 2, 4, ... (white plays first).
  const playerDeltas = moves
    .filter((_, i) => i % 2 === 0)
    .map(m => m.deltaSec)
    .filter(d => Number.isFinite(d));

  if (playerDeltas.length === 0) return [];

  const reasons: string[] = [];
  const minDelta = Math.min(...playerDeltas);
  const med = median(playerDeltas);
  const sum = playerDeltas.reduce((a, b) => a + b, 0);

  // Sub-human reaction (delta encoded as seconds; if any move was <0.2s
  // it'd be encoded as 0 since we use u8 sec resolution; but flag if too
  // many zeros, which means bot-instant moves).
  const zeroDeltas = playerDeltas.filter(d => d === 0).length;
  if (zeroDeltas > playerDeltas.length / 2) {
    reasons.push(`${zeroDeltas}/${playerDeltas.length} player moves at 0s delta — too many sub-human reactions`);
  }
  if (minDelta * 1000 < MIN_DELTA_MS && zeroDeltas === 0) {
    reasons.push(`minimum player delta ${minDelta}s under ${MIN_DELTA_MS}ms human reaction floor`);
  }

  // Uniform (all identical) = scripted bot.
  if (playerDeltas.length >= 3 && playerDeltas.every(d => d === playerDeltas[0])) {
    reasons.push(`all ${playerDeltas.length} player deltas identical (${playerDeltas[0]}s) — scripted pattern`);
  }

  // Median sanity.
  if (med < MIN_MEDIAN_DELTA_SEC) {
    reasons.push(`median player delta ${med}s below ${MIN_MEDIAN_DELTA_SEC}s minimum`);
  }

  // Total-sum sanity vs claimed duration (counting both player and bot deltas).
  const allSum = moves.map(m => m.deltaSec).filter(d => Number.isFinite(d)).reduce((a, b) => a + b, 0);
  if (Math.abs(allSum - claimedDuration) > DURATION_DEVIATION_TOL_SEC) {
    reasons.push(`sum(deltas)=${allSum}s diverges from claimed duration ${claimedDuration}s by >${DURATION_DEVIATION_TOL_SEC}s`);
  }

  return reasons;
}

export const chessValidator: Validator = {
  async validate(input: ReplayInput): Promise<Verdict> {
    const reasons: string[] = [];

    if (input.sessionSeed.length !== 32) {
      reasons.push(`session_seed must be 32 bytes (got ${input.sessionSeed.length})`);
    }

    // 1. Decode move log
    let moves: DecodedMove[];
    let version: 1 | 2;
    try {
      const decoded = decodeMoveLog(input.moveLog);
      moves = decoded.moves;
      version = decoded.version;
    } catch (e: any) {
      return verdictFail(input.claimedScore, `decode failed: ${e?.message ?? e}`);
    }
    if (moves.length === 0) return verdictFail(input.claimedScore, "empty move log");

    // 2. Replay each move through chess.js
    const chess = new Chess();
    for (let i = 0; i < moves.length; i++) {
      const m = moves[i];
      try {
        const fromAlg = idxToAlg(m.from);
        const toAlg = idxToAlg(m.to);
        const promotion = promotionCodeToSAN(m.promotion);
        const result = chess.move({ from: fromAlg, to: toAlg, ...(promotion ? { promotion } : {}) });
        if (!result) reasons.push(`move[${i}] ${fromAlg}${toAlg} illegal in position`);
      } catch (e: any) {
        reasons.push(`move[${i}] ${idxToAlg(m.from)}${idxToAlg(m.to)} rejected: ${e?.message ?? e}`);
        break; // can't safely continue with corrupt state
      }
    }
    if (reasons.length > 0) return verdictFail(input.claimedScore, ...reasons);

    // 3. Determine final outcome
    let won: boolean | null;
    if (chess.isCheckmate()) {
      // Player is white (move 0). Whoever's turn it would be has lost.
      won = chess.turn() === "b"; // bot's turn = bot got mated by player's last move
    } else if (chess.isStalemate() || chess.isInsufficientMaterial() || chess.isThreefoldRepetition() || chess.isDraw()) {
      won = null; // draw
    } else {
      // Audit P1-7: incomplete games (no terminal checkmate/stalemate in log)
      // are NOT wins. Previously this returned won=null which scored as draw
      // (250 points) — that's a free 250 per quit. Treat as loss (0 points).
      won = false;
    }

    // 4. Recompute score
    const variant = parseVariant(input.variant);
    const botElo = variant.botElo ?? DEFAULT_BOT_ELO;
    const turnTime = variant.turnTimeSec ?? DEFAULT_TURN_TIME;
    const computed = computeScore(botElo, won, moves.length, input.durationSec, turnTime);

    // Audit P1-7: if variant didn't parse, require an ACTUAL winning game
    // (checkmate confirmed by chess.js, won=true) AND upper-bound the score.
    // Previously this allowed unwinning games to score up to 7490 via just
    // an upper-bound check.
    if (variant.botElo == null || variant.turnTimeSec == null) {
      if (won !== true) {
        return verdictFail(
          input.claimedScore,
          `variant unparseable AND game not won (won=${won}); cannot accept claimed_score ${input.claimedScore}`,
        );
      }
      const maxPossible = computeScore(MAX_BOT_ELO, true, 1, 1, 3);
      if (input.claimedScore > maxPossible) {
        return verdictFail(
          input.claimedScore,
          `variant unparseable; claimed_score ${input.claimedScore} exceeds upper bound ${maxPossible}`,
        );
      }
    } else if (computed !== input.claimedScore) {
      return {
        ...verdictFail(
          input.claimedScore,
          `score mismatch: claimed=${input.claimedScore} computed=${computed} (bot_elo=${botElo}, won=${won}, dur=${input.durationSec}s, timer=${turnTime}s)`,
        ),
        computedScore: computed,
      };
    }

    // 5. Statistical timing (only when v2 / delta-encoded)
    if (version === 2) {
      const timingReasons = statisticalTimingCheck(moves, input.durationSec);
      if (timingReasons.length > 0) {
        return verdictFail(input.claimedScore, ...timingReasons);
      }
    }

    // 6. Duration sanity
    if (input.durationSec < 0) {
      return verdictFail(input.claimedScore, `duration_sec negative: ${input.durationSec}`);
    }

    return verdictOk(input.claimedScore, computed, {
      moveCount: moves.length,
      won,
      checkmate: chess.isCheckmate(),
      stalemate: chess.isStalemate(),
      moveLogVersion: version,
      botElo,
      turnTimeSec: turnTime,
      fen: chess.fen(),
    });
  },
};
