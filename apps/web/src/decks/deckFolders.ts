import { deckName } from "../game/importDeck";

/**
 * The My decks window's folders and search (#181). A deck's folder is the part of its name before
 * the last "/" (decision 422); a deck without one is under "No folder". Pure helpers.
 */

export const NO_FOLDER = "No folder";

/** The folder in a deck's name, or `null` when it has none. */
export function folderOf(name: string): string | null {
  const short = deckName(name);
  if (short === name.trim()) return null;
  const cut = name.lastIndexOf("/");
  return cut > 0 ? name.slice(0, cut).trim() : null;
}

/** Whether a deck matches the search: its name or folder, ignoring case (as #179's filter). */
export function matchesSearch(name: string, query: string): boolean {
  const q = query.trim().toLowerCase();
  return q === "" || name.toLowerCase().includes(q);
}

export interface Folder<T> {
  /** The folder's name, or `NO_FOLDER`. */
  name: string;
  /** Its decks that match the search, in My decks' order. */
  decks: T[];
}

/**
 * The decks that match `query`, grouped by folder: folders in A–Z order (ignoring case), "No
 * folder" last; folders with no match are left out.
 */
export function foldersOf<T extends { name: string }>(
  decks: readonly T[],
  query: string,
): Folder<T>[] {
  const groups = new Map<string, T[]>();
  for (const deck of decks) {
    if (!matchesSearch(deck.name, query)) continue;
    const folder = folderOf(deck.name) ?? NO_FOLDER;
    groups.set(folder, [...(groups.get(folder) ?? []), deck]);
  }
  return [...groups]
    .map(([name, list]) => ({ name, decks: list }))
    .sort((a, b) =>
      a.name === NO_FOLDER
        ? 1
        : b.name === NO_FOLDER
          ? -1
          : a.name.localeCompare(b.name, undefined, { sensitivity: "base" }),
    );
}
