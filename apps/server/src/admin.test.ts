import { mkdtempSync, writeFileSync } from "node:fs";
import type { AddressInfo } from "node:net";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { DatabaseSync } from "node:sqlite";
import { afterEach, describe, expect, it } from "vitest";
import { adminIdsFrom, playersReport } from "./admin.js";
import { centralTime, dailyPostText, dailyPostTick } from "./dailyPost.js";
import { openDb } from "./db/db.js";
import { playerSessionValue } from "./discordAuth.js";
import { COOKIE } from "./gate.js";
import { createAppServer } from "./index.js";
import { indexGame, indexH2hGame } from "./playerGames.js";
import { smokePlayer, upsertDiscordPlayer } from "./players.js";
import { startSeason } from "./seasons.js";

/*
 * #235: the players page for admins: who may see it, what it counts (and leaves out), the CSV,
 * and the daily post to #gojisim-dev.
 */

const SECRET = "s".repeat(40);
// 2026-11-12 13:00 UTC = 7:00 am Central (CST, UTC-6).
const NOW = Date.UTC(2026, 10, 12, 13);
const DAY = 24 * 60 * 60_000;
const dist = mkdtempSync(join(tmpdir(), "gojisim-dist-"));
writeFileSync(join(dist, "index.html"), "<title>GojiSim</title>");

let close: (() => void)[] = [];
afterEach(() => {
  for (const c of close) c();
  close = [];
});

const botRecord = (difficulty: number, winner: string | null) => ({
  seats: {
    P1: { kind: "human" },
    P2: { kind: "bot", bot: "ismcts", settings: { difficulty } },
  },
  ...(winner === undefined ? {} : { outcome: { winner, reason: "invasion" } }),
});

/** A database with Ann (an admin), Bo, the smoke player and a dev sign-in, and their games. */
function seeded(): {
  db: DatabaseSync;
  ann: string;
  bo: string;
} {
  const db = openDb(":memory:", { log: () => {} });
  const ann = upsertDiscordPlayer(
    db,
    { discordId: "111", displayName: "Ann", avatarUrl: null },
    NOW - 10 * DAY,
  ).id;
  const bo = upsertDiscordPlayer(
    db,
    { discordId: "222", displayName: '=Bo, "the" one', avatarUrl: null },
    NOW - 2 * DAY,
  ).id;
  const smoke = smokePlayer(db, NOW).id;
  db.prepare(
    "INSERT INTO players (id, display_name, created_at, last_seen_at) VALUES ('dev-zed', 'Zed', ?, ?)",
  ).run(NOW, NOW);
  let n = 0;
  const game = (
    player: string,
    at: number,
    difficulty: number,
    winner: string | null,
  ) =>
    indexGame(
      db,
      {
        gameId: `g${n++}`,
        playerId: player,
        file: "x.json",
        record: botRecord(difficulty, winner),
      },
      at,
    );
  // Beta: Ann wins vs Hard and loses vs Easy; Bo wins vs Medium.
  game(ann, NOW - 9 * DAY, 90, "P1");
  game(ann, NOW - 8 * DAY, 20, "P2");
  game(bo, NOW - DAY, 55, "P1");
  // The smoke check and a dev sign-in played too: never counted.
  game(smoke, NOW - DAY, 90, "P1");
  game("dev-zed", NOW - DAY, 90, "P1");
  // Launch season: Ann vs Bo online (Bo wins), and Ann vs Hard (no result yet).
  startSeason(db, "launch", NOW - 3 * DAY);
  indexH2hGame(
    db,
    {
      gameId: "h1",
      file: "h.json",
      players: { P1: ann, P2: bo },
      winner: "P2",
      abandoned: false,
      deckNames: "A vs B",
      startedAt: NOW - 2 * DAY,
    },
    NOW - 2 * DAY,
  );
  game(ann, NOW - DAY, 90, null);
  return { db, ann, bo };
}

