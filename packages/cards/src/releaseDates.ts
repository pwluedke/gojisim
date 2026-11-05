import { z } from "zod";
import releaseDatesJson from "../data/release-dates.json";

/**
 * A card in the data before it is tournament-legal: announced or out in Japan only. It can be
 * used now (deckbuilder, Casual games, bots), but a deck holding it is legal only from
 * `legalFrom`, like a restriction list's effective date.
 */
export const ReleaseDateSchema = z.strictObject({
  deckCardNumber: z.string().min(1),
  /** First day the card is tournament-legal (ISO date). */
  legalFrom: z.iso.date(),
  source: z.string().min(1),
});

export type ReleaseDate = z.infer<typeof ReleaseDateSchema>;

export const RELEASE_DATES: readonly ReleaseDate[] = z
  .array(ReleaseDateSchema)
  .parse(releaseDatesJson);

/**
 * The day a card becomes tournament-legal (`YYYY-MM-DD`) when that is after `asOf`; `null` when
 * it is already legal or has no release date listed.
 */
export function getNotYetLegal(
  deckCardNumber: string,
  asOf: Date,
): string | null {
  const day = asOf.toISOString().slice(0, 10);
  const entry = RELEASE_DATES.find((r) => r.deckCardNumber === deckCardNumber);
  return entry && entry.legalFrom > day ? entry.legalFrom : null;
}

/**
 * The first day every card in the data is tournament-legal: the latest `legalFrom`, or `asOf`
 * when that is later. Tools that prepare for a tournament check legality on this day.
 */
export function allCardsLegalFrom(asOf: Date): Date {
  const latest = RELEASE_DATES.map((r) => r.legalFrom)
    .sort()
    .at(-1);
  return latest && new Date(`${latest}T00:00:00Z`) > asOf
    ? new Date(`${latest}T00:00:00Z`)
    : asOf;
}
