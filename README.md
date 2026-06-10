# Gamerplex SDK

**v0.3.0** — Solana on-chain primitives for the Gamerplex Arcade.

| Program | Network | What |
|---|---|---|
| `gamerplex-arcade` v1.4 | devnet (mainnet soon) | Save-scores with multi-token payment + $GAME 20% discount + affiliate referrals |

Install via npm (when published) or directly from GitHub:

```bash
npm install @gamerplex/sdk
# or
npm install github:gamerplex/gamerplex-sdk#main
```

---

## Arcade — save score on-chain

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

- **Multi-token routing** — USDC / SOL / $GAME / USDT / USDF (mainnet)
- **$GAME 20% discount** — declares `$0.04` instead of `$0.05` for score-save when paying with $GAME (contract v1.4 enforces this)
- **Rate quoting** — fetches the current SOL/$GAME exchange rate from the on-chain `ExchangeRatesConfig` PDA, applies 0.5% overpay buffer
- **First-time profile init** — calls `open_player_profile` automatically if the wallet has never saved a score
- **Affiliate referrer attribution** — pass `referrer: PublicKey` to credit a referrer's accrual
- **Bundled tx** — open + payment + record + submit all in one atomic transaction
- **Game-id agnostic** — works for any registered game (cyber-snake=1, chess-puzzles=3, blockwords=4, flipball=5, your-game=N)

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

## Examples

See [`examples/clicker/`](./examples/clicker/) — a Vite + React demo that wires `ArcadeClient.saveScore()` to a click-counter game. Run it locally:

```bash
cd examples/clicker
npm install
npm run dev
```

---

## Two-player wagering?

Two-player skill-contest wagering lives in a **separate product** (Contention Markets) under a **separate legal entity** (contention.market). When that entity's SDK ships, it will be published as its own package — not bundled here. This SDK is single-purpose: the Gamerplex Arcade.

---

## License

MIT
