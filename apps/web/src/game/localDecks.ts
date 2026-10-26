import {
  type DeckListError,
  type NamedDeck,
  parseDeckList,
} from "@gojisim/cards/deck-lists";
import { files } from "virtual:gojisim-local-decks";

/** One deck from a development deck file (`local-decks/*.txt`). */
export interface FileDeck {
  file: string;
  /** The `[deck]` name's folder ("decklog" for "decklog/Red Rush"), or `null`. */
  folder: string | null;
  /** The name without its folder. */
  label: string;
  /** The deck, under its full `[deck]` name. */
  deck: NamedDeck;
}

/** One file's parse errors (unknown card numbers and the like), with their lines. */
export interface FileErrors {
  file: string;
  errors: DeckListError[];
}

export interface LocalDecks {
  decks: FileDeck[];
  /** Per file, decks read from it (errors or not). */
  counts: { file: string; decks: number }[];
  errors: FileErrors[];
  /** How long parsing took (ms), for the load-time check. */
  parseMs: number;
}

/**
 * Parses the development deck files. Each deck's folder is the part of its `[deck]` name before
 * the last "/". A file's errors are kept once, per file; the rest of each deck still loads, as
 * `parseDeckList` does.
 */
export function parseLocalDecks(
  input: readonly { file: string; text: string }[],
): LocalDecks {
  const start = performance.now();
  const decks: FileDeck[] = [];
  const counts: LocalDecks["counts"] = [];
  const errors: FileErrors[] = [];
  for (const { file, text } of input) {
    const parsed = parseDeckList(text);
    counts.push({ file, decks: parsed.decks.length });
    if (parsed.errors.length > 0) errors.push({ file, errors: parsed.errors });
    for (const deck of parsed.decks) {
      const cut = deck.name.lastIndexOf("/");
      decks.push({
        file,
        folder: cut > 0 ? deck.name.slice(0, cut) : null,
        label: cut > 0 ? deck.name.slice(cut + 1) : deck.name,
        deck,
      });
    }
  }
  return { decks, counts, errors, parseMs: performance.now() - start };
}

let parsed: LocalDecks | null = null;

/** The development decks of this page load (dev server only; none in a production build). */
export function localDecks(): LocalDecks {
  parsed ??= parseLocalDecks(files);
  return parsed;
}

/** The picker group a file deck goes in: its file, and its folder when it has one. */
export const fileGroup = (deck: Pick<FileDeck, "file" | "folder">) =>
  deck.folder ? `${deck.file} › ${deck.folder}` : deck.file;
