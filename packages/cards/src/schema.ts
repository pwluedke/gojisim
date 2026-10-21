import { z } from "zod";

export const CARD_TYPES = [
  "Monster",
  "Battle",
  "Strategy",
  "Rage",
  "Token",
] as const;

export const CARD_COLORS = ["Red", "Blue", "Green", "White"] as const;

export const CardTypeSchema = z.enum(CARD_TYPES);

export const CardColorSchema = z.enum(CARD_COLORS);

export const CardSchema = z.strictObject({
  /** Numeric id on godzillatcgdb.com (`/card/<id>`). */
  id: z.number().int().positive(),
  /** Printed card number as the site displays it, e.g. `EBP01-030`, `EBP01-030+`. */
  cardNumber: z.string().min(1),
  /** `cardNumber` without trailing `+` parallel markers. */
  baseCardNumber: z.string().min(1),
  isParallel: z.boolean(),
  /** Site id of the print this one is a version of; `null` for a base print. */
  parentId: z.number().int().positive().nullable(),
  /**
   * Card number the 4-copy deck limit counts against (rule 6.1.1.4): the base print's number
   * without `+`, `++`, ` (Foil)` or ` (Alt)`. Every print of one card shares this value.
   */
  deckCardNumber: z.string().min(1),
  name: z.string().min(1),
  /** Set code, e.g. `EBP01`, `PR`, `RAGE`. */
  set: z.string().min(1),
  /** Empty for colorless (blank) cards such as Rage cards. */
  colors: z.array(CardColorSchema),
  type: CardTypeSchema,
  rank: z.number().int().nullable(),
  /** Threat on Monster cards, Counter Power on Battle cards. */
  counterOrThreat: z.number().int().nullable(),
  invadeZones: z.number().int().nullable(),
  rarity: z.string().min(1),
  movie: z.string().min(1).nullable(),
  text: z.string(),
  notes: z.string().min(1).nullable(),
  imageUrl: z.url(),
  /** Label/value pairs from the site that have no field above. */
  unknownFields: z.record(z.string(), z.string()),
});

export type Card = z.infer<typeof CardSchema>;

export type CardType = z.infer<typeof CardTypeSchema>;

export type CardColor = z.infer<typeof CardColorSchema>;

export const CardListSchema = z.array(CardSchema);

/** Manual corrections applied after scraping, keyed by card id. */
export const CardOverridesSchema = z.record(
  z.string().regex(/^\d+$/),
  CardSchema.omit({ id: true })
    .partial()
    .extend({ reason: z.string().min(1) }),
);

export type CardOverrides = z.infer<typeof CardOverridesSchema>;

/** Strips parallel and finish markers: `EBP01-030++` and `ESD01-002 (Foil)` -> base numbers. */
export function stripPrintMarkers(cardNumber: string): string {
  return cardNumber.replace(/ \((Foil|Alt)\)$/, "").replace(/\++$/, "");
}
