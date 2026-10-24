import { useEffect, useRef, useState } from "react";
import { type DeckStore, deckStore, type SavedDeck } from "./deckStore";

/**
 * The player's saved decks (M7a), loaded once from IndexedDB. Every change shows at once and is
 * saved; when storage is unavailable the decks still work for this visit, with a note saying so.
 */
export function useMyDecks(store: DeckStore = deckStore()) {
  const [decks, setDecks] = useState<SavedDeck[]>([]);
  const [persistent, setPersistent] = useState(true);
  const [loaded, setLoaded] = useState(false);
  // Storage writes in flight; 0 once what is stored matches what shows.
  const [pending, setPending] = useState(0);
  const storeRef = useRef(store);

  useEffect(() => {
    let live = true;
    storeRef.current
      .list()
      .then((saved) => {
        if (live) setDecks((now) => mergeById(saved, now));
      })
      .catch(() => {
        if (live) setPersistent(false);
      })
      .finally(() => {
        if (live) setLoaded(true);
      });
    return () => {
      live = false;
    };
  }, []);

  const keep = (work: Promise<boolean>) => {
    setPending((n) => n + 1);
    void work
      .then((ok) => {
        if (!ok) setPersistent(false);
      })
      .finally(() => setPending((n) => n - 1));
  };

  const add = (...added: SavedDeck[]) => {
    setDecks((now) => [...now, ...added]);
    for (const deck of added) keep(storeRef.current.put(deck));
  };
  const rename = (id: string, name: string) => {
    const deck = decks.find((d) => d.id === id);
    if (!deck || !name.trim()) return;
    const renamed: SavedDeck = {
      ...deck,
      name: name.trim(),
      list: deck.list.replace(/^\[deck\].*$/m, `[deck] ${name.trim()}`),
      savedAt: deck.savedAt,
    };
    setDecks((now) => now.map((d) => (d.id === id ? renamed : d)));
    keep(storeRef.current.put(renamed));
  };
  const remove = (id: string) => {
    setDecks((now) => now.filter((d) => d.id !== id));
    keep(storeRef.current.remove(id));
  };
  return {
    decks,
    persistent,
    loaded,
    stored: loaded && pending === 0,
    add,
    rename,
    remove,
  };
}

/** Saved decks plus any added before they loaded (this visit's), without duplicates. */
function mergeById(saved: SavedDeck[], now: SavedDeck[]): SavedDeck[] {
  const ids = new Set(saved.map((d) => d.id));
  return [...saved, ...now.filter((d) => !ids.has(d.id))];
}
