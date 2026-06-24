// Standard Gamerplex save-flow: the start-page mode picker + tier router that
// fronts every game. Decoupled — arcade/arena are wired in via SaveHandlers so
// this module never hard-depends on them.
// See ENGINEERING/GAME_SDK_AND_SAVE_FLOW_DESIGN.md.

import {
  SaveTier,
  type GameMode,
  type GameManifest,
  type GameResult,
  type SaveOutcome,
  type SaveHandlers,
} from "./types";

export * from "./types";

/** Each mode maps to one save tier. */
export const MODE_TIER: Record<GameMode, SaveTier> = {
  casual: SaveTier.DB,
  ranked: SaveTier.OnchainScore,
  live: SaveTier.Live,
  wager: SaveTier.Live,
};

/** Tiers available to a game: web2 + arcade always; live only if arena-registered. */
export function getAvailableTiers(m: GameManifest): SaveTier[] {
  const tiers = [SaveTier.DB, SaveTier.OnchainScore];
  if (m.supportsArena) tiers.push(SaveTier.Live);
  return tiers;
}

/** Start-page card metadata for the standard picker (UI renders these). */
export interface ModeCard {
  mode: GameMode;
  tier: SaveTier;
  title: string;
  costLabel: string;
}

const CARDS: Record<GameMode, Omit<ModeCard, "mode" | "tier">> = {
  casual: { title: "Casual", costLabel: "Free" },
  ranked: { title: "Ranked", costLabel: "$0.05" },
  live: { title: "Live PvP", costLabel: "gas-light" },
  wager: { title: "Wager", costLabel: "stake" },
};

/** The mode cards a game's start page should render, in order. */
export function getGameModes(m: GameManifest): ModeCard[] {
  const modes: GameMode[] = ["casual", "ranked"];
  if (m.supportsArena) modes.push("live");
  if (m.supportsWager) modes.push("wager");
  return modes.map((mode) => ({ mode, tier: MODE_TIER[mode], ...CARDS[mode] }));
}

/** Persist a finished game to the tier the player chose. */
export async function saveResult(
  tier: SaveTier,
  result: GameResult,
  manifest: GameManifest,
  handlers: SaveHandlers,
): Promise<SaveOutcome> {
  const fail = (error: string): SaveOutcome => ({ tier, ok: false, error });
  switch (tier) {
    case SaveTier.DB:
      return handlers.db ? handlers.db(result, manifest) : fail("no db handler");
    case SaveTier.OnchainScore:
      return handlers.onchainScore
        ? handlers.onchainScore(result, manifest)
        : fail("no onchainScore handler");
    case SaveTier.Live:
      return handlers.live ? handlers.live(result, manifest) : fail("no live handler (arena)");
    default:
      return fail("unknown tier");
  }
}

/** Ready-made Tier-1 handler: POST the result to a web2 scores endpoint. */
export function dbSaver(scoresUrl: string): NonNullable<SaveHandlers["db"]> {
  return async (result, manifest): Promise<SaveOutcome> => {
    try {
      const r = await fetch(scoresUrl, {
        method: "POST",
        headers: { "content-type": "application/json" },
        credentials: "include",
        body: JSON.stringify({
          gameId: manifest.gameId,
          slug: manifest.slug,
          score: result.score,
          variant: result.variant,
          meta: result.meta,
        }),
      });
      if (!r.ok) return { tier: SaveTier.DB, ok: false, error: `http_${r.status}` };
      const j = await r.json().catch(() => ({}));
      return { tier: SaveTier.DB, ok: true, ref: j.id ? String(j.id) : undefined };
    } catch (e) {
      return { tier: SaveTier.DB, ok: false, error: String((e as Error)?.message ?? e) };
    }
  };
}
