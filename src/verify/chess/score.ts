export const ARCADE_BOTS = [
  { id: "molty",   icon: "🦞", label: "Molty",   elo: 600,  desc: "Just learning, makes mistakes" },
  { id: "coral",   icon: "🪸", label: "Coral",   elo: 900,  desc: "Plays safe, good for warming up" },
  { id: "shadow",  icon: "🥷", label: "Shadow",  elo: 1200, desc: "Club level, punishes blunders" },
  { id: "neon",    icon: "⚡", label: "Neon",    elo: 1600, desc: "Tournament level, fast and sharp" },
  { id: "quantum", icon: "🐡", label: "Quantum", elo: 2000, desc: "Near-master, deep calculation" },
  { id: "zero",    icon: "🛡️", label: "Zero",    elo: 2400, desc: "Grandmaster level. Good luck." },
] as const;

export function botById(id: string | null): typeof ARCADE_BOTS[number] | null {
  if (!id) return null;
  return ARCADE_BOTS.find(b => b.id === id) || null;
}

// Per-move timer presets. Per-move (not per-game) keeps UX simple: one clear
// countdown, no hidden clock management. Labels borrow from chess.com/lichess
// time-class vocabulary even though the standard is per-game there.
export const TIMER_PRESETS = [
  { sec: 3,  label: "Bullet",    icon: "⚡", desc: "hyper-fast" },
  { sec: 5,  label: "Blitz",     icon: "🔥", desc: "fast (default)" },
  { sec: 10, label: "Rapid",     icon: "⚡", desc: "quick" },
  { sec: 30, label: "Standard",  icon: "🧠", desc: "normal" },
  { sec: 60, label: "Classical", icon: "🐢", desc: "thoughtful" },
] as const;

export const DEFAULT_TIMER_SEC = 5;

// Speed-chess scoring.
//   win base       = 1000
//   bot ELO        = + bot.elo            (tougher bot, more points)
//   speed bonus    = + max(0, 60 - dur) * 50
//   pressure bonus = + (60 - turnTimeSec) * 20    (harder timer = more points)
//   loss/draw      = 0 / 250
export function computeScore(
  botElo: number,
  won: boolean | null,
  _movesUsed: number,
  durationSec: number,
  turnTimeSec: number = DEFAULT_TIMER_SEC,
): number {
  if (won === true) {
    const speedBonus = Math.max(0, 60 - durationSec) * 50;
    const pressureBonus = Math.max(0, 60 - turnTimeSec) * 20;
    return 1000 + botElo + speedBonus + pressureBonus;
  }
  if (won === false) return 0;
  return 250; // draw
}

export interface MoveLogEntry { from: number; to: number; promotion: number }

// 4 bytes/move [from,to,promotion,_pad]; cap=50 keeps memo ≤200B under the contract 400B ceiling.
export const MAX_MOVES_INLINE = 50;

export function encodeMoveLog(moves: MoveLogEntry[]): Uint8Array {
  const trimmed = moves.slice(0, MAX_MOVES_INLINE);
  const buf = new Uint8Array(trimmed.length * 4);
  for (let i = 0; i < trimmed.length; i++) {
    const m = trimmed[i];
    buf[i * 4] = m.from & 0xff;
    buf[i * 4 + 1] = m.to & 0xff;
    buf[i * 4 + 2] = m.promotion & 0xff;
    buf[i * 4 + 3] = 0;
  }
  return buf;
}

export function generateSeed(): Uint8Array {
  const s = new Uint8Array(32);
  const g: any = typeof globalThis !== "undefined" ? globalThis : {};
  if (g.crypto?.getRandomValues) {
    g.crypto.getRandomValues(s);
  } else {
    for (let i = 0; i < 32; i++) s[i] = Math.floor(Math.random() * 256);
  }
  return s;
}
