# Gamerplex SDK

**v0.2.0** — Solana on-chain primitives for game builders.

Two domains in one package:

| Sub-import | What | Anchor program |
|---|---|---|
| `@gamerplex/sdk/arcade` (NEW in v0.2) | Single-player save-scores with multi-token payment + $GAME 20% discount + affiliate referrals | gamerplex-arcade v1.4 |
| `@gamerplex/sdk` (root, v0.1) | Two-player skill-contest wagering with atomic settlement | Contention Markets v2.1 |

Use the sub-import for the one you need; tree-shaking removes the other.

---

## Arcade — save score on-chain (v0.2 highlight)

```bash
npm install @gamerplex/sdk
```

```typescript
import { ArcadeClient } from "@gamerplex/sdk/arcade";
import idl from "@gamerplex/sdk/idl/gamerplex_arcade.json";

const client = new ArcadeClient({
  connection,       // @solana/web3.js Connection
  wallet,           // WalletAdapter (Phantom / Solflare / etc.)
  network: "devnet",
  idl,
});

// One call: opens profile if needed, transfers payment, records on-chain, submits score.
const sig = await client.saveScore({
  gameId: 5,                                     // your game's registered id
  score: 12345,
  sessionSeed: new Uint8Array(32),               // your deterministic RNG seed
  durationSec: 60,
  token: "GAME",                                 // optional — auto applies 20% discount
});
```

### What ArcadeClient handles for you

- ✅ **Multi-token routing** — USDC / SOL / $GAME / USDT / USDF (mainnet)
- ✅ **$GAME 20% discount** — declares `$0.04` instead of `$0.05` for score-save when paying with $GAME (contract v1.4 enforces this)
- ✅ **Rate quoting** — fetches the current SOL/$GAME exchange rate from the on-chain `ExchangeRatesConfig` PDA, applies 0.5% overpay buffer
- ✅ **First-time profile init** — calls `open_player_profile` automatically if the wallet has never saved a score
- ✅ **Affiliate referrer attribution** — pass `referrer: PublicKey` to credit a referrer's accrual
- ✅ **Bundled tx** — open + payment + record + submit all in one atomic transaction
- ✅ **Game-id agnostic** — works for any registered game (cyber-snake=1, magic-chess=3, blockwords=4, flipball=5, your-game=N)

### Low-level escape hatches

The high-level `saveScore()` covers 95% of cases. For custom flows:

```typescript
import { ArcadeClient, CATEGORY, gamePda, profilePda } from "@gamerplex/sdk/arcade";

// Build individual ixs and bundle yourself
const openIx = await client.buildOpenProfileIx(player, referrer);
const recordIx = await client.buildRecordPaymentIx({ /* ... */ });
const submitIx = await client.buildSubmitScoreIx({ /* ... */ });
```

### Token catalog + constants

```typescript
import {
  paymentTokensFor,       // (network) => PaymentTokenDef[]
  applyDiscount,          // (amountMicroUsd, token) => number
  CATEGORY,               // { SCORE_COMMIT: 2, VERIFIED_COMMIT: 4, ... }
  GAME_DISCOUNT_BPS,      // 2_000 (20%)
  SCORE_COMMIT_MICRO_USD, // 50_000 ($0.05)
} from "@gamerplex/sdk/arcade";
```

---

## Wagering — two-player skill contest (v0.1, unchanged)

Any game you build with this SDK gets **atomic on-chain wagering** for free:
- Two players (human or AI agent) put up a stake
- Your game determines the winner
- Winner takes the pot, minus a 2% protocol fee
- Settlement is instant, trustless, on Solana

```typescript
import { ContentionClient, GameSession, Outcome } from "@gamerplex/sdk";

// 1. Initialize
const client = new ContentionClient({
  rpcUrl: "https://api.devnet.solana.com",
  partnerAuthority: myKeypair,
  mint: USDC_MINT,
});

const session = new GameSession(client, {
  partner: myTreasuryAta,
  protocol: contentionTreasuryAta,
});

// 2. Create a match
const match = await session.create({
  p1: player1Wallet,
  p2: player2Wallet,
  metadata: '{"game":"my_game","chat":"Let\'s go!"}',
  expiresAt: Math.floor(Date.now() / 1000) + 3600,
});

// 3. Players deposit stakes
await session.depositFor(match, player1Keypair, new BN(1_000_000));
await session.depositFor(match, player2Keypair, new BN(1_000_000));

// 4. Run your game logic...
const winner = await runMyGame(player1, player2);

// 5. Resolve
if (winner === player1) {
  await session.p1Wins(match);
} else {
  await session.p2Wins(match);
}

// 6. Cleanup
await session.close(match);
```

## Who Can Play?

| Matchup | How It Works |
|---------|-------------|
| **Human vs Human** | Both connect wallets, deposit, play |
| **Human vs AI Agent** | Agent has a Solana wallet, deposits programmatically |
| **Agent vs Agent** | Fully autonomous — agents find matches, deposit, play, collect |

## Architecture

```
Your Game (any logic)
    ↓
GameSession (this SDK)
    ↓
Contention Markets (Solana program)
    ↓
Atomic settlement: fees → treasuries, pot → winner
```

## API

### `ContentionClient`

Low-level program wrapper. Handles PDA derivation and transaction building.

| Method | Description |
|--------|-------------|
| `initializeMarket()` | Create market + vault on-chain |
| `buildDepositTx()` | Build unsigned deposit tx for player to sign |
| `resolveMarket()` | Settle match: fees + winner payout |
| `closeMarket()` | Reclaim rent from settled match |
| `fetchMarket()` | Read on-chain market state |

### `GameSession`

High-level match lifecycle. This is what game developers use.

| Method | Description |
|--------|-------------|
| `create(params)` | Create a new wagered match |
| `buildDeposit(match, player, amount)` | Build deposit tx (client-side wallets) |
| `depositFor(match, keypair, amount)` | Execute deposit (server-side) |
| `resolve(match, outcome)` | Resolve with any outcome code |
| `p1Wins(match)` | Shorthand: P1 wins |
| `p2Wins(match)` | Shorthand: P2 wins |
| `cancel(match)` | Cancel match (fee if both deposited) |
| `close(match)` | Reclaim rent after settlement |
| `getState(match)` | Fetch current on-chain state |
| `on(handler)` | Subscribe to lifecycle events |

### Outcome Codes

| Code | Constant | Meaning |
|------|----------|---------|
| `0` | `Outcome.P1_WINS` | Player 1 wins |
| `1` | `Outcome.P2_WINS` | Player 2 wins |
| `255` | `Outcome.CANCELLED` | Match cancelled/void |

## Cancel Fee Logic

- **Only one player deposited** → Free cancel (game never started)
- **Both players deposited** → 2% fee taken (prevents strategic cancel abuse)

## Examples

See [`examples/`](./examples/) for working demos:
- `reaction-duel.ts` — Two players race to react first

## Prerequisites

1. Partner must be registered with Contention Markets (admin operation)
2. Protocol config must be initialized (one-time setup)
3. Players need token accounts with sufficient balance for stakes
