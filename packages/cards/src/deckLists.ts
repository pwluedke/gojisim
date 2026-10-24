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

/** The deck list formats GojiSim reads (M7a). */
export type DeckListFormat = "gojisim" | "godzillatcgdb";

/** Which format a pasted deck list is in, or `null` when it is neither. */
export function detectDeckListFormat(text: string): DeckListFormat | null {
  if (/^\s*\[(deck|monster deck|main deck)\]/im.test(text)) return "gojisim";
  if (
    /^\s*monster deck\s*$/im.test(text) ||
    /\b(monster|battle|strategy) cards\s*\(\d+\)/i.test(text)
  )
    return "godzillatcgdb";
  return null;
}

const SET_CELL = /^[A-Z]{2,5}\d{2}$/;
const ID_CELL = /^\d{3}\+*$/;
const COUNT_CELL = /^[1-9]\d*$/;
/** A whole row on one line, separated by spaces: "Gigan (2004) [I] EBP04 027 1". */
const SPACED_ROW = /^(.*?)\s+([A-Z]{2,5}\d{2})\s+(\d{3}\+*)\s+([1-9]\d*)$/;

/**
 * Parses a deck copied from godzillatcgdb.com's printable deck list (`/decks/<id>/print`, M7a).
 * The site has no text export; that page is its textual deck list. Copied from a browser, each
 * row (name, set, id, count) arrives as one cell per line or as one tab- or space-separated
 * line, under the headings Monster Deck, Monster Cards, Battle Cards and Strategy Cards. The
 * deck name comes from its "Deck: <name>" line. Card numbers are `<set>-<id>`.
 */
export function parseGodzillaTcgDb(text: string): ParsedDeckList {
  const errors: DeckListError[] = [];
  const deck: NamedDeck = { name: "", monsterDeck: [], mainDeck: [] };
  const cells: { text: string; line: number; raw: string }[] = [];
  text.split(/\r?\n/).forEach((raw, index) => {
    const line = index + 1;
    const trimmed = raw.trim();
    if (trimmed === "") return;
    const named = /^Deck:\s*(.+)$/i.exec(trimmed);
    if (named) {
      deck.name = (named[1] as string).trim();
      return;
    }
    const spaced = trimmed.includes("\t") ? null : SPACED_ROW.exec(trimmed);
    const parts = spaced ? spaced.slice(1) : trimmed.split("\t");
    for (const part of parts)
      if (part.trim() !== "") cells.push({ text: part.trim(), line, raw });
  });
  let section: "monsterDeck" | "mainDeck" | null = null;
  for (let i = 0; i < cells.length; i++) {
    const cell = cells[i] as (typeof cells)[number];
    if (/^monster deck$/i.test(cell.text)) {
      section = "monsterDeck";
      continue;
    }
    if (/^(monster|battle|strategy) cards\b/i.test(cell.text)) {
      section = "mainDeck";
      continue;
    }
    const [id, count] = [cells[i + 1], cells[i + 2]];
    if (
      !SET_CELL.test(cell.text) ||
      !id ||
      !count ||
      !ID_CELL.test(id.text) ||
      !COUNT_CELL.test(count.text)
    )
      continue;
    i += 2;
    const cardNumber = `${cell.text}-${id.text}`;
    const error = (reason: string) =>
      errors.push({ line: cell.line, reason, text: cell.raw });
    if (!section) {
      error("Card listed before a Monster Deck or Cards heading");
      continue;
    }
    const card = findCardByNumber(cardNumber);
    if (!card) {
      error(`Unknown card number ${cardNumber}`);
      continue;
    }
    for (let n = 0; n < Number(count.text); n++) deck[section].push(card);
  }
  if (!deck.name) deck.name = "Imported deck";
  const empty = deck.monsterDeck.length === 0 && deck.mainDeck.length === 0;
  return { decks: empty && errors.length === 0 ? [] : [deck], errors };
}

/**
 * Parses a pasted deck list in any format GojiSim reads (M7a): its own deck list text, or a
 * copy of godzillatcgdb.com's printable deck list. An unrecognized text is one error.
 */
export function parseAnyDeckList(
  text: string,
): ParsedDeckList & { format: DeckListFormat | null } {
  const format = detectDeckListFormat(text);
  if (format === "gojisim") return { format, ...parseDeckList(text) };
  if (format === "godzillatcgdb")
    return { format, ...parseGodzillaTcgDb(text) };
  return {
    format,
    decks: [],
    errors:
      text.trim() === ""
        ? []
        : [
            {
              line: 1,
              reason:
                "Not a deck list GojiSim reads: paste a GojiSim deck list or godzillatcgdb.com's printable deck list",
              text: text.split(/\r?\n/)[0] ?? "",
            },
          ],
  };
}
