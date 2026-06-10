// SHA-256 helper — Web Crypto in browser, Node crypto fallback.

export async function sha256(data: Uint8Array): Promise<Uint8Array> {
  if (typeof globalThis.crypto?.subtle !== "undefined") {
    const buf = await globalThis.crypto.subtle.digest("SHA-256", data);
    return new Uint8Array(buf);
  }
  const { createHash } = await import("crypto");
  const h = createHash("sha256");
  h.update(data);
  return new Uint8Array(h.digest());
}
