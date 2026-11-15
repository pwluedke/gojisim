import type { NamedDeck } from "@gojisim/cards/deck-lists";
import {
  testDecksOf,
  type TestDeckSet,
  validateTestDeckSet,
} from "@gojisim/cards/test-deck-set";
import { useEffect, useState } from "react";

/*
 * #359: the test decks (the decks the bot is tested with), from the server (`GET /api/test-decks`,
 * behind the sign-in) and never from the repo. They show after the starter decks in `/play`'s
 * pickers and the Deckbuilder. Without the route (signed out, the dev server) or with nothing
 * uploaded, there are none and the group doesn't show.
 */

/** The server's test decks, in the uploaded order; none when the route can't be read. */
export async function fetchTestDecks(
  fetchImpl: typeof fetch = fetch,
): Promise<NamedDeck[]> {
  try {
    // `accept` keeps the dev server's page fallback from answering with index.html.
    const res = await fetchImpl("/api/test-decks", {
      headers: { accept: "application/json" },
    });
    if (!res.ok) return [];
    const data: unknown = await res.json();
    return validateTestDeckSet(data).length === 0
      ? testDecksOf(data as TestDeckSet)
      : [];
  } catch {
    return [];
  }
}

// One read per page load, shared by every picker on the page.
let loading: Promise<NamedDeck[]> | null = null;

/** The test decks once read (empty until then, and when there are none). */
export function useTestDecks(): NamedDeck[] {
  const [decks, setDecks] = useState<NamedDeck[]>([]);
  useEffect(() => {
    let live = true;
    void (loading ??= fetchTestDecks()).then((d) => {
      if (live) setDecks(d);
    });
    return () => {
      live = false;
    };
  }, []);
  return decks;
}
