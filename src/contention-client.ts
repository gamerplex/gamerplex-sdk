import {
  AnchorProvider,
  BN,
  Program,
  Wallet,
  setProvider,
} from "@coral-xyz/anchor";
import {
  Connection,
  Keypair,
  PublicKey,
  SystemProgram,
  Transaction,
} from "@solana/web3.js";
import {
  TOKEN_PROGRAM_ID,
  getAssociatedTokenAddressSync,
} from "@solana/spl-token";
import { CONTENTION_PROGRAM_ID, Seeds, Outcome } from "./constants";
import type { GameplexConfig, MarketState } from "./types";

// Load IDL at runtime
import idl from "../idl/contention_markets.json";

/**
 * Low-level client for the Contention Markets program.
 * Handles PDA derivation, transaction building, and program calls.
 */
export class ContentionClient {
  readonly connection: Connection;
  readonly program: Program;
  readonly provider: AnchorProvider;
  readonly partnerKeypair: Keypair;
  readonly mint: PublicKey;
  readonly protocolConfigPda: PublicKey;
  readonly partnerRegistryPda: PublicKey;

  constructor(config: GameplexConfig) {
    this.connection = new Connection(config.rpcUrl, "confirmed");
    this.partnerKeypair = Keypair.fromSecretKey(
      config.partnerAuthority.secretKey
    );
    this.mint = config.mint;

    const wallet = new Wallet(this.partnerKeypair);
    this.provider = new AnchorProvider(this.connection, wallet, {
      commitment: "confirmed",
    });
    setProvider(this.provider);

    const programId = config.programId ?? CONTENTION_PROGRAM_ID;
    this.program = new Program(idl as any, this.provider);

    // Derive singleton PDAs
    [this.protocolConfigPda] = PublicKey.findProgramAddressSync(
      [Seeds.PROTOCOL_CONFIG],
      programId
    );
    [this.partnerRegistryPda] = PublicKey.findProgramAddressSync(
      [Seeds.PARTNER_REGISTRY, this.partnerKeypair.publicKey.toBuffer()],
      programId
    );
  }

  /** Derive the market PDA for a given event ID. */
  deriveMarketPda(eventId: BN): [PublicKey, number] {
    return PublicKey.findProgramAddressSync(
      [Seeds.MARKET, eventId.toArrayLike(Buffer, "le", 8)],
      this.program.programId
    );
  }

  /** Derive the vault PDA for a given market. */
  deriveVaultPda(marketPda: PublicKey): [PublicKey, number] {
    return PublicKey.findProgramAddressSync(
      [Seeds.VAULT, marketPda.toBuffer()],
      this.program.programId
    );
  }

  /**
   * Initialize a new market with vault.
   * Returns the market PDA and transaction signature.
   */
  async initializeMarket(params: {
    eventId: BN;
    metadata: string;
    p1: PublicKey;
    p2: PublicKey;
    expiresAt: BN;
  }): Promise<{ marketPda: PublicKey; vaultPda: PublicKey; txSig: string }> {
    const [marketPda] = this.deriveMarketPda(params.eventId);
    const [vaultPda] = this.deriveVaultPda(marketPda);

    const txSig = await this.program.methods
      .initializeMarket(
        params.eventId,
        params.metadata,
        params.p1,
        params.p2,
        params.expiresAt
      )
      .accounts({
        market: marketPda,
        marketVault: vaultPda,
        mint: this.mint,
        partnerRegistry: this.partnerRegistryPda,
        authority: this.partnerKeypair.publicKey,
        systemProgram: SystemProgram.programId,
        tokenProgram: TOKEN_PROGRAM_ID,
      })
      .signers([this.partnerKeypair])
      .rpc();

    return { marketPda, vaultPda, txSig };
  }

  /**
   * Build a deposit transaction for a player to sign.
   * Returns an unsigned transaction — the player must sign and send it.
   */
  async buildDepositTx(params: {
    marketPda: PublicKey;
    vaultPda: PublicKey;
    player: PublicKey;
    amount: BN;
  }): Promise<Transaction> {
    const playerAta = getAssociatedTokenAddressSync(this.mint, params.player);

    const tx = await this.program.methods
      .deposit(params.amount)
      .accounts({
        market: params.marketPda,
        marketVault: params.vaultPda,
        userTokenAccount: playerAta,
        user: params.player,
        tokenProgram: TOKEN_PROGRAM_ID,
      })
      .transaction();

    return tx;
  }

  /**
   * Resolve a market. Only the partner authority can call this.
   * Handles fee distribution and winner payout atomically.
   */
  async resolveMarket(params: {
    marketPda: PublicKey;
    vaultPda: PublicKey;
    outcome: number;
    p1: PublicKey;
    p2: PublicKey;
    partnerTreasury: PublicKey;
    protocolTreasury: PublicKey;
  }): Promise<string> {
    const p1Ata = getAssociatedTokenAddressSync(this.mint, params.p1);
    const p2Ata = getAssociatedTokenAddressSync(this.mint, params.p2);

    const txSig = await this.program.methods
      .resolveMarket(params.outcome)
      .accounts({
        market: params.marketPda,
        authority: this.partnerKeypair.publicKey,
        partnerRegistry: this.partnerRegistryPda,
        protocolConfig: this.protocolConfigPda,
        marketVault: params.vaultPda,
        p1TokenAccount: p1Ata,
        p2TokenAccount: p2Ata,
        partnerTreasury: params.partnerTreasury,
        protocolTreasury: params.protocolTreasury,
        tokenProgram: TOKEN_PROGRAM_ID,
      })
      .signers([this.partnerKeypair])
      .rpc();

    return txSig;
  }

  /**
   * Close a settled market and reclaim rent.
   */
  async closeMarket(params: {
    marketPda: PublicKey;
    vaultPda: PublicKey;
  }): Promise<string> {
    return this.program.methods
      .closeMarket()
      .accounts({
        market: params.marketPda,
        marketVault: params.vaultPda,
        authority: this.partnerKeypair.publicKey,
        tokenProgram: TOKEN_PROGRAM_ID,
      })
      .signers([this.partnerKeypair])
      .rpc();
  }

  /** Fetch on-chain market state. */
  async fetchMarket(marketPda: PublicKey): Promise<MarketState> {
    const coder = this.program.coder;
    const info = await this.connection.getAccountInfo(marketPda);
    if (!info) throw new Error(`Market account not found: ${marketPda.toBase58()}`);
    const decoded = coder.accounts.decode("marketState", info.data);
    return decoded as unknown as MarketState;
  }

  /** Check if a market PDA exists on-chain. */
  async marketExists(marketPda: PublicKey): Promise<boolean> {
    const info = await this.connection.getAccountInfo(marketPda);
    return info !== null;
  }
}
