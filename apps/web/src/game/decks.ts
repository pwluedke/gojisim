import { type DeckValidation, validateDeck } from "@gojisim/cards";
import esd01Starter from "@gojisim/cards/data/decks/esd01-starter.txt?raw";
import esd02Starter from "@gojisim/cards/data/decks/esd02-starter.txt?raw";
import {
  formatDeckList,
  type NamedDeck,
  parseDeckList,
} from "@gojisim/cards/deck-lists";
import { buildTestDeck, TEST_DECK_SETS } from "@gojisim/cards/test-decks";

/** One entry in a deck picker. */
export interface DeckOption {
  key: string;
  label: string;
  kind: "official" | "random" | "imported" | "mine";
  /** The deck to play; random decks depend on the game seed. */
  build: (seed: number) => NamedDeck;
}

function firstDeck(text: string): NamedDeck {
  const deck = parseDeckList(text).decks[0];
  if (!deck) throw new Error("Official deck list is empty");
  return deck;
}

const OFFICIAL: DeckOption[] = [
  ["ESD01", esd01Starter],
  ["ESD02", esd02Starter],
].map(([set, text]) => {
  const deck = firstDeck(text as string);
  return {
    key: `official:${set}`,
    label: `${set} official`,
    kind: "official",
    build: () => deck,
  };
});

const RANDOM: DeckOption[] = TEST_DECK_SETS.map((set) => ({
  key: `random:${set}`,
  label: `${set} random`,
  kind: "random",
  build: (seed) => ({
    name: `${set} random (seed ${seed})`,
    ...buildTestDeck(set, seed),
  }),
}));

export function importedOptions(decks: NamedDeck[]): DeckOption[] {
  return decks.map((deck, i) => ({
    key: `imported:${i}`,
    label: deck.name,
    kind: "imported",
    build: () => deck,
  }));
}

/** Official starters first, then the random generators, then imported decks (`/debug`). */
export function deckOptions(imported: NamedDeck[]): DeckOption[] {
  return [...OFFICIAL, ...RANDOM, ...importedOptions(imported)];
}

/** The player's saved decks (M7a), as deck options keyed `mine:<id>`. */
export function myDeckOptions(
  decks: readonly { id: string; name: string; deck: NamedDeck }[],
): DeckOption[] {
  return decks.map(({ id, name, deck }) => ({
    key: `mine:${id}`,
    label: name,
    kind: "mine",
    build: () => ({ ...deck, name }),
  }));
}

/**
 * The `/play` deck picker (M7a): the two starters, then My decks, then the development decks
 * (random test decks and decks imported from `local-decks` in `/debug`).
 */
export function playDeckOptions(
  mine: readonly { id: string; name: string; deck: NamedDeck }[],
  imported: NamedDeck[],
): DeckOption[] {
  return [
    ...OFFICIAL,
    ...myDeckOptions(mine),
    ...RANDOM,
    ...importedOptions(imported),
  ];
}

export function checkDeck(deck: NamedDeck): DeckValidation {
  return validateDeck(deck, new Date());
}

const STORAGE_KEY = "gojisim.debug.importedDecks";

/** Imported decks remembered in this browser; empty if storage is unavailable or unreadable. */
export function loadImportedDecks(): NamedDeck[] {
  try {
    const text = window.localStorage.getItem(STORAGE_KEY);
    return text ? parseDeckList(text).decks : [];
  } catch {
    return [];
  }
}

export function saveImportedDecks(decks: NamedDeck[]): void {
  try {
    window.localStorage.setItem(STORAGE_KEY, formatDeckList(decks));
  } catch {
    // Storage blocked or full: the decks still work for this page view.
  }
}
