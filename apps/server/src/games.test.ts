import {
  mkdirSync,
  mkdtempSync,
  readdirSync,
  readFileSync,
  writeFileSync,
} from "node:fs";
import type { AddressInfo } from "node:net";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import { COOKIE, sessionValue } from "./gate.js";
import {
  isGameRecord,
  MAX_RECORD_BYTES,
  siteConfig,
  testSiteEnabled,
  UPLOADS_PER_MINUTE,
} from "./games.js";
import { createAppServer } from "./index.js";

const SECRET = "s".repeat(40);
const NOW = Date.UTC(2026, 9, 28, 12);

let servers: ReturnType<typeof createAppServer>[] = [];
afterEach(() => {
  for (const server of servers) server.close();
  servers = [];
});

/** A server with its own records folder; `password` turns the login gate on. */
async function serve(
  options: {
    testSite?: boolean;
    password?: string;
    maxRecordsBytes?: number;
  } = {},
) {
  const recordsDir = mkdtempSync(join(tmpdir(), "gojisim-records-"));
  const server = createAppServer({
    distDir: recordsDir,
    cardsDir: recordsDir,
    recordsDir,
    config: { testSite: options.testSite ?? true },
    ...(options.maxRecordsBytes === undefined
      ? {}
      : { maxRecordsBytes: options.maxRecordsBytes }),
    now: () => NOW,
    ...(options.password ? { password: options.password, secret: SECRET } : {}),
  });
  servers.push(server);
  await new Promise<void>((resolve) => server.listen(0, resolve));
  const { port } = server.address() as AddressInfo;
  const request = (path: string, init: RequestInit = {}) =>
    fetch(`http://localhost:${port}${path}`, { redirect: "manual", ...init });
  return { request, recordsDir };
}

const RECORD = {
  version: 1,
  seed: 42,
  decks: [
    { id: "P1", monsterDeck: [], mainDeck: [] },
    { id: "P2", monsterDeck: [], mainDeck: [] },
  ],
  actions: [{ type: "pass", player: "P1" }],
  botFeedback: [{ actionIndex: 0, text: "bad", reporter: "Dr. Serizawa" }],
};

const upload = (body: string, ip = "203.0.113.9", cookie?: string) => ({
  method: "POST",
  headers: {
    "content-type": "application/json",
    "x-real-ip": ip,
    "user-agent": "Mozilla/5.0 test",
    ...(cookie ? { cookie } : {}),
  },
  body,
});

/** Every stored file, as `<day>/<name>`. */
const stored = (dir: string) =>
  readdirSync(dir).flatMap((day) =>
    readdirSync(join(dir, day)).map((name) => `${day}/${name}`),
  );

