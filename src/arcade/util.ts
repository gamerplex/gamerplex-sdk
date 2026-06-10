// SHA-256 helper. Web Crypto preferred where available; Node crypto fallback.
// Browser consumers via Vite/webpack need a Node polyfill plugin for the
// fallback path (flipball ships vite-plugin-node-polyfills already).

export async function sha256(data: Uint8Array): Promise<Uint8Array> {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const subtle = (globalThis as any)?.crypto?.subtle;
  if (subtle) {
    const buf = await subtle.digest("SHA-256", data);
    return new Uint8Array(buf);
  }
  const nodeCrypto = await import("crypto");
  const h = nodeCrypto.createHash("sha256");
  h.update(data);
  return new Uint8Array(h.digest());
}
