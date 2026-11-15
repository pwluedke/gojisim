import { mkdirSync, mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import type { AddressInfo } from "node:net";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeAll, describe, expect, it } from "vitest";
import { createAppServer } from "./index.js";

/** #340: the results routes, with a made-up check (real results live on the server only). */

let root = "";
let distDir = "";
beforeAll(() => {
  root = mkdtempSync(join(tmpdir(), "gojisim-results-"));
  distDir = join(root, "dist");
  mkdirSync(distDir);
  writeFileSync(join(distDir, "index.html"), "<!doctype html><title>x</title>");
});

let servers: ReturnType<typeof createAppServer>[] = [];
afterEach(() => {
  for (const server of servers) server.close();
  servers = [];
});

const TOKEN = "t".repeat(32);

async function serve(options: Parameters<typeof createAppServer>[0] = {}) {
  const resultsDir = mkdtempSync(join(root, "results-"));
  const server = createAppServer({
    distDir,
    recordsDir: join(root, "records"),
    resultsDir,
    ...options,
  });
  servers.push(server);
  await new Promise<void>((resolve) => server.listen(0, resolve));
  const { port } = server.address() as AddressInfo;
  const call = (path: string, init: RequestInit = {}) =>
    fetch(`http://localhost:${port}${path}`, { redirect: "manual", ...init });
  return { call, resultsDir };
}

const check = (id: string, bWins = 60) => ({
  check: {
    id,
    date: "2026-01-10",
    change: "Sample rule",
    level: "Hard",
    seeds: "paired (sample)",
    decks: [{ deck: "Sample deck", games: 100, aWins: 50, bWins }],
  },
});

const upload = (
  call: Awaited<ReturnType<typeof serve>>["call"],
  body: unknown,
  token = TOKEN,
) =>
  call("/api/results/upload", {
    method: "POST",
    headers: {
      authorization: `Bearer ${token}`,
      "content-type": "application/json",
    },
    body: JSON.stringify(body),
  });

describe("#340 results routes", () => {
  it("GET /api/results answers the stored results, none at first", async () => {
    const { call } = await serve();
    const res = await call("/api/results");
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ checks: [], runs: [] });
  });

  it("the upload is off without RESULTS_UPLOAD_TOKEN (404), and needs the right token (401)", async () => {
    const off = await serve();
    expect((await upload(off.call, check("a"))).status).toBe(404);
    const on = await serve({ resultsToken: TOKEN });
    expect((await upload(on.call, check("a"), "wrong")).status).toBe(401);
    expect(
      (
        await on.call("/api/results/upload", {
          method: "POST",
          body: JSON.stringify(check("a")),
        })
      ).status,
    ).toBe(401);
  });

  it("an upload is stored on the server's volume and read back; the same id replaces it", async () => {
    const { call, resultsDir } = await serve({ resultsToken: TOKEN });
    expect((await upload(call, check("a"))).status).toBe(200);
    expect((await upload(call, check("b"))).status).toBe(200);
    expect((await upload(call, check("a", 70))).status).toBe(200);
    const data = (await (await call("/api/results")).json()) as {
      checks: { id: string; decks: { bWins: number }[] }[];
    };
    expect(data.checks.map((c) => c.id).sort()).toEqual(["a", "b"]);
    expect(data.checks.find((c) => c.id === "a")?.decks[0]?.bWins).toBe(70);
    const stored = JSON.parse(
      readFileSync(join(resultsDir, "results.json"), "utf8"),
    ) as { checks: unknown[] };
    expect(stored.checks).toHaveLength(2);
  });

  it("an entry that fails the schema is refused (400) and nothing is stored", async () => {
    const { call } = await serve({ resultsToken: TOKEN });
    const bad = check("a");
    bad.check.decks[0]!.bWins = 999;
    const res = await upload(call, bad);
    expect(res.status).toBe(400);
    expect(((await res.json()) as { problems: string[] }).problems).toContain(
      "checks[0].decks[0]: bWins not within games",
    );
    expect((await upload(call, { nope: 1 })).status).toBe(400);
    expect(await (await call("/api/results")).json()).toEqual({
      checks: [],
      runs: [],
    });
  });

  it("with the password gate on, GET /api/results needs the sign-in; the token upload doesn't", async () => {
    const { call } = await serve({
      password: "kaiju tea party",
      secret: "s".repeat(40),
      resultsToken: TOKEN,
    });
    expect((await call("/api/results")).status).not.toBe(200);
    expect((await upload(call, check("a"))).status).toBe(200);
  });
});
