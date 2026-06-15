// High-level client for gamerplex-arcade v1.4. See README for usage.

import {
  Connection,
  PublicKey,
  SystemProgram,
  Transaction,
  TransactionInstruction,
  SYSVAR_INSTRUCTIONS_PUBKEY,
  sendAndConfirmTransaction,
} from "@solana/web3.js";
import {
  getAssociatedTokenAddressSync,
  createAssociatedTokenAccountIdempotentInstruction,
  createTransferCheckedInstruction,
  TOKEN_PROGRAM_ID,
} from "@solana/spl-token";
import { AnchorProvider, BN, Program, type Idl } from "@coral-xyz/anchor";

import {
  ARCADE_PROGRAM_ID,
  configPda,
  stablecoinConfigPda,
  ratesPda,
  affiliateConfigPda,
  gamePda,
  profilePda,
} from "./pdas";
import {
  paymentTokensFor,
  applyDiscount,
  CATEGORY,
  SCORE_COMMIT_MICRO_USD,
  SOL_NATIVE,
  GAME_DECIMALS,
  STABLE_DECIMALS,
  type ArcadeNetwork,
  type PaymentTokenDef,
} from "./tokens";
import { SDK_VERSION } from "../version";

const SPL_MEMO_ID = new PublicKey("MemoSq4gqABAXKb96qnH8TysNcWxMyWCqXgDLGmfcHr");
const RATE_SCALE_FACTOR = 1_000_000_000_000n;
const OVERPAY_BPS = 50n; // 0.5% overpay to stay above the contract floor

/** Minimal wallet adapter contract. */
export interface WalletAdapter {
  publicKey: PublicKey;
  signTransaction(tx: Transaction): Promise<Transaction>;
  signAllTransactions(txs: Transaction[]): Promise<Transaction[]>;
}

export interface ArcadeClientOpts {
  connection: Connection;
  wallet: WalletAdapter;
  network?: ArcadeNetwork;
  programId?: PublicKey;
  /** Path to bundled IDL JSON. Default loads from package's ./idl/gamerplex_arcade.json. */
  idl?: Idl;
}

export interface SaveScoreInput {
  gameId: number;
  score: number;
  sessionSeed: Uint8Array; // 32 bytes — the deterministic RNG seed
  durationSec?: number;
  /** "USDC" | "SOL" | "GAME" | "USDT" | "USDF" — defaults to USDC */
  token?: string;
  /** Score variant tag (e.g. "v1", "hard"). Default empty. */
  variant?: string;
  /** Move-log hash for replay verification. Default zero-filled. */
  moveHash?: Uint8Array;
  /** Continues used during run (affects 1CC leaderboard). Default 0. */
  continuesUsed?: number;
  /** Powerups used during run. Default 0. */
  powerupsUsed?: number;
  /** Free-form metadata (≤64 chars). Folded into GPX5 memo. */
  meta?: string;
  /** Referrer pubkey for affiliate accrual. Default PublicKey.default. */
  referrer?: PublicKey;
  /** External arweave ref for VERIFIED_COMMIT category. Default empty. */
  externalRef?: string;
  /** Override category. Default CATEGORY.SCORE_COMMIT. */
  category?: number;
  /** Raw move-log bytes (per-game encoding). When present, sent fire-and-forget
   *  to the resolver after save confirms so the validator can verify the run. */
  moveLog?: Uint8Array;
  /** Override resolver base URL. Set to "" to disable auto submit-replay. */
  resolverUrl?: string;
  /** Session PDA from openSession(). REQUIRED when variant starts with
   *  "daily" or "challenge" (P0-3 grind defense). Ignored otherwise. */
  sessionPda?: PublicKey;
}

import { submitReplay, type SubmitReplayResult } from "./replay";

export class ArcadeClient {
  readonly connection: Connection;
  readonly wallet: WalletAdapter;
  readonly network: ArcadeNetwork;
  readonly programId: PublicKey;
  readonly program: Program;
  readonly tokens: PaymentTokenDef[];

  private treasury: PublicKey | null = null;

  constructor(opts: ArcadeClientOpts) {
    this.connection = opts.connection;
    this.wallet = opts.wallet;
    this.network = opts.network ?? "devnet";
    this.programId = opts.programId ?? ARCADE_PROGRAM_ID;
    this.tokens = paymentTokensFor(this.network);

    const provider = new AnchorProvider(
      opts.connection,
      opts.wallet as any,
      { commitment: "confirmed" },
    );

    if (!opts.idl) {
      throw new Error(
        "ArcadeClient: pass `idl` — the Anchor IDL JSON for gamerplex_arcade. " +
        "Import via `import idl from \"@gamerplex/sdk/idl/gamerplex_arcade.json\"`.",
      );
    }
    this.program = new Program(opts.idl, provider);
  }

