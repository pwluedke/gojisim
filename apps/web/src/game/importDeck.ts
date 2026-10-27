import type { DeckFailure } from "@gojisim/cards";
import {
  type DeckListError,
  type DeckListFormat,
  type NamedDeck,
  parseAnyDeckList,
} from "@gojisim/cards/deck-lists";
import { checkDeck } from "./decks";

/** What the Import deck modal shows and allows for a pasted text (M7a). */
export interface ImportStatus {
  format: DeckListFormat | null;
  /** Every deck in the text (a GojiSim list can hold several). */
  decks: NamedDeck[];
  /** The chosen deck, if any. */
  deck: NamedDeck | undefined;
  /**
   * The name to suggest: the list's own name without its folder (`deckName`), or empty when it
   * has none (godzilla-sim's Export to Clipboard writes no name line), so the player names it.
   */
  suggestedName: string;
  /** Unknown card numbers and unreadable lines: they block saving. */
  errors: DeckListError[];
  /** Legality problems (size, copies, restriction list): warnings only, saving still works. */
  warnings: DeckFailure[];
  /** Whether Save is allowed with this name. */
  canSave: (name: string) => boolean;
}

export function importStatus(text: string, choice = 0): ImportStatus {
  const parsed = parseAnyDeckList(text);
  const deck = parsed.decks[choice] ?? parsed.decks[0];
  return {
    format: parsed.format,
    decks: parsed.decks,
    deck,
    suggestedName:
      deck && (parsed.format !== "gojisim" || /^\s*\[deck\]/im.test(text))
        ? deckName(deck.name)
        : "",
    errors: parsed.errors,
    warnings: deck ? checkDeck(deck).failures : [],
    canSave: (name) =>
      !!deck && parsed.errors.length === 0 && name.trim() !== "",
  };
}

/**
 * A deck's name for My decks: the `[deck]` name after its last "/". The folder groups development
 * decks (decision 422) and means nothing in My decks. A name with no "/", or nothing after it, is
 * kept whole.
 */
export function deckName(listName: string): string {
  const last = listName.slice(listName.lastIndexOf("/") + 1).trim();
  return last || listName.trim();
}

/** `name`, or `name (2)`, `name (3)` and so on, whichever isn't in `taken` yet. */
export function freeName(name: string, taken: ReadonlySet<string>): string {
  if (!taken.has(name)) return name;
  for (let n = 2; ; n++)
    if (!taken.has(`${name} (${n})`)) return `${name} (${n})`;
}

export interface ImportAll {
  /** The decks to save, named for My decks, in the list's order. */
  saved: { deck: NamedDeck; name: string }[];
  /** The decks that didn't parse (or have no cards), with their reasons. */
  failed: { name: string; reasons: string[] }[];
  /** Lines outside any deck (before the first header): nothing to save, but still reported. */
  stray: DeckListError[];
}

/**
 * Import all (several decks in one pasted list): every deck with no errors on its own lines and
 * at least one card is saved, named by `deckName`; a name already in My decks, or used earlier in
 * the same import, gets " (2)", " (3)" and so on.
 */
export function importAll(
  text: string,
  existingNames: Iterable<string>,
): ImportAll {
  const parsed = parseAnyDeckList(text);
  const taken = new Set(existingNames);
  const result: ImportAll = { saved: [], failed: [], stray: [] };
  // Only GojiSim text holds several decks; in the other formats every error is the one deck's.
  const deckOf = (e: DeckListError) =>
    parsed.format === "gojisim" ? e.deck : 0;
  result.stray = parsed.errors.filter((e) => deckOf(e) === undefined);
  parsed.decks.forEach((deck, i) => {
    const reasons = parsed.errors
      .filter((e) => deckOf(e) === i)
      .map((e) => `Line ${e.line}: ${e.reason}`);
    if (deck.monsterDeck.length + deck.mainDeck.length === 0)
      reasons.push("No cards");
    if (reasons.length > 0) {
      result.failed.push({ name: deck.name, reasons });
      return;
    }
    const name = freeName(deckName(deck.name), taken);
    taken.add(name);
    result.saved.push({ deck, name });
  });
  return result;
}
