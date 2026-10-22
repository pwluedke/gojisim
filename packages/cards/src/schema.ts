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
  /**
   * Traits as printed, in the site's spelling after `trait-spellings.json` (e.g.
   * `["Rodan", "Weapon"]`); empty for cards with none. Use `getCardTraits` for the traits in force
   * after errata.
   */
  traits: z.array(z.string().min(1)),
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

/** Corrections to the site's trait spelling, keyed by the site's spelling. Applied after scraping. */
export const TraitSpellingsSchema = z.record(
  z.string().min(1),
  z.strictObject({ spelling: z.string().min(1), reason: z.string().min(1) }),
);

export type TraitSpellings = z.infer<typeof TraitSpellingsSchema>;

/** Strips parallel and finish markers: `EBP01-030++` and `ESD01-002 (Foil)` -> base numbers. */
export function stripPrintMarkers(cardNumber: string): string {
  return cardNumber.replace(/ \((Foil|Alt)\)$/, "").replace(/\++$/, "");
}

/**
 * Splits a comma-separated trait list into trait names, dropping any 《》 brackets.
 * The site stores traits as one comma-separated string, e.g. `"Ebirah, Final Wars"`.
 */
export function parseTraits(trait: string | null): string[] {
  return (trait ?? "")
    .split(",")
    .map((t) => t.replace(/[《》]/g, "").trim())
    .filter((t) => t.length > 0);
}

/**
 * Corrections to scraped card text, keyed by `deckCardNumber` (Q12). Each `from` is replaced by
 * `to` in every print of the card whose text contains it. Applied after scraping.
 */
export const TextOverridesSchema = z.record(
  z.string().min(1),
  z
    .array(
      z.strictObject({
        from: z.string().min(1),
        to: z.string(),
        reason: z.string().min(1),
      }),
    )
    .min(1),
);

export type TextOverrides = z.infer<typeof TextOverridesSchema>;

/** Applies `text-overrides.json` to every print of each listed card (Q12). */
export function applyTextOverrides(
  cards: Card[],
  overrides: TextOverrides,
): Card[] {
  return cards.map((card) => {
    const fixes = overrides[card.deckCardNumber];
    if (!fixes) return card;
    const text = fixes.reduce(
      (current, fix) => current.split(fix.from).join(fix.to),
      card.text,
    );
    return text === card.text ? card : { ...card, text };
  });
}
