/**
 * Example: Reaction Duel
 *
 * A simple server-side game where two players race to "react" first.
 * The winner takes the pot (minus 2% protocol fee).
 *
 * This demonstrates the full Gamerplex SDK lifecycle:
 *   1. Create a wagered match
 *   2. Both players deposit their stake
 *   3. Run game logic (simulated here)
 *   4. Resolve with the winner
 *   5. Close the match (reclaim rent)
 */

import { Keypair, PublicKey } from "@solana/web3.js";
import { BN } from "@coral-xyz/anchor";
import {
  ContentionClient,
  GameSession,
  Outcome,
  type GameplexConfig,
} from "../src";

// --- Configuration ---
// In production, load these from environment variables or a config file.

const USDC_MINT = new PublicKey("EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v"); // Mainnet USDC
const STAKE_AMOUNT = new BN(1_000_000); // 1 USDC (6 decimals)

async function main() {
  // 1. Initialize the SDK
  const partnerKeypair = Keypair.generate(); // In production: load from secure storage

  const config: GameplexConfig = {
    rpcUrl: "https://api.devnet.solana.com",
    partnerAuthority: partnerKeypair,
    mint: USDC_MINT,
  };

  const client = new ContentionClient(config);

  // Partner and protocol treasury token accounts (pre-created ATAs)
  const partnerTreasury = PublicKey.default; // Replace with real ATA
  const protocolTreasury = PublicKey.default; // Replace with real ATA

  const session = new GameSession(client, {
    partner: partnerTreasury,
    protocol: protocolTreasury,
  });

  // 2. Listen to match events
  session.on((event) => {
    switch (event.type) {
      case "created":
        console.log(`Match created: ${event.match.marketPda.toBase58()}`);
        break;
      case "p1_deposited":
        console.log(`P1 deposited ${event.amount.toString()} tokens`);
        break;
      case "p2_deposited":
        console.log(`P2 deposited ${event.amount.toString()} tokens`);
        break;
      case "resolved":
        const winner = event.result.outcome === 0 ? "P1" : "P2";
        console.log(
          `Match resolved! ${winner} wins ${event.result.totalPot.toString()} tokens`
        );
        break;
      case "closed":
        console.log("Match closed, rent reclaimed.");
        break;
      case "error":
        console.error("Match error:", event.error.message);
        break;
    }
  });

  // 3. Two players want to duel
  const p1 = Keypair.generate();
  const p2 = Keypair.generate();

  const match = await session.create({
    p1: p1.publicKey,
    p2: p2.publicKey,
    metadata: JSON.stringify({
      game: "reaction_duel",
      chat: "First to react wins! 🎯",
      version: 1,
    }),
    expiresAt: Math.floor(Date.now() / 1000) + 3600, // 1 hour timeout
  });

  // 4. Both players deposit their stake
  await session.depositFor(match, p1, STAKE_AMOUNT);
  await session.depositFor(match, p2, STAKE_AMOUNT);

  // 5. Run the game logic
  console.log("\n⏱️  Game starting in 3... 2... 1... REACT!\n");

  const p1ReactionTime = simulateReaction();
  const p2ReactionTime = simulateReaction();

  console.log(`P1 reacted in ${p1ReactionTime}ms`);
  console.log(`P2 reacted in ${p2ReactionTime}ms`);

  // 6. Determine winner and resolve
  if (p1ReactionTime < p2ReactionTime) {
    console.log("\nP1 wins!");
    await session.p1Wins(match);
  } else {
    console.log("\nP2 wins!");
    await session.p2Wins(match);
  }

  // 7. Clean up
  await session.close(match);
  console.log("\nDone. Match settled on Solana.");
}

/** Simulate a human reaction time (150-400ms). */
function simulateReaction(): number {
  return Math.floor(150 + Math.random() * 250);
}

main().catch(console.error);
