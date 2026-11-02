import { mkdtempSync, readdirSync, readFileSync, writeFileSync } from "node:fs";
import type { AddressInfo } from "node:net";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import { openDb } from "./db/db.js";
import { playerSessionValue } from "./discordAuth.js";
import { COOKIE } from "./gate.js";
import { createAppServer } from "./index.js";
import { gameFacts, playerGames } from "./playerGames.js";
import { upsertDiscordPlayer } from "./players.js";

const SECRET = "s".repeat(40);
const NOW = Date.UTC(2026, 10, 1, 20);
let servers: ReturnType<typeof createAppServer>[] = [];
afterEach(() => {
  for (const s of servers) s.close();
  servers = [];
});
const dist = mkdtempSync(join(tmpdir(), "gojisim-dist-"));
writeFileSync(join(dist, "index.html"), "<title>GojiSim</title>");

const record = (gameId: string, extra: Record<string, unknown> = {}) => ({
  version: 1,
  seed: 7,
  gameId,
  decks: [
    { id: "P1", monsterDeck: [], mainDeck: [] },
    { id: "P2", monsterDeck: [], mainDeck: [] },
  ],
  actions: [{ type: "pass", player: "P1" }],
  seats: {
    P1: { kind: "human" },
    P2: { kind: "bot", bot: "ismcts", settings: { difficulty: 55 } },
  },
  deckNames: { P1: "ESD01 official", P2: "Kaiju Rush" },
  ...extra,
});
const G1 = "11111111-2222-4333-8444-555555555555";
const G2 = "22222222-2222-4333-8444-555555555555";

async function serve() {
  const db = openDb(":memory:", { log: () => {} });
  const recordsDir = mkdtempSync(join(tmpdir(), "gojisim-records-"));
  const posts: string[] = [];
  const server = createAppServer({
    distDir: dist,
    cardsDir: dist,
    recordsDir,
    secret: SECRET,
    discord: {
      db,
      clientId: "c",
      clientSecret: "s",
      guildId: "g",
      testerRoleId: "r",
      redirectUri: "https://x/cb",
    },
    reportsWebhook: "https://discord.com/api/webhooks/1/x",
    reportsFetch: (async (_u: unknown, init?: RequestInit) => {
      posts.push(
        (JSON.parse(String(init?.body)) as { content: string }).content,
      );
      return new Response(null, { status: 204 });
    }) as typeof fetch,
    now: () => NOW,
  });
  servers.push(server);
  await new Promise<void>((r) => server.listen(0, r));
  const { port } = server.address() as AddressInfo;
  const as = (name: string, discordId: string) => {
    const player = upsertDiscordPlayer(
      db,
      { discordId, displayName: name, avatarUrl: null },
      NOW,
    );
    const cookie = `${COOKIE}=${playerSessionValue(SECRET, player.id, NOW + 86_400_000)}`;
    const request = (path: string, init: RequestInit = {}) =>
      fetch(`http://localhost:${port}${path}`, {
        redirect: "manual",
        ...init,
        headers: {
          cookie,
          "x-real-ip": `198.51.100.${discordId}`,
          ...(init.headers ?? {}),
        },
      });
    const upload = (body: unknown) =>
      request("/api/games", { method: "POST", body: JSON.stringify(body) });
    return { player, request, upload };
  };
  return { db, recordsDir, as, posts };
}

