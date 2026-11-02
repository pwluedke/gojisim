import { mkdtempSync, writeFileSync } from "node:fs";
import type { AddressInfo } from "node:net";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { MAX_DECKS, MAX_LIST_CHARS } from "./accountData.js";
import { openDb } from "./db/db.js";
import { playerSessionValue } from "./discordAuth.js";
import { COOKIE } from "./gate.js";
import { createAppServer } from "./index.js";
import { upsertDiscordPlayer } from "./players.js";

const SECRET = "s".repeat(40);
const NOW = Date.UTC(2026, 10, 1, 21);
let servers: ReturnType<typeof createAppServer>[] = [];
afterEach(() => {
  for (const s of servers) s.close();
  servers = [];
});
const dist = mkdtempSync(join(tmpdir(), "gojisim-dist-"));
writeFileSync(join(dist, "index.html"), "<title>GojiSim</title>");

async function serve() {
  const db = openDb(":memory:", { log: () => {} });
  const server = createAppServer({
    distDir: dist,
    cardsDir: dist,
    recordsDir: dist,
    secret: SECRET,
    discord: {
      db,
      clientId: "c",
      clientSecret: "s",
      guildId: "g",
      testerRoleId: "r",
      redirectUri: "https://x/cb",
    },
    now: () => NOW,
  });
  servers.push(server);
  await new Promise<void>((r) => server.listen(0, r));
  const { port } = server.address() as AddressInfo;
  const as = (discordId: string) => {
    const player = upsertDiscordPlayer(
      db,
      { discordId, displayName: `P${discordId}`, avatarUrl: null },
      NOW,
    );
    const cookie = `${COOKIE}=${playerSessionValue(SECRET, player.id, NOW + 86_400_000)}`;
    const call = async (method: string, path: string, body?: unknown) => {
      const res = await fetch(`http://localhost:${port}${path}`, {
        method,
        headers: { cookie, "content-type": "application/json" },
        ...(body === undefined ? {} : { body: JSON.stringify(body) }),
      });
      return {
        status: res.status,
        json: (await res.json()) as Record<string, unknown>,
      };
    };
    return { player, call };
  };
  return { as, port, db };
}

const T = (min: number) =>
  new Date(Date.UTC(2026, 10, 1, 20, min)).toISOString();
const deck = (name: string, at: string) => ({
  name,
  list: `[deck] ${name}\n4 ESD01-001`,
  updatedAt: at,
});

