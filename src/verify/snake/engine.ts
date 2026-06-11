export const GRID = 32;
export const MAX_LEN = 256;
export const START_LEN = 3;
export const TICK_MS = 140;
export const DIR_N = 0, DIR_E = 1, DIR_S = 2, DIR_W = 3;
export const FOOD_STARVATION_TICKS = 210;
export const MAX_MOVE_CHANGES = 130;

export interface SnakeMove { tick: number; dir: number }

export function decodeMoveLog(buf: Uint8Array): SnakeMove[] {
  const n = Math.floor(buf.length / 3);
  const out: SnakeMove[] = [];
  for (let i = 0; i < n; i++) {
    const lo = buf[i * 3];
    const hi = buf[i * 3 + 1];
    const dir = buf[i * 3 + 2];
    out.push({ tick: lo | (hi << 8), dir });
  }
  return out;
}

export function makeRng(seedBytes: Uint8Array): () => number {
  const ZERO = BigInt(0);
  const U64_MASK = BigInt("0xffffffffffffffff");
  const U32_MASK = BigInt("0xffffffff");
  let state = ZERO;
  for (let i = 0; i < 8; i++) {
    state = (state << BigInt(8)) | BigInt(seedBytes[i] || 0);
  }
  if (state === ZERO) state = BigInt("0xdeadbeef");
  return () => {
    state ^= state << BigInt(13);
    state &= U64_MASK;
    state ^= state >> BigInt(7);
    state ^= state << BigInt(17);
    state &= U64_MASK;
    return Number(state & U32_MASK);
  };
}

export function opposite(d: number): number {
  return (d + 2) % 4;
}

function stepDir(pos: number, dir: number): number | null {
  const r = Math.floor(pos / GRID);
  const c = pos % GRID;
  let nr = r, nc = c;
  switch (dir) {
    case DIR_N: nr = r - 1; break;
    case DIR_E: nc = c + 1; break;
    case DIR_S: nr = r + 1; break;
    case DIR_W: nc = c - 1; break;
  }
  if (nr < 0 || nr >= GRID || nc < 0 || nc >= GRID) return null;
  return nr * GRID + nc;
}

export interface SnakeState {
  body: number[];
  headIdx: number;
  len: number;
  dir: number;
  foodPos: number;
  grid: Uint8Array;
  tick: number;
  score: number;
  status: "active" | "crashed";
  ticksSinceLastFood: number;
  rng: () => number;
}

export function freshGame(seed: Uint8Array): SnakeState {
  const rng = makeRng(seed);
  const body = new Array<number>(MAX_LEN).fill(0);
  const grid = new Uint8Array(GRID * GRID);
  const startRow = GRID / 2;
  const startCol = GRID / 4;
  for (let i = 0; i < START_LEN; i++) {
    const pos = startRow * GRID + (startCol - (START_LEN - 1 - i));
    body[i] = pos;
    grid[pos] = 1;
  }
  const headIdx = START_LEN;
  let food = 0;
  for (let attempts = 0; attempts < 50; attempts++) {
    food = rng() % (GRID * GRID);
    if (grid[food] === 0) break;
  }
  return {
    body, headIdx, len: START_LEN, dir: DIR_E, foodPos: food, grid,
    tick: 0, score: 0, status: "active", ticksSinceLastFood: 0, rng,
  };
}

export function tickGame(g: SnakeState): SnakeState {
  if (g.status !== "active") return g;
  if (g.ticksSinceLastFood >= FOOD_STARVATION_TICKS) {
    g.status = "crashed";
    return g;
  }
  const headPos = g.body[(g.headIdx + MAX_LEN - 1) % MAX_LEN];
  const nextPos = stepDir(headPos, g.dir);
  if (nextPos === null) { g.status = "crashed"; return g; }
  const eating = nextPos === g.foodPos;
  const tailIdx = (g.headIdx + MAX_LEN - g.len) % MAX_LEN;
  const tailPos = g.body[tailIdx];
  if (g.grid[nextPos] === 1 && !(nextPos === tailPos && !eating)) {
    g.status = "crashed";
    return g;
  }
  g.body[g.headIdx] = nextPos;
  g.headIdx = (g.headIdx + 1) % MAX_LEN;
  g.grid[nextPos] = 1;
  if (eating) {
    g.len++;
    g.score += 10 + Math.floor(g.len / 5);
    g.ticksSinceLastFood = 0;
    let newFood = g.foodPos;
    for (let attempts = 0; attempts < 200; attempts++) {
      const candidate = g.rng() % (GRID * GRID);
      if (g.grid[candidate] === 0) { newFood = candidate; break; }
    }
    g.foodPos = newFood;
    if (g.len > MAX_LEN) g.len = MAX_LEN;
  } else {
    g.grid[tailPos] = 0;
    g.ticksSinceLastFood++;
  }
  g.tick++;
  return g;
}
