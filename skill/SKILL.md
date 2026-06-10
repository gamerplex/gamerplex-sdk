# Gamerplex Agents — Game Builder Skill

Build wagered on-chain games on Solana in minutes. Any AI agent (Claude Code, OpenClaw, or custom) can use this skill to create games that settle on Contention Markets with real-time execution via MagicBlock Ephemeral Rollups.

Games built with this skill automatically appear in the Gamerplex /games portal at gamerplex.com/games.

## When This Skill Activates

- User asks to build a game with betting/wagering/stakes
- User mentions Gamerplex, Contention Markets, or on-chain gaming
- User wants to create a multiplayer game on Solana
- User says "build me a game" in a Gamerplex project

## Architecture Overview

```
Game Frontend (HTML/React)
    ↓ calls
Gamerplex Resolver API (creates + settles matches)
    ↓ calls
Contention Markets (Solana program — atomic wagering)
    ↓ settles on
Solana L1 (or MagicBlock Ephemeral Rollup for real-time games)
```

### Key Concept: The Resolver

Game creators do NOT deploy smart contracts. Gamerplex runs a resolver backend that is the registered "partner" on Contention Markets. Games call the resolver API to create and settle matches.

**Resolver API Endpoints:**
- `POST /match/create` — Create a wagered match (returns marketPda, vaultPda)
- `POST /match/resolve` — Settle match with winner (triggers on-chain payout)
- `GET /match/:id` — Get match state
- `GET /feed` — Recent matches feed

**Resolver URL:** `https://gamerplex-resolver-508521387980.us-central1.run.app` (devnet) or `http://localhost:8080` (local)

## How to Build a Game

Every Gamerplex game has two parts:

### 1. Frontend (HTML or React)
The game UI that players interact with. Runs in browser. Contains game logic.

### 2. Wagering Integration (3 API calls)
```
START:  POST /match/create   { gameId, p1, p2, stake }
         → Returns matchId, marketPda, vaultPda, mint

PLAY:   Players deposit via wallet (sign tx to transfer tokens to vault)
        Game logic runs. Determine winner.

END:    POST /match/resolve  { matchId, winner: "p1"|"p2"|"cancel" }
         → Contention Markets settles atomically on-chain
```

## Game Template: Reaction Duel

When asked to build a simple 1v1 game, use this pattern:

```html
<!DOCTYPE html>
<html>
<head><title>My Game — Gamerplex</title></head>
<body>
<script>
const RESOLVER = "http://localhost:8080"; // or https://api.gamerplex.com

async function startMatch(p1Wallet, p2Wallet, stakeUsdc) {
  const res = await fetch(`${RESOLVER}/match/create`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      gameId: "my-game",
      p1: p1Wallet,
      p2: p2Wallet,
      stake: stakeUsdc,
      metadata: JSON.stringify({ game: "my-game", version: 1 }),
      expiresIn: 3600, // 1 hour timeout
    }),
  });
  return res.json(); // { matchId, marketPda, vaultPda, mint }
}

async function resolveMatch(matchId, winner) {
  // winner = "p1" | "p2" | "cancel"
  const res = await fetch(`${RESOLVER}/match/resolve`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ matchId, winner }),
  });
  return res.json(); // { txSignature, totalPot }
}

// --- Your game logic here ---
// 1. Connect wallets (use @solana/wallet-adapter)
// 2. Call startMatch()
// 3. Players deposit (sign transaction to transfer tokens to vault)
// 4. Run game logic (reaction test, trivia, math race, etc.)
// 5. Call resolveMatch() with the winner
// 6. Display result + share card
</script>
</body>
</html>
```

## Game Template: Math Race

Two players race to solve math problems. First to 10 correct answers wins.

Key game logic:
- Generate random math problems (addition, multiplication, etc.)
- Track correct answers per player
- First to reach target score wins
- Call resolveMatch() when someone wins or timer expires

## Game Template: Trivia Battle

Two players answer trivia questions. Most correct in 60 seconds wins.

Key game logic:
- Fetch questions from a trivia API or hardcoded set
- Show same question to both players simultaneously
- Track scores
- Resolve when timer ends

## Player Deposit Flow

After match creation, players must deposit their stake into the market vault.
The frontend builds a deposit transaction using the Gamerplex SDK:

```typescript
import { ContentionClient } from "@gamerplex/sdk";
import { PublicKey } from "@solana/web3.js";
import { BN } from "@coral-xyz/anchor";

// Build deposit transaction (player signs via wallet adapter)
const depositTx = await client.buildDepositTx({
  marketPda: new PublicKey(match.marketPda),
  vaultPda: new PublicKey(match.vaultPda),
  player: walletPublicKey,
  amount: new BN(stakeAmount),
});

// Player signs and sends via wallet adapter
await walletAdapter.sendTransaction(depositTx, connection);
```

## Styling Guidelines

Games on Gamerplex should follow the platform aesthetic:
- Dark background: `#0d001a`
- Primary accent: `#14F195` (neon green)
- Secondary: `#9945FF` (purple)
- Font: JetBrains Mono or system monospace
- Gradient: `linear-gradient(135deg, #9945FF, #14F195)`

## Share Card

After a match, generate a shareable result:
```
🦞 GAMERPLEX ARENA
Player1 vs Player2
WINNER: Player1 (+$9.80)
Settled on Contention Markets (Solana)
gamerplex.com
```

Include a "Share on X" button that generates a tweet with the result.

## MagicBlock Integration (Advanced)

For real-time multiplayer games needing sub-200ms state updates:

1. Import MagicBlock SDK
2. Delegate game state accounts to ephemeral rollup
3. Game logic runs on the rollup (fast)
4. Settlement commits back to Solana L1
5. Contention Markets resolves the wager on L1

See: https://docs.magicblock.gg for MagicBlock-specific patterns.

## File Structure for a Game

```
my-game/
├── index.html          # Game frontend (or React app)
├── game-logic.js       # Core game rules
├── gamerplex.js         # Resolver API calls (create, resolve)
├── wallet.js           # Solana wallet connection
└── style.css           # Styling (dark theme)
```

## Environment Variables

```
GAMERPLEX_RESOLVER_URL=https://api.gamerplex.com
SOLANA_RPC_URL=https://api.devnet.solana.com
USDC_MINT=EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v
```
