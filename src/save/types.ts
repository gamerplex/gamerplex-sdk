// Standard save-flow model shared by every Gamerplex game.
// See ENGINEERING/GAME_SDK_AND_SAVE_FLOW_DESIGN.md.

/** Where a finished game's result is persisted. */
export enum SaveTier {
  /** Tier 1 — web2 "trust me bro" DB save. Free. */
  DB = "db",
  /** Tier 2 — arcade on-chain score-commit (record_payment + submit_score, replay-verified). */
  OnchainScore = "onchain_score",
  /** Tier 3 — live on-chain match via the shared `arena` contract. */
  Live = "live",
}

/** A start-page play mode (maps to a tier + the contract(s) it uses). */
export type GameMode = "casual" | "ranked" | "live" | "wager";

/** Per-game capability flags that gate which modes/tiers are offered. */
export interface GameManifest {
  gameId: number;
  slug: string;
  /** Registered with the shared `arena` contract → Live PvP available. */
  supportsArena?: boolean;
  /** Wagering (cm-sdk) enabled → Wager mode available. */
  supportsWager?: boolean;
}

/** A finished game's payload, handed to saveResult. */
export interface GameResult {
  score: number;
  /** Deterministic session seed (for on-chain replay verification). */
  seed?: Uint8Array;
  /** Move log (Tier 2 replay-verify; Tier 3 action log). */
  moveLog?: Uint8Array;
  variant?: string;
  meta?: string;
}

export interface SaveOutcome {
  tier: SaveTier;
  ok: boolean;
  /** Tx signature (on-chain tiers) or row id (web2). */
  ref?: string;
  error?: string;
}

/** One async persister per tier; the app wires arcade/arena into these. */
export interface SaveHandlers {
  db?: (r: GameResult, m: GameManifest) => Promise<SaveOutcome>;
  onchainScore?: (r: GameResult, m: GameManifest) => Promise<SaveOutcome>;
  live?: (r: GameResult, m: GameManifest) => Promise<SaveOutcome>;
}
