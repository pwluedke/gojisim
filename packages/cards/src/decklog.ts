import { findCardByNumber } from "./deckLists";

/**
 * Decklog decks (decklog-en.bushiroad.com) as GojiSim deck list text. The server route
 * (`apps/server/src/decklog.ts`) fetches the deck; this module reads what it returns.
 */

export interface DecklogEntry {
  card_number: string;
  num: number;
}

/** A deck as the `/api/decklog/<code>` route returns it. */
export interface DecklogDeck {
  code: string;
  title: string;
  /** Main deck. */
  list: DecklogEntry[];
  /** Monster deck. */
  p_list: DecklogEntry[];
  /** Decklog's side list; the Godzilla Card Game has no side deck, so it is left out. */
  sub_list: DecklogEntry[];
}

/**
 * The deck code in a pasted Decklog URL (`https://decklog-en.bushiroad.com/view/1STAP`) or a bare
 * code (`1STAP`), or `null` when the text is neither.
 */
export function decklogCode(input: string): string | null {
  const text = input.trim();
  const url =
    /^(?:https?:\/\/)?decklog-en\.bushiroad\.com\/(?:[a-z]{2}\/)?view\/([A-Za-z0-9]+)\/?(?:[?#].*)?$/i.exec(
      text,
    );
  if (url) return url[1] as string;
  return /^[A-Za-z0-9]{3,12}$/.test(text) ? text : null;
}

/**
 * The card number GojiSim reads for a Decklog card number. Decklog writes parallels with `+` and
 * PR reprints with `++` the same way the card data does (decision 10), so the number usually
 * names the very print. A `+` print the card data lacks falls back to the number without the
 * pluses (6.1.1.4.1 ignores them). EPR-005+ is in the data with its override (decisions 18, 19),
 * so it resolves directly to deck card number EPR-005.
 */
export function decklogCardNumber(cardNumber: string): string {
  const number = cardNumber.trim();
  if (findCardByNumber(number)) return number;
  const base = number.replace(/\++$/, "");
  return base !== number && findCardByNumber(base) ? base : number;
}

export interface DecklogDeckList {
  /** GojiSim deck list text: one deck named after the Decklog title. */
  text: string;
  /** Decklog card numbers GojiSim doesn't know (they stay in the text, where the parser reports them). */
  unknown: string[];
  /** `+` numbers read as their base card, as [Decklog number, number used]. */
  fallbacks: [string, string][];
  /** Cards in Decklog's side list, left out. */
  ignored: number;
}

/** A Decklog deck as GojiSim deck list text, ready for the Import deck preview. */
export function decklogDeckList(deck: DecklogDeck): DecklogDeckList {
  const unknown: string[] = [];
  const fallbacks: [string, string][] = [];
  const lines = (entries: DecklogEntry[]) =>
    entries.map(({ card_number, num }) => {
      const number = decklogCardNumber(card_number);
      if (!findCardByNumber(number)) unknown.push(card_number);
      else if (number !== card_number.trim())
        fallbacks.push([card_number, number]);
      return `${num} ${number}`;
    });
  // A deck list name is one line.
  const name = deck.title.replace(/\s+/g, " ").trim() || `Decklog ${deck.code}`;
  const text = [
    `[deck] ${name}`,
    "[monster deck]",
    ...lines(deck.p_list),
    "[main deck]",
    ...lines(deck.list),
    "",
  ].join("\n");
  return {
    text,
    unknown: [...new Set(unknown)],
    fallbacks,
    ignored: deck.sub_list.reduce((n, e) => n + e.num, 0),
  };
}
