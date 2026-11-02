import {
  formatDeckList,
  type NamedDeck,
  parseDeckList,
} from "@gojisim/cards/deck-lists";
import { browserIdb, runInStore } from "./db";

/**
 * "My decks" (M7a): decks a player imported, saved in this browser's IndexedDB. Each is kept as
 * GojiSim deck list text, so it reads back with the same parser and survives card data updates
 * by card number. When storage is unavailable, `useMyDecks` keeps them for the current visit.
 */

export interface SavedDeck {
  id: string;
  name: string;
  /** The deck as GojiSim deck list text (`formatDeckList`), with this deck's name. */
  list: string;
  /** ISO time it was saved or last changed. */
  savedAt: string;
  /** #152: ISO time of its last edit (a rename too), for the account sync's newest-wins rule. */
  updatedAt?: string;
}

/** A saved deck as a deck to play; `null` if its list no longer parses cleanly. */
export function deckOf(saved: SavedDeck): NamedDeck | null {
  const { decks, errors } = parseDeckList(saved.list);
  const deck = decks[0];
  return deck && errors.length === 0 ? { ...deck, name: saved.name } : null;
}

/** A new saved deck from a parsed deck and the name the player gave it. */
export function savedDeck(
  deck: NamedDeck,
  name: string,
  now = new Date(),
): SavedDeck {
  const named = { ...deck, name };
  return {
    id: `d${now.getTime().toString(36)}${Math.random().toString(36).slice(2, 6)}`,
    name,
    list: formatDeckList([named]),
    savedAt: now.toISOString(),
  };
}

export interface DeckStore {
  /** Every saved deck, oldest first; throws when storage is unavailable. */
  list(): Promise<SavedDeck[]>;
  /** Saves (adds or replaces) a deck; resolves `false` when storage is unavailable. */
  put(deck: SavedDeck): Promise<boolean>;
  /** Deletes a deck; resolves `false` when storage is unavailable. */
  remove(id: string): Promise<boolean>;
}

/** The deck store on `idb` (the browser's IndexedDB by default; tests pass a fake). */
export function deckStore(
  idb: IDBFactory | undefined = browserIdb(),
): DeckStore {
  return {
    async list() {
      if (!idb) throw new Error("No IndexedDB in this browser");
      const all = await runInStore<SavedDeck[]>(idb, "decks", "readonly", (s) =>
        s.getAll(),
      );
      return [...all].sort((a, b) => a.savedAt.localeCompare(b.savedAt));
    },
    async put(deck) {
      if (!idb) return false;
      try {
        await runInStore(idb, "decks", "readwrite", (s) =>
          s.put(deck, deck.id),
        );
        return true;
      } catch {
        return false;
      }
    },
    async remove(id) {
      if (!idb) return false;
      try {
        await runInStore(idb, "decks", "readwrite", (s) => s.delete(id));
        return true;
      } catch {
        return false;
      }
    },
  };
}

/** The backup file's shape: every saved deck as a name and its GojiSim deck list text. */
export interface DeckBackup {
  app: "gojisim";
  kind: "decks";
  version: 1;
  decks: { name: string; list: string }[];
}

/** One JSON backup file for all saved decks. */
export function backupJson(decks: readonly SavedDeck[]): string {
  const backup: DeckBackup = {
    app: "gojisim",
    kind: "decks",
    version: 1,
    decks: decks.map(({ name, list }) => ({ name, list })),
  };
  return `${JSON.stringify(backup, null, 2)}\n`;
}

/**
 * Reads a backup file: the decks it holds (each must parse with no errors), and the problems,
 * one per skipped deck or one for a file that isn't a backup.
 */
export function readBackup(
  text: string,
  now = new Date(),
): { decks: SavedDeck[]; problems: string[] } {
  let data: unknown;
  try {
    data = JSON.parse(text);
  } catch {
    return { decks: [], problems: ["Not a GojiSim deck backup (not JSON)"] };
  }
  const backup = data as Partial<DeckBackup>;
  if (
    backup?.app !== "gojisim" ||
    backup.kind !== "decks" ||
    !Array.isArray(backup.decks)
  )
    return { decks: [], problems: ["Not a GojiSim deck backup"] };
  const decks: SavedDeck[] = [];
  const problems: string[] = [];
  backup.decks.forEach((entry, i) => {
    const name = typeof entry?.name === "string" ? entry.name : `Deck ${i + 1}`;
    const { decks: parsed, errors } = parseDeckList(
      typeof entry?.list === "string" ? entry.list : "",
    );
    const deck = parsed[0];
    if (!deck || errors.length > 0) {
      problems.push(
        `${name}: ${errors[0]?.reason ?? "no deck in its list"} (skipped)`,
      );
      return;
    }
    // A distinct time per deck keeps their order.
    decks.push(savedDeck(deck, name, new Date(now.getTime() + i)));
  });
  return { decks, problems };
}
