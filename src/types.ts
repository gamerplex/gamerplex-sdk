import { PublicKey } from "@solana/web3.js";
import { BN } from "@coral-xyz/anchor";

/** Configuration for initializing the SDK. */
export interface GameplexConfig {
  /** Solana RPC endpoint URL. */
  rpcUrl: string;
  /** Partner authority keypair (registered with Contention Markets). */
  partnerAuthority: {
    publicKey: PublicKey;
    secretKey: Uint8Array;
  };
  /** Collateral token mint (e.g., USDC). */
  mint: PublicKey;
  /** Optional: custom program ID (defaults to Contention Markets). */
  programId?: PublicKey;
}

/** Parameters for creating a new match. */
export interface CreateMatchParams {
  /** Player 1 wallet address. */
  p1: PublicKey;
  /** Player 2 wallet address. */
  p2: PublicKey;
  /** Game metadata (JSON string, max 512 bytes). Attached to on-chain event. */
  metadata: string;
  /** Unix timestamp after which anyone can expire the match. 0 = no expiry. */
  expiresAt?: number;
  /** Optional: explicit event ID. Auto-generated from timestamp if omitted. */
  eventId?: BN;
}

/** A live match with all on-chain addresses. */
export interface Match {
  /** Unique event identifier. */
  eventId: BN;
  /** Market PDA address. */
  marketPda: PublicKey;
  /** Vault PDA address (holds collateral). */
  vaultPda: PublicKey;
  /** Player 1 wallet. */
  p1: PublicKey;
  /** Player 2 wallet. */
  p2: PublicKey;
  /** Collateral token mint. */
  mint: PublicKey;
  /** Partner authority. */
  authority: PublicKey;
}

/** On-chain market state (deserialized). */
export interface MarketState {
  authority: PublicKey;
  mint: PublicKey;
  p1: PublicKey;
  p2: PublicKey;
  eventId: BN;
  p1Deposit: BN;
  p2Deposit: BN;
  resolved: boolean;
  winningOutcome: number | null;
  createdAt: BN;
  expiresAt: BN;
  settled: boolean;
  bump: number;
  vaultBump: number;
}

/** Result of resolving a match. */
export interface ResolveResult {
  /** Transaction signature. */
  txSignature: string;
  /** Winning outcome (0=P1, 1=P2, 255=cancelled). */
  outcome: number;
  /** Total pot at resolution time. */
  totalPot: BN;
}

/** Match lifecycle events emitted by GameSession. */
export type MatchEvent =
  | { type: "created"; match: Match }
  | { type: "p1_deposited"; amount: BN }
  | { type: "p2_deposited"; amount: BN }
  | { type: "resolved"; result: ResolveResult }
  | { type: "closed" }
  | { type: "error"; error: Error };
