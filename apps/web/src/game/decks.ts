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
  kind: "official" | "random" | "mine";
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

/**
 * The `/debug` picker (#161): official starters, My decks (the same store as `/play` and the
 * Deckbuilder, synced when signed in, so a tester's deck can be tracked down), then the random
 * test decks. `/debug` has no import store of its own any more.
 */
export function deckOptions(
  mine: readonly { id: string; name: string; deck: NamedDeck }[] = [],
): DeckOption[] {
  return [...OFFICIAL, ...myDeckOptions(mine), ...RANDOM];
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
 * The `/play` deck picker (#161): the two starters, then My decks. Random test decks and
 * `/debug` imports stay in `/debug`; decks are built and imported in the Deckbuilder.
 */
export function playDeckOptions(
  mine: readonly { id: string; name: string; deck: NamedDeck }[],
): DeckOption[] {
  return [...OFFICIAL, ...myDeckOptions(mine)];
}

// Deck checks are cached per deck and day: the pickers check every option on each render, and
// the development files hold hundreds of decks. Random decks are rebuilt per seed, so they miss.
const checked = new WeakMap<
  NamedDeck,
  { day: string; result: DeckValidation }
>();

export function checkDeck(deck: NamedDeck): DeckValidation {
  const now = new Date();
  const day = now.toISOString().slice(0, 10);
  const hit = checked.get(deck);
  if (hit?.day === day) return hit.result;
  const result = validateDeck(deck, now);
  checked.set(deck, { day, result });
  return result;
}

/**
 * A deck option's legality for a game with `seed` (random test decks depend on it), or the error
 * that kept it from building.
 */
export function optionLegality(
  option: DeckOption,
  seed: number,
): DeckValidation | { error: string } {
  try {
    return checkDeck(option.build(seed));
  } catch (err) {
    return { error: String(err) };
  }
}

/**
 * Why a deck option can't be picked in a Tournament game (6.1.1 and the restriction lists), one
 * line per failure; empty when it can. Casual games allow illegal decks with a warning (Paul's
 * ruling, Oct 21, 2026).
 */
export function tournamentProblems(
  legality: DeckValidation | { error: string },
): string[] {
  if ("error" in legality) return [legality.error];
  return legality.failures.map((f) => `${f.rule}: ${f.message}`);
}

/** Every plain reason a deck is illegal (M13b), card by card; empty when it's legal. */
export function deckReasons(
  legality: DeckValidation | { error: string },
): string[] {
  if ("error" in legality) return [legality.error];
  return legality.failures.flatMap((f) => f.reasons);
}

/** How many reasons a badge shows before "+N more" (M13b); the tooltip lists them all. */
export const BADGE_REASONS = 3;

/** The reasons a badge shows, and how many more the tooltip holds. */
export function badgeReasons(reasons: readonly string[]): {
  shown: string[];
  more: number;
} {
  return {
    shown: reasons.slice(0, BADGE_REASONS),
    more: Math.max(0, reasons.length - BADGE_REASONS),
  };
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

/** #161: forgets `/debug`'s old import store once its decks are in My decks. */
export function clearImportedDecks(): void {
  try {
    window.localStorage.removeItem(STORAGE_KEY);
  } catch {
    // Storage blocked: nothing was stored there.
  }
}

/**
 * #161: the old `/debug` imports to copy into My decks: every deck except one My decks already
 * has under the same name with the same list.
 */
export function importsToMove(
  legacy: readonly NamedDeck[],
  mine: readonly { name: string; list: string }[],
): NamedDeck[] {
  const body = (list: string) => list.replace(/^\[deck\].*$/m, "").trim();
  return legacy.filter((deck) => {
    const list = body(formatDeckList([deck]));
    return !mine.some((m) => m.name === deck.name && body(m.list) === list);
  });
}

/** One `<optgroup>` of a deck picker. */
export interface PickerGroup {
  label: string;
  options: DeckOption[];
}

/**
 * The picker's groups (#161): the Starter decks, My decks, then (in `/debug`) the random test
 * decks, each in the options' order.
 */
export function pickerGroups(options: readonly DeckOption[]): PickerGroup[] {
  const label: Record<DeckOption["kind"], string> = {
    official: "Starter decks",
    mine: "My decks",
    random: "Random test decks",
  };
  const groups = new Map<string, DeckOption[]>();
  for (const option of options) {
    const name = label[option.kind];
    groups.set(name, [...(groups.get(name) ?? []), option]);
  }
  return [...groups].map(([name, list]) => ({ label: name, options: list }));
}

/** The starter picks: P1 ESD01 official, P2 ESD02 official. A match type switch resets to them. */
export const STARTER_PICKS = {
  P1: "official:ESD01",
  P2: "official:ESD02",
} as const;

/**
 * Randomize: a deck key from `candidates` (the seat's filtered list, legal decks only in a
 * Tournament game), other than `current` when there is another to pick. `random` is a fresh
 * random source, never the game seed, so the pick doesn't hint at the game's shuffles.
 */
export function randomDeckKey(
  candidates: readonly string[],
  current: string,
  random: () => number = Math.random,
): string | null {
  const others = candidates.filter((key) => key !== current);
  const pool = others.length > 0 ? others : candidates;
  if (pool.length === 0) return null;
  return pool[Math.floor(random() * pool.length)] ?? null;
}
