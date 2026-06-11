// @gamerplex/sdk — Solana on-chain primitives for the Gamerplex Arcade.
// Single program surface: gamerplex-arcade (save-scores with multi-token
// payment + $GAME discount + affiliate referrals).
//
// Wagering / prediction markets are a separate product under a separate
// legal entity (contention.market) and will live in their own package
// when that entity forms — not in this SDK.

export * from "./arcade";
export * as Arcade from "./arcade";
export { SDK_VERSION } from "./version";
