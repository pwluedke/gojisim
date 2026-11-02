import type { DeckFailure } from "@gojisim/cards";
import {
  type DeckListError,
  type DeckListFormat,
  formatDeckList,
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

/** A saved deck as an import compares it: its id, name and list text. */
export type MyDeck = { id: string; name: string; list: string };

/** A deck list's cards, without its name line, to tell two decks' lists apart. */
const cardsOf = (list: string) => list.replace(/^\[deck\].*$/m, "").trim();

/**
 * What one imported deck does (#167): `new` saves it under `name`; `same` skips it, since My decks
 * has that name with the same list; `clash` means My decks has the name with a different list,
 * and the caller decides (the Deckbuilder asks Replace / Keep both, `/debug` replaces).
 */
export type ImportStep =
  | { kind: "new"; deck: NamedDeck; name: string }
  | { kind: "same"; name: string }
  | { kind: "clash"; deck: NamedDeck; name: string; existing: MyDeck };

/**
 * #167: the one import path the Deckbuilder's Import all, `/debug`'s Import deck list and the
 * move of the old `/debug` imports share. Each deck keeps its full `[deck]` name, folder included
 * (decisions 422 and 501). A name repeated within the same import gets " (2)", " (3)" ...
 */
export function planImport(
  decks: readonly NamedDeck[],
  mine: readonly MyDeck[],
): ImportStep[] {
  const taken = new Set(mine.map((d) => d.name));
  const planned = new Set<string>();
  return decks.map((deck) => {
    const name = deck.name.trim();
    const existing = planned.has(name)
      ? undefined
      : mine.find((d) => d.name === name);
    if (existing) {
      planned.add(name);
      return cardsOf(existing.list) === cardsOf(formatDeckList([deck]))
        ? { kind: "same", name }
        : { kind: "clash", deck, name, existing };
    }
    const free = freeName(name, taken);
    taken.add(free);
    planned.add(name);
    return { kind: "new", deck, name: free };
  });
}

/**
 * #161: the old `/debug` imports to copy into My decks: every deck except one My decks already
 * has under the same name with the same list.
 */
export function importsToMove(
  legacy: readonly NamedDeck[],
  mine: readonly MyDeck[],
): NamedDeck[] {
  const steps = planImport(legacy, mine);
  return legacy.filter((_, i) => steps[i]?.kind !== "same");
}

export interface ImportAll {
  /** The decks to save, named for My decks, in the list's order. */
  saved: { deck: NamedDeck; name: string }[];
  /** Names already in My decks with the same list: skipped. */
  same: string[];
  /** Names already in My decks with a different list: the caller asks Replace / Keep both. */
  clashes: Extract<ImportStep, { kind: "clash" }>[];
  /** The decks that didn't parse (or have no cards), with their reasons. */
  failed: { name: string; reasons: string[] }[];
  /** Lines outside any deck (before the first header): nothing to save, but still reported. */
  stray: DeckListError[];
}

/**
 * Import all (several decks in one pasted list): every deck with no errors on its own lines and
 * at least one card goes through `planImport` (#167), keeping its full `[deck]` name.
 */
export function importAll(text: string, mine: readonly MyDeck[]): ImportAll {
  const parsed = parseAnyDeckList(text);
  const result: ImportAll = {
    saved: [],
    same: [],
    clashes: [],
    failed: [],
    stray: [],
  };
  const good: NamedDeck[] = [];
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
    good.push(deck);
  });
  for (const step of planImport(good, mine)) {
    if (step.kind === "new") result.saved.push(step);
    else if (step.kind === "same") result.same.push(step.name);
    else result.clashes.push(step);
  }
  return result;
}
