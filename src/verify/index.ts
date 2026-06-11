// @gamerplex/sdk/verify — replay validation framework for Gamerplex Arcade.
//
// Verifies that a GPX5 score memo on chain corresponds to a legitimate game
// session. Used by the resolver for invisible auto-verification, by game
// devs for local self-tests, and by independent auditors.
//
// All saves get verified for free — there's no paid verification tier.

import { blockwordsValidator } from "./blockwords/validator";
import { chessValidator } from "./chess/validator";
import type { ReplayInput, Validator, Verdict } from "./types";

export type { ReplayInput, Validator, Verdict };
export { verdictFail, verdictOk } from "./types";

// Per-game registry. Future: cyber-snake, flipball.
const VALIDATORS: Record<string, Validator | undefined> = {
  blockwords: blockwordsValidator,
  "chess-puzzles": chessValidator,
  "magic-chess": chessValidator, // alias if slug variant lands
};

/**
 * Dispatch a replay to the right per-game validator.
 * Returns valid=false with reason "no validator" if the game doesn't have one yet —
 * the resolver should treat that as "unverified, no-fault" (NOT as a cheat).
 */
export async function verifyReplay(input: ReplayInput): Promise<Verdict> {
  const validator = VALIDATORS[input.gameSlug];
  if (!validator) {
    return {
      valid: false,
      reasons: [`no validator registered for game "${input.gameSlug}"`],
      claimedScore: input.claimedScore,
      computedScore: null,
      details: { reason: "no-validator" },
    };
  }
  return validator.validate(input);
}

/** Returns the list of game slugs with shipped validators. */
export function supportedGames(): string[] {
  return Object.keys(VALIDATORS);
}
