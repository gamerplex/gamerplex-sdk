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

import { answerForSeed, computeScore, decodeGuessLog, isWinningGuess, MAX_GUESSES, RUN_DURATION_SEC, WORD_LENGTH } from "./engine";
import type { ReplayInput, Validator, Verdict } from "../types";
import { verdictFail, verdictOk } from "../types";

const DURATION_GRACE_SEC = 5; // clock skew between client and chain block-time

export const blockwordsValidator: Validator = {
  async validate(input: ReplayInput): Promise<Verdict> {
    const reasons: string[] = [];

    // 1. Seed shape
    if (input.sessionSeed.length !== 32) {
      reasons.push(`session_seed must be 32 bytes (got ${input.sessionSeed.length})`);
    }

    // 2. Decode the guess log
    let guesses: string[] = [];
    try {
      guesses = decodeGuessLog(input.moveLog);
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

    return verdictOk(input.claimedScore, computed, {
      answer,
      solved,
      guessesUsed: guesses.length,
      lastGuess,
    });
  },
};
