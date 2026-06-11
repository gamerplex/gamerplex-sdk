import type { ReplayInput, Validator, Verdict } from "../types";
import { verdictFail, verdictOk } from "../types";

const MIN_DURATION_SEC = 5;
const MAX_DURATION_SEC = 30 * 60;
const MAX_SCORE = 100_000_000;
const MAX_AVG_PTS_PER_SEC = 100_000;
const MAX_BALLS_USED = 3;

export const flipballValidator: Validator = {
  async validate(input: ReplayInput): Promise<Verdict> {
    const { claimedScore, durationSec, continuesUsed } = input;

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
    if (continuesUsed < 0 || continuesUsed > MAX_BALLS_USED) {
      return verdictFail(claimedScore, `balls_used ${continuesUsed} out of bounds [0, ${MAX_BALLS_USED}]`);
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
      avgPtsPerSec: Math.round(avgPtsPerSec),
      ballsUsed: continuesUsed,
    });
  },
};
