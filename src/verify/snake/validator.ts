import {
  decodeMoveLog,
  freshGame,
  tickGame,
  opposite,
  MAX_MOVE_CHANGES,
  TICK_MS,
} from "./engine";
import type { ReplayInput, Validator, Verdict } from "../types";
import { verdictFail, verdictOk } from "../types";

const MAX_SIM_TICKS = 100_000;
const DURATION_TOL_SEC = 5;

export const snakeValidator: Validator = {
  async validate(input: ReplayInput): Promise<Verdict> {
    if (input.sessionSeed.length !== 32) {
      return verdictFail(input.claimedScore, `session_seed must be 32 bytes (got ${input.sessionSeed.length})`);
    }

    let moves: ReturnType<typeof decodeMoveLog>;
    try { moves = decodeMoveLog(input.moveLog); }
    catch (e: any) { return verdictFail(input.claimedScore, `decode failed: ${e?.message ?? e}`); }

    if (moves.length > MAX_MOVE_CHANGES) {
      return verdictFail(input.claimedScore, `${moves.length} direction changes exceeds cap ${MAX_MOVE_CHANGES}`);
    }
    for (let i = 0; i < moves.length; i++) {
      if (moves[i].dir < 0 || moves[i].dir > 3) {
        return verdictFail(input.claimedScore, `move[${i}] invalid dir ${moves[i].dir}`);
      }
      if (i > 0 && moves[i].tick <= moves[i - 1].tick) {
        return verdictFail(input.claimedScore, `move[${i}] tick ${moves[i].tick} not monotonic after ${moves[i - 1].tick}`);
      }
    }

    const state = freshGame(input.sessionSeed);
    let nextMoveIdx = 0;
    let safety = 0;
    while (state.status === "active" && safety++ < MAX_SIM_TICKS) {
      if (nextMoveIdx < moves.length && moves[nextMoveIdx].tick === state.tick) {
        const requested = moves[nextMoveIdx].dir;
        if (requested === opposite(state.dir)) {
          return verdictFail(
            input.claimedScore,
            `move[${nextMoveIdx}] tick=${state.tick} dir=${requested} is opposite of current dir ${state.dir} (illegal in honest play)`,
          );
        }
        state.dir = requested;
        nextMoveIdx++;
      }
      tickGame(state);
    }

    if (state.status !== "crashed") {
      return verdictFail(input.claimedScore, `simulation did not terminate within ${MAX_SIM_TICKS} ticks`);
    }

    if (state.score !== input.claimedScore) {
      return {
        ...verdictFail(
          input.claimedScore,
          `score mismatch: claimed=${input.claimedScore} computed=${state.score} (ticks=${state.tick}, len=${state.len})`,
        ),
        computedScore: state.score,
      };
    }

    const expectedDurationSec = Math.floor((state.tick * TICK_MS) / 1000);
    if (Math.abs(expectedDurationSec - input.durationSec) > DURATION_TOL_SEC) {
      return verdictFail(
        input.claimedScore,
        `duration mismatch: claimed=${input.durationSec}s computed=${expectedDurationSec}s (ticks=${state.tick})`,
      );
    }

    return verdictOk(input.claimedScore, state.score, {
      ticks: state.tick,
      finalLength: state.len,
      directionChanges: moves.length,
    });
  },
};
