import type { ReplayInput, Validator, Verdict } from "../types";
import { verdictFail, verdictOk } from "../types";

// Pet Legends Arena Phase A — bounds-only validator. The battle resolution
// runs client-side from (pet_stats, sessionSeed, player_moves); resolver
// replays it via this validator. Same trust posture as flipball/snake:
// reject anything outside plausible bounds, accept inside-bounds scores as-is.
//
// Phase B will swap this for a deterministic replay engine once the on-chain
// PLA contract is deployed and pet stats live on-chain.

const MIN_TURNS = 3;
const MAX_TURNS = 50;
const MAX_SCORE = 1_000_000;
const MIN_DURATION_SEC = 5;
const MAX_DURATION_SEC = 15 * 60;
const MAX_AVG_PTS_PER_SEC = 50_000;

// `continuesUsed` field is repurposed as the turn count for PLA. The arcade
// SDK passes it through unchanged into the GPX5 memo, so the resolver sees
// the same value the client claimed.

export const petLegendsArenaValidator: Validator = {
  async validate(input: ReplayInput): Promise<Verdict> {
    const { claimedScore, durationSec, continuesUsed: turnsUsed } = input;

    if (input.sessionSeed.length !== 32) {
      return verdictFail(claimedScore, `session_seed must be 32 bytes (got ${input.sessionSeed.length})`);
    }
    if (claimedScore < 0 || claimedScore > MAX_SCORE) {
      return verdictFail(claimedScore, `score ${claimedScore} out of bounds [0, ${MAX_SCORE}]`);
    }
    if (durationSec < MIN_DURATION_SEC) {
      return verdictFail(claimedScore, `duration ${durationSec}s below minimum ${MIN_DURATION_SEC}s`);
    }
    if (durationSec > MAX_DURATION_SEC) {
      return verdictFail(claimedScore, `duration ${durationSec}s exceeds maximum ${MAX_DURATION_SEC}s`);
    }
    if (turnsUsed < MIN_TURNS || turnsUsed > MAX_TURNS) {
      return verdictFail(claimedScore, `turns ${turnsUsed} out of bounds [${MIN_TURNS}, ${MAX_TURNS}]`);
    }
    const avgPtsPerSec = claimedScore / Math.max(1, durationSec);
    if (avgPtsPerSec > MAX_AVG_PTS_PER_SEC) {
      return verdictFail(
        claimedScore,
        `avg ${Math.round(avgPtsPerSec)} pts/sec exceeds ceiling ${MAX_AVG_PTS_PER_SEC} (score=${claimedScore}, dur=${durationSec}s)`,
      );
    }

    return verdictOk(claimedScore, claimedScore, {
      mode: "bounds-only",
      turnsUsed,
      avgPtsPerSec: Math.round(avgPtsPerSec),
    });
  },
};
