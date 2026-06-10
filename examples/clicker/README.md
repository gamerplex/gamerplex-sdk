# arcade-clicker — `@gamerplex/sdk` demo

Smallest possible arcade game using `@gamerplex/sdk` v0.2. Clicks are the score; saves go on-chain via `ArcadeClient.saveScore()`.

This example serves three purposes:

1. **Smoke-test the SDK** in a real browser with a real wallet (catches anything Node-only tests miss).
2. **Canonical onboarding template** for third-party game devs — fork it, swap the click counter for actual gameplay.
3. **AI agent reference** — when an LLM reads the gamerplex-arcade skill file, this is the minimal correct example to mirror.

## Run it

```sh
cd examples/clicker
npm install
npm run dev
```

Opens at `http://localhost:5173`. Connect Phantom (devnet mode), click as many times as you want, pick USDC / SOL / $GAME, hit Save.

## What it demonstrates

| SDK surface | Where in the code |
|---|---|
| `new ArcadeClient({...})` | [src/App.tsx](src/App.tsx) — `useMemo` after `useAnchorWallet()` |
| `paymentTokensFor("devnet")` | [src/App.tsx](src/App.tsx) — top-level constant |
| `client.saveScore({...})` | [src/App.tsx](src/App.tsx) — `onSave` callback |
| Multi-token picker with `$GAME` discount badge | [src/App.tsx](src/App.tsx) — `tokens` JSX |
| IDL import via `@gamerplex/sdk/idl/gamerplex_arcade.json` | top-level import |
| Wallet-adapter integration (PhantomWalletAdapter) | [src/main.tsx](src/main.tsx) |

## What you DON'T have to write

Because `ArcadeClient.saveScore()` handles it internally:

- `open_player_profile` for first-time wallets (auto)
- `record_payment` with the correct accounts including v1.4's `affiliateConfig` + `rates` PDAs
- `submit_score` with the right Borsh args
- SPL transfer-checked + ATA creation
- `$GAME` 20% discount math (`amount_micro_usd` is auto-discounted)
- Slippage tolerance (0.5%)
- Sending + confirming the bundled tx

A full arcade save-score that previously took ~150 LOC of raw `@solana/web3.js` is now ~10 LOC of SDK calls.

## Devnet setup checklist

1. Install Phantom browser extension
2. Switch Phantom to **Devnet** (Settings → Developer Settings → Change Network)
3. Get some devnet SOL: `solana airdrop 2 <YOUR_PHANTOM_PUBKEY> --url devnet` (or via faucet.solana.com)
4. Get devnet USDC: faucet.circle.com → pick "Solana Devnet" → paste wallet address
5. (Optional, for $GAME testing) you'll need devnet $GAME tokens — currently distributed via the Flipcash app on devnet

## Game-id used here

This demo uses `gameId: 5` (Flipball's registered game). For production you'd register your own game_id via `gamerplex-arcade/scripts/register-game.ts`. Re-using id=5 is fine for demo/exploration on devnet but on mainnet you must use your own.

## Source link

Live at: [github.com/gamerplex/gamerplex-sdk/tree/main/examples/clicker](https://github.com/gamerplex/gamerplex-sdk/tree/main/examples/clicker)
