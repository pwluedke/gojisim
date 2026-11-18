import { getAllCards } from "@gojisim/cards/all-cards";
import { type NamedDeck, parseDeckList } from "@gojisim/cards/deck-lists";
import { useEffect, useState } from "react";
import { drawCardsAsText } from "./cardImage";
import { type PrivateSetData, registerPrivateSet } from "./privateSetData";

/*
 * Paul's private card set (Nov 17): cards only some accounts see. The server sends it from
 * `GET /api/private-set` to those accounts only (everyone else, the dev server and signed-out
 * pages get a 404, and nothing here changes). Its cards and abilities are registered with
 * `@gojisim/cards` once, so deck lists, the Deckbuilder and the engine know them; they're drawn
 * as text cards (`cardImage.ts`); the bot's worker gets its cards and abilities with each request
 * (`privateBotSet`), since a worker shares no modules with the page; its decks join the pickers
 * after the test decks.
 */

export interface PrivateSet {
  decks: NamedDeck[];
}

let forBot: PrivateSetData | null = null;

/** The set's cards and abilities, for the bot worker; null without a set. */
export function privateBotSet(): PrivateSetData | null {
  return forBot;
}

/** Fetches and registers the private set; null when the account has none. */
export async function loadPrivateSet(
  fetchImpl: typeof fetch = fetch,
): Promise<PrivateSet | null> {
  try {
    const res = await fetchImpl("/api/private-set", {
      headers: { accept: "application/json" },
    });
    if (!res.ok) return null;
    const data = (await res.json()) as {
      cards: unknown;
      abilities: Record<string, unknown>;
      decks: { name: string; list: string }[];
    };
    forBot = { cards: data.cards, abilities: data.abilities };
    registerPrivateSet(forBot);
    const known = new Set((data.cards as { id: number }[]).map((c) => c.id));
    drawCardsAsText(getAllCards().filter((c) => known.has(c.id)));
    const decks = data.decks.flatMap((d) => parseDeckList(d.list).decks);
    return { decks };
  } catch {
    return null;
  }
}

// One read per page load, shared by every page that needs it.
let loading: Promise<PrivateSet | null> | null = null;

/** Starts the read (at the app's start, so the cards are known before a page needs them). */
export function startPrivateSet(): Promise<PrivateSet | null> {
  return (loading ??= loadPrivateSet());
}

/** The private set once read: null until then and for accounts without one. */
export function usePrivateSet(): PrivateSet | null {
  const [set, setSet] = useState<PrivateSet | null>(null);
  useEffect(() => {
    let live = true;
    void startPrivateSet().then((s) => {
      if (live) setSet(s);
    });
    return () => {
      live = false;
    };
  }, []);
  return set;
}