  /** Look up the configured treasury wallet (cached after first call). */
  async getTreasury(): Promise<PublicKey> {
    if (this.treasury) return this.treasury;
    const cfg = await (this.program.account as any).arcadeConfig.fetch(configPda(this.programId));
    this.treasury = cfg.treasuryWallet as PublicKey;
    return this.treasury;
  }

  /** Find the token catalog entry by symbol. */
  findToken(symbol: string): PaymentTokenDef {
    const t = this.tokens.find((x) => x.symbol === symbol.toUpperCase());
    if (!t) throw new Error(`ArcadeClient: unknown token symbol "${symbol}". Available: ${this.tokens.map((x) => x.symbol).join(", ")}`);
    return t;
  }

  /** Has the player opened their on-chain profile? */
  async hasProfile(player?: PublicKey): Promise<boolean> {
    const p = player ?? this.wallet.publicKey;
    const info = await this.connection.getAccountInfo(profilePda(p, this.programId));
    return !!info;
  }

  /**
   * Save a score on-chain. Bundles open_profile (if needed) + payment +
   * record_payment + submit_score into one atomic tx.
   */
  async saveScore(input: SaveScoreInput): Promise<string> {
    const token = this.findToken(input.token ?? "USDC");
    const category = input.category ?? CATEGORY.SCORE_COMMIT;
    const player = this.wallet.publicKey;
    const treasury = await this.getTreasury();

    // 1. Discount math (v1.4): contract enforces amount_micro_usd matches
    //    required_amount(category, mint). For $GAME, that's 80% of base.
    const baseUsd = SCORE_COMMIT_MICRO_USD; // could vary per category, kept simple here
    const declaredUsd = applyDiscount(baseUsd, token);

    // 2. Compute payment amount in token's smallest unit
    const rates: any = token.kind === "stable"
      ? null
      : await (this.program.account as any).exchangeRatesConfig.fetch(ratesPda(this.programId));

    let paymentAmountRaw: bigint;
    if (token.kind === "stable") {
      paymentAmountRaw = BigInt(declaredUsd); // 6-decimal parity
    } else if (token.kind === "sol") {
      const expected = (BigInt(declaredUsd) * RATE_SCALE_FACTOR) / BigInt(rates.solMicroUsdPerLamport.toString());
      paymentAmountRaw = (expected * (10_000n + OVERPAY_BPS)) / 10_000n;
    } else {
      const expected = (BigInt(declaredUsd) * RATE_SCALE_FACTOR) / BigInt(rates.gameMicroUsdPerQuark.toString());
      paymentAmountRaw = (expected * (10_000n + OVERPAY_BPS)) / 10_000n;
    }

    // 3. Build the bundled tx
    const tx = new Transaction();
    if (!(await this.hasProfile(player))) {
      tx.add(await this.buildOpenProfileIx(player, input.referrer ?? PublicKey.default));
    }
    tx.add(...this.buildPaymentTransferIxs(player, treasury, token, paymentAmountRaw));
    tx.add(await this.buildRecordPaymentIx({
      player,
      category,
      amountMicroUsd: declaredUsd,
      paymentMint: token.mint,
      paymentAmountRaw,
      externalRef: input.externalRef ?? "",
      gameId: input.gameId,
      referrer: input.referrer,
    }));
    const userMeta = (input.meta ?? "").trim();
    const composedMeta = userMeta
      ? `sdk=${SDK_VERSION};${userMeta}`
      : `sdk=${SDK_VERSION}`;

    // Audit P1-8: auto-compute moveHash from moveLog when present. Previously
    // defaulting to a 32-byte zero hash silently broke replay verification —
    // resolver hash compare always failed, all saves permanently unverified.
    let resolvedMoveHash: Uint8Array;
    if (input.moveHash) {
      resolvedMoveHash = input.moveHash;
    } else if (input.moveLog && input.moveLog.length > 0) {
      const crypto = await import("crypto");
      resolvedMoveHash = new Uint8Array(crypto.createHash("sha256").update(input.moveLog).digest());
    } else {
      resolvedMoveHash = new Uint8Array(32);
      console.warn("[ArcadeClient.saveScore] Submitting with ZERO moveHash — no moveLog provided. Replay verification will be impossible.");
    }

    tx.add(await this.buildSubmitScoreIx({
      player,
      gameId: input.gameId,
      score: input.score,
      // Audit P1-7: require explicit variant in <botId>|<turnTime> format for
      // chess; using "v1" silently bypassed score-equality check. Empty string
      // is safer for non-chess games; chess client must pass real variant.
      variant: input.variant ?? "",
      continuesUsed: input.continuesUsed ?? 0,
      powerupsUsed: input.powerupsUsed ?? 0,
      sessionSeed: input.sessionSeed,
      durationSec: input.durationSec ?? 0,
      moveHash: resolvedMoveHash,
      session: input.sessionPda,
      meta: composedMeta,
    }));

    // 4. Sign + send
    const sig = await this.sendTx(tx);

    if (input.moveLog && input.moveLog.length > 0 && input.resolverUrl !== "") {
      submitReplay(sig, input.moveLog, input.resolverUrl).catch(() => {});
    }

    return sig;
  }

