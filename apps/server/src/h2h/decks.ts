import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import type { DatabaseSync } from "node:sqlite";
import { parseDeckList } from "@gojisim/cards/deck-lists";
import { deckLegalityFor, type MatchMode } from "@gojisim/engine";
import { playerDecks } from "../accountData.js";
import type { SeatPlayer } from "./room.js";

/*
 * The deck a head to head player brings (M9a): one of their own My decks (the server's synced
 * copy, so the list never comes from the other player's client) or an official starter. A
 * Tournament game takes legal decks only, as in `/play`.
 */

/** What the client names: a My decks id, or a starter. */
export type DeckChoice =
  | { source: "mine"; id: string }
  | { source: "official"; set: "ESD01" | "ESD02" };

const STARTERS = {
  ESD01: "esd01-starter.txt",
  ESD02: "esd02-starter.txt",
} as const;

const require = createRequire(import.meta.url);
const starterText = (set: keyof typeof STARTERS) =>
  readFileSync(
    require.resolve(`@gojisim/cards/data/decks/${STARTERS[set]}`),
    "utf8",
  );

export type DeckResult =
  | { ok: true; deckName: string; deck: SeatPlayer["deck"] }
  | { ok: false; error: string };

export function resolveDeck(
  db: DatabaseSync,
  playerId: string,
  choice: unknown,
  mode: MatchMode,
  now: Date,
): DeckResult {
  const c = choice as Partial<{ source: string; id: unknown; set: unknown }>;
  let text: string;
  let name: string;
  if (c?.source === "mine" && typeof c.id === "string") {
    const saved = playerDecks(db, playerId).find(
      (d) => d.id === c.id && !d.deleted,
    );
    if (!saved) return { ok: false, error: "no-such-deck" };
    text = saved.list;
    name = saved.name;
  } else if (
    c?.source === "official" &&
    (c.set === "ESD01" || c.set === "ESD02")
  ) {
    text = starterText(c.set);
    name = `${c.set} official`;
  } else return { ok: false, error: "bad-deck" };
  const parsed = parseDeckList(text);
  const deck = parsed.decks[0];
  if (!deck || parsed.errors.length > 0)
    return { ok: false, error: "bad-deck" };
  const legal = deckLegalityFor(
    [{ id: "P1", monsterDeck: deck.monsterDeck, mainDeck: deck.mainDeck }],
    now,
  )[0]?.legal;
  if (mode === "tournament" && !legal)
    return { ok: false, error: "illegal-deck" };
  return {
    ok: true,
    deckName: name,
    deck: { monsterDeck: deck.monsterDeck, mainDeck: deck.mainDeck },
  };
}