async function serve(admins: string[]) {
  const { db, ann, bo } = seeded();
  // Roles checked just now, so a page load isn't sent through Discord again (the gate's daily check).
  db.prepare("UPDATE players SET roles_checked_at = ?").run(NOW);
  const server = createAppServer({
    distDir: dist,
    cardsDir: dist,
    recordsDir: mkdtempSync(join(tmpdir(), "gojisim-records-")),
    secret: SECRET,
    discord: {
      db,
      clientId: "c",
      clientSecret: "s",
      guildId: "g",
      testerRoleId: "r",
      redirectUri: "https://x/cb",
    },
    admins: new Set(admins),
    now: () => NOW,
  });
  await new Promise<void>((r) => server.listen(0, r));
  close.push(() => server.close());
  const { port } = server.address() as AddressInfo;
  const cookie = (id: string) =>
    `${COOKIE}=${playerSessionValue(SECRET, id, NOW + DAY)}`;
  const get = (path: string, id?: string) =>
    fetch(`http://localhost:${port}${path}`, {
      redirect: "manual",
      headers: id ? { cookie: cookie(id) } : {},
    });
  return { db, ann, bo, get };
}

describe("#235: the players page for admins", () => {
  it("ADMIN_DISCORD_IDS: comma-separated Discord ids; blank or junk is nobody", () => {
    expect(adminIdsFrom({ ADMIN_DISCORD_IDS: " 111, 222 ,,x" })).toEqual(
      new Set(["111", "222"]),
    );
    expect(adminIdsFrom({})).toEqual(new Set());
  });

  it("only an admin gets the page and the API; a non-admin and a signed-out visitor get 404", async () => {
    const { ann, bo, get } = await serve(["111"]);
    expect((await get("/api/admin/players", ann)).status).toBe(200);
    expect((await get("/admin/players", ann)).status).toBe(200);
    expect((await get("/api/admin/players.csv", ann)).status).toBe(200);
    for (const path of [
      "/api/admin/players",
      "/api/admin/players.csv",
      "/admin/players",
    ]) {
      expect((await get(path, bo)).status).toBe(404);
      // Signed out: 404 too, not the sign-in page.
      expect((await get(path)).status).toBe(404);
    }
    // /api/me tells the menu, for the admin only.
    expect(await (await get("/api/me", ann)).json()).toMatchObject({
      admin: true,
    });
    expect(await (await get("/api/me", bo)).json()).not.toHaveProperty("admin");
  });

  it("with ADMIN_DISCORD_IDS unset, nobody is an admin: 404 for all", async () => {
    const { ann, get } = await serve([]);
    expect((await get("/api/admin/players", ann)).status).toBe(404);
    expect((await get("/admin/players", ann)).status).toBe(404);
    expect(await (await get("/api/me", ann)).json()).not.toHaveProperty(
      "admin",
    );
  });

  it("counts every season, leaves out the smoke player and dev sign-ins, and counts an online game once", () => {
    const { db } = seeded();
    const all = playersReport(db, NOW, null);
    expect(all.seasons).toEqual(["beta", "launch"]);
    expect(all.currentSeason).toBe("launch");
    expect(all.players.map((p) => p.name).sort()).toEqual([
      '=Bo, "the" one',
      "Ann",
    ]);
    const ann = all.players.find((p) => p.name === "Ann");
    expect(ann).toMatchObject({
      botGames: 3,
      onlineGames: 1,
      wins: 1,
      losses: 2,
      botLevels: ["Easy", "Hard"],
    });
    expect(all.totals).toEqual({
      players: 2,
      // g0, g1, g2 (beta), h1 once, and Ann's open game: the smoke and dev games aren't counted.
      games: 5,
      gamesLast7Days: 3,
      gamesBySeason: { beta: 3, launch: 2 },
    });
  });

  it("a season filter counts only that season's games", () => {
    const { db } = seeded();
    const beta = playersReport(db, NOW, "beta");
    expect(beta.season).toBe("beta");
    expect(beta.totals.games).toBe(3);
    expect(beta.players.find((p) => p.name === "Ann")).toMatchObject({
      botGames: 2,
      onlineGames: 0,
      wins: 1,
      losses: 1,
    });
    const launch = playersReport(db, NOW, "launch");
    expect(launch.totals.games).toBe(2);
    expect(launch.players.find((p) => p.name.startsWith("=Bo"))).toMatchObject({
      botGames: 0,
      onlineGames: 1,
      wins: 1,
      losses: 0,
    });
    // An unknown season is all seasons.
    expect(playersReport(db, NOW, "nope").season).toBeNull();
  });

  it("the CSV has the table's columns and the season, quotes commas and quotes, and defuses formulas", async () => {
    const { ann, get } = await serve(["111"]);
    const res = await get("/api/admin/players.csv?season=beta", ann);
    expect(res.headers.get("content-type")).toBe("text/csv; charset=utf-8");
    expect(res.headers.get("content-disposition")).toContain(
      "gojisim-players-beta-2026-11-12.csv",
    );
    const lines = (await res.text()).trimEnd().split("\r\n");
    expect(lines[0]).toBe(
      "Discord name,First seen,Last seen,Games vs bot,Online games,Wins,Losses,Bot levels,Season",
    );
    expect(lines).toHaveLength(3);
    expect(lines).toContain(
      `Ann,${new Date(NOW - 10 * DAY).toISOString()},${new Date(NOW - 10 * DAY).toISOString()},2,0,1,1,Easy Hard,beta`,
    );
    expect(lines.some((l) => l.startsWith(`"'=Bo, ""the"" one",`))).toBe(true);
    expect(lines.join("\n")).not.toContain("Zed");
    expect(lines.join("\n")).not.toContain("smoke");
  });

  it("the JSON never carries a deck, a deck name or a record file (Q42)", async () => {
    const { ann, get } = await serve(["111"]);
    const text = await (await get("/api/admin/players", ann)).text();
    expect(text).not.toContain("A vs B");
    expect(text).not.toContain(".json");
    expect(text).not.toContain("deck");
  });
});

