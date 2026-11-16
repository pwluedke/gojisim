import {
  type TestDeckSet,
  testDeckSetFromFile,
  testDecksOf,
  validateTestDeckSet,
} from "@gojisim/cards/test-deck-set";

/*
 * #359: `pnpm test-decks check|upload --file <path>`. The file is Paul's local list of test decks
 * (GojiSim text with a `[deck]` line per deck, or JSON of name → deck list), which stays on the Mac
 * and is never committed. `upload` sends the whole set to the server (`TEST_DECKS_URL`, default
 * the site) with the token in `TEST_DECKS_UPLOAD_TOKEN`, replacing the set there: a deck left out
 * of the file leaves the pickers. The token is never printed.
 */

/** The site the upload goes to, unless `TEST_DECKS_URL` says otherwise. */
export const DEFAULT_SITE = "https://gojisim.somanygames.app";

/** The file read as a set, checked as the server will check it; throws with every problem. */
export function testDeckSetOf(text: string): TestDeckSet {
  const set = testDeckSetFromFile(text);
  const problems = validateTestDeckSet(set);
  if (problems.length > 0) throw new Error(problems.join("\n"));
  return set;
}

/** One line per deck for the console: its name and card counts (the list itself stays local). */
export function summary(set: TestDeckSet): string[] {
  return testDecksOf(set).map(
    (d) =>
      `${d.name}: ${d.monsterDeck.length} monster, ${d.mainDeck.length} main`,
  );
}

/** Sends the set; the server's answer, with `ok` false when it was refused. */
export async function uploadTestDecks(
  set: TestDeckSet,
  env: Record<string, string | undefined>,
  fetchImpl: typeof fetch = fetch,
): Promise<{ ok: boolean; status: number; body: string }> {
  const token = env["TEST_DECKS_UPLOAD_TOKEN"]?.trim();
  if (!token) throw new Error("TEST_DECKS_UPLOAD_TOKEN isn't set");
  const site = (env["TEST_DECKS_URL"]?.trim() || DEFAULT_SITE).replace(
    /\/+$/,
    "",
  );
  const res = await fetchImpl(`${site}/api/test-decks/upload`, {
    method: "POST",
    headers: {
      authorization: `Bearer ${token}`,
      "content-type": "application/json",
    },
    body: JSON.stringify(set),
  });
  return { ok: res.ok, status: res.status, body: await res.text() };
}
