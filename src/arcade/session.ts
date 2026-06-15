// Open a server-issued play Session for daily / challenge variants. The
// resolver funds + signs the on-chain open_session ix; this helper is just an
// HTTP wrapper. The seed in the response is cryptographically random and
// committed to the Session PDA — submit_score validates it matches.

import { PublicKey } from "@solana/web3.js";

const DEFAULT_RESOLVER = "https://resolver.gamerplex.com";

export interface OpenSessionInput {
  player: PublicKey;
  gameId: number;
  /** Session lifetime in seconds. Default 86400 (1 day). Min 60, max 604800. */
  lifetimeSec?: number;
  /** Override resolver base URL. Defaults to resolver.gamerplex.com. */
  resolverUrl?: string;
}

export interface OpenSessionResult {
  sessionPda: PublicKey;
  seed: Uint8Array;        // 32 bytes — pass to saveScore as sessionSeed
  nonce: string;           // unix-ms as string (u64 doesn't fit in JS number)
  expiresAt: number;       // unix-sec
  tx: string;              // open_session tx sig (for auditing)
}

function hexToBytes(hex: string): Uint8Array {
  const out = new Uint8Array(hex.length / 2);
  for (let i = 0; i < out.length; i++) {
    out[i] = parseInt(hex.substr(i * 2, 2), 16);
  }
  return out;
}

export async function openSession(input: OpenSessionInput): Promise<OpenSessionResult> {
  const url = (input.resolverUrl ?? DEFAULT_RESOLVER) + "/arcade/session/open";
  const r = await fetch(url, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      player: input.player.toBase58(),
      gameId: input.gameId,
      lifetimeSec: input.lifetimeSec,
    }),
  });
  if (!r.ok) {
    let err = `${r.status}`;
    try { err = (await r.json()).error ?? err; } catch {}
    throw new Error(`openSession failed: ${err}`);
  }
  const data = await r.json();
  if (!data?.ok) throw new Error(`openSession failed: ${data?.error ?? "unknown"}`);
  return {
    sessionPda: new PublicKey(data.sessionPda),
    seed: hexToBytes(data.seedHex),
    nonce: data.nonce,
    expiresAt: data.expiresAt,
    tx: data.tx,
  };
}
