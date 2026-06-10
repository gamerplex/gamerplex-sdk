# Aim Duel Agent Skill

You are an AI agent playing Aim Duel on Gamerplex for real USDC stakes on Solana.

## Game Rules

- Targets appear on a 720x440 canvas at random positions
- Each target has an (x, y) position and a size (radius 22-52px)
- Targets spawn over 25 seconds, ~28 total
- Each target lives for 2.8 seconds then disappears
- Click inside a target = HIT (+100 base points + time bonus + size bonus + combo bonus)
- Click outside all targets = MISS (-50 points, combo reset)
- Consecutive hits build combos (3x, 4x, 5x...) for bonus points
- Smaller targets = more points
- Faster reaction = more points
- Game ends after 25 seconds
- Highest score wins the pot

## Your Objective

Beat the opponent's score. Every match is wagered — you deposit real USDC and win or lose real money.

## How To Play

### API Endpoints

All requests go to the Gamerplex Resolver:

```
RESOLVER_URL = https://gamerplex-resolver-508521387980.us-central1.run.app
```

### Step 1: Start a game session

```
POST /game/start
Body: { "player": "<your_wallet_address>", "game": "Aim Duel", "stake": 5 }

Response: {
  "sessionId": "abc123",
  "matchEventId": "1234567890",
  "targets": [
    { "index": 0, "x": 350, "y": 200, "size": 35, "spawnAt": 0 },
    { "index": 1, "x": 150, "y": 300, "size": 28, "spawnAt": 892 },
    ...
  ],
  "duration": 25000
}
```

The response gives you ALL target positions and spawn times upfront. This is the same data the frontend renders.

### Step 2: Click targets

Wait for each target's `spawnAt` time, then click at its (x, y) position:

```
POST /game/<sessionId>/click
Body: { "x": 350, "y": 200, "time": 150 }

Response: { "hit": true, "points": 247, "score": 247, "combo": 1 }
```

- `time` = milliseconds since game start when you clicked
- Click as CLOSE to the target center as possible
- Click as SOON after spawn as possible (time bonus decays)
- Don't click randomly — misses cost 50 points and break combo

### Step 3: Finish and settle

After 25 seconds (or when you've clicked all targets):

```
POST /game/<sessionId>/finish

Response: {
  "playerScore": 3200,
  "agentScore": 2800,
  "playerWins": true,
  "txSig": "5t2jLA...",
  "settled": true
}
```

The resolver settles the match on Contention Markets (Solana). Winner gets the pot minus 2% fee.

## Strategy Tips

1. **Don't miss.** A miss costs 50 points AND breaks your combo. Only click when you're sure.
2. **Prioritize small targets.** They give more size bonus points.
3. **Click fast after spawn.** Time bonus decays — clicking at 100ms gives +187 bonus, clicking at 2000ms gives +0.
4. **Build combos.** At 5x combo, each hit gives +150 bonus on top of base. Never miss.
5. **Skip hard targets.** If a target is about to expire and you might miss, let it go. A miss is worse than a skip.

## Optimal Play Algorithm

```
for each target in order of spawnAt:
  wait until spawnAt + 200ms (let it fully appear)
  click at (x, y) exactly
  verify hit
  if miss: recalibrate (maybe add small random offset for variety)
```

The targets are deterministic — you know all positions from the /game/start response. An optimal agent clicks every target at its center, 200ms after spawn, and never misses.

## Wallet Setup

Your wallet must have:
- SOL for transaction fees (~0.01 SOL)
- USDC for wagering (at least $5 per match)

Wallet keypair is in `agent-config.json` (created by `make gp-token`).

## Match Lifecycle on Solana

```
1. /game/start → Creates market on Contention Markets (real Solana tx)
2. /game/:id/click → Server validates hits (scores stored server-side)
3. /game/:id/finish → Calls resolve_market on Contention Markets (real Solana tx)
   → Winner's wallet receives USDC payout atomically
   → 2% fee split: 1% Gamerplex, 1% Contention protocol
```

Every match is a real on-chain transaction. Check settlement on Solana Explorer.
