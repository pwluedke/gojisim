import { type AbilityStatus, getCardAbilities } from "@gojisim/cards";
import { inScopeCards, STARTER_SETS } from "./survey";

/** One card's ability status (format.md: implemented, partial or manual). */
export interface CoverageRow {
  deckCardNumber: string;
  name: string;
  set: string;
  starter: boolean;
  status: AbilityStatus;
  /** Abilities in the data (keywords included). */
  abilities: number;
  deckRules: string[];
}

export type StatusCounts = Record<AbilityStatus, number>;

export interface Coverage {
  rows: CoverageRow[];
  total: StatusCounts;
  starters: StatusCounts;
  bySet: Record<string, StatusCounts>;
}

const empty = (): StatusCounts => ({ implemented: 0, partial: 0, manual: 0 });

/** Ability status of every in-scope card (the M4a survey's scope), from the ability data. */
export function abilityCoverage(): Coverage {
  const rows = inScopeCards().map((card): CoverageRow => {
    const data = getCardAbilities(card.deckCardNumber);
    return {
      deckCardNumber: card.deckCardNumber,
      name: card.name,
      set: card.set,
      starter: STARTER_SETS.includes(card.set),
      status: data.status,
      abilities: data.abilities.length,
      deckRules: (data.deckRules ?? []).map((r) => r.rule),
    };
  });
  const total = empty();
  const starters = empty();
  const bySet: Record<string, StatusCounts> = {};
  for (const row of rows) {
    total[row.status]++;
    if (row.starter) starters[row.status]++;
    const set = (bySet[row.set] ??= empty());
    set[row.status]++;
  }
  return { rows, total, starters, bySet };
}
