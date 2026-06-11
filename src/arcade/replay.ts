export interface SubmitReplayResult {
  ok: boolean;
  verified: boolean;
  verdict?: unknown;
  gpx5rSig?: string;
  error?: string;
}

const DEFAULT_RESOLVER = "https://resolver.gamerplex.com";

function bytesToBase64(b: Uint8Array): string {
  if (typeof Buffer !== "undefined") return Buffer.from(b).toString("base64");
  let s = "";
  for (let i = 0; i < b.length; i++) s += String.fromCharCode(b[i]);
  return btoa(s);
}

export async function submitReplay(
  scoreSig: string,
  moveLog: Uint8Array,
  resolverUrl: string = DEFAULT_RESOLVER,
): Promise<SubmitReplayResult> {
  try {
    const r = await fetch(`${resolverUrl}/arcade/submit-replay/${encodeURIComponent(scoreSig)}`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ moveLog: bytesToBase64(moveLog) }),
    });
    if (!r.ok) return { ok: false, verified: false, error: `${r.status}` };
    return await r.json();
  } catch (e: any) {
    return { ok: false, verified: false, error: e?.message ?? String(e) };
  }
}

export function submitReplayFireAndForget(
  scoreSig: string,
  moveLog: Uint8Array,
  resolverUrl?: string,
): void {
  submitReplay(scoreSig, moveLog, resolverUrl).catch(() => {});
}
