import {
  type GameState,
  getLegalActions,
  getPlayerView,
  type PlayerId,
  type PlayerSetup,
} from "@gojisim/engine";
import type { BotInput, BotSettings, Decklist, Knowledge } from "./types";

/** mulberry32 seeded from a string or number: uniform in [0, 1). */
export function seededRng(seed: string | number): () => number {
  let state =
    typeof seed === "number"
      ? seed >>> 0
      : [...seed].reduce(
          (h, ch) => Math.imul(h ^ ch.charCodeAt(0), 0x01000193) >>> 0,
          0x811c9dc5,
        );
  return () => {
    state = (state + 0x6d2b79f5) >>> 0;
    let t = state;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Both decklists, keyed by player; `botInput` keeps only the bot's own (Q42). */
export function decklistsOf(
  decks: readonly PlayerSetup[],
): Record<PlayerId, Decklist> {
  return Object.fromEntries(
    decks.map((d) => [
      d.id,
      { monsterDeck: d.monsterDeck, mainDeck: d.mainDeck },
    ]),
  );
}

/**
 * Everything a bot gets for one decision, built only from what `botId` may see: its view, its
 * legal actions (concede left out), its own decklist and the public log. The opponent's decklist
 * is dropped here (Q42: presented, never shown, 6.3.1.1), so no caller can pass it on; only the
 * tools' `knowsDecklists: true` setting keeps it, for comparisons. `asOf` is the game's date (the
 * restriction list a guessed deck follows). The real state is used only to compute these; the
 * bot never receives it.
 */
export function botInput(
  state: GameState,
  botId: PlayerId,
  decks: Record<PlayerId, Decklist>,
  rng: () => number,
  settings: BotSettings = {},
  asOf?: string,
): BotInput {
  const view = getPlayerView(state, botId);
  const own = decks[botId];
  // `true` from code, "true" from a command line's `key=value` settings.
  const knows =
    settings["knowsDecklists"] === true ||
    settings["knowsDecklists"] === "true";
  const knowledge: Knowledge = {
    decks: knows ? decks : own ? { [botId]: own } : {},
    log: view.log,
    ...(asOf ? { asOf } : {}),
  };
  return {
    view,
    legalActions: getLegalActions(state, botId).filter(
      (a) => a.type !== "concede",
    ),
    knowledge,
    rng,
    settings,
  };
}
