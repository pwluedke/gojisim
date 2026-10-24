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
   * The name to suggest: the list's own name, or empty when it has none (godzilla-sim's Export
   * to Clipboard writes no name line), so the player names it.
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
        ? deck.name
        : "",
    errors: parsed.errors,
    warnings: deck ? checkDeck(deck).failures : [],
    canSave: (name) =>
      !!deck && parsed.errors.length === 0 && name.trim() !== "",
  };
}
