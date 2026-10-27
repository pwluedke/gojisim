import { mkdirSync, mkdtempSync, writeFileSync } from "node:fs";
import type { AddressInfo } from "node:net";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeAll, describe, expect, it } from "vitest";
import {
  COOKIE,
  SESSION_DAYS,
  sessionValue,
  TRIES_PER_MINUTE,
  validSession,
} from "./gate.js";
import { createServer, type IncomingMessage } from "node:http";
import { clientIp, safeNext } from "./gate.js";
import { createAppServer, openSiteWarning, safeHandler } from "./index.js";
import { fileUnder } from "./static.js";

/** A built app and a card image in a temp folder. */
let distDir = "";
let cardsDir = "";
beforeAll(() => {
  const root = mkdtempSync(join(tmpdir(), "gojisim-server-"));
  distDir = join(root, "dist");
  cardsDir = join(root, "cards");
  mkdirSync(join(distDir, "assets"), { recursive: true });
  mkdirSync(cardsDir);
  writeFileSync(
    join(distDir, "index.html"),
    "<!doctype html><title>GojiSim</title>",
  );
  writeFileSync(join(distDir, "assets", "index-abc123.js"), "console.log(1)");
  writeFileSync(join(cardsDir, "7-thumb.webp"), "webp");
});

const PASSWORD = "kaiju tea party";
const SECRET = "s".repeat(40);

let servers: ReturnType<typeof createAppServer>[] = [];
afterEach(() => {
  for (const server of servers) server.close();
  servers = [];
});

async function serve(options: Parameters<typeof createAppServer>[0] = {}) {
  const server = createAppServer({ distDir, cardsDir, ...options });
  servers.push(server);
  await new Promise<void>((resolve) => server.listen(0, resolve));
  const { port } = server.address() as AddressInfo;
  return (path: string, init: RequestInit = {}) =>
    fetch(`http://localhost:${port}${path}`, { redirect: "manual", ...init });
}

/**
 * A login POST as Railway's edge forwards it: `X-Real-IP` is the client, and the client's own
 * `X-Forwarded-For` first entry is whatever it likes (a fresh fake one each time here).
 */
let fake = 0;
const login = (password: string, next = "/play", ip = "203.0.113.7") => ({
  method: "POST",
  headers: {
    "content-type": "application/x-www-form-urlencoded",
    "x-real-ip": ip,
    "x-forwarded-for": `198.18.0.${++fake % 250}, ${ip}`,
  },
  body: new URLSearchParams({ password, next }).toString(),
});

/** Every kind of route: a page, an app route, an asset, a card image, the API. */
const ROUTES = [
  "/",
  "/play",
  "/assets/index-abc123.js",
  "/cards/7-thumb.webp",
  "/api/decklog/1STAP",
];

describe("the server without a password (local runs, e2e)", () => {
  it("serves the app, its routes, assets and card images; robots.txt and the health route", async () => {
    const get = await serve();
    expect(await (await get("/")).text()).toContain("<title>GojiSim");
    // An app route falls back to index.html; a missing file is a 404.
    expect(await (await get("/play")).text()).toContain("<title>GojiSim");
    expect((await get("/assets/missing.js")).status).toBe(404);
    const asset = await get("/assets/index-abc123.js");
    expect(asset.headers.get("content-type")).toContain("text/javascript");
    expect(asset.headers.get("cache-control")).toContain("immutable");
    const card = await get("/cards/7-thumb.webp");
    expect(card.headers.get("content-type")).toBe("image/webp");
    expect(card.headers.get("cache-control")).toContain("max-age=2592000");
    expect((await get("/cards/nope.webp")).status).toBe(404);
    expect(await (await get("/robots.txt")).text()).toBe(
      "User-agent: *\nDisallow: /\n",
    );
    expect(await (await get("/healthz")).json()).toEqual({ status: "ok" });
    // noindex on every response.
    for (const path of ["/", "/robots.txt", "/cards/7-thumb.webp"])
      expect((await get(path)).headers.get("x-robots-tag")).toBe(
        "noindex, nofollow",
      );
  });

  it("never serves a file outside its folders", async () => {
    expect(fileUnder("/srv/dist", "../secret")).toBeNull();
    expect(fileUnder("/srv/dist", "%2e%2e/secret")).toBeNull();
    expect(fileUnder("/srv/dist", "a/../../b")).toBeNull();
    expect(fileUnder("/srv/dist", "assets/x.js")).toBe("/srv/dist/assets/x.js");
    const get = await serve();
    expect((await get("/cards/..%2f..%2fdist%2findex.html")).status).toBe(404);
  });

  it("refuses to start with a password but no long enough secret", () => {
    expect(() => createAppServer({ password: PASSWORD })).toThrow(
      /SESSION_SECRET/,
    );
    expect(() =>
      createAppServer({ password: PASSWORD, secret: "short" }),
    ).toThrow(/SESSION_SECRET/);
  });

  it("warns loudly on Railway with no password, and only there", () => {
    expect(openSiteWarning({ RAILWAY_ENVIRONMENT: "production" })).toMatch(
      /^WARNING: no password gate, the site is open to anyone/,
    );
    expect(
      openSiteWarning({
        RAILWAY_ENVIRONMENT: "production",
        GOJISIM_PASSWORD: PASSWORD,
      }),
    ).toBeNull();
    // Locally (and in the e2e tests) no gate is normal.
    expect(openSiteWarning({})).toBeNull();
  });
});

