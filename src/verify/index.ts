import { blockwordsValidator } from "./blockwords/validator";
import { chessValidator } from "./chess/validator";
import type { ReplayInput, Validator, Verdict } from "./types";

export type { ReplayInput, Validator, Verdict };
export { verdictFail, verdictOk } from "./types";

const VALIDATORS: Record<string, Validator | undefined> = {
  blockwords: blockwordsValidator,
  "chess-puzzles": chessValidator,
  "magic-chess": chessValidator,
};

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

export function supportedGames(): string[] {
  return Object.keys(VALIDATORS);
}
