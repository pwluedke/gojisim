import { getAllCards } from "./allCards";
import type { Card } from "./schema";
import type { Deck } from "./validate";

/** A named deck, as in a deck list file. */
export interface NamedDeck extends Deck {
  name: string;
}

export interface DeckListError {
  /** 1-based line number in the text. */
  line: number;
  reason: string;
  text: string;
}

export interface ParsedDeckList {
  decks: NamedDeck[];
  errors: DeckListError[];
}

let byNumber: Map<string, Card> | null = null;

/**
 * The print a card number stands for. Several prints can share a card number (a parallel and its
 * promo reprint); prefer the base print, then the print from the set the number names, then the
 * lowest id.
 */
export function findCardByNumber(cardNumber: string): Card | undefined {
  if (!byNumber) {
    byNumber = new Map();
    const rank = (c: Card) => [
      c.parentId === null ? 0 : 1,
      c.cardNumber.startsWith(`${c.set}-`) ? 0 : 1,
      c.id,
    ];
    const sorted = [...getAllCards()].sort((a, b) => {
      const [x, y] = [rank(a), rank(b)];
      return x[0]! - y[0]! || x[1]! - y[1]! || x[2]! - y[2]!;
    });
    for (const card of sorted)
      if (!byNumber.has(card.cardNumber)) byNumber.set(card.cardNumber, card);
  }
  return byNumber.get(cardNumber);
}

/**
 * Parses GojiSim's deck list text (the godzilla-sim export format):
 *
 *     # comment
 *     [deck] Folder/Deck Name
 *     [monster deck]
 *     1 EBP02-024
 *     [main deck]
 *     2 EBP02-027
 *
 * Blank lines separate decks. Problems become errors with a line number; a bad line is skipped
 * and the rest of the deck still loads.
 */
export function parseDeckList(text: string): ParsedDeckList {
  const decks: NamedDeck[] = [];
  const errors: DeckListError[] = [];
  let deck: NamedDeck | null = null;
  let section: "monsterDeck" | "mainDeck" | null = null;

  text.split(/\r?\n/).forEach((raw, index) => {
    const line = index + 1;
    const text = raw.trim();
    const error = (reason: string) => errors.push({ line, reason, text: raw });
    if (text === "" || text.startsWith("#")) return;

    const header = /^\[([^\]]+)\]\s*(.*)$/.exec(text);
    if (header) {
      const [, tag = "", rest = ""] = header;
      const name = tag.trim().toLowerCase();
      if (name === "deck") {
        deck = {
          name: rest.trim() || `Deck ${decks.length + 1}`,
          monsterDeck: [],
          mainDeck: [],
        };
        decks.push(deck);
        section = null;
      } else if (name === "monster deck" || name === "main deck") {
        if (!deck) {
          deck = {
            name: `Deck ${decks.length + 1}`,
            monsterDeck: [],
            mainDeck: [],
          };
          decks.push(deck);
        }
        section = name === "monster deck" ? "monsterDeck" : "mainDeck";
      } else {
        error(`Unknown header [${tag}]`);
      }
      return;
    }

    const entry = /^(\S+)\s+(\S+)$/.exec(text);
    if (!entry)
      return void error(
        'Expected a count and a card number, e.g. "2 EBP02-027"',
      );
    const [, countText = "", cardNumber = ""] = entry;
    if (!deck || !section)
      return void error(
        "Card listed before a [monster deck] or [main deck] header",
      );
    if (!/^[1-9]\d*$/.test(countText))
      return void error(`Count "${countText}" is not a positive integer`);
    const card = findCardByNumber(cardNumber);
    if (!card) return void error(`Unknown card number ${cardNumber}`);
    const target: Card[] = (deck as NamedDeck)[section];
    for (let i = 0; i < Number(countText); i++) target.push(card);
  });
  return { decks, errors };
}

/** Consecutive runs of the same card number, so formatting keeps the deck's order exactly. */
function runs(cards: Card[]): string[] {
  const lines: string[] = [];
  let current: string | null = null;
  let count = 0;
  for (const card of [...cards, null]) {
    if (card?.cardNumber === current) {
      count++;
      continue;
    }
    if (current !== null) lines.push(`${count} ${current}`);
    current = card?.cardNumber ?? null;
    count = 1;
  }
  return lines;
}

/** Formats decks in the deck list format; `parseDeckList` reads the result back unchanged. */
export function formatDeckList(decks: NamedDeck[]): string {
  return `${decks
    .map((deck) =>
      [
        `[deck] ${deck.name}`,
        "[monster deck]",
        ...runs(deck.monsterDeck),
        "[main deck]",
        ...runs(deck.mainDeck),
      ].join("\n"),
    )
    .join("\n\n")}\n`;
}
