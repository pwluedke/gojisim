import type { Card } from "@gojisim/cards";
import { keywordParts, tagLabel } from "./keywordTags";

/*
 * A card's picture. Most cards have a scanned image under `/cards/` (`<id>-thumb.webp` and
 * `<id>-full.webp`). The private card set's cards have none (Paul, Nov 18: no movie images or
 * official frames): each is drawn as a text card in Showa Poster's style (cream paper, ink
 * border, poster red for red cards, plain white for white ones) with its name, type, rank,
 * counter power or threat, invasion icon, traits and ability text; a token gets a plain ring.
 * Where the set has a picture for a card (Nov 18), that picture is used instead, from the
 * owner-only `/api/private-set/image/<card number>`.
 */

export type CardImageSize = "thumb" | "full";

const drawn = new Map<number, Card>();
const cache = new Map<number, string>();
const pictures = new Map<number, string>();

/** The private set's cards that have a picture: card id → its URL. */
export function setCardPictures(urls: ReadonlyMap<number, string>): void {
  for (const [id, url] of urls) pictures.set(id, url);
}

/** The private set's cards, drawn instead of loaded (`privateSet.ts` hands them over). */
export function drawCardsAsText(cards: readonly Card[]): void {
  for (const card of cards) {
    drawn.set(card.id, card);
    cache.delete(card.id);
  }
}

/** The image source for a card id at a size. */
export function cardImage(id: number, size: CardImageSize | string): string {
  const picture = pictures.get(id);
  if (picture) return picture;
  const card = drawn.get(id);
  if (!card) return `/cards/${id}-${size}.webp`;
  let src = cache.get(id);
  if (!src) {
    src = `data:image/svg+xml;charset=utf-8,${encodeURIComponent(textCard(card))}`;
    cache.set(id, src);
  }
  return src;
}

const PAPER = "#f1e6cf";
const PANEL = "#fbf4e4";
const INK = "#1a1410";
const RED = "#d7261e";
const MUTED = "#5c4b36";

const escape = (text: string) =>
  text.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");

/** Words wrapped to `width` characters a line. */
function wrap(text: string, width: number): string[] {
  const lines: string[] = [];
  for (const para of text.split("\n")) {
    let line = "";
    for (const word of para.split(/\s+/).filter(Boolean)) {
      if (line && line.length + 1 + word.length > width) {
        lines.push(line);
        line = word;
      } else line = line ? `${line} ${word}` : word;
    }
    if (line) lines.push(line);
  }
  return lines;
}

/** About one character's width at the body's 13 px, for placing a keyword tag's border. */
const CHAR_W = 7.1;

/** One body line; a keyword ability gets a bordered tag, as on the printed cards. */
function textLine(line: string, y: number): string {
  let x = 24;
  let out = "";
  for (const part of keywordParts(line)) {
    const label = part.tag ? tagLabel(part.text) : part.text;
    const width = label.length * CHAR_W;
    out += part.tag
      ? `<rect x="${(x - 2).toFixed(1)}" y="${y - 12}" width="${(width + 4).toFixed(1)}" height="16" rx="3" fill="none" stroke="${INK}" stroke-width="1.5"/><text x="${x.toFixed(1)}" y="${y}" font-size="13" font-weight="700" fill="${INK}" textLength="${width.toFixed(1)}" lengthAdjust="spacingAndGlyphs">${escape(label)}</text>`
      : `<text x="${x.toFixed(1)}" y="${y}" font-size="13" fill="${INK}" xml:space="preserve">${escape(part.text)}</text>`;
    x += width + (part.tag ? 4 : 0);
  }
  return out;
}

/** The card as an SVG text card, 300 × 420 (the scans' 5:7). */
export function textCard(card: Card): string {
  const white = card.colors.includes("White") && !card.colors.includes("Red");
  const band = white ? "#ffffff" : RED;
  const bandText = white ? INK : PANEL;
  const token = card.type === "Token";
  const stat =
    card.counterOrThreat === null
      ? ""
      : `${card.type === "Monster" ? "Threat" : "Counter power"} ${card.counterOrThreat.toLocaleString("en-US")}`;
  const name = escape(card.name);
  const head = `${card.type}${card.rank === null ? "" : ` · Rank ${card.rank}`}`;
  const traits = card.traits.map((t) => `《${escape(t)}》`).join(" ");
  const body = wrap(card.text, 34)
    .slice(0, 14)
    .map((line, i) => textLine(line, (token ? 300 : 196) + i * 17))
    .join("");
  const icon =
    card.invadeZones === null
      ? ""
      : `<circle cx="262" cy="384" r="16" fill="${band}" stroke="${INK}" stroke-width="3"/><text x="262" y="390" font-size="17" font-weight="700" text-anchor="middle" fill="${bandText}">${card.invadeZones}</text>`;
  const ring = token
    ? `<circle cx="150" cy="200" r="70" fill="none" stroke="${INK}" stroke-width="14"/>`
    : "";
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 300 420" width="300" height="420" font-family="'Dela Gothic One','Zen Kaku Gothic New',system-ui,sans-serif">
<rect x="3" y="3" width="294" height="414" rx="14" fill="${PAPER}" stroke="${INK}" stroke-width="6"/>
<rect x="14" y="14" width="272" height="64" rx="6" fill="${band}" stroke="${INK}" stroke-width="3"/>
<text x="26" y="44" font-size="22" font-weight="700" fill="${bandText}">${name}</text>
<text x="26" y="66" font-size="13" fill="${bandText}">${escape(head)}</text>
<text x="24" y="104" font-size="14" font-weight="700" fill="${INK}">${escape(stat)}</text>
<text x="24" y="126" font-size="12" fill="${MUTED}">${traits}</text>
<line x1="24" y1="140" x2="276" y2="140" stroke="${INK}" stroke-width="2"/>
${ring}${body}${icon}
<text x="24" y="398" font-size="11" fill="${MUTED}">${escape(card.cardNumber)}</text>
</svg>`;
}