describe("game collection (M13b)", () => {
  it("GOJISIM_TEST_SITE: on unless set to off; testSiteEnabled reads the config", () => {
    expect(siteConfig({})).toEqual({ testSite: true });
    expect(siteConfig({ GOJISIM_TEST_SITE: "on" })).toEqual({ testSite: true });
    expect(siteConfig({ GOJISIM_TEST_SITE: "OFF" })).toEqual({
      testSite: false,
    });
    expect(testSiteEnabled({ testSite: false })).toBe(false);
  });

  it("GET /api/config answers the switch", async () => {
    expect(await (await (await serve()).request("/api/config")).json()).toEqual(
      { testSite: true },
    );
    const off = await serve({ testSite: false });
    expect(await (await off.request("/api/config")).json()).toEqual({
      testSite: false,
    });
  });

  it("stores a valid record under <day>/<uuid>.json exactly as sent, with no IP or user agent", async () => {
    const { request, recordsDir } = await serve();
    const body = JSON.stringify(RECORD);
    const res = await request("/api/games", upload(body));
    expect(res.status).toBe(201);
    const { id } = (await res.json()) as { id: string };
    expect(stored(recordsDir)).toEqual([`2026-10-28/${id}.json`]);
    const text = readFileSync(
      join(recordsDir, "2026-10-28", `${id}.json`),
      "utf8",
    );
    expect(text).toBe(body);
    expect(text).not.toContain("203.0.113.9");
    expect(text).not.toContain("Mozilla");
  });

  it("refuses an oversize body (413), non-JSON and a bad shape (400)", async () => {
    const { request, recordsDir } = await serve();
    const big = JSON.stringify({
      ...RECORD,
      pad: "x".repeat(MAX_RECORD_BYTES),
    });
    expect((await request("/api/games", upload(big))).status).toBe(413);
    expect((await request("/api/games", upload("{nope"))).status).toBe(400);
    for (const bad of [
      { ...RECORD, version: 2 },
      { ...RECORD, actions: "none" },
      { ...RECORD, decks: [] },
      { version: 1, seed: 1, actions: [] },
      [RECORD],
    ])
      expect(
        (await request("/api/games", upload(JSON.stringify(bad)))).status,
      ).toBe(400);
    expect(stored(recordsDir)).toEqual([]);
    expect(isGameRecord(RECORD)).toBe(true);
  });

  it(`allows ${UPLOADS_PER_MINUTE} uploads a minute per IP, then 429; another IP still uploads`, async () => {
    const { request } = await serve();
    const body = JSON.stringify(RECORD);
    for (let i = 0; i < UPLOADS_PER_MINUTE; i++)
      expect((await request("/api/games", upload(body))).status).toBe(201);
    expect((await request("/api/games", upload(body))).status).toBe(429);
    expect(
      (await request("/api/games", upload(body, "198.51.100.4"))).status,
    ).toBe(201);
  });

  it("refuses uploads with 507 once the records folder would pass its cap, counting files already there", async () => {
    const body = JSON.stringify(RECORD);
    const size = Buffer.byteLength(body);
    // Room for two records: the folder already holds one from before this server started.
    const { request, recordsDir } = await serve({
      maxRecordsBytes: size * 2 + 10,
    });
    mkdirSync(join(recordsDir, "2026-10-27"));
    writeFileSync(join(recordsDir, "2026-10-27", "old.json"), body);
    const logged = vi.spyOn(console, "error").mockImplementation(() => {});
    try {
      expect((await request("/api/games", upload(body))).status).toBe(201);
      const full = await request("/api/games", upload(body));
      expect(full.status).toBe(507);
      expect(await full.json()).toEqual({ error: "storage-full" });
      expect((await request("/api/games", upload(body))).status).toBe(507);
      expect(stored(recordsDir)).toHaveLength(2);
      // Logged once while it stays full, not once per refused upload.
      expect(logged).toHaveBeenCalledTimes(1);
      expect(String(logged.mock.calls[0]?.[0])).toMatch(
        /records folder is full/,
      );
    } finally {
      logged.mockRestore();
    }
  });

  it("with the Test Site off, the upload route answers 404 and stores nothing", async () => {
    const { request, recordsDir } = await serve({ testSite: false });
    const res = await request("/api/games", upload(JSON.stringify(RECORD)));
    expect(res.status).toBe(404);
    expect(stored(recordsDir)).toEqual([]);
  });

  it("behind the gate, both routes need the login cookie", async () => {
    const { request, recordsDir } = await serve({ password: "testers" });
    const body = JSON.stringify(RECORD);
    expect((await request("/api/config")).status).toBe(401);
    expect((await request("/api/games", upload(body))).status).toBe(401);
    expect(stored(recordsDir)).toEqual([]);
    const cookie = `${COOKIE}=${sessionValue(SECRET, NOW + 60_000)}`;
    expect((await request("/api/config", { headers: { cookie } })).status).toBe(
      200,
    );
    expect(
      (await request("/api/games", upload(body, undefined, cookie))).status,
    ).toBe(201);
  });
});