describe("My decks and Settings per player (#152)", () => {
  it("a deck is stored and listed; an older edit loses and gets the stored one back; a newer one wins", async () => {
    const { as } = await serve();
    const ann = as("1");
    expect(
      (await ann.call("PUT", "/api/me/decks/d1", deck("Red", T(10)))).json,
    ).toMatchObject({
      deck: { id: "d1", name: "Red", updatedAt: T(10), deleted: false },
    });
    const older = await ann.call(
      "PUT",
      "/api/me/decks/d1",
      deck("Stale", T(5)),
    );
    expect(older.status).toBe(200);
    expect(older.json["deck"]).toMatchObject({ name: "Red" });
    await ann.call("PUT", "/api/me/decks/d1", deck("Red v2", T(20)));
    const list = (await ann.call("GET", "/api/me/decks")).json["decks"] as {
      name: string;
    }[];
    expect(list.map((d) => d.name)).toEqual(["Red v2"]);
  });

  it("a delete leaves a tombstone, so other browsers drop the deck; a newer save brings it back", async () => {
    const { as } = await serve();
    const ann = as("1");
    await ann.call("PUT", "/api/me/decks/d1", deck("Red", T(10)));
    await ann.call("DELETE", "/api/me/decks/d1", { updatedAt: T(11) });
    expect(
      (await ann.call("GET", "/api/me/decks")).json["decks"],
    ).toMatchObject([{ id: "d1", deleted: true, name: "" }]);
    // An older save from a browser that missed the delete doesn't revive it.
    await ann.call("PUT", "/api/me/decks/d1", deck("Red", T(10)));
    expect(
      (await ann.call("GET", "/api/me/decks")).json["decks"],
    ).toMatchObject([{ deleted: true }]);
    await ann.call("PUT", "/api/me/decks/d1", deck("Red again", T(30)));
    expect(
      (await ann.call("GET", "/api/me/decks")).json["decks"],
    ).toMatchObject([{ deleted: false, name: "Red again" }]);
  });

  it("settings: stored, the newest wins, and none at first", async () => {
    const { as } = await serve();
    const ann = as("1");
    expect((await ann.call("GET", "/api/me/settings")).json).toEqual({
      settings: null,
      updatedAt: null,
    });
    await ann.call("PUT", "/api/me/settings", {
      settings: { theme: "grey", sound: false },
      updatedAt: T(10),
    });
    const older = await ann.call("PUT", "/api/me/settings", {
      settings: { theme: "light" },
      updatedAt: T(1),
    });
    expect(older.json).toEqual({
      settings: { theme: "grey", sound: false },
      updatedAt: T(10),
    });
    expect((await ann.call("GET", "/api/me/settings")).json).toEqual({
      settings: { theme: "grey", sound: false },
      updatedAt: T(10),
    });
  });

  it("each player sees only their own decks and settings", async () => {
    const { as } = await serve();
    const ann = as("1");
    const bo = as("2");
    await ann.call("PUT", "/api/me/decks/d1", deck("Ann's", T(10)));
    await ann.call("PUT", "/api/me/settings", {
      settings: { theme: "grey" },
      updatedAt: T(10),
    });
    expect((await bo.call("GET", "/api/me/decks")).json["decks"]).toEqual([]);
    expect(
      (await bo.call("GET", "/api/me/settings")).json["settings"],
    ).toBeNull();
    // Bo's deck with the same id is Bo's own.
    await bo.call("PUT", "/api/me/decks/d1", deck("Bo's", T(1)));
    expect(
      (
        (await ann.call("GET", "/api/me/decks")).json["decks"] as {
          name: string;
        }[]
      )[0]?.name,
    ).toBe("Ann's");
  });

  it("refuses bad input: an id, a time, an empty or too-long deck, non-object settings; caps the deck count", async () => {
    const { as, db } = await serve();
    const ann = as("1");
    expect(
      (await ann.call("PUT", "/api/me/decks/bad id!", deck("x", T(1)))).status,
    ).toBe(400);
    expect(
      (
        await ann.call("PUT", "/api/me/decks/d1", {
          name: "x",
          list: "y",
          updatedAt: "yesterday",
        })
      ).status,
    ).toBe(400);
    expect(
      (
        await ann.call("PUT", "/api/me/decks/d1", {
          name: " ",
          list: "y",
          updatedAt: T(1),
        })
      ).status,
    ).toBe(400);
    expect(
      (
        await ann.call("PUT", "/api/me/decks/d1", {
          name: "x",
          list: "y".repeat(MAX_LIST_CHARS + 1),
          updatedAt: T(1),
        })
      ).status,
    ).toBe(400);
    expect(
      (
        await ann.call("PUT", "/api/me/settings", {
          settings: [1],
          updatedAt: T(1),
        })
      ).status,
    ).toBe(400);
    const insert = db.prepare(
      "INSERT INTO player_decks (player_id, deck_id, name, list, updated_at) VALUES (?, ?, 'n', 'l', ?)",
    );
    for (let i = 0; i < MAX_DECKS; i++)
      insert.run(ann.player.id, `x${i}`, T(1));
    expect(
      (await ann.call("PUT", "/api/me/decks/one-more", deck("x", T(2)))).status,
    ).toBe(507);
    // #153 (Monarch's #156 note): deleted decks don't count toward the limit.
    db.prepare(
      "UPDATE player_decks SET deleted = 1 WHERE deck_id = 'x1' AND player_id = ?",
    ).run(ann.player.id);
    expect(
      (await ann.call("PUT", "/api/me/decks/one-more", deck("x", T(2)))).status,
    ).toBe(200);
    // An existing deck can still change.
    expect(
      (await ann.call("PUT", "/api/me/decks/x0", deck("x", T(2)))).status,
    ).toBe(200);
  });

  it("without a session, 401; without Discord sign-in, 404", async () => {
    const { port } = await serve();
    expect((await fetch(`http://localhost:${port}/api/me/decks`)).status).toBe(
      401,
    );
    const plain = createAppServer({
      distDir: dist,
      cardsDir: dist,
      recordsDir: dist,
    });
    servers.push(plain);
    await new Promise<void>((r) => plain.listen(0, r));
    const p = (plain.address() as AddressInfo).port;
    for (const path of ["/api/me/decks", "/api/me/settings"]) {
      const res = await fetch(`http://localhost:${p}${path}`);
      expect(res.status).toBe(404);
      expect(await res.json()).toEqual({ error: "no-accounts" });
    }
  });
});
