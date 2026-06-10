// PDA derivation for gamerplex-arcade v1.4.

import { PublicKey } from "@solana/web3.js";
import { Buffer } from "buffer";

export const ARCADE_PROGRAM_ID = new PublicKey(
  "4FVwdxxBp6PTax2tAcPyHE9rYt8tyNf2YBGrSnSqmx8t",
);

const enc = (s: string) => Buffer.from(s);

export function configPda(programId: PublicKey = ARCADE_PROGRAM_ID): PublicKey {
  return PublicKey.findProgramAddressSync([enc("config")], programId)[0];
}

export function stablecoinConfigPda(programId: PublicKey = ARCADE_PROGRAM_ID): PublicKey {
  return PublicKey.findProgramAddressSync([enc("stablecoins")], programId)[0];
}

export function ratesPda(programId: PublicKey = ARCADE_PROGRAM_ID): PublicKey {
  return PublicKey.findProgramAddressSync([enc("rates")], programId)[0];
}

export function affiliateConfigPda(programId: PublicKey = ARCADE_PROGRAM_ID): PublicKey {
  return PublicKey.findProgramAddressSync([enc("affiliate")], programId)[0];
}

export function gamePda(gameId: number, programId: PublicKey = ARCADE_PROGRAM_ID): PublicKey {
  return PublicKey.findProgramAddressSync(
    [enc("game"), new Uint8Array([gameId])],
    programId,
  )[0];
}

export function profilePda(player: PublicKey, programId: PublicKey = ARCADE_PROGRAM_ID): PublicKey {
  return PublicKey.findProgramAddressSync(
    [enc("profile"), player.toBuffer()],
    programId,
  )[0];
}

export function receiptPda(player: PublicKey, nonce: bigint, programId: PublicKey = ARCADE_PROGRAM_ID): PublicKey {
  const buf = new ArrayBuffer(8);
  new DataView(buf).setBigUint64(0, nonce, true);
  return PublicKey.findProgramAddressSync(
    [enc("receipt"), player.toBuffer(), new Uint8Array(buf)],
    programId,
  )[0];
}
