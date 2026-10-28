import { type DeckValidation, validateDeck } from "@gojisim/cards";
import esd01Starter from "@gojisim/cards/data/decks/esd01-starter.txt?raw";
import esd02Starter from "@gojisim/cards/data/decks/esd02-starter.txt?raw";
import {
  formatDeckList,
  type NamedDeck,
  parseDeckList,
} from "@gojisim/cards/deck-lists";
import { buildTestDeck, TEST_DECK_SETS } from "@gojisim/cards/test-decks";
import { deckName } from "./importDeck";
import { type FileDeck, fileGroup, localDecks } from "./localDecks";

/** One entry in a deck picker. */
export interface DeckOption {
  key: string;
  label: string;
  kind: "official" | "random" | "imported" | "mine" | "file";
  /** The deck to play; random decks depend on the game seed. */
  build: (seed: number) => NamedDeck;
  /**
   * A development deck file's picker group: its file, and its `[deck]` folder. For a deck
   * imported in `/debug`, its `[deck]` folder, if any.
   */
  group?: string;
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
 * Decks imported in `/debug` and kept in this browser. One whose name a development deck file
 * also has is left out: the file's deck is shown instead (Monarch, Oct 25, 2026). Like the file
 * decks, each is labelled without its `[deck]` folder (`deckName`) and grouped by it; keys stay
 * `imported:<index>`, so earlier picks still work.
 */
export function importedOptions(
  decks: NamedDeck[],
  fileDecks: readonly FileDeck[] = [],
): DeckOption[] {
  const inFiles = new Set(fileDecks.map((d) => d.deck.name));
  return decks.flatMap((deck, i) => {
    if (inFiles.has(deck.name)) return [];
    const label = deckName(deck.name);
    const cut = deck.name.lastIndexOf("/");
    const folder =
      label !== deck.name.trim() && cut > 0 ? deck.name.slice(0, cut) : null;
    return [
      {
        key: `imported:${i}`,
        label,
        kind: "imported" as const,
        build: () => deck,
        ...(folder ? { group: folder } : {}),
      },
    ];
  });
}

/**
 * The development deck files' decks (`local-decks/*.txt`, dev server only), grouped by file and
 * `[deck]` folder, labelled without the folder. Keys use the full name, so a pick survives a
 * reload after the file changes; a repeated name in one file gets `#2`, `#3`, ...
 */
export function fileOptions(fileDecks: readonly FileDeck[]): DeckOption[] {
  const seen = new Map<string, number>();
  return fileDecks.map((fileDeck) => {
    const base = `file:${fileDeck.file}:${fileDeck.deck.name}`;
    const n = (seen.get(base) ?? 0) + 1;
    seen.set(base, n);
    return {
      key: n === 1 ? base : `${base}#${n}`,
      label: fileDeck.label,
      kind: "file" as const,
      build: () => fileDeck.deck,
      group: fileGroup(fileDeck),
    };
  });
}

/**
 * The `/debug` picker: official starters, the random generators, the development deck files,
 * then imported decks.
 */
export function deckOptions(
  imported: NamedDeck[],
  fileDecks: readonly FileDeck[] = localDecks().decks,
): DeckOption[] {
  return [
    ...OFFICIAL,
    ...RANDOM,
    ...fileOptions(fileDecks),
    ...importedOptions(imported, fileDecks),
  ];
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
 * (random test decks, the development deck files and decks imported in `/debug`).
 */
export function playDeckOptions(
  mine: readonly { id: string; name: string; deck: NamedDeck }[],
  imported: NamedDeck[],
  fileDecks: readonly FileDeck[] = localDecks().decks,
): DeckOption[] {
  return [
    ...OFFICIAL,
    ...myDeckOptions(mine),
    ...RANDOM,
    ...fileOptions(fileDecks),
    ...importedOptions(imported, fileDecks),
  ];
}

/** Picker groups for development decks without a file group (random test decks, imports). */
export const DEV_GROUPS = {
  random: "Development",
  imported: "Development: imported in /debug",
} as const;

/**
 * Whether a development deck option matches the picker's filter text: its name, its file or its
 * folder, ignoring case. An empty filter matches everything.
 */
export function matchesFilter(option: DeckOption, filter: string): boolean {
  const text = filter.trim().toLowerCase();
  if (!text) return true;
  return `${option.label} ${option.group ?? ""}`.toLowerCase().includes(text);
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

/**
 * The stored imports after importing `incoming` in `/debug`: a deck with the same name as a
 * stored one replaces it in place, so importing a file again doesn't double the list.
 */
export function replaceByName(
  stored: readonly NamedDeck[],
  incoming: readonly NamedDeck[],
): NamedDeck[] {
  const byName = new Map(incoming.map((d) => [d.name, d]));
  const next = stored.map((d) => {
    const fresh = byName.get(d.name);
    if (fresh) byName.delete(d.name);
    return fresh ?? d;
  });
  return [...next, ...byName.values()];
}

export function saveImportedDecks(decks: NamedDeck[]): void {
  try {
    window.localStorage.setItem(STORAGE_KEY, formatDeckList(decks));
  } catch {
    // Storage blocked or full: the decks still work for this page view.
  }
}

/** One `<optgroup>` of a deck picker. */
export interface PickerGroup {
  label: string;
  options: DeckOption[];
}

/**
 * A picker's groups in order: Starters, My decks, Development (random test decks), each
 * development file and folder, then decks imported in `/debug`. The filter narrows the
 * development groups only, and never hides an option that is picked (`keep`), so a select always
 * shows its value. Empty groups are left out.
 */
export function pickerGroups(
  options: readonly DeckOption[],
  filter = "",
  keep: readonly string[] = [],
): PickerGroup[] {
  const groups = new Map<string, DeckOption[]>();
  const add = (label: string, option: DeckOption) => {
    const list = groups.get(label) ?? [];
    list.push(option);
    groups.set(label, list);
  };
  for (const option of options) {
    if (option.kind === "official") add("Starters", option);
    else if (option.kind === "mine") add("My decks", option);
    else if (keep.includes(option.key) || matchesFilter(option, filter))
      add(
        option.kind === "file"
          ? `Development: ${option.group ?? ""}`
          : option.kind === "imported" && option.group
            ? `${DEV_GROUPS.imported} › ${option.group}`
            : DEV_GROUPS[option.kind],
        option,
      );
  }
  // Map keeps insertion order, which follows the options' order; the imports come last, the
  // ones with no folder first, then each folder's in name order.
  const importGroups = [...groups.keys()]
    .filter((label) => label.startsWith(DEV_GROUPS.imported))
    .sort((a, b) =>
      a === DEV_GROUPS.imported
        ? -1
        : b === DEV_GROUPS.imported
          ? 1
          : a.localeCompare(b),
    );
  for (const label of importGroups) {
    const list = groups.get(label) as DeckOption[];
    groups.delete(label);
    groups.set(label, list);
  }
  return [...groups].map(([label, list]) => ({ label, options: list }));
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
