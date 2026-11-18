import { existsSync, mkdtempSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { putDeck } from "./accountData.js";
import { openDb } from "./db/db.js";
import { resolveDeck } from "./h2h/decks.js";
import { upsertDiscordPlayer } from "./players.js";
import { pullPrivateSet } from "./privatePull.js";

/*
 * The private card set at the server's start (pulled from its private repo with the token), on
 * a fake GitHub, and the online matches' refusal of its cards.
 */

const TOKEN = "github_pat_secret_value";

/** A fake GitHub API: the tree and each file's raw text; every call is kept. */
function github(files: Record<string, string>, failOn?: string) {
  const calls: { url: string; auth: string | null }[] = [];
  const fetchImpl = (async (input: string, init?: RequestInit) => {
    const url = String(input);
    const auth = new Headers(init?.headers).get("authorization");
    calls.push({ url, auth });
    if (failOn && url.includes(failOn))
      return new Response("nope", { status: 500 });
    if (url.includes("/git/trees/"))
      return Response.json({
        tree: [
          ...Object.keys(files).map((path) => ({ path, type: "blob" })),
          { path: "README.md", type: "blob" },
          { path: "packages/cards/data", type: "tree" },
        ],
      });
    const path = decodeURIComponent(
      url.split("/contents/")[1]?.split("?")[0] ?? "",
    );
    return new Response(files[path] ?? "", {
      status: path in files ? 200 : 404,
    });
  }) as unknown as typeof fetch;
  return { fetchImpl, calls };
}

const FILES = {
  "packages/cards/data/private-cards.json": "[]",
  "packages/cards/data/abilities/PRV.json": "{}",
  "packages/cards/data/decks/private-test.txt": "[deck] Private Test Deck\n",
};

describe("pulling the private card set at start", () => {
  it("writes the set's data files (only those) into the checkout, with the token only in the header", async () => {
    const dir = mkdtempSync(join(tmpdir(), "gojisim-pull-"));
    const { fetchImpl, calls } = github(FILES);
    const lines: string[] = [];
    const n = await pullPrivateSet({
      token: TOKEN,
      repo: "pwluedke/gojisim-private",
      dir,
      fetchImpl,
      log: (l) => lines.push(l),
    });
    expect(n).toBe(3);
    expect(
      readFileSync(
        join(dir, "packages/cards/data/decks/private-test.txt"),
        "utf8",
      ),
    ).toContain("Private Test Deck");
    expect(existsSync(join(dir, "README.md"))).toBe(false);
    for (const call of calls) {
      expect(call.url).not.toContain(TOKEN);
      expect(call.auth).toBe(`Bearer ${TOKEN}`);
    }
    expect(lines.join("\n")).not.toContain(TOKEN);
  });

  it("with no token it skips; a failure logs without the token and writes nothing", async () => {
    const dir = mkdtempSync(join(tmpdir(), "gojisim-pull-"));
    const lines: string[] = [];
    const log = (l: string) => lines.push(l);
    const { fetchImpl, calls } = github(FILES);
    expect(
      await pullPrivateSet({
        token: undefined,
        repo: "a/b",
        dir,
        fetchImpl,
        log,
      }),
    ).toBeNull();
    expect(calls).toHaveLength(0);
    const failing = github(FILES, "abilities");
    expect(
      await pullPrivateSet({
        token: TOKEN,
        repo: "pwluedke/gojisim-private",
        dir,
        fetchImpl: failing.fetchImpl,
        log,
      }),
    ).toBeNull();
    expect(existsSync(join(dir, "packages"))).toBe(false);
    expect(lines.join("\n")).not.toContain(TOKEN);
    expect(lines.at(-1)).toContain("couldn't be pulled");
  });
});

describe("online matches refuse the private set's cards", () => {
  it("a My deck holding a card that isn't in the public cards.json is a bad deck", () => {
    const db = openDb(":memory:", { log: () => {} });
    const player = upsertDiscordPlayer(
      db,
      { discordId: "111", displayName: "Owner", avatarUrl: null },
      Date.UTC(2026, 10, 18),
    ).id;
    const starter = readFileSync(
      new URL(
        "../../../packages/cards/data/decks/esd01-starter.txt",
        import.meta.url,
      ),
      "utf8",
    );
    const stamp = new Date(Date.UTC(2026, 10, 18)).toISOString();
    for (const [id, list] of [
      ["public", starter],
      ["private", starter.replace("4 ESD01-008", "4 PRV-901")],
    ] as const)
      putDeck(db, player, {
        id,
        name: id,
        list,
        updatedAt: stamp,
        deleted: false,
      });
    const now = new Date(Date.UTC(2026, 10, 18));
    expect(
      resolveDeck(db, player, { source: "mine", id: "public" }, "casual", now)
        .ok,
    ).toBe(true);
    expect(
      resolveDeck(db, player, { source: "mine", id: "private" }, "casual", now),
    ).toEqual({ ok: false, error: "bad-deck" });
  });
});
