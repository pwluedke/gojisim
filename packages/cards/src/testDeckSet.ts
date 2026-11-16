import { formatDeckList, type NamedDeck, parseDeckList } from "./deckLists";

/*
 * #359: the test decks (the decks the bot is tested with), shown next to the starter decks. The
 * lists never go in the repo: they live on the server's volume (`GET /api/test-decks`, behind the
 * sign-in), uploaded from Paul's Mac (`pnpm test-decks upload`). This is their shape and check,
 * shared by the server, the upload script and the web app.
 */

/** One test deck: the name the pickers show, and its list in GojiSim text. */
export interface TestDeckEntry {
  name: string;
  list: string;
}

/** The stored set: every upload replaces it whole, so a deck left out of an upload goes. */
export interface TestDeckSet {
  decks: TestDeckEntry[];
}

/** At most this many test decks in a set. */
export const MAX_TEST_DECKS = 40;
/** A test deck's name is at most this many characters. */
export const MAX_TEST_DECK_NAME = 60;

const isObject = (v: unknown): v is Record<string, unknown> =>
  typeof v === "object" && v !== null && !Array.isArray(v);

/**
 * The problems with a test deck set, empty when it's valid: the shape (no other fields), names
 * (set, short, no control characters, each once ignoring case) and lists (GojiSim text that reads
 * with no errors, one deck with cards).
 */
export function validateTestDeckSet(data: unknown): string[] {
  if (!isObject(data)) return ["not an object"];
  const extra = Object.keys(data).filter((k) => k !== "decks");
  if (extra.length > 0) return [`unexpected field ${extra.join(", ")}`];
  const { decks } = data;
  if (!Array.isArray(decks)) return ["decks is not a list"];
  const problems: string[] = [];
  if (decks.length > MAX_TEST_DECKS)
    problems.push(`more than ${MAX_TEST_DECKS} decks`);
  const names = new Set<string>();
  decks.forEach((entry: unknown, i) => {
    const where = `decks[${i}]`;
    if (!isObject(entry)) return void problems.push(`${where}: not an object`);
    const keys = Object.keys(entry).filter((k) => k !== "name" && k !== "list");
    if (keys.length > 0)
      problems.push(`${where}: unexpected field ${keys.join(", ")}`);
    const { name, list } = entry;
    if (typeof name !== "string" || name.trim() === "")
      problems.push(`${where}: no name`);
    else if (name !== name.trim())
      problems.push(`${where}: name has spaces at an end`);
    else if (name.length > MAX_TEST_DECK_NAME)
      problems.push(`${where}: name over ${MAX_TEST_DECK_NAME} characters`);
    // eslint-disable-next-line no-control-regex
    else if (/[\u0000-\u001f\u007f]/.test(name))
      problems.push(`${where}: name has a control character`);
    else if (names.has(name.toLowerCase()))
      problems.push(`${where}: name ${name} twice`);
    else names.add(name.toLowerCase());
    if (typeof list !== "string")
      return void problems.push(`${where}: no list`);
    const parsed = parseDeckList(list);
    for (const e of parsed.errors)
      problems.push(`${where}: line ${e.line}: ${e.reason}`);
    if (parsed.decks.length !== 1)
      problems.push(`${where}: ${parsed.decks.length} decks in the list`);
    else if (
      parsed.errors.length === 0 &&
      parsed.decks[0]!.monsterDeck.length + parsed.decks[0]!.mainDeck.length ===
        0
    )
      problems.push(`${where}: no cards`);
  });
  return problems;
}

/** A valid set's decks, each read from its list and named as the set names it. */
export function testDecksOf(set: TestDeckSet): NamedDeck[] {
  return set.decks.flatMap(({ name, list }) => {
    const deck = parseDeckList(list).decks[0];
    return deck ? [{ ...deck, name }] : [];
  });
}

/** A deck's GojiSim text with only its name and cards (no tags, origin or old names). */
const listOf = (name: string, deck: NamedDeck) =>
  formatDeckList([
    { name, monsterDeck: deck.monsterDeck, mainDeck: deck.mainDeck },
  ]);

/**
 * The upload script's input, a local file on Paul's Mac (never committed), as a set: either JSON
 * (an object of name → deck list text) or GojiSim text holding several decks, each named by its
 * `[deck]` line. Each list is stored as its deck's GojiSim text, so the server never holds another
 * format. Throws when the file reads as neither; `validateTestDeckSet` checks the result.
 */
export function testDeckSetFromFile(text: string): TestDeckSet {
  const trimmed = text.trim();
  if (trimmed.startsWith("{")) {
    const data: unknown = JSON.parse(trimmed);
    if (!isObject(data))
      throw new Error("Expected an object of name → deck list");
    return {
      decks: Object.entries(data).map(([name, list]) => {
        if (typeof list !== "string")
          throw new Error(`${name}: the deck list is not text`);
        const parsed = parseDeckList(list);
        const deck = parsed.decks[0];
        // A list that doesn't read is kept as given, so the check names its lines.
        return {
          name: name.trim(),
          list:
            deck && parsed.errors.length === 0 && parsed.decks.length === 1
              ? listOf(name.trim(), deck)
              : list,
        };
      }),
    };
  }
  const parsed = parseDeckList(text);
  if (parsed.errors.length > 0)
    throw new Error(
      parsed.errors.map((e) => `line ${e.line}: ${e.reason}`).join("\n"),
    );
  return {
    decks: parsed.decks.map((deck) => ({
      name: deck.name.trim(),
      list: listOf(deck.name.trim(), deck),
    })),
  };
}
