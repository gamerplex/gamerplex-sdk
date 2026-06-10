import { BN } from "@coral-xyz/anchor";
import { PublicKey } from "@solana/web3.js";
import { getAssociatedTokenAddressSync } from "@solana/spl-token";
import { ContentionClient } from "./contention-client";
import { Outcome } from "./constants";
import type {
  CreateMatchParams,
  Match,
  MatchEvent,
  ResolveResult,
} from "./types";

type EventHandler = (event: MatchEvent) => void;

/**
 * High-level match lifecycle manager.
 *
 * Usage:
 *   const session = new GameSession(client, treasuries);
 *   const match = await session.create({ p1, p2, metadata: '{"game":"duel"}' });
 *   await session.depositFor(match, p1Keypair, new BN(1_000_000));
 *   await session.depositFor(match, p2Keypair, new BN(1_000_000));
 *   // ... run your game logic ...
 *   const result = await session.resolve(match, Outcome.P1_WINS);
 *   await session.close(match);
 */
export class GameSession {
  private client: ContentionClient;
  private partnerTreasury: PublicKey;
  private protocolTreasury: PublicKey;
  private listeners: EventHandler[] = [];

  constructor(
    client: ContentionClient,
    treasuries: {
      /** Partner's token account for fee share. */
      partner: PublicKey;
      /** Protocol's token account for contention fee share. */
      protocol: PublicKey;
    }
  ) {
    this.client = client;
    this.partnerTreasury = treasuries.partner;
    this.protocolTreasury = treasuries.protocol;
  }

  /** Subscribe to match lifecycle events. */
  on(handler: EventHandler): () => void {
    this.listeners.push(handler);
    return () => {
      this.listeners = this.listeners.filter((h) => h !== handler);
    };
  }

  private emit(event: MatchEvent) {
    for (const handler of this.listeners) {
      try {
        handler(event);
      } catch {
        // Don't let listener errors break the session
      }
    }
  }

  /**
   * Create a new wagered match.
   * Initializes a market + vault on-chain.
   */
  async create(params: CreateMatchParams): Promise<Match> {
    const eventId =
      params.eventId ?? new BN(Date.now() * 1000 + Math.floor(Math.random() * 1000));
    const expiresAt = new BN(params.expiresAt ?? 0);

    try {
      const { marketPda, vaultPda, txSig } =
        await this.client.initializeMarket({
          eventId,
          metadata: params.metadata,
          p1: params.p1,
          p2: params.p2,
          expiresAt,
        });

      const match: Match = {
        eventId,
        marketPda,
        vaultPda,
        p1: params.p1,
        p2: params.p2,
        mint: this.client.mint,
        authority: this.client.partnerKeypair.publicKey,
      };

      this.emit({ type: "created", match });
      return match;
    } catch (error) {
      this.emit({ type: "error", error: error as Error });
      throw error;
    }
  }

  /**
   * Build a deposit transaction for a player.
   * Returns an unsigned transaction the player (or their wallet) must sign.
   *
   * For server-side games where you hold player keypairs:
   *   Use depositFor() instead.
   */
  async buildDeposit(
    match: Match,
    player: PublicKey,
    amount: BN
  ) {
    return this.client.buildDepositTx({
      marketPda: match.marketPda,
      vaultPda: match.vaultPda,
      player,
      amount,
    });
  }

  /**
   * Execute a deposit directly (server-side, when you have the player keypair).
   * Signs and sends the transaction.
   */
  async depositFor(
    match: Match,
    playerKeypair: { publicKey: PublicKey; secretKey: Uint8Array },
    amount: BN
  ): Promise<string> {
    const playerAta = getAssociatedTokenAddressSync(
      this.client.mint,
      playerKeypair.publicKey
    );

    const txSig = await this.client.program.methods
      .deposit(amount)
      .accounts({
        market: match.marketPda,
        marketVault: match.vaultPda,
        userTokenAccount: playerAta,
        user: playerKeypair.publicKey,
        tokenProgram: new PublicKey(
          "TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA"
        ),
      })
      .signers([playerKeypair as any])
      .rpc();

    const isP1 = playerKeypair.publicKey.equals(match.p1);
    this.emit({
      type: isP1 ? "p1_deposited" : "p2_deposited",
      amount,
    });

    return txSig;
  }

  /**
   * Resolve the match with a winner.
   * Only the partner authority can call this.
   *
   * @param outcome - Outcome.P1_WINS (0), Outcome.P2_WINS (1), or Outcome.CANCELLED (255)
   */
  async resolve(match: Match, outcome: number): Promise<ResolveResult> {
    try {
      // Fetch vault balance before resolution for the result
      const vaultInfo = await this.client.connection.getTokenAccountBalance(
        match.vaultPda
      );
      const totalPot = new BN(vaultInfo.value.amount);

      const txSignature = await this.client.resolveMarket({
        marketPda: match.marketPda,
        vaultPda: match.vaultPda,
        outcome,
        p1: match.p1,
        p2: match.p2,
        partnerTreasury: this.partnerTreasury,
        protocolTreasury: this.protocolTreasury,
      });

      const result: ResolveResult = { txSignature, outcome, totalPot };
      this.emit({ type: "resolved", result });
      return result;
    } catch (error) {
      this.emit({ type: "error", error: error as Error });
      throw error;
    }
  }

  /** Convenience: resolve with P1 as winner. */
  async p1Wins(match: Match): Promise<ResolveResult> {
    return this.resolve(match, Outcome.P1_WINS);
  }

  /** Convenience: resolve with P2 as winner. */
  async p2Wins(match: Match): Promise<ResolveResult> {
    return this.resolve(match, Outcome.P2_WINS);
  }

  /** Convenience: cancel the match. */
  async cancel(match: Match): Promise<ResolveResult> {
    return this.resolve(match, Outcome.CANCELLED);
  }

  /**
   * Close a settled match and reclaim rent.
   * Call after resolution when vault is empty.
   */
  async close(match: Match): Promise<string> {
    const txSig = await this.client.closeMarket({
      marketPda: match.marketPda,
      vaultPda: match.vaultPda,
    });
    this.emit({ type: "closed" });
    return txSig;
  }

  /** Fetch the current on-chain state of a match. */
  async getState(match: Match) {
    return this.client.fetchMarket(match.marketPda);
  }
}