describe("the password gate", () => {
  it("without the cookie: pages go to the login page, everything else is 401; robots.txt and the health route still answer", async () => {
    const get = await serve({ password: PASSWORD, secret: SECRET });
    for (const path of ["/", "/play"]) {
      const res = await get(path);
      expect(res.status).toBe(303);
      expect(res.headers.get("location")).toBe(
        `/login?next=${encodeURIComponent(path)}`,
      );
    }
    for (const path of [
      "/assets/index-abc123.js",
      "/cards/7-thumb.webp",
      "/api/decklog/1STAP",
    ])
      expect((await get(path)).status, path).toBe(401);
    expect((await get("/robots.txt")).status).toBe(200);
    expect((await get("/healthz")).status).toBe(200);
    // The login page: noindex, the form, no hint of the password.
    const page = await get("/login?next=%2Fplay");
    expect(page.status).toBe(200);
    const html = await page.text();
    expect(html).toContain('<meta name="robots" content="noindex, nofollow">');
    expect(html).toContain('name="next" value="/play"');
    expect(html).not.toContain(PASSWORD);
  });

  it("a wrong password gets the login page again, with no hint", async () => {
    const get = await serve({ password: PASSWORD, secret: SECRET });
    const res = await get("/login", login("kaiju tea"));
    expect(res.status).toBe(401);
    expect(res.headers.get("set-cookie")).toBeNull();
    const html = await res.text();
    expect(html).toContain("Wrong password.");
    expect(html).not.toMatch(/kaiju|length|characters|close/i);
  });

  it("the right password sets a signed, HttpOnly, Secure cookie for 30 days, and every route opens", async () => {
    const now = 1_800_000_000_000;
    const get = await serve({
      password: PASSWORD,
      secret: SECRET,
      now: () => now,
    });
    const res = await get("/login", login(PASSWORD, "/play"));
    expect(res.status).toBe(303);
    expect(res.headers.get("location")).toBe("/play");
    const cookie = res.headers.get("set-cookie") ?? "";
    expect(cookie).toContain("HttpOnly");
    expect(cookie).toContain("Secure");
    expect(cookie).toContain("SameSite=Lax");
    expect(cookie).toContain(`Max-Age=${SESSION_DAYS * 24 * 60 * 60}`);
    const value = /gojisim_session=([^;]+)/.exec(cookie)?.[1] ?? "";
    expect(value).toBe(
      sessionValue(SECRET, now + SESSION_DAYS * 24 * 60 * 60 * 1000),
    );
    const headers = { cookie: `${COOKIE}=${value}` };
    for (const path of ROUTES)
      expect((await get(path, { headers })).status, path).not.toBe(401);
    expect((await get("/play", { headers })).status).toBe(200);
    expect((await get("/cards/7-thumb.webp", { headers })).status).toBe(200);
  });

  it("an expired, tampered or foreign cookie doesn't open anything", async () => {
    const now = 1_800_000_000_000;
    const get = await serve({
      password: PASSWORD,
      secret: SECRET,
      now: () => now,
    });
    const good = sessionValue(SECRET, now + 60_000);
    const [expires, signature] = good.split(".") as [string, string];
    const bad = [
      sessionValue(SECRET, now - 1), // expired
      `${Number(expires) + 10_000_000}.${signature}`, // later expiry, old signature
      `${expires}.${signature.slice(0, -1)}${signature.endsWith("A") ? "B" : "A"}`, // signature changed
      sessionValue("x".repeat(40), now + 60_000), // another secret: SESSION_SECRET changed
      "garbage",
    ];
    for (const value of bad) {
      expect(validSession(SECRET, value, now)).toBe(false);
      const res = await get("/api/decklog/1STAP", {
        headers: { cookie: `${COOKIE}=${value}` },
      });
      expect(res.status, value).toBe(401);
    }
    expect(validSession(SECRET, good, now)).toBe(true);
  });

  it(`after ${TRIES_PER_MINUTE} wrong tries in a minute an IP waits, even with the right password; other IPs don't; a minute later it can try again`, async () => {
    let now = 1_800_000_000_000;
    const get = await serve({
      password: PASSWORD,
      secret: SECRET,
      now: () => now,
    });
    for (let i = 0; i < TRIES_PER_MINUTE; i++)
      expect((await get("/login", login("wrong"))).status).toBe(401);
    const blocked = await get("/login", login(PASSWORD));
    expect(blocked.status).toBe(429);
    expect(blocked.headers.get("set-cookie")).toBeNull();
    expect(await blocked.text()).toContain("Too many tries");
    expect(
      (await get("/login", login(PASSWORD, "/play", "198.51.100.2"))).status,
    ).toBe(303);
    now += 60_001;
    expect((await get("/login", login(PASSWORD))).status).toBe(303);
  });

  it("the login never redirects to another site", async () => {
    const get = await serve({ password: PASSWORD, secret: SECRET });
    const offsite = [
      "https://evil.example",
      "//evil.example",
      "evil",
      "/\\evil.com", // browsers read /\ like //
      "/%5Cevil.com",
      "/%5cevil.com",
      "/\t/evil.com",
      "/%09/evil.com",
      "/play\r\nSet-Cookie: x=1",
      "/play%0d%0aSet-Cookie: x=1",
    ];
    for (const next of offsite) {
      expect(safeNext(next), JSON.stringify(next)).toBe("/");
      expect(
        (await get("/login", login(PASSWORD, next))).headers.get("location"),
        JSON.stringify(next),
      ).toBe("/");
    }
    for (const next of ["/play", "/debug?seed=4", "/play#top"])
      expect(safeNext(next)).toBe(next);
  });

  it("the rate limit counts the client Railway saw, not the first X-Forwarded-For entry the client sends", async () => {
    const get = await serve({ password: PASSWORD, secret: SECRET });
    // Ten wrong tries, each with a different spoofed first entry, from one client.
    for (let i = 0; i < TRIES_PER_MINUTE; i++) {
      const res = await get("/login", {
        ...login("wrong"),
        headers: {
          "content-type": "application/x-www-form-urlencoded",
          "x-real-ip": "203.0.113.9",
          "x-forwarded-for": `10.${i}.0.1, 203.0.113.9`,
        },
      });
      expect(res.status).toBe(401);
    }
    expect(
      (await get("/login", login(PASSWORD, "/", "203.0.113.9"))).status,
    ).toBe(429);
    // Without X-Real-IP, the last X-Forwarded-For entry (the nearest proxy's), never the first.
    const req = (headers: Record<string, string>) =>
      ({
        headers,
        socket: { remoteAddress: "10.1.1.1" },
      }) as unknown as IncomingMessage;
    expect(clientIp(req({ "x-real-ip": "203.0.113.9" }))).toBe("203.0.113.9");
    expect(clientIp(req({ "x-forwarded-for": "1.2.3.4, 203.0.113.9" }))).toBe(
      "203.0.113.9",
    );
    expect(clientIp(req({}))).toBe("10.1.1.1");
  });
});

