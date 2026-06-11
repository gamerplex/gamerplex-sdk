import { WORDS } from "./words";

export const LetterState = {
  GREEN: 2,
  YELLOW: 1,
  GREY: 0,
} as const;
export type LetterStateValue =
  (typeof LetterState)[keyof typeof LetterState];

export const MAX_GUESSES = 6;
export const RUN_DURATION_SEC = 90;
export const WORD_LENGTH = 5;

// xorshift64 — first 8 bytes fold into u64; matches resolver verifier.
export function makeRng(seedBytes: Uint8Array): () => number {
  const ZERO = BigInt(0);
  const U64 = BigInt("0xffffffffffffffff");
  const U32 = BigInt("0xffffffff");
  let state = ZERO;
  for (let i = 0; i < 8; i++) {
    state = (state << BigInt(8)) | BigInt(seedBytes[i] || 0);
  }
  if (state === ZERO) state = BigInt("0xdeadbeef");
  return () => {
    state ^= state << BigInt(13);
    state &= U64;
    state ^= state >> BigInt(7);
    state ^= state << BigInt(17);
    state &= U64;
    return Number(state & U32);
  };
}

export function nextWordIndex(seed: Uint8Array): number {
  const rng = makeRng(seed);
  rng();
  return rng() % WORDS.length;
}

export function answerForSeed(seed: Uint8Array): string {
  return WORDS[nextWordIndex(seed)];
}

export function gradeGuess(answer: string, guess: string): LetterStateValue[] {
  const ans = answer.toUpperCase();
  const g = guess.toUpperCase();
  if (ans.length !== WORD_LENGTH || g.length !== WORD_LENGTH) {
    throw new Error(
      `gradeGuess: both answer and guess must be ${WORD_LENGTH} letters`,
    );
  }
  const states: LetterStateValue[] = new Array(WORD_LENGTH).fill(LetterState.GREY);
  const answerConsumed: boolean[] = new Array(WORD_LENGTH).fill(false);

  for (let i = 0; i < WORD_LENGTH; i++) {
    if (g[i] === ans[i]) {
      states[i] = LetterState.GREEN;
      answerConsumed[i] = true;
    }
  }
  for (let i = 0; i < WORD_LENGTH; i++) {
    if (states[i] === LetterState.GREEN) continue;
    const ch = g[i];
    for (let j = 0; j < WORD_LENGTH; j++) {
      if (!answerConsumed[j] && ans[j] === ch) {
        states[i] = LetterState.YELLOW;
        answerConsumed[j] = true;
        break;
      }
    }
  }
  return states;
}

export function isWinningGuess(answer: string, guess: string): boolean {
  return answer.toUpperCase() === guess.toUpperCase();
}

export function encodeGuessLog(guesses: string[]): Uint8Array {
  const buf = new Uint8Array(guesses.length * WORD_LENGTH);
  for (let i = 0; i < guesses.length; i++) {
    const g = guesses[i].toUpperCase();
    if (g.length !== WORD_LENGTH) {
      throw new Error(`encodeGuessLog: guess[${i}] must be ${WORD_LENGTH} letters`);
    }
    for (let j = 0; j < WORD_LENGTH; j++) {
      const code = g.charCodeAt(j);
      buf[i * WORD_LENGTH + j] = code >= 65 && code <= 90 ? code : 65;
    }
  }
  return buf;
}

export function decodeGuessLog(buf: Uint8Array): string[] {
  const n = Math.floor(buf.length / WORD_LENGTH);
  const out: string[] = [];
  for (let i = 0; i < n; i++) {
    let s = "";
    for (let j = 0; j < WORD_LENGTH; j++) {
      const code = buf[i * WORD_LENGTH + j];
      s += code >= 65 && code <= 90 ? String.fromCharCode(code) : "A";
    }
    out.push(s);
  }
  return out;
}

export function computeScore(
  solved: boolean,
  guessesUsed: number,
  secondsUsed: number,
): number {
  if (!solved) return 0;
  const base = 1000 - guessesUsed * 100;
  const timeBonus = Math.max(0, 300 - Math.max(0, Math.floor(secondsUsed)));
  return Math.max(0, base + timeBonus);
}
