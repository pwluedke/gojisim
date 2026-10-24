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

/**
 * The deck list formats GojiSim reads (M7a): its own text (also what godzilla-sim's Export to
 * Clipboard and Export All Decks write), a copy of a godzillatcgdb.com deck page (Select All,
 * Copy), and a copy of its printable deck list.
 */
export type DeckListFormat =
  "gojisim" | "godzillatcgdb-page" | "godzillatcgdb-print";

/** A whole card number, as the deck page labels each card: "EBP02-041". */
const CARD_NUMBER = /^[A-Z]{2,5}\d{2}-\d{3}\+*$/;

/** Which format a pasted deck list is in, or `null` when it is none of them. */
export function detectDeckListFormat(text: string): DeckListFormat | null {
  if (/^\s*\[(deck|monster deck|main deck)\]/im.test(text)) return "gojisim";
  const headings =
    /^\s*monster deck\s*$/im.test(text) ||
    /\b(monster|battle|strategy) cards\s*\(\d+\)/i.test(text);
  if (!headings) return null;
  // The deck page labels cards by whole number; the print page splits set and id.
  return text
    .split(/\r?\n/)
    .some((line) => CARD_NUMBER.test(line.trim().replace(/^[1-9]\d*\s+/, "")))
    ? "godzillatcgdb-page"
    : "godzillatcgdb-print";
}

/** Where the deck page's card lists end: its comments and footer. */
const PAGE_END =
  /must be logged in to post a comment|^no comments added yet|^comments\b|^©/i;

/**
 * Parses a godzillatcgdb.com deck page (`/d/<id>`) copied whole: Select All, then Copy (M7a).
 * The page labels each card with its number and, in the Monster, Battle and Strategy Cards
 * sections, a count badge on the line before it ("2", then "EBP02-041"; some browsers put both
 * on one line). The Monster Deck section has no badges: one copy each. The deck name is the line
 * before "Author:". The rest of the page (menus, history, validator, comments) is ignored.
 */
export function parseGodzillaTcgDbPage(text: string): ParsedDeckList {
  const errors: DeckListError[] = [];
  const deck: NamedDeck = { name: "", monsterDeck: [], mainDeck: [] };
  const lines = text.split(/\r?\n/);
  const author = lines.findIndex((l) => /^\s*Author:/i.test(l));
  for (let i = author - 1; i >= 0 && !deck.name; i--)
    deck.name = (lines[i] ?? "").trim();
  let section: "monsterDeck" | "mainDeck" | null = null;
  let badge: number | null = null;
  for (const [index, raw] of lines.entries()) {
    const trimmed = raw.trim();
    if (trimmed === "") continue;
    if (PAGE_END.test(trimmed)) break;
    if (/^monster deck$/i.test(trimmed)) {
      [section, badge] = ["monsterDeck", null];
      continue;
    }
    if (/^(monster|battle|strategy) cards\b/i.test(trimmed)) {
      [section, badge] = ["mainDeck", null];
      continue;
    }
    if (!section) continue;
    if (/^[1-9]\d*$/.test(trimmed)) {
      badge = Number(trimmed);
      continue;
    }
    const card = /^(?:([1-9]\d*)\s+)?([A-Z]{2,5}\d{2}-\d{3}\+*)$/.exec(trimmed);
    if (!card) {
      badge = null;
      continue;
    }
    const error = (reason: string) =>
      errors.push({ line: index + 1, reason, text: raw });
    const cardNumber = card[2] as string;
    const count = card[1]
      ? Number(card[1])
      : (badge ?? (section === "monsterDeck" ? 1 : null));
    badge = null;
    if (count === null) {
      error(`No count badge for ${cardNumber}`);
      continue;
    }
    const found = findCardByNumber(cardNumber);
    if (!found) {
      error(`Unknown card number ${cardNumber}`);
      continue;
    }
    for (let n = 0; n < count; n++) deck[section].push(found);
  }
  if (!deck.name) deck.name = "Imported deck";
  const empty = deck.monsterDeck.length === 0 && deck.mainDeck.length === 0;
  return { decks: empty && errors.length === 0 ? [] : [deck], errors };
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
 * Parses a pasted deck list in any format GojiSim reads (M7a): its own deck list text
 * (godzilla-sim's exports too), a copied godzillatcgdb.com deck page, or a copy of its
 * printable deck list. An unrecognized text is one error.
 */
export function parseAnyDeckList(
  text: string,
): ParsedDeckList & { format: DeckListFormat | null } {
  const format = detectDeckListFormat(text);
  if (format === "gojisim") return { format, ...parseDeckList(text) };
  if (format === "godzillatcgdb-page")
    return { format, ...parseGodzillaTcgDbPage(text) };
  if (format === "godzillatcgdb-print")
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
                "Not a deck list GojiSim reads: paste a GojiSim or godzilla-sim deck list, or a copied godzillatcgdb.com deck page or printable deck list",
              text: text.split(/\r?\n/)[0] ?? "",
            },
          ],
  };
}
