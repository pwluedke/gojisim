import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { validateDeck } from "@gojisim/cards";
import { type NamedDeck, parseDeckList } from "@gojisim/cards/deck-lists";
import { buildTestDeck } from "@gojisim/cards/test-decks";

/**
 * #170 deck-vs-deck: the decks `pnpm bots --a-deck / --b-deck` and `pnpm bots-plan` play. Deck
 * files stay local (`local-decks/`, gitignored); nothing here is committed.
 */

/** While this file exists (under the output folder), runs stop between games (#170). */
export const STOP_FILE = "bot-reports/STOP";

/**
 * A deck from `<file>#<deck name>` (the full `[deck]` name, folder included), or
 * `random:<SET>`: a random test deck of that set with a seed fixed for the run. A deck from a file
 * must parse cleanly and pass `validateDeck`.
 */
export function loadDeck(spec: string, base: string, seed: string): NamedDeck {
  if (spec.startsWith("random:")) {
    const set = spec.slice("random:".length);
    const deck = buildTestDeck(set, `${seed}-random-${set}`);
    return { ...deck, name: `Random ${set}` };
  }
  const cut = spec.indexOf("#");
  if (cut < 0)
    throw new Error(`A deck is <file>#<deck name> or random:<SET>: ${spec}`);
  const file = spec.slice(0, cut);
  const name = spec.slice(cut + 1).trim();
  const parsed = parseDeckList(readFileSync(resolve(base, file), "utf8"));
  const index = parsed.decks.findIndex((d) => d.name.trim() === name);
  const deck = parsed.decks[index];
  if (!deck) throw new Error(`No deck named "${name}" in ${file}`);
  const errors = parsed.errors.filter((e) => e.deck === index);
  if (errors.length > 0)
    throw new Error(
      `"${name}" doesn't parse: ${errors.map((e) => `line ${e.line}: ${e.reason}`).join("; ")}`,
    );
  const check = validateDeck(deck, new Date());
  if (!check.legal)
    throw new Error(
      `"${name}" isn't legal: ${check.failures.flatMap((f) => f.reasons.map((r) => `${f.rule} ${r}`)).join("; ")}`,
    );
  return deck;
}