describe("games linked to the player (#151)", () => {
  it("the result from the player's side, the bot level and the decks come from the record", () => {
    expect(
      gameFacts(record(G1, { outcome: { winner: "P1", reason: "invasion" } })),
    ).toEqual({
      result: "win",
      botLevel: "Medium",
      deckNames: "ESD01 official vs Kaiju Rush",
    });
    expect(
      gameFacts(record(G1, { outcome: { winner: "P2", reason: "concede" } }))
        .result,
    ).toBe("loss");
    expect(
      gameFacts(record(G1, { outcome: { winner: null, reason: "draw" } }))
        .result,
    ).toBe("draw");
    expect(gameFacts(record(G1)).result).toBeNull();
  });

  it("the server records the signed-in player in the upload, never the client's claim, and indexes the game", async () => {
    const { db, recordsDir, as } = await serve();
    const ann = as("Ann", "1");
    const res = await ann.upload(
      record(G1, { playerId: "someone-else", playerName: "Forged" }),
    );
    expect(res.status).toBe(201);
    const [day] = readdirSync(recordsDir);
    const stored = JSON.parse(
      readFileSync(join(recordsDir, day ?? "", `${G1}.json`), "utf8"),
    );
    expect(stored.playerId).toBe(ann.player.id);
    expect(stored.playerName).toBe("Ann");
    expect(playerGames(db, ann.player.id)).toMatchObject([
      {
        gameId: G1,
        result: null,
        botLevel: "Medium",
        deckNames: "ESD01 official vs Kaiju Rush",
        startedAt: NOW,
      },
    ]);
    // The finished upload sets the result and end time.
    await ann.upload(
      record(G1, { outcome: { winner: "P1", reason: "invasion" } }),
    );
    expect(playerGames(db, ann.player.id)[0]).toMatchObject({
      result: "win",
      endedAt: NOW,
    });
  });

  it("another player can't overwrite your game, see it in their list, or load it", async () => {
    const { as } = await serve();
    const ann = as("Ann", "1");
    const bo = as("Bo", "2");
    await ann.upload(record(G1));
    expect((await bo.upload(record(G1))).status).toBe(403);
    await bo.upload(record(G2));
    const annList = (await (await ann.request("/api/games/mine")).json()) as {
      games: { gameId: string }[];
    };
    expect(annList.games.map((g) => g.gameId)).toEqual([G1]);
    expect("file" in (annList.games[0] ?? {})).toBe(false);
    expect((await bo.request(`/api/games/${G1}`)).status).toBe(404);
    const own = await ann.request(`/api/games/${G1}`);
    expect(own.status).toBe(200);
    expect(((await own.json()) as { gameId: string }).gameId).toBe(G1);
  });

  it("the report posts name the player, not the typed reporter", async () => {
    const { as, posts } = await serve();
    const ann = as("Ann", "1");
    await ann.upload(
      record(G1, {
        bugReports: [
          {
            actionIndex: 0,
            text: "odd",
            reporter: "typed name",
            at: "2026-11-01T20:00:00.000Z",
          },
        ],
      }),
    );
    await vi.waitFor(() => expect(posts).toHaveLength(1));
    expect(posts[0]).toContain("from Ann");
    expect(posts[0]).not.toContain("typed name");
  });
});

describe("without accounts (#151)", () => {
  it("the history routes answer 404, and a client's player claim is dropped from the stored file", async () => {
    const recordsDir = mkdtempSync(join(tmpdir(), "gojisim-records-"));
    const server = createAppServer({
      distDir: dist,
      cardsDir: dist,
      recordsDir,
      now: () => NOW,
    });
    servers.push(server);
    await new Promise<void>((r) => server.listen(0, r));
    const { port } = server.address() as AddressInfo;
    const url = (p: string) => `http://localhost:${port}${p}`;
    expect((await fetch(url("/api/games/mine"))).status).toBe(404);
    expect((await fetch(url(`/api/games/${G1}`))).status).toBe(404);
    const res = await fetch(url("/api/games"), {
      method: "POST",
      body: JSON.stringify(record(G1, { playerId: "x", playerName: "Forged" })),
    });
    expect(res.status).toBe(201);
    const [day] = readdirSync(recordsDir);
    const stored = JSON.parse(
      readFileSync(join(recordsDir, day ?? "", `${G1}.json`), "utf8"),
    );
    expect("playerId" in stored).toBe(false);
    expect("playerName" in stored).toBe(false);
  });
});