  async submitReplay(input: {
    scoreSig: string;
    moveLog: Uint8Array;
    resolverUrl?: string;
  }): Promise<SubmitReplayResult> {
    return submitReplay(input.scoreSig, input.moveLog, input.resolverUrl);
  }

  async buildOpenProfileIx(player: PublicKey, referrer: PublicKey): Promise<TransactionInstruction> {
    const refProfile = referrer.equals(PublicKey.default) ? null : profilePda(referrer, this.programId);
    return (this.program.methods as any)
      .openPlayerProfile(referrer)
      .accounts({
        config: configPda(this.programId),
        profile: profilePda(player, this.programId),
        referrerProfile: refProfile,
        player,
        systemProgram: SystemProgram.programId,
      })
      .instruction();
  }

  private buildPaymentTransferIxs(
    player: PublicKey,
    treasury: PublicKey,
    token: PaymentTokenDef,
    amount: bigint,
  ): TransactionInstruction[] {
    if (token.kind === "sol") {
      return [SystemProgram.transfer({
        fromPubkey: player, toPubkey: treasury, lamports: Number(amount),
      })];
    }
    const decimals = token.kind === "game" ? GAME_DECIMALS : STABLE_DECIMALS;
    const fromAta = getAssociatedTokenAddressSync(token.mint, player);
    const toAta = getAssociatedTokenAddressSync(token.mint, treasury);
    return [
      createAssociatedTokenAccountIdempotentInstruction(player, toAta, treasury, token.mint),
      createTransferCheckedInstruction(fromAta, token.mint, toAta, player, amount, decimals, [], TOKEN_PROGRAM_ID),
    ];
  }

  /** Build record_payment ix (advanced). Includes v1.3+ affiliateConfig + rates accounts. */
  async buildRecordPaymentIx(args: {
    player: PublicKey;
    category: number;
    amountMicroUsd: number;
    paymentMint: PublicKey;
    paymentAmountRaw: bigint;
    externalRef: string;
    gameId: number;
    referrer?: PublicKey;
  }): Promise<TransactionInstruction> {
    const refProfile = (args.referrer && !args.referrer.equals(PublicKey.default))
      ? profilePda(args.referrer, this.programId) : null;
    return (this.program.methods as any)
      .recordPayment(
        args.category,
        new BN(args.amountMicroUsd),
        args.paymentMint,
        new BN(args.paymentAmountRaw.toString()),
        Array.from(new Uint8Array(64)),
        args.externalRef,
      )
      .accounts({
        config: configPda(this.programId),
        stablecoinConfig: stablecoinConfigPda(this.programId),
        game: gamePda(args.gameId, this.programId),
        profile: profilePda(args.player, this.programId),
        wallet: args.player,
        referrerProfile: refProfile,
        rates: ratesPda(this.programId),
        affiliateConfig: affiliateConfigPda(this.programId),
        player: args.player,
        instructionsSysvar: SYSVAR_INSTRUCTIONS_PUBKEY,
      })
      .instruction();
  }

  /** Build submit_score ix (advanced). */
  async buildSubmitScoreIx(args: {
    player: PublicKey;
    gameId: number;
    score: number;
    variant: string;
    continuesUsed: number;
    powerupsUsed: number;
    sessionSeed: Uint8Array;
    durationSec: number;
    moveHash: Uint8Array;
    meta: string;
    vsChallenger?: PublicKey;
    /** Session PDA — required when variant starts with "daily" or "challenge". */
    session?: PublicKey;
  }): Promise<TransactionInstruction> {
    return (this.program.methods as any)
      .submitScore(
        args.variant,
        new BN(args.score),
        args.continuesUsed,
        args.powerupsUsed,
        Array.from(args.sessionSeed),
        args.durationSec,
        Array.from(args.moveHash),
        args.meta,
        args.vsChallenger ?? PublicKey.default,
      )
      .accountsPartial({
        config: configPda(this.programId),
        game: gamePda(args.gameId, this.programId),
        profile: profilePda(args.player, this.programId),
        wallet: args.player,
        player: args.player,
        memoProgram: SPL_MEMO_ID,
        instructionsSysvar: SYSVAR_INSTRUCTIONS_PUBKEY,
        session: args.session ?? null,
      })
      .instruction();
  }

  private async sendTx(tx: Transaction): Promise<string> {
    const { blockhash } = await this.connection.getLatestBlockhash("confirmed");
    tx.recentBlockhash = blockhash;
    tx.feePayer = this.wallet.publicKey;
    const signed = await this.wallet.signTransaction(tx);
    const sig = await this.connection.sendRawTransaction(signed.serialize(), { skipPreflight: false });
    await this.connection.confirmTransaction(sig, "confirmed");
    return sig;
  }
}
