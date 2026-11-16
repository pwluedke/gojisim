import { readFileSync } from "node:fs";
import { botInput, decklistsOf } from "@gojisim/bot";
import { parseDeckList } from "@gojisim/cards/deck-lists";
import { describe, expect, it } from "vitest";
import {
  deckOptions,
  pickerGroups,
  playDeckOptions,
  testDeckOptions,
} from "./decks";
import { newSession } from "./session";
import { fetchTestDecks } from "./testDecks";

/**
 * #359: the test decks in the web app, on made-up decks: the public starter lists under sample
 * names (the real test decks live on the server only, never in the repo).
 */
const starter = (file: string) =>
  readFileSync(
    new URL(`../../../../packages/cards/data/decks/${file}`, import.meta.url),
    "utf8",
  );
const esd01 = starter("esd01-starter.txt");
const esd02 = starter("esd02-starter.txt");
const sampleSet = {
  decks: [
    { name: "Sample A", list: esd02 },
    { name: "Sample B", list: esd01 },
  ],
};

const answering = (status: number, body: unknown) => {
  const calls: { url: string; init?: RequestInit }[] = [];
  const fake = (async (url: string, init?: RequestInit) => {
    calls.push({ url, ...(init ? { init } : {}) });
    return new Response(
      typeof body === "string" ? body : JSON.stringify(body),
      { status },
    );
  }) as unknown as typeof fetch;
  return { fake, calls };
};

describe("#359 test decks from the server", () => {
  it("reads GET /api/test-decks as decks in the uploaded order, under the set's names", async () => {
    const { fake, calls } = answering(200, sampleSet);
    const decks = await fetchTestDecks(fake);
    expect(calls[0]?.url).toBe("/api/test-decks");
    expect((calls[0]?.init?.headers as Record<string, string>).accept).toBe(
      "application/json",
    );
    expect(decks.map((d) => d.name)).toEqual(["Sample A", "Sample B"]);
    expect(decks[0]?.mainDeck).toHaveLength(50);
  });

  it("has none when signed out, the route is missing, the answer isn't JSON or fails the check", async () => {
    expect(await fetchTestDecks(answering(401, {}).fake)).toEqual([]);
    expect(await fetchTestDecks(answering(404, "nope").fake)).toEqual([]);
    expect(
      await fetchTestDecks(answering(200, "<!doctype html>").fake),
    ).toEqual([]);
    expect(
      await fetchTestDecks(answering(200, { decks: [{ name: "x" }] }).fake),
    ).toEqual([]);
    const failing = (async () => {
      throw new Error("offline");
    }) as unknown as typeof fetch;
    expect(await fetchTestDecks(failing)).toEqual([]);
  });
});

describe("#359 test decks in the pickers", () => {
  const tests = parseDeckList(`${esd02}\n${esd01}`).decks.map((d, i) => ({
    ...d,
    name: `Sample ${"AB"[i]}`,
  }));
  const mine = [
    {
      id: "d1",
      name: "Mine",
      deck: { name: "Mine", monsterDeck: [], mainDeck: [] },
    },
  ];

  it("/play lists the Starter decks, then the Test decks, then My decks", () => {
    const options = playDeckOptions(mine, tests);
    expect(options.map((o) => o.key)).toEqual([
      "official:ESD01",
      "official:ESD02",
      "test:Sample A",
      "test:Sample B",
      "mine:d1",
    ]);
    expect(
      pickerGroups(options).map((g) => [g.label, g.options.length]),
    ).toEqual([
      ["Starter decks", 2],
      ["Test decks", 2],
      ["My decks", 1],
    ]);
  });

  it("with no test decks, the group doesn't show", () => {
    expect(pickerGroups(playDeckOptions(mine)).map((g) => g.label)).toEqual([
      "Starter decks",
      "My decks",
    ]);
  });

  it("/debug's picker is unchanged (no test decks)", () => {
    expect(deckOptions(mine).some((o) => o.kind === "test")).toBe(false);
  });

  it("a test deck plays its list for either seat, and reaches a bot seat as its decklist", () => {
    const [a, b] = testDeckOptions(tests);
    const session = newSession(7, [a!, b!], {
      P1: { kind: "human" },
      P2: { kind: "bot", difficulty: 50 },
    });
    const ids = (cards: readonly { id: number }[]) => cards.map((c) => c.id);
    expect(ids(session.record.decks[0].mainDeck)).toEqual(
      ids(tests[0]!.mainDeck),
    );
    expect(ids(session.record.decks[1].mainDeck)).toEqual(
      ids(tests[1]!.mainDeck),
    );
    // The bot's own decklist, as `useGameSession` builds the bot's input: the test deck's list.
    const input = botInput(
      session.states.at(-1)!,
      "P2",
      decklistsOf(session.record.decks),
      () => 0,
    );
    const own = input.knowledge.decks.P2!;
    expect(ids(own.mainDeck)).toEqual(ids(tests[1]!.mainDeck));
    expect(ids(own.monsterDeck)).toEqual(ids(tests[1]!.monsterDeck));
  });
});
