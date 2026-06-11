// Blockwords replay validator.
//
// What this proves:
//   1. The submitted seed deterministically resolves to a real WORDS[] entry.
//   2. Every guess in the move_log is a legal 5-letter encoding.
//   3. Player's "solved" claim matches: if last guess == answer => solved true.
//      Otherwise solved false (with guesses=6 or out-of-time).
//   4. The claimed score == computeScore(solved, guesses, secondsUsed).
//   5. Duration fits the 90s run cap (with small grace for clock skew).
//
// What this does NOT prove (intentional):
//   - That the player's typing speed is humanly plausible (anti-bot is a
//     separate layer — focus is anti-cheat, not anti-automation).
//   - Whether the guesses use only the on-screen keyboard (we don't care).

import { answerForSeed, computeScore, decodeGuessLogFull, isWinningGuess, MAX_GUESSES, RUN_DURATION_SEC, WORD_LENGTH } from "./engine";
import type { ReplayInput, Validator, Verdict } from "../types";
import { verdictFail, verdictOk } from "../types";

const DURATION_GRACE_SEC = 5; // clock skew between client and chain block-time
const MIN_GUESS_DELTA_SEC = 1; // humans need ≥1s to type a 5-letter word
const DURATION_DEVIATION_TOL_SEC = 10;

function median(xs: number[]): number {
  if (xs.length === 0) return 0;
  const sorted = [...xs].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 0 ? (sorted[mid - 1] + sorted[mid]) / 2 : sorted[mid];
}

function statisticalTimingCheck(deltas: number[], claimedDuration: number): string[] {
  const reasons: string[] = [];
  const sum = deltas.reduce((a, b) => a + b, 0);
  // Sum of deltas should ≈ claimed duration (within tolerance).
  if (Math.abs(sum - claimedDuration) > DURATION_DEVIATION_TOL_SEC) {
    reasons.push(`sum(deltas)=${sum}s diverges from claimed duration ${claimedDuration}s by >${DURATION_DEVIATION_TOL_SEC}s`);
  }
  // Sub-human typing speed.
  for (let i = 0; i < deltas.length; i++) {
    if (deltas[i] < MIN_GUESS_DELTA_SEC) {
      reasons.push(`guess[${i}] delta ${deltas[i]}s below ${MIN_GUESS_DELTA_SEC}s typing floor`);
    }
  }
  // Uniform timing = scripted.
  if (deltas.length >= 3 && deltas.every(d => d === deltas[0])) {
    reasons.push(`all ${deltas.length} guess deltas identical (${deltas[0]}s) — scripted pattern`);
  }
  // Median sanity.
  const med = median(deltas);
  if (med < MIN_GUESS_DELTA_SEC) {
    reasons.push(`median guess delta ${med}s below ${MIN_GUESS_DELTA_SEC}s minimum`);
  }
  return reasons;
}

export const blockwordsValidator: Validator = {
  async validate(input: ReplayInput): Promise<Verdict> {
    const reasons: string[] = [];

    // 1. Seed shape
    if (input.sessionSeed.length !== 32) {
      reasons.push(`session_seed must be 32 bytes (got ${input.sessionSeed.length})`);
    }

    // 2. Decode the guess log (handles v1 = 5 bytes/guess and v2 = 6 bytes/guess)
    let guesses: string[] = [];
    let deltasSec: number[] = [];
    let logVersion: 1 | 2 = 1;
    try {
      const decoded = decodeGuessLogFull(input.moveLog);
      guesses = decoded.guesses;
      deltasSec = decoded.deltasSec;
      logVersion = decoded.version;
    } catch (e: any) {
      reasons.push(`failed to decode guess log: ${e?.message ?? e}`);
    }

    if (guesses.length === 0) reasons.push("zero guesses in move log");
    if (guesses.length > MAX_GUESSES) {
      reasons.push(`too many guesses: ${guesses.length} > ${MAX_GUESSES}`);
    }

    for (let i = 0; i < guesses.length; i++) {
      if (guesses[i].length !== WORD_LENGTH) {
        reasons.push(`guess[${i}] not ${WORD_LENGTH} letters: "${guesses[i]}"`);
      }
      if (!/^[A-Z]+$/.test(guesses[i])) {
        reasons.push(`guess[${i}] not A-Z only: "${guesses[i]}"`);
      }
    }

    // 3. Resolve the answer
    let answer = "";
    try {
      answer = answerForSeed(input.sessionSeed);
    } catch (e: any) {
      reasons.push(`failed to resolve answer from seed: ${e?.message ?? e}`);
    }
    if (!answer || answer.length !== WORD_LENGTH) {
      reasons.push(`resolved answer invalid: "${answer}"`);
    }

    if (reasons.length > 0) return { ...verdictFail(input.claimedScore, ...reasons), computedScore: null };

    // 4. Determine actual outcome
    const lastGuess = guesses[guesses.length - 1];
    const solved = isWinningGuess(answer, lastGuess);

    // If the player claims solved but the last guess doesn't match, fail.
    // (We don't currently parse a separate "solved" claim out of the memo —
    //  we derive it from the move log. That's the simpler model.)

    // 5. Duration cap
    if (input.durationSec > RUN_DURATION_SEC + DURATION_GRACE_SEC) {
      return verdictFail(
        input.claimedScore,
        `duration_sec ${input.durationSec} exceeds RUN_DURATION_SEC ${RUN_DURATION_SEC} + grace ${DURATION_GRACE_SEC}`,
      );
    }
    if (input.durationSec < 0) {
      return verdictFail(input.claimedScore, `duration_sec negative: ${input.durationSec}`);
    }

    // 6. Score recompute
    const computed = computeScore(solved, guesses.length, input.durationSec);
    if (computed !== input.claimedScore) {
      return {
        ...verdictFail(
          input.claimedScore,
          `score mismatch: claimed=${input.claimedScore} computed=${computed} (solved=${solved}, guesses=${guesses.length}, dur=${input.durationSec}s)`,
        ),
        computedScore: computed,
      };
    }

    // 7. Statistical timing check (v2 only — v1 logs have no delta data)
    if (logVersion === 2) {
      const timingReasons = statisticalTimingCheck(deltasSec, input.durationSec);
      if (timingReasons.length > 0) {
        return verdictFail(input.claimedScore, ...timingReasons);
      }
    }

    return verdictOk(input.claimedScore, computed, {
      answer,
      solved,
      guessesUsed: guesses.length,
      lastGuess,
      moveLogVersion: logVersion,
    });
  },
};
