import { PublicKey } from "@solana/web3.js";

/** Contention Markets program ID (devnet + mainnet). */
export const CONTENTION_PROGRAM_ID = new PublicKey(
  "69YfcveAbLbJ5LNERjq6k5wnszfZbXMYVzx2j8Ca1Xo8"
);

/** Outcome codes for 1v1 Direct Settlement. */
export const Outcome = {
  P1_WINS: 0,
  P2_WINS: 1,
  CANCELLED: 255,
} as const;

/** PDA seed prefixes. */
export const Seeds = {
  PROTOCOL_CONFIG: Buffer.from("protocol_config"),
  PARTNER_REGISTRY: Buffer.from("partner_registry"),
  MARKET: Buffer.from("market"),
  VAULT: Buffer.from("vault"),
} as const;
