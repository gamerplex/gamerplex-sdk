import { describe, it, expect, vi } from "vitest";
import {
  SaveTier,
  MODE_TIER,
  getAvailableTiers,
  getGameModes,
  saveResult,
  dbSaver,
  type GameManifest,
  type GameResult,
} from "../index";

const base: GameManifest = { gameId: 1, slug: "cyber-snake" };
const arena: GameManifest = { gameId: 3, slug: "chess", supportsArena: true, supportsWager: true };
const result: GameResult = { score: 100, variant: "v1" };

describe("save tiers/modes", () => {
  it("non-arena game offers web2 + arcade only", () => {
    expect(getAvailableTiers(base)).toEqual([SaveTier.DB, SaveTier.OnchainScore]);
  });
  it("arena game adds Live", () => {
    expect(getAvailableTiers(arena)).toContain(SaveTier.Live);
  });
  it("start-page modes: casual+ranked always; live/wager gated", () => {
    expect(getGameModes(base).map((c) => c.mode)).toEqual(["casual", "ranked"]);
    expect(getGameModes(arena).map((c) => c.mode)).toEqual(["casual", "ranked", "live", "wager"]);
  });
  it("each mode maps to the right tier", () => {
    expect(MODE_TIER.casual).toBe(SaveTier.DB);
    expect(MODE_TIER.ranked).toBe(SaveTier.OnchainScore);
    expect(MODE_TIER.live).toBe(SaveTier.Live);
    expect(getGameModes(arena).find((c) => c.mode === "ranked")?.costLabel).toBe("$0.05");
  });
});

describe("saveResult routing", () => {
  it("routes each tier to its handler", async () => {
    const handlers = {
      db: vi.fn(async () => ({ tier: SaveTier.DB, ok: true })),
      onchainScore: vi.fn(async () => ({ tier: SaveTier.OnchainScore, ok: true })),
      live: vi.fn(async () => ({ tier: SaveTier.Live, ok: true })),
    };
    await saveResult(SaveTier.DB, result, base, handlers);
    await saveResult(SaveTier.OnchainScore, result, base, handlers);
    await saveResult(SaveTier.Live, result, arena, handlers);
    expect(handlers.db).toHaveBeenCalledOnce();
    expect(handlers.onchainScore).toHaveBeenCalledOnce();
    expect(handlers.live).toHaveBeenCalledOnce();
  });
  it("fails closed when a handler is missing (e.g. arena not wired)", async () => {
    const out = await saveResult(SaveTier.Live, result, arena, {});
    expect(out.ok).toBe(false);
    expect(out.error).toContain("arena");
  });
});

describe("dbSaver (Tier 1 web2)", () => {
  it("POSTs the result and returns the row id", async () => {
    const fetchMock = vi.fn(async () => ({ ok: true, json: async () => ({ id: 42 }) }));
    vi.stubGlobal("fetch", fetchMock);
    const out = await dbSaver("https://gamerplex.com/api/scores")(result, base);
    expect(out.ok).toBe(true);
    expect(out.ref).toBe("42");
    expect(fetchMock).toHaveBeenCalledOnce();
    vi.unstubAllGlobals();
  });
});
