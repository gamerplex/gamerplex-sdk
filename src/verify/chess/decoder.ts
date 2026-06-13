export interface DecodedMove {
  from: number;
  to: number;
  promotion: number;
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
  // Audit P1-9: v1 logs contain no delta data and bypass statisticalTimingCheck.
  // Legitimate clients only emit v2 — reject v1 entirely.
  if (!looksValidV2(bytes)) {
    throw new Error(`move log length ${bytes.length} not v2 (mod 5); v1 logs are rejected post-launch`);
  }
  return { moves: decodeV2(bytes), version: 2 };
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
