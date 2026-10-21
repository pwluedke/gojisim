import {
  type Card,
  type CardColor,
  type CardType,
  CardSchema,
} from "@gojisim/cards";
import type { ParsedCardPage, SitePrint } from "./parse";

export const IMAGE_ORIGIN = "https://image.godzillatcgdb.com";

/** Table labels that map onto `Card` fields (or are already covered by the embedded JSON). */
const KNOWN_LABELS = new Set([
  "Rank",
  "Color",
  "Type",
  "Movie Title",
  "Card Text",
  "Invade Zones",
  "Threat",
  "Counter Power",
  "Rarity",
  "Card Number",
  "Card Notes",
]);

/** Rarity overrides hardcoded in the site's variant-switching script. */
const RARITY_OVERRIDES: Record<number, string> = { 834: "ACSP", 860: "SSPT" };

/** Card number exactly as the site displays it (mirrors the card page's own script). */
export function displayCardNumber(print: SitePrint): string {
  let num = print.card_number;
  const isFoil = num.includes("-foil");
  const isAlt = num.includes("-ALT");
  num = num.replace("-foil", "").replace("-ALT", "");
  let full =
    (print.set_number === "PR" || print.set_number === "EPR") &&
    num.includes("-")
      ? num
      : `${print.set_number}-${num.padStart(3, "0")}`;
  if (isFoil) full += " (Foil)";
  if (isAlt) full += " (Alt)";
  return full;
}

/** Maps the site's movie slug (`property`) to its display title, from table rows of active prints. */
export function collectMovieTitles(
  pages: ParsedCardPage[],
): Map<string, string> {
  const titles = new Map<string, string>();
  for (const page of pages) {
    const active = page.prints.find((p) => p.id === page.activeId);
    const title = page.table["Movie Title"];
    if (active?.property && title) titles.set(active.property, title);
  }
  return titles;
}

export function toCard(
  print: SitePrint,
  page: ParsedCardPage,
  movieTitles: ReadonlyMap<string, string>,
): Card {
  const cardNumber = displayCardNumber(print);
  const isActive = print.id === page.activeId;

  const unknownFields: Record<string, string> = {};
  if (print.trait) unknownFields["Traits"] = print.trait;
  if (print.release_set) unknownFields["Released In"] = print.release_set;
  if (print.language && print.language !== "en")
    unknownFields["Language"] = print.language;
  if (isActive) {
    if (page.likes !== null) unknownFields["Likes (unlabeled)"] = page.likes;
    for (const [label, value] of Object.entries(page.table)) {
      if (
        !KNOWN_LABELS.has(label) &&
        label !== "Traits" &&
        label !== "Released In" &&
        value
      ) {
        unknownFields[label] = value;
      }
    }
  }

  const movie =
    print.property && print.property !== "blank"
      ? ((isActive ? page.table["Movie Title"] : undefined) ??
        movieTitles.get(print.property) ??
        null)
      : null;

  return CardSchema.parse({
    id: print.id,
    cardNumber,
    baseCardNumber: cardNumber.replace(/\++(?=( \(\w+\))?$)/, ""),
    isParallel: /\+( \(\w+\))?$/.test(cardNumber),
    name: print.name,
    set: print.set_number,
    colors:
      print.color === "blank"
        ? []
        : (print.color.split("-").map(capitalize) as CardColor[]),
    type: capitalize(print.type) as CardType,
    rank: toInt(print.rank),
    counterOrThreat: print.strength,
    invadeZones: print.invade,
    rarity: RARITY_OVERRIDES[print.id] ?? print.rarity,
    movie,
    text: (print.text ?? "").replace(/\r\n?/g, "\n"),
    notes: print.notes?.replace(/\r\n?/g, "\n").trim() || null,
    imageUrl: `${IMAGE_ORIGIN}/img/cards/original/${print.set_number}/${print.id}.png`,
    unknownFields,
  });
}

function capitalize(word: string): string {
  return word.charAt(0).toUpperCase() + word.slice(1).toLowerCase();
}

function toInt(value: string | number | null): number | null {
  if (value === null || value === "") return null;
  const n = Number(value);
  if (!Number.isInteger(n))
    throw new Error(`Not an integer: ${JSON.stringify(value)}`);
  return n;
}
