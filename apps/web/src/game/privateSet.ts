import { registerAbilities } from "@gojisim/cards";
import { getAllCards, registerCards } from "@gojisim/cards/all-cards";
import { type NamedDeck, parseDeckList } from "@gojisim/cards/deck-lists";
import { useEffect, useState } from "react";
import { drawCardsAsText, setCardPictures } from "./cardImage";

/*
 * Paul's private card set (Nov 17): cards only some accounts see. The server sends it from
 * `GET /api/private-set` to those accounts only (everyone else, the dev server and signed-out
 * pages get a 404, and nothing here changes). Its cards and abilities are registered with
 * `@gojisim/cards` once, so deck lists, the Deckbuilder and the engine know them; they're drawn
 * as text cards (`cardImage.ts`); the bot's worker gets the abilities with each request
 * (`privateAbilities`); its decks join the pickers after the test decks.
 */

export interface PrivateSet {
  decks: NamedDeck[];
}

let abilities: Record<string, unknown> | null = null;

/** The set's abilities, for the bot worker; null without a set. */
export function privateAbilities(): Record<string, unknown> | null {
  return abilities;
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
      /** Card numbers with a picture, sent by the owner-only image route. */
      images?: string[];
    };
    registerCards(data.cards);
    registerAbilities(data.abilities);
    abilities = data.abilities;
    const known = new Set((data.cards as { id: number }[]).map((c) => c.id));
    const mine = getAllCards().filter((c) => known.has(c.id));
    drawCardsAsText(mine);
    // A card with a picture shows it; the others keep their text faces.
    const pictured = new Set(data.images ?? []);
    setCardPictures(
      new Map(
        mine
          .filter((c) => pictured.has(c.cardNumber))
          .map((c) => [
            c.id,
            `/api/private-set/image/${encodeURIComponent(c.cardNumber)}`,
          ]),
      ),
    );
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
