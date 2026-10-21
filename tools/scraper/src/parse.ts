import { z } from "zod";

/** One print as embedded in a card page's `const allPrints = [...]` script. */
export const SitePrintSchema = z.looseObject({
  id: z.number().int(),
  parent_id: z.number().int().nullable(),
  set_number: z.string(),
  release_set: z.string().nullable(),
  name: z.string(),
  rank: z.union([z.string(), z.number()]).nullable(),
  invade: z.number().int().nullable(),
  color: z.string(),
  type: z.string(),
  trait: z.string().nullable(),
  property: z.string().nullable(),
  text: z.string().nullable(),
  card_number: z.string(),
  rarity: z.string(),
  strength: z.number().int().nullable(),
  notes: z.string().nullable(),
  language: z.string().optional(),
});

export type SitePrint = z.infer<typeof SitePrintSchema>;

export interface ParsedCardPage {
  prints: SitePrint[];
  /** Id of the print the HTML table describes. */
  activeId: number;
  /** Label -> text of the details table (describes the active print only). */
  table: Record<string, string>;
  /** The unlabeled number next to the heart icon in the card header. */
  likes: string | null;
}

export function parseCardPage(html: string): ParsedCardPage {
  const prints = z
    .array(SitePrintSchema)
    .min(1)
    .parse(JSON.parse(extractAllPrints(html)));

  const activeIndex = Number(
    /js-variant-dot active"\s+data-index="(\d+)"/.exec(html)?.[1] ?? 0,
  );
  const active = prints[activeIndex];
  if (!active)
    throw new Error(`Active variant index ${activeIndex} is out of range`);

  return {
    prints,
    activeId: active.id,
    table: parseDetailsTable(html),
    likes:
      /class='like-button[^>]*>[\s\S]*?<span>\s*(\d+)\s*<\/span>/.exec(
        html,
      )?.[1] ?? null,
  };
}

/** Returns the JSON array literal assigned to `allPrints`, matching brackets outside strings. */
function extractAllPrints(html: string): string {
  const marker = "const allPrints = ";
  const start = html.indexOf(marker);
  if (start < 0) throw new Error("No allPrints data on page");
  const from = start + marker.length;
  let depth = 0;
  let inString = false;
  for (let i = from; i < html.length; i++) {
    const ch = html[i];
    if (inString) {
      if (ch === "\\") i++;
      else if (ch === '"') inString = false;
    } else if (ch === '"') {
      inString = true;
    } else if (ch === "[" || ch === "{") {
      depth++;
    } else if (ch === "]" || ch === "}") {
      depth--;
      if (depth === 0) return html.slice(from, i + 1);
    }
  }
  throw new Error("Unterminated allPrints data");
}

function parseDetailsTable(html: string): Record<string, string> {
  const body = /<div class="card-body">([\s\S]*?)<\/table>/.exec(html)?.[1];
  if (!body) throw new Error("No card details table on page");
  const table: Record<string, string> = {};
  for (const [, label = "", value = ""] of body.matchAll(
    /<th[^>]*>([\s\S]*?)<\/th>\s*<td[^>]*>([\s\S]*?)<\/td>/g,
  )) {
    table[htmlToText(label)] = htmlToText(value);
  }
  return table;
}

export function htmlToText(html: string): string {
  return decodeEntities(html.replace(/<[^>]+>/g, " "))
    .replace(/\s+/g, " ")
    .trim();
}

function decodeEntities(text: string): string {
  const named: Record<string, string> = {
    amp: "&",
    lt: "<",
    gt: ">",
    quot: '"',
    apos: "'",
    nbsp: " ",
  };
  return text.replace(
    /&(#x[0-9a-f]+|#\d+|[a-z]+);/gi,
    (entity, code: string) => {
      if (code[0] === "#") {
        const n =
          code[1] === "x" || code[1] === "X"
            ? parseInt(code.slice(2), 16)
            : Number(code.slice(1));
        return String.fromCodePoint(n);
      }
      return named[code.toLowerCase()] ?? entity;
    },
  );
}
