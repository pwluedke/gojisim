import { mkdirSync, mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { DatabaseSync } from "node:sqlite";
import { describe, expect, it } from "vitest";
import { openDb } from "../db/db.js";
import { deckLists, reportPoster } from "../reports.js";
import { resolveDeck } from "./decks.js";
import { reporterDeck } from "./reportDeck.js";
import { createRoom, joinRoom, type Room, type SeatPlayer } from "./room.js";

/*
 * Paul, Nov 12: every in-app report's Slack #gojisim-reports post carries the full deck lists
 * (only Paul reads that channel): both decks vs the bot, the reporter's own deck only online
 * (Q42). Never in a Discord post.
 */

function starter(set: "ESD01" | "ESD02"): SeatPlayer["deck"] {
  const found = resolveDeck(
    null as unknown as DatabaseSync,
    "nobody",
    { source: "official", set },
    "tournament",
    new Date("2026-11-10"),
  );
  if (!found.ok) throw new Error(found.error);
  return found.deck;
}
const ESD01 = starter("ESD01");
const ESD02 = starter("ESD02");
const GAME = "11111111-2222-4333-8444-555555555555";
const H2H = "0f8b6c3e-4b7a-4c1e-9d2a-5e6f7a8b9c0d";
const SLACK = "https://hooks.slack.com/services/T0/B0/slacksecret";
const DISCORD = "https://discord.com/api/webhooks/1/discordsecret";
const BUGS = "https://discord.example/api/webhooks/bugs";
const bug = {
  actionIndex: 3,
  when: "Turn 2, Main phase",
  text: "it broke",
  reporter: "Ann",
  at: "2026-11-12T21:00:00.000Z",
  community: "named",
};

/** A poster with every webhook, recording what each one got. */
function poster(
  reporterDeckOf?: Parameters<typeof reportPoster>[0]["reporterDeckOf"],
) {
  const calls: { url: string; body: string }[] = [];
  const post = reportPoster({
    webhook: DISCORD,
    slackWebhook: SLACK,
    bugsWebhook: BUGS,
    ...(reporterDeckOf ? { reporterDeckOf } : {}),
    fetchImpl: (async (url: string | URL | Request, init?: RequestInit) => {
      calls.push({ url: String(url), body: String(init?.body) });
      return new Response("ok");
    }) as typeof fetch,
    log: () => {},
  });
  return { post, calls };
}

describe("deck lists in the Slack report post (Paul, Nov 12)", () => {
  it('a game vs the bot: both decks in full, "count name card-number", in the Slack post only', async () => {
    const record = {
      version: 1,
      seed: 1,
      gameId: GAME,
      playerName: "Ann",
      decks: [
        { id: "P1", ...ESD01 },
        { id: "P2", ...ESD02 },
      ],
      actions: [],
      seats: {
        P1: { kind: "human" },
        P2: { kind: "bot", bot: "ismcts", settings: { difficulty: 55 } },
      },
      deckNames: { P1: "ESD01 official", P2: "ESD02 official" },
      bugReports: [bug],
    };
    const lists = (await deckLists(record)) ?? "";
    expect(lists).toContain("P1 · Ann: ESD01 official\nMonster deck (4)\n");
    expect(lists).toContain(
      "\n\nP2 · Bot P2: ESD02 official\nMonster deck (4)\n",
    );
    expect(lists).toMatch(/^Main deck \(50\)$/m);
    // One line per card, its count first: e.g. ESD01's 4 Heat Ray.
    expect(lists).toMatch(/^\d+ Heat Ray ESD01-016$/m);
    const { post, calls } = poster();
    await post(record, null, "2026-11-12/g.json");
    const slack = calls.find((c) => c.url === SLACK)?.body ?? "";
    expect(slack).toContain("Heat Ray ESD01-016");
    expect(slack).toContain("ESD02 official");
    for (const c of calls.filter((c) => c.url !== SLACK)) {
      expect(c.body).not.toContain("ESD01-016");
      expect(c.body).not.toContain("Monster deck");
    }
  });

  it("Q42: a head to head report lists the reporter's own deck only, which the server looks up", async () => {
    const asked: string[] = [];
    const { post, calls } = poster(async (gameId, playerId) => {
      asked.push(`${gameId}/${playerId}`);
      return { name: "Ann", deckName: "ESD01 official", deck: ESD01 };
    });
    // The browser's copy: empty decks, the h2h game named, the server's player stamp.
    const record = {
      version: 1,
      seed: 0,
      gameId: GAME,
      h2hGameId: H2H,
      playerId: "ann-id",
      playerName: "Ann",
      decks: [
        { id: "P1", monsterDeck: [], mainDeck: [] },
        { id: "P2", monsterDeck: [], mainDeck: [] },
      ],
      actions: [],
      seats: { P1: { kind: "human" }, P2: { kind: "human" } },
      deckNames: { P1: "ESD01 official" },
      bugReports: [bug],
    };
    await post(record, null, "2026-11-12/g.json");
    expect(asked).toEqual([`${H2H}/ann-id`]);
    const slack = calls.find((c) => c.url === SLACK)?.body ?? "";
    expect(slack).toContain("Ann: ESD01 official");
    expect(slack).toContain("Heat Ray ESD01-016");
    expect(slack).not.toContain("ESD02");
    for (const c of calls.filter((c) => c.url !== SLACK))
      expect(c.body).not.toContain("ESD01-016");
  });

  it("the reporter's deck comes from the live room, or once it's gone, from the game's stored record; never the other seat's", async () => {
    const ann: SeatPlayer = {
      playerId: "ann-id",
      name: "Ann",
      deckName: "ESD01 official",
      deck: ESD01,
    };
    const bo: SeatPlayer = {
      playerId: "bo-id",
      name: "Bo",
      deckName: "ESD02 official",
      deck: ESD02,
    };
    const room = createRoom({
      gameId: H2H,
      seed: 1,
      mode: "casual",
      creator: ann,
      now: 0,
    });
    joinRoom(room, bo);
    const rooms = new Map<string, Room>([[H2H, room]]);
    const dir = mkdtempSync(join(tmpdir(), "gojisim-report-deck-"));
    expect(
      (await reporterDeck(rooms, undefined, dir, H2H, "bo-id"))?.deckName,
    ).toBe("ESD02 official");
    expect(await reporterDeck(rooms, undefined, dir, H2H, "nobody")).toBeNull();
    // The room is gone: the stored record, found through the player's `games` row.
    const db = openDb(join(dir, "db.sqlite"));
    mkdirSync(join(dir, "2026-11-12"));
    writeFileSync(
      join(dir, "2026-11-12", `${H2H}.json`),
      JSON.stringify({
        version: 1,
        seed: 1,
        gameId: H2H,
        h2h: true,
        decks: [
          { id: "P1", ...ESD01 },
          { id: "P2", ...ESD02 },
        ],
        actions: [],
        seats: {
          P1: { kind: "human", playerId: "ann-id", playerName: "Ann" },
          P2: { kind: "human", playerId: "bo-id", playerName: "Bo" },
        },
        deckNames: { P1: "ESD01 official", P2: "ESD02 official" },
      }),
    );
    db.prepare(
      "INSERT INTO players (id, discord_id, display_name, avatar_url, created_at, last_seen_at, roles_checked_at) VALUES ('ann-id', NULL, 'Ann', NULL, 0, 0, NULL)",
    ).run();
    db.prepare(
      "INSERT INTO games (game_id, player_id, file, started_at, updated_at, ended_at, result, bot_level, deck_names, season, h2h) VALUES (?, 'ann-id', ?, 0, 0, 0, 'win', NULL, '', 'beta', 1)",
    ).run(H2H, `2026-11-12/${H2H}.json`);
    const stored = await reporterDeck(new Map(), db, dir, H2H, "ann-id");
    expect(stored?.deckName).toBe("ESD01 official");
    expect(stored?.name).toBe("Ann");
    expect(await reporterDeck(new Map(), db, dir, H2H, "bo-id")).toBeNull();
  });
});
