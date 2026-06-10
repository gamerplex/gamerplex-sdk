import express from "express";
import cors from "cors";
import { Keypair, PublicKey, Connection } from "@solana/web3.js";
import { BN } from "@coral-xyz/anchor";
import { getAssociatedTokenAddressSync } from "@solana/spl-token";
import { ContentionClient, GameSession, Outcome } from "../../src";
import dotenv from "dotenv";

dotenv.config();

// ─── Config ──────────────────────────────────────────────────────────────────

const PORT = parseInt(process.env.PORT || "8080");
const RPC_URL = process.env.RPC_URL || "https://api.devnet.solana.com";
const MINT = new PublicKey(
  process.env.MINT || "EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v"
);

// The partner keypair — registered on Contention Markets.
// This is the ONLY key that can resolve markets.
const PARTNER_SECRET = process.env.PARTNER_SECRET_KEY;
if (!PARTNER_SECRET) throw new Error("PARTNER_SECRET_KEY env required");
const partnerKeypair = Keypair.fromSecretKey(
  Buffer.from(JSON.parse(PARTNER_SECRET))
);

const PARTNER_TREASURY = new PublicKey(
  process.env.PARTNER_TREASURY || partnerKeypair.publicKey.toBase58()
);
const PROTOCOL_TREASURY = new PublicKey(
  process.env.PROTOCOL_TREASURY || partnerKeypair.publicKey.toBase58()
);

// ─── Init SDK ────────────────────────────────────────────────────────────────

const client = new ContentionClient({
  rpcUrl: RPC_URL,
  partnerAuthority: partnerKeypair,
  mint: MINT,
});

const session = new GameSession(client, {
  partner: PARTNER_TREASURY,
  protocol: PROTOCOL_TREASURY,
});

// ─── In-memory match registry ────────────────────────────────────────────────

interface ActiveMatch {
  matchId: string;
  gameId: string;
  eventId: BN;
  marketPda: PublicKey;
  vaultPda: PublicKey;
  p1: PublicKey;
  p2: PublicKey;
  stake: number;
  createdAt: number;
  status: "created" | "funded" | "playing" | "resolved";
}

const matches = new Map<string, ActiveMatch>();

// ─── Express App ─────────────────────────────────────────────────────────────

const app = express();
app.use(cors({ origin: process.env.ALLOWED_ORIGINS?.split(",") || "*" }));
app.use(express.json());

// ─── Authentication ──────────────────────────────────────────────────────────
const API_KEY = process.env.API_KEY;
if (!API_KEY) console.warn("WARNING: API_KEY not set — all endpoints are open!");

app.use((req, res, next) => {
  // Public endpoints: health, feed, match status
  if (req.path === "/health" || req.path === "/feed" || (req.method === "GET" && req.path.startsWith("/match/"))) {
    return next();
  }
  // Protected endpoints: create, resolve
  if (API_KEY && req.headers["x-api-key"] !== API_KEY) {
    return res.status(401).json({ error: "Unauthorized" });
  }
  next();
});

// ─── Rate Limiting (in-memory, simple) ───────────────────────────────────────
const rateLimits = new Map<string, { count: number; resetAt: number }>();
const MAX_REQUESTS_PER_MINUTE = 20;

app.use("/match/create", (req, res, next) => {
  const ip = req.ip || "unknown";
  const now = Date.now();
  const entry = rateLimits.get(ip);
  if (entry && entry.resetAt > now) {
    if (entry.count >= MAX_REQUESTS_PER_MINUTE) {
      return res.status(429).json({ error: "Rate limit exceeded" });
    }
    entry.count++;
  } else {
    rateLimits.set(ip, { count: 1, resetAt: now + 60_000 });
  }
  next();
});

// ─── Max concurrent matches ──────────────────────────────────────────────────
const MAX_ACTIVE_MATCHES = 500;

// Health check
app.get("/health", (_, res) => {
  res.json({
    status: "ok",
    partner: partnerKeypair.publicKey.toBase58(),
    activeMatches: matches.size,
  });
});

/**
 * POST /match/create
 *
 * Game frontend calls this to create a new wagered match.
 * Returns the match ID, market PDA, and vault PDA.
 * Players then deposit directly via their wallets.
 *
 * Body: { gameId, p1, p2, stake, metadata?, expiresIn? }
 */
