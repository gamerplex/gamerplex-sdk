# Battleship on Private Ephemeral Rollup (PER)

Ship positions are hidden at the HARDWARE level using Intel TDX Trusted Execution Environment. Even the validator operator cannot see ship positions.

## Architecture

```
Standard ER:   Validator sees all data → only hides from RPC queries
Private ER:    TEE hardware encrypts data → nobody can see, not even the machine

Battleship boards → delegated to PER (tee.magicblock.app)
  → Ships hidden in TEE memory
  → Program validates hits/misses inside TEE
  → Attack results (hit/miss) are PUBLIC
  → Ship positions stay PRIVATE until game ends
  → On finish: permissions cleared, boards revealed for verification
```

## Client-Side PER Integration

### 1. Verify TEE Integrity

Before trusting the PER endpoint, verify it's running in a real TEE:

```typescript
import {
  verifyTeeRpcIntegrity,
  getAuthToken,
} from "@magicblock-labs/ephemeral-rollups-sdk";

const PER_RPC = "https://tee.magicblock.app";

// Verify the hardware attestation
const isVerified = await verifyTeeRpcIntegrity(PER_RPC);
if (!isVerified) throw new Error("TEE integrity check failed");
```

### 2. Get Auth Token

```typescript
import nacl from "tweetnacl";

const token = await getAuthToken(
  PER_RPC,
  wallet.publicKey,
  (message: Uint8Array) =>
    Promise.resolve(nacl.sign.detached(message, wallet.secretKey))
);

// All subsequent requests include this token
const perConnection = new Connection(`${PER_RPC}?token=${token}`);
```

### 3. Delegate Board to PER (Not Standard ER)

The delegation instruction is the same. The difference is WHICH validator receives the delegation:

```typescript
// Standard ER (NOT private):
// const erConnection = new Connection("https://devnet.magicblock.app");

// Private ER (TEE-secured):
const perConnection = new Connection(`${PER_RPC}?token=${token}`);

// Delegate board account to PER
const tx = await program.methods
  .delegateBoard()
  .accounts({
    board: boardPda,
    payer: wallet.publicKey,
  })
  .transaction();

// Send delegation to BASE LAYER (Solana devnet)
await sendAndConfirmTransaction(baseConnection, tx, [wallet]);

// Now all operations on the board go through PER
// The board data is encrypted in TEE hardware
```

### 4. Create Permission (Restrict Board Visibility)

```typescript
// Only the board owner can read their own board
const members = [
  {
    flags: AUTHORITY_FLAG | TX_LOGS_FLAG,
    pubkey: playerWallet.publicKey,
  },
];

const tx = await program.methods
  .createBoardPermission(gameId, members)
  .accounts({
    board: boardPda,
    permission: permissionPda,
    payer: playerWallet.publicKey,
    permissionProgram: PERMISSION_PROGRAM_ID,
    systemProgram: SystemProgram.programId,
  })
  .transaction();

// Send to PER
await sendAndConfirmTransaction(perConnection, tx, [playerWallet]);
```

### 5. Attack (Through PER)

```typescript
// Player sends attack to PER
// The TEE reads the opponent's hidden board inside encrypted memory
// Returns hit/miss but NEVER reveals ship positions

const tx = await program.methods
  .attack(cellIndex)
  .accounts({
    game: gamePda,
    opponentBoard: opponentBoardPda,
    player: wallet.publicKey,
  })
  .transaction();

// Send to PER (where the TEE validates)
await sendAndConfirmTransaction(perConnection, tx, [wallet], {
  skipPreflight: true,
});
```

### 6. Finish Game (Commit to L1 + Reveal Boards)

```typescript
// Removes permissions → boards become public for post-game verification
// Commits game state back to Solana L1
// Contention Markets can then read game.winner and settle the wager

const tx = await program.methods
  .finishGame()
  .accounts({
    game: gamePda,
    p1Board: p1BoardPda,
    p2Board: p2BoardPda,
    p1Permission: p1PermissionPda,
    p2Permission: p2PermissionPda,
    payer: wallet.publicKey,
    permissionProgram: PERMISSION_PROGRAM_ID,
  })
  .transaction();

await sendAndConfirmTransaction(perConnection, tx, [wallet], {
  skipPreflight: true,
});
```

## Security Model

| Who | Can See Ship Positions? | Why |
|-----|:-----------------------:|-----|
| Board owner | Yes | Permission flag grants access |
| Opponent | No | No permission flag |
| Spectators | No | No permission flag |
| Validator operator | No | TEE hardware encryption |
| MagicBlock team | No | TEE hardware encryption |
| Gamerplex | No | TEE hardware encryption |
| Post-game (everyone) | Yes | Permissions cleared on finish |

## Contention Markets Integration

After `finish_game` commits the game state to L1:
1. `game.winner` is readable on Solana L1 (1=P1, 2=P2)
2. Resolver reads this value
3. Resolver calls `resolve_market` on Contention Markets
4. Winner receives payout atomically
5. Both boards are now public — anyone can verify the game was fair

## Programs

- Battleship: `HAyynhcKsdMjmo5RPTJCTogwCnXVjB2ZZDK44c3ARX4t` (devnet)
- Contention Markets: `69YfcveAbLbJ5LNERjq6k5wnszfZbXMYVzx2j8Ca1Xo8` (devnet)
- PER endpoint: `https://tee.magicblock.app`
