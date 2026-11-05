import { archetypes } from "@gojisim/bot";
import { getCombos } from "@gojisim/cards";
import type { NamedDeck } from "@gojisim/cards/deck-lists";
import { deckOf, type SavedDeck } from "../game/deckStore";
import { deckName } from "../game/importDeck";
import { folderOf } from "./deckFolders";

/**
 * #166 card insights: where a card is used, for the Deckbuilder's card detail. My decks come
 * from the browser's saved decks, archetypes from the deck recognizer's catalog (#191,
 * `packages/bot/data/archetypes.json`), combos from `packages/cards/data/combos/`.
 */

export interface DeckUse {
  id: string;
  /** The deck's name without its folder. */
  name: string;
  folder: string | null;
  copies: number;
  deck: NamedDeck;
}

/** The saved decks holding the card, most copies first, then by name. */
export function decksWithCard(
  saved: readonly SavedDeck[],
  deckCardNumber: string,
): DeckUse[] {
  const uses: DeckUse[] = [];
  for (const s of saved) {
    const deck = deckOf(s);
    if (!deck) continue;
    const copies = [...deck.monsterDeck, ...deck.mainDeck].filter(
      (c) => c.deckCardNumber === deckCardNumber,
    ).length;
    if (copies > 0)
      uses.push({
        id: s.id,
        name: deckName(s.name),
        folder: folderOf(s.name),
        copies,
        deck,
      });
  }
  return uses.sort(
    (a, b) => b.copies - a.copies || a.name.localeCompare(b.name),
  );
}

export interface ArchetypeUse {
  archetype: string;
  /** Its rank I monster, a core line or a common line of the catalog. */
  role: "Rank I" | "Core" | "Common";
  /** The line's usual copies, for core and common lines. */
  count: [number, number] | null;
}

/** The catalog archetypes naming the card, rank I first, then core, then common. */
export function archetypesWithCard(deckCardNumber: string): ArchetypeUse[] {
  const order = { "Rank I": 0, Core: 1, Common: 2 };
  const uses: ArchetypeUse[] = [];
  for (const a of archetypes()) {
    if (a.rankOne.has(deckCardNumber)) {
      uses.push({ archetype: a.name, role: "Rank I", count: null });
      continue;
    }
    for (const [role, entries] of [
      ["Core", a.core],
      ["Common", a.common],
    ] as const) {
      const line = entries.find((e) =>
        e.cards.some((c) => c.deckCardNumber === deckCardNumber),
      );
      if (line) {
        uses.push({ archetype: a.name, role, count: line.count });
        break;
      }
    }
  }
  return uses.sort(
    (a, b) =>
      order[a.role] - order[b.role] || a.archetype.localeCompare(b.archetype),
  );
}

export interface ComboUse {
  name: string;
  steps: string;
}

/** The combos (combos.md as data) that use the card. */
export function combosWithCard(deckCardNumber: string): ComboUse[] {
  return getCombos()
    .filter((c) => c.cards.includes(deckCardNumber))
    .map((c) => ({ name: c.name, steps: c.text.steps }));
}

/** "×4", or "×2–3" for a range. */
export const copiesLabel = ([low, high]: [number, number]) =>
  low === high ? `×${low}` : `×${low}–${high}`;
