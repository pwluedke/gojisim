import { z } from "zod";
import restrictionsJson from "../data/restrictions.json";

/** Copies of one card allowed in a deck when no restriction applies (rule 6.1.1.4). */
export const DEFAULT_MAX_COPIES = 4;

export const RestrictionEntrySchema = z.strictObject({
  deckCardNumber: z.string().min(1),
  maxCopies: z.number().int().min(0).max(DEFAULT_MAX_COPIES),
});

/** "Choice-Restricted": a deck may include cards from only one card of the group. */
export const ChoiceRestrictionSchema = z.strictObject({
  deckCardNumbers: z.array(z.string().min(1)).min(2),
});

export const RestrictionListSchema = z.strictObject({
  /** First day the list applies (ISO date). */
  effective: z.iso.date(),
  announced: z.iso.date(),
  sourceUrl: z.url(),
  entries: z.array(RestrictionEntrySchema),
  choiceRestrictions: z.array(ChoiceRestrictionSchema),
});

export type RestrictionList = z.infer<typeof RestrictionListSchema>;

export type ChoiceRestriction = z.infer<typeof ChoiceRestrictionSchema>;

export const RestrictionListsSchema = z.array(RestrictionListSchema);

export const RESTRICTION_LISTS: readonly RestrictionList[] =
  RestrictionListsSchema.parse(restrictionsJson).sort((a, b) =>
    a.effective < b.effective ? -1 : 1,
  );

/** Calendar date of `asOf` in UTC, as `YYYY-MM-DD`. */
function isoDay(asOf: Date): string {
  return asOf.toISOString().slice(0, 10);
}

function namesCard(list: RestrictionList, deckCardNumber: string): boolean {
  return (
    list.entries.some((e) => e.deckCardNumber === deckCardNumber) ||
    list.choiceRestrictions.some((g) =>
      g.deckCardNumbers.includes(deckCardNumber),
    )
  );
}

/**
 * The newest list in force on `asOf` that names the card. A later list replaces an earlier one
 * only for the cards it names.
 */
function governingList(
  deckCardNumber: string,
  asOf: Date,
): RestrictionList | undefined {
  const day = isoDay(asOf);
  return RESTRICTION_LISTS.filter(
    (l) => l.effective <= day && namesCard(l, deckCardNumber),
  ).at(-1);
}

/** Copies of a card allowed in a deck on `asOf`: the restriction in force, else 4 (rule 6.1.1.4). */
export function getMaxCopies(deckCardNumber: string, asOf: Date): number {
  const entry = governingList(deckCardNumber, asOf)?.entries.find(
    (e) => e.deckCardNumber === deckCardNumber,
  );
  return entry?.maxCopies ?? DEFAULT_MAX_COPIES;
}

/**
 * The restriction in force on `asOf` for a card, with the date its list took effect
 * (`YYYY-MM-DD`); `null` when no list limits it below 4.
 */
export function getRestriction(
  deckCardNumber: string,
  asOf: Date,
): { maxCopies: number; effective: string } | null {
  const list = governingList(deckCardNumber, asOf);
  const entry = list?.entries.find((e) => e.deckCardNumber === deckCardNumber);
  return list && entry && entry.maxCopies < DEFAULT_MAX_COPIES
    ? { maxCopies: entry.maxCopies, effective: list.effective }
    : null;
}

/** Choice-restricted groups in force on `asOf`. */
export function getChoiceRestrictions(asOf: Date): ChoiceRestriction[] {
  const day = isoDay(asOf);
  return RESTRICTION_LISTS.filter((l) => l.effective <= day).flatMap((list) =>
    list.choiceRestrictions.filter((group) =>
      group.deckCardNumbers.every((n) => governingList(n, asOf) === list),
    ),
  );
}