describe("errors never stop the server", () => {
  it("a handler that throws or rejects gets a 500, and the next request still works", async () => {
    const logged: unknown[] = [];
    let calls = 0;
    const server = createServer(
      safeHandler(
        async (req, res) => {
          calls++;
          if (req.url === "/throw") throw new Error("boom");
          if (req.url === "/bad-header")
            // An invalid header value: writeHead throws.
            res.writeHead(200, { "x-bad": "a\nb" });
          res.writeHead(200);
          res.end("fine");
        },
        (error) => logged.push(error),
      ),
    );
    servers.push(server as ReturnType<typeof createAppServer>);
    await new Promise<void>((resolve) => server.listen(0, resolve));
    const { port } = server.address() as AddressInfo;
    const get = (path: string) => fetch(`http://localhost:${port}${path}`);
    for (const path of ["/throw", "/bad-header"]) {
      const res = await get(path);
      expect(res.status, path).toBe(500);
      expect(await res.text()).toBe("Something went wrong.");
    }
    expect(logged).toHaveLength(2);
    const next = await get("/ok");
    expect(next.status).toBe(200);
    expect(await next.text()).toBe("fine");
    expect(calls).toBe(3);
  });

  it("the app server answers a failing step with a 500 and keeps serving", async () => {
    // A fetch that throws before Decklog's own error handling sees it.
    const get = await serve({
      fetchImpl: (() => {
        throw new Error("network down");
      }) as unknown as typeof fetch,
    });
    const failed = await get("/api/decklog/1STAP");
    expect([500, 502]).toContain(failed.status);
    expect((await get("/healthz")).status).toBe(200);
  });
});
