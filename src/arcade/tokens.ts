// Payment token catalog for gamerplex-arcade v1.4.

import { PublicKey } from "@solana/web3.js";

export type ArcadeNetwork = "mainnet" | "devnet";

export const GAME_MAINNET_MINT = new PublicKey("7TTBUfDomCKBMemv7FF37Tg3y52cRkAxn8vJnvKD4rsE");
export const GAME_DEVNET_MINT = new PublicKey("8eGnj5jkW6zTGYieGhtejPjLtGmnKfCdk7FamoJ5LLvD");
export const GAME_DECIMALS = 10;
export const GAME_DISCOUNT_BPS = 2_000;

export const USDC_MAINNET_MINT = new PublicKey("EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v");
export const USDC_DEVNET_MINT = new PublicKey("4zMMC9srt5Ri5X14GAgXhaHii3GnPAEERYPJgZJDncDU");
export const USDT_MAINNET_MINT = new PublicKey("Es9vMFrzaCERmJfrF4H2FYD4KCoNkY11McCe8BenwNYB");
export const USDF_MAINNET_MINT = new PublicKey("5AMAA9JV9H97YYVxx8F6FsCMmTwXSuTTQneiup4RYAUQ");
export const USDF_DEVNET_MINT = new PublicKey("USDFBnpup7jXV8DZ9jvz3cR4syDYegoSBnarmxMeLgT");
export const STABLE_DECIMALS = 6;

export const SOL_NATIVE = PublicKey.default;
export const SOL_DECIMALS = 9;

export const SCORE_COMMIT_MICRO_USD = 50_000;
export const VERIFIED_COMMIT_MICRO_USD = 150_000;
export const REPLAY_RECEIPT_MICRO_USD = 250_000;
export const CNFT_WRAP_MICRO_USD = 500_000;

export const CATEGORY = {
  CONTINUE: 0,
  POWERUP: 1,
  SCORE_COMMIT: 2,
  COSMETIC: 3,
  VERIFIED_COMMIT: 4,
  REPLAY_RECEIPT: 5,
  CNFT_WRAP: 6,
} as const;

export type PaymentTokenKind = "stable" | "sol" | "game";

export interface PaymentTokenDef {
  symbol: string;
  mint: PublicKey;
  decimals: number;
  label: string;
  discountBps: number;
  kind: PaymentTokenKind;
}

export function paymentTokensFor(network: ArcadeNetwork): PaymentTokenDef[] {
  const usdc: PaymentTokenDef = {
    symbol: "USDC",
    mint: network === "mainnet" ? USDC_MAINNET_MINT : USDC_DEVNET_MINT,
    decimals: STABLE_DECIMALS,
    label: "USDC",
    discountBps: 0,
    kind: "stable",
  };
  const game: PaymentTokenDef = {
    symbol: "GAME",
    mint: network === "mainnet" ? GAME_MAINNET_MINT : GAME_DEVNET_MINT,
    decimals: GAME_DECIMALS,
    label: "$GAME (20% off)",
    discountBps: GAME_DISCOUNT_BPS,
    kind: "game",
  };
  const sol: PaymentTokenDef = {
    symbol: "SOL",
    mint: SOL_NATIVE,
    decimals: SOL_DECIMALS,
    label: "SOL",
    discountBps: 0,
    kind: "sol",
  };
  if (network === "mainnet") {
    return [
      usdc,
      { ...usdc, symbol: "USDT", mint: USDT_MAINNET_MINT, label: "USDT" },
      { ...usdc, symbol: "USDF", mint: USDF_MAINNET_MINT, label: "USDF" },
      sol,
      game,
    ];
  }
  return [usdc, sol, game];
}

export function applyDiscount(amountMicroUsd: number, token: PaymentTokenDef): number {
  if (token.discountBps === 0) return amountMicroUsd;
  return Math.floor((amountMicroUsd * (10_000 - token.discountBps)) / 10_000);
}
