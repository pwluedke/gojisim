/**
 * Deck tags in place of folders (Paul, Nov 9): the tag buttons above My decks and the deck
 * pickers, and their filter. Tags compare ignoring case. Pure helpers.
 */

export interface TagCount {
  /** The tag as first spelled. */
  tag: string;
  /** Decks that have it. */
  count: number;
}

/** Every tag among the decks with how many have it: most used first, then A–Z. */
export function tagCounts(
  tagLists: readonly (readonly string[])[],
): TagCount[] {
  const counts = new Map<string, TagCount>();
  for (const tags of tagLists)
    for (const tag of new Set(tags.map((t) => t.toLowerCase()))) {
      const spelled = tags.find((t) => t.toLowerCase() === tag) ?? tag;
      const entry = counts.get(tag) ?? { tag: spelled, count: 0 };
      entry.count++;
      counts.set(tag, entry);
    }
  return [...counts.values()].sort(
    (a, b) =>
      b.count - a.count ||
      a.tag.localeCompare(b.tag, undefined, { sensitivity: "base" }),
  );
}

/** Whether a deck has every selected tag (no selection matches every deck). */
export function hasAllTags(
  tags: readonly string[],
  selected: readonly string[],
): boolean {
  const own = new Set(tags.map((t) => t.toLowerCase()));
  return selected.every((t) => own.has(t.toLowerCase()));
}

/** The selection with `tag` switched on or off. */
export function toggleTag(selected: readonly string[], tag: string): string[] {
  const on = selected.some((t) => t.toLowerCase() === tag.toLowerCase());
  return on
    ? selected.filter((t) => t.toLowerCase() !== tag.toLowerCase())
    : [...selected, tag];
}

/** Names A–Z, ignoring case: the flat list's order. */
export function byName<T extends { name: string }>(a: T, b: T): number {
  return a.name.localeCompare(b.name, undefined, { sensitivity: "base" });
}
