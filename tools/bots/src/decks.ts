import { existsSync, readFileSync } from "node:fs";
import { isAbsolute, relative, resolve } from "node:path";
import { allCardsLegalFrom, validateDeck } from "@gojisim/cards";
import { type NamedDeck, parseDeckList } from "@gojisim/cards/deck-lists";
import { buildTestDeck } from "@gojisim/cards/test-decks";

/**
 * #170 deck-vs-deck: the decks `pnpm bots --a-deck / --b-deck` and `pnpm bots-plan` play. Deck
 * files stay local (`local-decks/`, gitignored); nothing here is committed.
 */

/** While this file exists (under the output folder), runs stop between games (#170). */
export const STOP_FILE = "bot-reports/STOP";

/**
 * The one deck list (Paul, Nov 9): every deck, flat names, tags in place of folders. The top-tier
 * set is its decks tagged Meta (replacing meta.txt), and a deck a run plan names by its old
 * `<file>#<name>` is found by its `# was:` line.
 */
export const DECKS_FILE = "local-decks/decks.txt";
export const META_TAG = "Meta";

/** `--decks meta`'s default list: the one deck list, or meta.txt while it isn't there. */
export function defaultMetaDecks(base: string): string {
  return existsSync(resolve(base, DECKS_FILE))
    ? DECKS_FILE
    : "local-decks/meta.txt";
}

const tagged = (deck: NamedDeck, tag: string) =>
  (deck.tags ?? []).some((t) => t.toLowerCase() === tag.toLowerCase());

/**
 * A deck from `<file>#<deck name>` (the full `[deck]` name, folder included), or
 * `random:<SET>`: a random test deck of that set with a seed fixed for the run. A deck from a file
 * must parse cleanly and pass `validateDeck` on the day every card is tournament-legal.
 */
/**
 * The `--decks meta` list (Paul's guard rule): the top-tier decks in a local deck-list file, each
 * parsed and checked as `loadDeck` does. In a file with tags (the one deck list, `DECKS_FILE`)
 * they are the decks tagged Meta; an older file without tags (meta.txt) gives all its decks.
 */
export function loadMetaDecks(file: string, base: string): NamedDeck[] {
  const parsed = parseDeckList(readFileSync(resolve(base, file), "utf8"));
  const withTags = parsed.decks.some((d) => (d.tags ?? []).length > 0);
  return parsed.decks
    .filter((d) => !withTags || tagged(d, META_TAG))
    .map((d) => loadDeck(`${file}#${d.name.trim()}`, base, ""));
}

/**
 * Where `<file>#<name>` is now: that file's deck if it's still there; otherwise the deck in the
 * one deck list with that `# was:` name (paths compared relative to `base`).
 */
function findDeck(
  file: string,
  name: string,
  base: string,
): { file: string; text: string; name: string } | null {
  const path = resolve(base, file);
  if (existsSync(path)) {
    const text = readFileSync(path, "utf8");
    if (parseDeckList(text).decks.some((d) => d.name.trim() === name))
      return { file, text, name };
  }
  const list = resolve(base, DECKS_FILE);
  if (!existsSync(list)) return null;
  const text = readFileSync(list, "utf8");
  const old = `${isAbsolute(file) ? relative(base, file) : file}#${name}`;
  const moved = parseDeckList(text).decks.find((d) =>
    (d.was ?? []).includes(old),
  );
  return moved ? { file: DECKS_FILE, text, name: moved.name.trim() } : null;
}

export function loadDeck(spec: string, base: string, seed: string): NamedDeck {
  if (spec.startsWith("random:")) {
    const set = spec.slice("random:".length);
    const deck = buildTestDeck(set, `${seed}-random-${set}`);
    return { ...deck, name: `Random ${set}` };
  }
  const cut = spec.indexOf("#");
  if (cut < 0)
    throw new Error(`A deck is <file>#<deck name> or random:<SET>: ${spec}`);
  const asked = spec.slice(0, cut);
  const found = findDeck(asked, spec.slice(cut + 1).trim(), base);
  if (!found)
    throw new Error(
      `No deck named "${spec.slice(cut + 1).trim()}" in ${asked}`,
    );
  const { name } = found;
  const parsed = parseDeckList(found.text);
  const index = parsed.decks.findIndex((d) => d.name.trim() === name);
  const deck = parsed.decks[index];
  if (!deck) throw new Error(`No deck named "${name}" in ${found.file}`);
  const errors = parsed.errors.filter((e) => e.deck === index);
  if (errors.length > 0)
    throw new Error(
      `"${name}" doesn't parse: ${errors.map((e) => `line ${e.line}: ${e.reason}`).join("; ")}`,
    );
  // Checked for the tournament: on the day every card in the data is legal (SD05-005 from Dec 4,
  // 2026), so decks with a card out in Japan only can play now.
  const check = validateDeck(deck, allCardsLegalFrom(new Date()));
  if (!check.legal)
    throw new Error(
      `"${name}" isn't legal: ${check.failures.flatMap((f) => f.reasons.map((r) => `${f.rule} ${r}`)).join("; ")}`,
    );
  return deck;
}
