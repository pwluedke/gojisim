import { mkdirSync, mkdtempSync, readdirSync, writeFileSync } from "node:fs";
import type { AddressInfo } from "node:net";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { openDb } from "./db/db.js";
import { playerSessionValue } from "./discordAuth.js";
import { COOKIE } from "./gate.js";
import { createAppServer } from "./index.js";
import { upsertDiscordPlayer } from "./players.js";
import { holdsUnlistedCard } from "./privateRecords.js";
import { privateSetOwnersFrom, readPrivateSet } from "./privateSet.js";

/*
 * The private card set's gate, on a made-up set (one placeholder card): only the accounts in
 * `PRIVATE_SET_OWNERS` get it; everyone else gets the same 404 as when there's no set; records
 * holding an unlisted card are kept apart from the shared ones.
 */

const SECRET = "s".repeat(40);
const NOW = Date.UTC(2026, 10, 18, 6);
const DAY = 24 * 60 * 60_000;
const dist = mkdtempSync(join(tmpdir(), "gojisim-dist-"));
writeFileSync(join(dist, "index.html"), "<!doctype html><title>x</title>");

const CARD = {
  id: 990101,
  cardNumber: "PRV-001",
  baseCardNumber: "PRV-001",
  isParallel: false,
  parentId: null,
  deckCardNumber: "PRV-001",
  name: "Private Test Card",
  set: "PRV",
  colors: ["Red"],
  type: "Battle",
  traits: ["Weapon"],
  rank: 1,
  counterOrThreat: 1000,
  invadeZones: 1,
  rarity: "C",
  movie: null,
  text: "A placeholder.",
  notes: null,
  imageUrl: "https://gojisim.invalid/private-set/990101.png",
  unknownFields: {},
};

/** A private checkout with the placeholder card, its abilities and one deck. */
function privateDir(): string {
  const dir = mkdtempSync(join(tmpdir(), "gojisim-private-"));
  const data = join(dir, "packages", "cards", "data");
  mkdirSync(join(data, "abilities"), { recursive: true });
  mkdirSync(join(data, "decks"));
  writeFileSync(join(data, "private-cards.json"), JSON.stringify([CARD]));
  writeFileSync(
    join(data, "abilities", "PRV.json"),
    JSON.stringify({
      "PRV-001": { deckCardNumber: "PRV-001", status: "manual", abilities: [] },
    }),
  );
  writeFileSync(
    join(data, "decks", "private-test.txt"),
    "[deck] Private Test Deck\n[monster deck]\n1 ESD01-001\n[main deck]\n4 PRV-001\n",
  );
  return dir;
}

let close: (() => void)[] = [];
afterEach(() => {
  for (const c of close) c();
  close = [];
});

async function serve(owners: string[], dir = privateDir()) {
  const db = openDb(":memory:", { log: () => {} });
  const owner = upsertDiscordPlayer(
    db,
    { discordId: "111", displayName: "Owner", avatarUrl: null },
    NOW,
  ).id;
  const other = upsertDiscordPlayer(
    db,
    { discordId: "222", displayName: "Tester", avatarUrl: null },
    NOW,
  ).id;
  db.prepare("UPDATE players SET roles_checked_at = ?").run(NOW);
  const recordsDir = join(
    mkdtempSync(join(tmpdir(), "gojisim-data-")),
    "records",
  );
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
    privateSetDir: dir,
    privateSetOwners: new Set(owners),
    now: () => NOW,
  });
  await new Promise<void>((r) => server.listen(0, r));
  close.push(() => server.close());
  const { port } = server.address() as AddressInfo;
  const cookie = (id: string) =>
    `${COOKIE}=${playerSessionValue(SECRET, id, NOW + DAY)}`;
  const call = (path: string, id?: string, init: RequestInit = {}) =>
    fetch(`http://localhost:${port}${path}`, {
      redirect: "manual",
      ...init,
      headers: { ...(id ? { cookie: cookie(id) } : {}), ...init.headers },
    });
  return { owner, other, call, recordsDir };
}

describe("the private card set", () => {
  it("PRIVATE_SET_OWNERS: comma-separated Discord ids; junk is nobody", () => {
    expect(
      privateSetOwnersFrom({ PRIVATE_SET_OWNERS: " 111, x,,222" }),
    ).toEqual(new Set(["111", "222"]));
    expect(privateSetOwnersFrom({})).toEqual(new Set());
  });

  it("reads the checkout's cards, abilities and decks; no checkout is no set", async () => {
    const set = await readPrivateSet(privateDir());
    expect(set?.cards).toHaveLength(1);
    expect(Object.keys(set?.abilities ?? {})).toEqual(["PRV-001"]);
    expect(set?.decks.map((d) => d.name)).toEqual(["Private Test Deck"]);
    expect(await readPrivateSet(join(tmpdir(), "no-such-private"))).toBeNull();
  });

  it("only an owner gets it, not cached; anyone else (or signed out) gets 404", async () => {
    const { owner, other, call } = await serve(["111"]);
    const mine = await call("/api/private-set", owner);
    expect(mine.status).toBe(200);
    expect(mine.headers.get("cache-control")).toBe("private, no-store");
    const body = (await mine.json()) as { cards: { cardNumber: string }[] };
    expect(body.cards.map((c) => c.cardNumber)).toEqual(["PRV-001"]);
    const theirs = await call("/api/private-set", other);
    expect(theirs.status).toBe(404);
    expect(await theirs.text()).not.toContain("PRV-001");
    expect((await call("/api/private-set")).status).not.toBe(200);
  });

  it("with no owners set, or no checkout, it's 404 for everyone", async () => {
    const none = await serve([]);
    expect((await none.call("/api/private-set", none.owner)).status).toBe(404);
    const empty = await serve(["111"], join(tmpdir(), "no-such-private"));
    expect((await empty.call("/api/private-set", empty.owner)).status).toBe(
      404,
    );
  });

  it("a record holding an unlisted card is kept apart: not in the shared records", async () => {
    const { owner, call, recordsDir } = await serve(["111"]);
    const record = {
      version: 1,
      seed: 42,
      decks: [
        { id: "P1", monsterDeck: [], mainDeck: [CARD] },
        { id: "P2", monsterDeck: [], mainDeck: [] },
      ],
      actions: [{ type: "pass", player: "P1" }],
    };
    expect(holdsUnlistedCard(record)).toBe(true);
    expect(
      holdsUnlistedCard({ decks: [{ monsterDeck: [], mainDeck: [] }] }),
    ).toBe(false);
    const res = await call("/api/games", owner, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(record),
    });
    expect(res.status).toBe(201);
    const { id } = (await res.json()) as { id: string };
    const kept = join(dirname(recordsDir), "private-records");
    expect(readdirSync(kept)).toEqual([`${id}.json`]);
    const shared = (() => {
      try {
        return readdirSync(recordsDir);
      } catch {
        return [];
      }
    })();
    expect(shared).toEqual([]);
  });
});
