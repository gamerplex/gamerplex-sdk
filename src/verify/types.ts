// Common interfaces for the @gamerplex/sdk/verify replay validator framework.
//
// Each game has a Validator that takes a ReplayInput (data pulled from a GPX5
// memo on chain) and returns a Verdict. The runner dispatches by gameSlug.
//
// Used by:
//   - resolver (server-side auto-verify on every new GPX5 memo)
//   - game devs (local self-test before submission)
//   - independent auditors (re-verify any leaderboard score from chain data)

export interface ReplayInput {
  /** Game slug as registered in the arcade contract (e.g. "blockwords"). */
  gameSlug: string;
  /** Player wallet pubkey (base58). */
  player: string;
  /** Score the client claimed in submit_score. */
  claimedScore: number;
  /** Raw move log bytes from the GPX5 memo. Per-game encoding. */
  moveLog: Uint8Array;
  /** Deterministic 32-byte session seed from the GPX5 memo. */
  sessionSeed: Uint8Array;
  /** Duration (sec) the client claimed. */
  durationSec: number;
  /** Variant string from the GPX5 memo (e.g. "default", "2026-06-11"). */
  variant: string;
  /** Free-form meta string from the GPX5 memo (may be empty). */
  meta: string;
}

export interface Verdict {
  /** TRUE only if every check passed. */
  valid: boolean;
  /** Sorted list of failure reasons (empty when valid=true). */
  reasons: string[];
  /** Echo of claimedScore for convenience. */
  claimedScore: number;
  /** What the validator recomputed (null if validator could not compute). */
  computedScore: number | null;
  /** Game-specific extras (e.g. {winner, finalPosition} for chess). */
  details?: Record<string, unknown>;
}

export interface Validator {
  /** Run validation. Must be pure + deterministic given the input. */
  validate(input: ReplayInput): Promise<Verdict>;
}

export function verdictFail(claimedScore: number, ...reasons: string[]): Verdict {
  return { valid: false, reasons, claimedScore, computedScore: null };
}

export function verdictOk(claimedScore: number, computedScore: number, details?: Record<string, unknown>): Verdict {
  return { valid: true, reasons: [], claimedScore, computedScore, details };
}
