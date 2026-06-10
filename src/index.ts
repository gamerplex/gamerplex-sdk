// @gamerplex/sdk — Solana on-chain primitives for game builders.
// See README for the two sub-imports (./arcade and root for wagering).

export { ContentionClient } from "./contention-client";
export { GameSession } from "./game-session";

export type {
  GameplexConfig,
  CreateMatchParams,
  Match,
  MarketState,
  ResolveResult,
  MatchEvent,
} from "./types";

export { CONTENTION_PROGRAM_ID, Outcome, Seeds } from "./constants";

export * as Arcade from "./arcade";