app.post("/match/create", async (req, res) => {
  try {
    const { gameId, p1, p2, stake, metadata, expiresIn } = req.body;

    if (!gameId || !p1 || !p2 || !stake) {
      return res.status(400).json({ error: "Missing: gameId, p1, p2, stake" });
    }

    // Guard against unbounded match creation
    const activeCount = Array.from(matches.values()).filter(m => m.status !== "resolved").length;
    if (activeCount >= MAX_ACTIVE_MATCHES) {
      return res.status(503).json({ error: "Too many active matches. Try again later." });
    }

    const p1Key = new PublicKey(p1);
    const p2Key = new PublicKey(p2);
    const expiresAt = expiresIn
      ? Math.floor(Date.now() / 1000) + expiresIn
      : 0;

    const match = await session.create({
      p1: p1Key,
      p2: p2Key,
      metadata: metadata || JSON.stringify({ game: gameId }),
      expiresAt,
    });

    const matchId = match.eventId.toString();
    matches.set(matchId, {
      matchId,
      gameId,
      eventId: match.eventId,
      marketPda: match.marketPda,
      vaultPda: match.vaultPda,
      p1: p1Key,
      p2: p2Key,
      stake,
      createdAt: Date.now(),
      status: "created",
    });

    res.json({
      matchId,
      marketPda: match.marketPda.toBase58(),
      vaultPda: match.vaultPda.toBase58(),
      mint: MINT.toBase58(),
      message: "Match created. Players should deposit via their wallets.",
    });
  } catch (err: any) {
    console.error("Create match error:", err);
    res.status(500).json({ error: "Failed to create match" });
  }
});

/**
 * POST /match/resolve
 *
 * Game frontend calls this when a match ends.
 * The resolver validates and settles on-chain.
 *
 * Body: { matchId, winner: "p1" | "p2" | "cancel", proof? }
 */
app.post("/match/resolve", async (req, res) => {
  try {
    const { matchId, winner, proof } = req.body;

    if (!matchId || !winner) {
      return res.status(400).json({ error: "Missing: matchId, winner" });
    }

    const match = matches.get(matchId);
    if (!match) {
      return res.status(404).json({ error: "Match not found" });
    }
    if (match.status === "resolved") {
      return res.status(400).json({ error: "Match already resolved" });
    }

    // Determine outcome
    let outcome: number;
    if (winner === "p1") outcome = Outcome.P1_WINS;
    else if (winner === "p2") outcome = Outcome.P2_WINS;
    else if (winner === "cancel") outcome = Outcome.CANCELLED;
    else return res.status(400).json({ error: 'winner must be "p1", "p2", or "cancel"' });

    // TODO: Validate proof (game-specific anti-cheat).
    // For V1, we trust the game frontend.
    // For V2, require signed game state or MagicBlock rollup proof.

    const result = await session.resolve(
      {
        eventId: match.eventId,
        marketPda: match.marketPda,
        vaultPda: match.vaultPda,
        p1: match.p1,
        p2: match.p2,
        mint: MINT,
        authority: partnerKeypair.publicKey,
      },
      outcome
    );

    match.status = "resolved";

    // Close market to reclaim rent
    try {
      await session.close({
        eventId: match.eventId,
        marketPda: match.marketPda,
        vaultPda: match.vaultPda,
        p1: match.p1,
        p2: match.p2,
        mint: MINT,
        authority: partnerKeypair.publicKey,
      });
    } catch {
      // Non-critical — rent stays locked until manual cleanup
    }

    res.json({
      matchId,
      outcome: winner,
      txSignature: result.txSignature,
      totalPot: result.totalPot.toString(),
    });
  } catch (err: any) {
    console.error("Resolve match error:", err);
    res.status(500).json({ error: "Failed to resolve match" });
  }
});

/**
 * GET /match/:id
 *
 * Get match status and on-chain state.
 */
app.get("/match/:id", async (req, res) => {
  const match = matches.get(req.params.id);
  if (!match) return res.status(404).json({ error: "Match not found" });

  try {
    const state = await client.fetchMarket(match.marketPda);
    res.json({
      ...match,
      marketPda: match.marketPda.toBase58(),
      vaultPda: match.vaultPda.toBase58(),
      p1: match.p1.toBase58(),
      p2: match.p2.toBase58(),
      onChain: {
        p1Deposit: state.p1Deposit.toString(),
        p2Deposit: state.p2Deposit.toString(),
        resolved: state.resolved,
        settled: state.settled,
        winningOutcome: state.winningOutcome,
      },
    });
  } catch {
    res.json({ ...match, onChain: null });
  }
});

/**
 * GET /feed
 *
 * Live feed of recent matches (for the arena).
 */
app.get("/feed", (_, res) => {
  const recent = Array.from(matches.values())
    .sort((a, b) => b.createdAt - a.createdAt)
    .slice(0, 50)
    .map((m) => ({
      matchId: m.matchId,
      gameId: m.gameId,
      p1: m.p1.toBase58(),
      p2: m.p2.toBase58(),
      stake: m.stake,
      status: m.status,
      createdAt: m.createdAt,
    }));
  res.json(recent);
});

// ─── Start ───────────────────────────────────────────────────────────────────

app.listen(PORT, () => {
  console.log(`Gamerplex Resolver running on :${PORT}`);
  console.log(`Partner: ${partnerKeypair.publicKey.toBase58()}`);
  console.log(`RPC: ${RPC_URL}`);
  console.log(`Mint: ${MINT.toBase58()}`);
});
