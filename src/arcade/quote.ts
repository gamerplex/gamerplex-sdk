// Rate quoting + slippage helpers for the arcade contract v1.4 paths.
// Mirrors the on-chain math so frontend pre-computation matches what the
// contract will accept.

import { PublicKey } from "@solana/web3.js";
import { BN, type Program } from "@coral-xyz/anchor";
import { ratesPda, configPda } from "./pdas";
import { GAME_MAINNET_MINT, GAME_DEVNET_MINT, type ArcadeNetwork } from "./tokens";

export const RATE_SCALE_FACTOR = 1_000_000_000_000; // ×1e12 fixed-point on rates
export const RATE_OVERPAY_BPS = 50; // 0.5% — matches contract slippage floor

export interface ExchangeRatesSnapshot {
  solMicroUsdPerLamport: BN;
  gameMicroUsdPerQuark: BN;
  solUpdatedAt: number;
  gameUpdatedAt: number;
}

let cached: { at: number; value: ExchangeRatesSnapshot } | null = null;

/** Fetch ExchangeRatesConfig PDA. 30s in-memory cache. */
export async function fetchExchangeRates(program: Program): Promise<ExchangeRatesSnapshot> {
  const now = Date.now();
  if (cached && now - cached.at < 30_000) return cached.value;
  const r: any = await (program.account as any).exchangeRatesConfig.fetch(ratesPda());
  const snap: ExchangeRatesSnapshot = {
    solMicroUsdPerLamport: r.solMicroUsdPerLamport as BN,
    gameMicroUsdPerQuark: r.gameMicroUsdPerQuark as BN,
    solUpdatedAt: Number(r.solUpdatedAt),
    gameUpdatedAt: Number(r.gameUpdatedAt),
  };
  cached = { at: now, value: snap };
  return snap;
}

/** Mirror of on-chain convert_usd_to_raw. */
export function convertUsdToRaw(amountMicroUsd: BN, rateScaled: BN): BN {
  return amountMicroUsd.mul(new BN(RATE_SCALE_FACTOR)).div(rateScaled);
}

/** Frontend overpay buffer so a single-block rate move doesn't trip the floor. */
export function applyOverpay(raw: BN, overpayBps: number = RATE_OVERPAY_BPS): BN {
  return raw.mul(new BN(10_000 + overpayBps)).div(new BN(10_000));
}

export interface PaymentQuote {
  amountMicroUsdToRecord: BN;
  paymentAmountRaw: BN;
}

/** Quote: convert a USD price to the raw token amount for a chosen mint.
 *  Returns the discounted amount (when discountBps > 0) plus overpaid raw. */
export function quotePaymentAmount(
  rates: ExchangeRatesSnapshot,
  basePriceMicroUsd: BN,
  paymentMint: PublicKey,
  discountBps: number = 0,
  network: ArcadeNetwork = "devnet",
): PaymentQuote {
  const discounted = basePriceMicroUsd
    .mul(new BN(10_000 - discountBps))
    .div(new BN(10_000));

  const gameMint = network === "mainnet" ? GAME_MAINNET_MINT : GAME_DEVNET_MINT;

  if (paymentMint.equals(PublicKey.default)) {
    const lamports = convertUsdToRaw(discounted, rates.solMicroUsdPerLamport);
    return { amountMicroUsdToRecord: discounted, paymentAmountRaw: applyOverpay(lamports) };
  }
  if (paymentMint.equals(gameMint)) {
    const quarks = convertUsdToRaw(discounted, rates.gameMicroUsdPerQuark);
    return { amountMicroUsdToRecord: discounted, paymentAmountRaw: applyOverpay(quarks) };
  }
  return { amountMicroUsdToRecord: discounted, paymentAmountRaw: discounted };
}

/** Read the treasury wallet from on-chain config. Cached per program instance. */
const treasuryCache = new WeakMap<Program, PublicKey>();
export async function getTreasuryWallet(program: Program): Promise<PublicKey> {
  const hit = treasuryCache.get(program);
  if (hit) return hit;
  const cfg: any = await (program.account as any).arcadeConfig.fetch(configPda());
  const t = cfg.treasuryWallet as PublicKey;
  treasuryCache.set(program, t);
  return t;
}
