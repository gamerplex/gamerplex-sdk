// gamerplex-arcade v1.4 — high-level client + token catalog + PDA helpers.

export { ArcadeClient } from "./client";
export type { ArcadeClientOpts, SaveScoreInput, WalletAdapter } from "./client";

export {
  paymentTokensFor,
  applyDiscount,
  CATEGORY,
  SCORE_COMMIT_MICRO_USD,
  VERIFIED_COMMIT_MICRO_USD,
  REPLAY_RECEIPT_MICRO_USD,
  CNFT_WRAP_MICRO_USD,
  GAME_MAINNET_MINT,
  GAME_DEVNET_MINT,
  GAME_DECIMALS,
  GAME_DISCOUNT_BPS,
  USDC_MAINNET_MINT,
  USDC_DEVNET_MINT,
  USDT_MAINNET_MINT,
  USDF_MAINNET_MINT,
  USDF_DEVNET_MINT,
  STABLE_DECIMALS,
  SOL_NATIVE,
  SOL_DECIMALS,
} from "./tokens";
export type { ArcadeNetwork, PaymentTokenDef, PaymentTokenKind } from "./tokens";

export {
  ARCADE_PROGRAM_ID,
  configPda,
  stablecoinConfigPda,
  ratesPda,
  affiliateConfigPda,
  gamePda,
  profilePda,
  receiptPda,
} from "./pdas";

export {
  RATE_SCALE_FACTOR,
  RATE_OVERPAY_BPS,
  fetchExchangeRates,
  convertUsdToRaw,
  applyOverpay,
  quotePaymentAmount,
  getTreasuryWallet,
} from "./quote";
export type { ExchangeRatesSnapshot, PaymentQuote } from "./quote";

export { fetchProfile } from "./profile";

export { sha256 } from "./util";

export { SDK_VERSION } from "../version";
