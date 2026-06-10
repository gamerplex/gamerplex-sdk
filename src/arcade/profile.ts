// Profile fetch helper for the arcade contract v1.4.

import { Connection, PublicKey } from "@solana/web3.js";
import { profilePda } from "./pdas";

/** Returns the raw account info or null. Caller can decode via
 *  program.account.playerProfile.fetch() if they hold a Program instance. */
export async function fetchProfile(
  connection: Connection,
  wallet: PublicKey,
): Promise<{ data: Buffer; lamports: number; owner: PublicKey } | null> {
  const info = await connection.getAccountInfo(profilePda(wallet));
  if (!info) return null;
  return { data: info.data as Buffer, lamports: info.lamports, owner: info.owner };
}
