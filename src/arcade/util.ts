// SHA-256 helper — Web Crypto in browser, Node crypto fallback.

export async function sha256(data: Uint8Array): Promise<Uint8Array> {
  const g = globalThis as { crypto?: { subtle?: SubtleCrypto } };
  if (g.crypto?.subtle) {
    const buf = await g.crypto.subtle.digest("SHA-256", data);
    return new Uint8Array(buf);
  }
  const nodeCrypto = await import("crypto");
  const h = nodeCrypto.createHash("sha256");
  h.update(data);
  return new Uint8Array(h.digest());
}