describe("#235: the daily players post", () => {
  // 8:30 am Central on Nov 12, 2026 (CST).
  const AT_830 = Date.UTC(2026, 10, 12, 14, 30);

  it("Central time follows daylight saving", () => {
    expect(centralTime(Date.UTC(2026, 10, 12, 14))).toEqual({
      day: "2026-11-12",
      hour: 8,
    });
    // July: CDT, UTC-5.
    expect(centralTime(Date.UTC(2026, 6, 1, 13))).toEqual({
      day: "2026-07-01",
      hour: 8,
    });
  });

  it("the text: totals with beta apart, and new players by name only", () => {
    const { db } = seeded();
    expect(dailyPostText(db, AT_830, NOW - 5 * DAY)).toBe(
      'GojiSim players, 2026-11-12: 2 players · 5 games (beta 3) · 3 in the last 7 days\nNew since the last post (1): =Bo, "the" one',
    );
    expect(dailyPostText(db, AT_830, NOW)).toContain(
      "No new players since the last post.",
    );
  });

  it("posts once a day from 8:00 Central; skipped without a webhook; never logs the URL", async () => {
    const { db } = seeded();
    const posts: string[] = [];
    const logs: string[] = [];
    const slack = (ok: boolean) =>
      (async (_url: unknown, init?: RequestInit) => {
        posts.push((JSON.parse(String(init?.body)) as { text: string }).text);
        return new Response(null, { status: ok ? 200 : 500 });
      }) as typeof fetch;
    const tick = (now: number, webhook: string | undefined, ok = true) =>
      dailyPostTick({
        db,
        webhook,
        now,
        fetchImpl: slack(ok),
        log: (l) => logs.push(l),
      });
    expect(await tick(AT_830, undefined)).toBe("no-webhook");
    expect(await tick(NOW, "https://hooks.slack.com/services/SECRET")).toBe(
      "not-yet",
    );
    expect(await tick(AT_830, "https://hooks.slack.com/services/SECRET")).toBe(
      "posted",
    );
    expect(
      await tick(AT_830 + 60_000, "https://hooks.slack.com/services/SECRET"),
    ).toBe("done-today");
    expect(posts).toHaveLength(1);
    expect(posts[0]).toContain("2 players");
    // The next day: a failed post is logged without the URL, and not retried that day.
    const next = AT_830 + DAY;
    expect(
      await tick(next, "https://hooks.slack.com/services/SECRET", false),
    ).toBe("failed");
    expect(
      await tick(next + 60_000, "https://hooks.slack.com/services/SECRET"),
    ).toBe("done-today");
    expect(logs.join("\n")).not.toContain("SECRET");
    expect(logs.join("\n")).not.toContain("hooks.slack.com");
  });
});
