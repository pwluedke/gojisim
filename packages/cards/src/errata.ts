import { z } from "zod";
import errataJson from "../data/errata.json";
import type { Card } from "./schema";

const IsoDateSchema = z.iso.date();

export const ErratumSchema = z.strictObject({
  deckCardNumber: z.string().min(1),
  /** What the erratum corrects: the ability text, or the card's traits. */
  field: z.enum(["text", "traits"]),
  /**
   * Text as printed, copied verbatim from the official errata page. The page may quote only the
   * changed part of the ability, marked with a leading or trailing `...`.
   */
  printedText: z.string().min(1),
  /** Corrected text, verbatim from the official errata page (same excerpt rules). */
  correctedText: z.string().min(1),
  announced: IsoDateSchema,
  sourceUrl: z.url(),
});

export type Erratum = z.infer<typeof ErratumSchema>;

export const ErrataSchema = z.array(ErratumSchema);

export const ERRATA: readonly Erratum[] = ErrataSchema.parse(errataJson);

export interface CardText {
  /** Text in force: the corrected text for a card with errata. */
  text: string;
  hasErrata: boolean;
  /** Full text as printed, when it differs from `text`. */
  printedText?: string;
}

/** Strips the `...` excerpt markers the official errata pages put around partial ability text. */
function excerptCore(excerpt: string): string {
  return excerpt
    .replace(/^\s*(\.\.\.|…)\s*/, "")
    .replace(/\s*(\.\.\.|…)\s*$/, "")
    .trim();
}

/**
 * Returns a card's text with any errata applied. `card.text` (from godzillatcgdb) may hold either
 * the printed or the corrected wording; the official excerpt is swapped in either direction to
 * produce both versions.
 */
export function getCardText(
  card: Pick<Card, "deckCardNumber" | "text">,
): CardText {
  const errata = ERRATA.filter((e) => e.deckCardNumber === card.deckCardNumber);
  if (errata.length === 0) return { text: card.text, hasErrata: false };

  let text = card.text;
  let printedText = card.text;
  // Trait errata (e.g. Rodan(2004)) still mark the card as having errata but leave its text alone.
  for (const erratum of errata.filter((e) => e.field === "text")) {
    const printed = excerptCore(erratum.printedText);
    const corrected = excerptCore(erratum.correctedText);
    if (text.includes(corrected)) {
      printedText = printedText.replace(corrected, printed);
    } else if (text.includes(printed)) {
      text = text.replace(printed, corrected);
    } else {
      throw new Error(
        `Erratum for ${card.deckCardNumber} matches neither the printed nor the corrected text`,
      );
    }
  }
  return printedText === text
    ? { text, hasErrata: true }
    : { text, hasErrata: true, printedText };
}
