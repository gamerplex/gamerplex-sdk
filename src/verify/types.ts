export interface ReplayInput {
  gameSlug: string;
  player: string;
  claimedScore: number;
  moveLog: Uint8Array;
  sessionSeed: Uint8Array;
  durationSec: number;
  variant: string;
  meta: string;
}

export interface Verdict {
  valid: boolean;
  reasons: string[];
  claimedScore: number;
  computedScore: number | null;
  details?: Record<string, unknown>;
}

export interface Validator {
  validate(input: ReplayInput): Promise<Verdict>;
}

export function verdictFail(claimedScore: number, ...reasons: string[]): Verdict {
  return { valid: false, reasons, claimedScore, computedScore: null };
}

export function verdictOk(claimedScore: number, computedScore: number, details?: Record<string, unknown>): Verdict {
  return { valid: true, reasons: [], claimedScore, computedScore, details };
}
