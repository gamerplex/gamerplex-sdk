// Decode the Magic Chess arcade move log.
//
// v1 format (current): 4 bytes per move — [from, to, promotion, _pad]
// v2 format (delta-encoded): 5 bytes per move — [from, to, promotion, delta_sec, _pad]
//
// Detection: a v2-encoded log is signaled either by length-divisible-by-5
// AND length-NOT-divisible-by-4 (rare collision) OR by a version-byte
// prefix. For backward compat we just check both shapes and pick the one
// that decodes to legal squares (0-63). Conservative.

export interface DecodedMove {
  from: number; // 0-63
  to: number;   // 0-63
  promotion: number; // 0 = none, 2-13 = piece code
  /** Seconds since previous move. NaN if move log is v1 (no deltas). */
  deltaSec: number;
}

const SQUARE_MAX = 63;

function looksValidV1(bytes: Uint8Array): boolean {
  if (bytes.length % 4 !== 0) return false;
  const n = bytes.length / 4;
  for (let i = 0; i < n; i++) {
    if (bytes[i * 4] > SQUARE_MAX || bytes[i * 4 + 1] > SQUARE_MAX) return false;
  }
  return true;
}

function looksValidV2(bytes: Uint8Array): boolean {
  if (bytes.length % 5 !== 0) return false;
  const n = bytes.length / 5;
  for (let i = 0; i < n; i++) {
    if (bytes[i * 5] > SQUARE_MAX || bytes[i * 5 + 1] > SQUARE_MAX) return false;
  }
  return true;
}

export function decodeMoveLog(bytes: Uint8Array): { moves: DecodedMove[]; version: 1 | 2 } {
  // Prefer v2 if it's a valid divisor — v2 is the forward standard.
  if (looksValidV2(bytes) && bytes.length % 4 !== 0) {
    return { moves: decodeV2(bytes), version: 2 };
  }
  // Both v1 and v2 valid (multiples of both 4 and 5, e.g. 20 bytes)?
  // Ambiguous — choose v1 for safety (no false-positive delta data).
  if (looksValidV1(bytes)) {
    return { moves: decodeV1(bytes), version: 1 };
  }
  if (looksValidV2(bytes)) {
    return { moves: decodeV2(bytes), version: 2 };
  }
  throw new Error(
    `move log length ${bytes.length} doesn't match v1 (mod 4) or v2 (mod 5)`
  );
}

function decodeV1(bytes: Uint8Array): DecodedMove[] {
  const n = bytes.length / 4;
  const out: DecodedMove[] = [];
  for (let i = 0; i < n; i++) {
    out.push({
      from: bytes[i * 4],
      to: bytes[i * 4 + 1],
      promotion: bytes[i * 4 + 2],
      deltaSec: NaN,
    });
  }
  return out;
}

function decodeV2(bytes: Uint8Array): DecodedMove[] {
  const n = bytes.length / 5;
  const out: DecodedMove[] = [];
  for (let i = 0; i < n; i++) {
    out.push({
      from: bytes[i * 5],
      to: bytes[i * 5 + 1],
      promotion: bytes[i * 5 + 2],
      deltaSec: bytes[i * 5 + 3],
    });
  }
  return out;
}

const FILES = "abcdefgh";
export function idxToAlg(idx: number): string {
  const file = FILES[idx & 7];
  const rank = (idx >> 3) + 1;
  return `${file}${rank}`;
}

const PROMOTION_TO_SAN: Record<number, "n" | "b" | "r" | "q" | undefined> = {
  6: "n", 7: "n",
  8: "b", 9: "b",
  4: "r", 5: "r",
  10: "q", 11: "q",
};
export function promotionCodeToSAN(code: number): "n" | "b" | "r" | "q" | undefined {
  return PROMOTION_TO_SAN[code];
}
