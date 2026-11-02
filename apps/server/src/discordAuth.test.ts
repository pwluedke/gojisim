import { createHash } from "node:crypto";
import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { AddressInfo } from "node:net";
import { afterEach, describe, expect, it } from "vitest";
import { openDb } from "./db/db.js";
import {
  OAUTH_COOKIE,
  playerSessionValue,
  ROLE_CHECK_MS,
  sessionPlayer,
} from "./discordAuth.js";
import { COOKIE, TRIES_PER_MINUTE } from "./gate.js";
import { authMode, createAppServer, discordSettings } from "./index.js";
import { playerById, SMOKE_PLAYER_ID } from "./players.js";

const SECRET = "s".repeat(40);
const TESTER = "role-tester";
const GUILD = "guild-1";
let servers: ReturnType<typeof createAppServer>[] = [];
/** A built app's folder with an index page, so a request past the gate gets an answer. */
const dist = mkdtempSync(join(tmpdir(), "gojisim-dist-"));
writeFileSync(join(dist, "index.html"), "<title>GojiSim</title>");
afterEach(() => {
  for (const s of servers) s.close();
  servers = [];
});

/** A fake Discord: the token exchange, the account, and its roles in the server. */
function fakeDiscord(
  account: {
    id: string;
    username: string;
    global_name?: string | null;
    avatar?: string | null;
  },
  roles: string[] | null,
) {
  const calls: { url: string; body?: string; auth?: string }[] = [];
  const fetchImpl = (async (
    url: string | URL | Request,
    init?: RequestInit,
  ) => {
    const u = String(url);
    const headers = (init?.headers ?? {}) as Record<string, string>;
    calls.push({
      url: u,
      ...(init?.body ? { body: String(init.body) } : {}),
      ...(headers["authorization"] ? { auth: headers["authorization"] } : {}),
    });
    if (u.endsWith("/oauth2/token"))
      return new Response(
        JSON.stringify({ access_token: "tok-1", token_type: "Bearer" }),
      );
    if (u.endsWith("/users/@me")) return new Response(JSON.stringify(account));
    if (u.endsWith(`/users/@me/guilds/${GUILD}/member`))
      return roles
        ? new Response(JSON.stringify({ roles }))
        : new Response("{}", { status: 404 });
    return new Response("{}", { status: 404 });
  }) as typeof fetch;
  return { fetchImpl, calls };
}

async function serve(
  fetchImpl: typeof fetch,
  opts: { smokeToken?: string; clock?: { t: number } } = {},
) {
  const db = openDb(":memory:", { log: () => {} });
  const clock = opts.clock ?? { t: Date.UTC(2026, 10, 1, 12) };
  const server = createAppServer({
    distDir: dist,
    cardsDir: "/nonexistent",
    recordsDir: "/nonexistent",
    secret: SECRET,
    discord: {
      db,
      clientId: "client-1",
      clientSecret: "client-secret-1",
      guildId: GUILD,
      testerRoleId: TESTER,
      redirectUri: "https://gojisim.somanygames.app/auth/discord/callback",
      ...(opts.smokeToken ? { smokeToken: opts.smokeToken } : {}),
    },
    discordFetch: fetchImpl,
    now: () => clock.t,
  });
  servers.push(server);
  await new Promise<void>((r) => server.listen(0, r));
  const { port } = server.address() as AddressInfo;
  const request = (path: string, init: RequestInit = {}) =>
    fetch(`http://localhost:${port}${path}`, { redirect: "manual", ...init });
  return { request, db, clock };
}

const cookieFrom = (res: Response, name: string) =>
  res.headers
    .getSetCookie()
    .find((c) => c.startsWith(`${name}=`))
    ?.split(";")[0]
    ?.slice(name.length + 1);

/** Starts sign-in, then comes back from Discord with a code; returns the callback's answer. */
async function signIn(
  request: Awaited<ReturnType<typeof serve>>["request"],
  next = "/play",
) {
  const start = await request(`/auth/discord?next=${encodeURIComponent(next)}`);
  const location = new URL(start.headers.get("location") ?? "");
  const oauth = cookieFrom(start, OAUTH_COOKIE) ?? "";
  const state = location.searchParams.get("state") ?? "";
  const back = await request(
    `/auth/discord/callback?code=code-1&state=${state}`,
    {
      headers: { cookie: `${OAUTH_COOKIE}=${oauth}` },
    },
  );
  return { start, location, back };
}

describe("Discord sign-in (#150)", () => {
  it("without a session: pages go to the sign-in page, the API is 401, and /login offers Discord", async () => {
    const { request } = await serve(
      fakeDiscord({ id: "1", username: "a" }, [TESTER]).fetchImpl,
    );
    const page = await request("/play");
    expect(page.status).toBe(303);
    expect(page.headers.get("location")).toBe("/login?next=%2Fplay");
    expect((await request("/api/me")).status).toBe(401);
    expect(
      (await request("/api/games", { method: "POST", body: "{}" })).status,
    ).toBe(401);
    const login = await (await request("/login?next=%2Fplay")).text();
    expect(login).toContain('href="/auth/discord?next=%2Fplay"');
    expect(login).toContain("Sign in with Discord");
    expect(login).not.toContain('type="password"');
  });

  it("starts OAuth with PKCE (S256), a state, the scopes and the registered redirect; the state rides in a signed cookie", async () => {
    const { request } = await serve(
      fakeDiscord({ id: "1", username: "a" }, [TESTER]).fetchImpl,
    );
    const start = await request("/auth/discord?next=%2Fplay");
    expect(start.status).toBe(303);
    const url = new URL(start.headers.get("location") ?? "");
    expect(url.origin + url.pathname).toBe(
      "https://discord.com/oauth2/authorize",
    );
    expect(url.searchParams.get("client_id")).toBe("client-1");
    expect(url.searchParams.get("scope")).toBe("identify guilds.members.read");
    expect(url.searchParams.get("redirect_uri")).toBe(
      "https://gojisim.somanygames.app/auth/discord/callback",
    );
    expect(url.searchParams.get("code_challenge_method")).toBe("S256");
    expect(url.searchParams.get("state")).toMatch(/^[\w-]{20,}$/);
    const cookie =
      start.headers
        .getSetCookie()
        .find((c) => c.startsWith(`${OAUTH_COOKIE}=`)) ?? "";
    expect(cookie).toMatch(/HttpOnly; Secure; SameSite=Lax/);
    expect(cookie).toContain("Max-Age=600");
  });

  it("a Tester signs in: the code (with the PKCE verifier) for a token, then the account and roles; a player is made with no email; the session names it", async () => {
    const account: {
      id: string;
      username: string;
      global_name: string | null;
      avatar: string | null;
    } = { id: "111", username: "kiryu", global_name: "Kiryu", avatar: "abc" };
    const discord = fakeDiscord(account, ["other", TESTER]);
    const { request, db } = await serve(discord.fetchImpl);
    const { location, back } = await signIn(request);
    expect(back.status).toBe(303);
    expect(back.headers.get("location")).toBe("/play");
    // The token exchange sent the verifier whose S256 is the challenge, and the client secret.
    const exchange = new URLSearchParams(
      discord.calls.find((c) => c.url.endsWith("/oauth2/token"))?.body,
    );
    expect(exchange.get("grant_type")).toBe("authorization_code");
    expect(exchange.get("client_secret")).toBe("client-secret-1");
    const verifier = exchange.get("code_verifier") ?? "";
    expect(createHash("sha256").update(verifier).digest("base64url")).toBe(
      location.searchParams.get("code_challenge"),
    );
    expect(
      discord.calls
        .filter((c) => c.auth)
        .every((c) => c.auth === "Bearer tok-1"),
    ).toBe(true);
    // The OAuth cookie is cleared; the session cookie carries the player.
    expect(cookieFrom(back, OAUTH_COOKIE)).toBe("");
    const session = cookieFrom(back, COOKIE) ?? "";
    const id = sessionPlayer(SECRET, session, Date.UTC(2026, 10, 1, 12));
    const player = playerById(db, id ?? "");
    expect(player).toMatchObject({
      discordId: "111",
      displayName: "Kiryu",
      avatarUrl: "https://cdn.discordapp.com/avatars/111/abc.png?size=64",
    });
    const columns = (
      db.prepare("PRAGMA table_info(players)").all() as { name: string }[]
    ).map((c) => c.name);
    expect(columns.some((c) => /mail/i.test(c))).toBe(false);
    const me = await request("/api/me", {
      headers: { cookie: `${COOKIE}=${session}` },
    });
    expect(await me.json()).toEqual({
      id,
      name: "Kiryu",
      avatarUrl: "https://cdn.discordapp.com/avatars/111/abc.png?size=64",
      // #153: the current season.
      season: "beta",
    });
    // Signing in again keeps the same player, with the newer name and avatar.
    account.global_name = null;
    account.avatar = null;
    const second = await signIn(request);
    const again = sessionPlayer(
      SECRET,
      cookieFrom(second.back, COOKIE),
      Date.UTC(2026, 10, 1, 12),
    );
    expect(again).toBe(id);
    expect(playerById(db, again ?? "")).toMatchObject({
      displayName: "kiryu",
      avatarUrl: null,
    });
    expect(
      (db.prepare("SELECT COUNT(*) AS n FROM players").get() as { n: number })
        .n,
    ).toBe(1);
  });

  it("without the Tester role, or outside the server: the 'ask Paul' page and no session", async () => {
    for (const roles of [["other"], null]) {
      const { request } = await serve(
        fakeDiscord({ id: "222", username: "outsider" }, roles).fetchImpl,
      );
      const { back } = await signIn(request);
      expect(back.status).toBe(403);
      expect(await back.text()).toContain(
        "Ask Paul in the GojiSim Discord server for the Tester role",
      );
      expect(cookieFrom(back, COOKIE)).toBeUndefined();
    }
  });

  it("a callback with the wrong state or no OAuth cookie is refused; Discord's 'cancel' says so", async () => {
    const { request } = await serve(
      fakeDiscord({ id: "1", username: "a" }, [TESTER]).fetchImpl,
    );
    const start = await request("/auth/discord");
    const oauth = cookieFrom(start, OAUTH_COOKIE) ?? "";
    expect(
      (
        await request("/auth/discord/callback?code=c&state=forged", {
          headers: { cookie: `${OAUTH_COOKIE}=${oauth}` },
        })
      ).status,
    ).toBe(400);
    expect(
      (await request("/auth/discord/callback?code=c&state=x")).status,
    ).toBe(400);
    const cancelled = await request(
      "/auth/discord/callback?error=access_denied",
      { headers: { cookie: `${OAUTH_COOKIE}=${oauth}` } },
    );
    expect(await cancelled.text()).toContain("Discord sign-in was cancelled.");
  });

  it("24 hours after the role check, a page load goes back through Discord; API calls keep working", async () => {
    const clock = { t: Date.UTC(2026, 10, 1, 12) };
    const { request } = await serve(
      fakeDiscord({ id: "333", username: "b" }, [TESTER]).fetchImpl,
      { clock },
    );
    const { back } = await signIn(request);
    const cookie = `${COOKIE}=${cookieFrom(back, COOKIE)}`;
    clock.t += ROLE_CHECK_MS - 1;
    expect((await request("/play", { headers: { cookie } })).status).not.toBe(
      303,
    );
    clock.t += 1;
    const page = await request("/play", { headers: { cookie } });
    expect(page.status).toBe(303);
    expect(page.headers.get("location")).toMatch(
      /^https:\/\/discord\.com\/oauth2\/authorize\?/,
    );
    expect((await request("/api/me", { headers: { cookie } })).status).toBe(
      200,
    );
  });

  it("sign out clears the session; a tampered or unknown-player session is refused", async () => {
    const { request } = await serve(
      fakeDiscord({ id: "444", username: "c" }, [TESTER]).fetchImpl,
    );
    const out = await request("/auth/logout", { method: "POST" });
    expect(out.status).toBe(303);
    expect(out.headers.get("location")).toBe("/login");
    expect(cookieFrom(out, COOKIE)).toBe("");
    const forged = playerSessionValue(
      "x".repeat(40),
      "someone",
      Date.UTC(2027, 0, 1),
    );
    expect(
      (await request("/api/me", { headers: { cookie: `${COOKIE}=${forged}` } }))
        .status,
    ).toBe(401);
    const unknown = playerSessionValue(
      SECRET,
      "no-such-player",
      Date.UTC(2027, 0, 1),
    );
    expect(
      (
        await request("/api/me", {
          headers: { cookie: `${COOKIE}=${unknown}` },
        })
      ).status,
    ).toBe(401);
  });

  it("the smoke login: 404 without a token set; a constant-time compare; rate-limited; the smoke player, never re-checked", async () => {
    const off = await serve(
      fakeDiscord({ id: "1", username: "a" }, [TESTER]).fetchImpl,
    );
    expect(
      (await off.request("/auth/smoke", { method: "POST", body: "token=x" }))
        .status,
    ).toBe(404);
    const clock = { t: Date.UTC(2026, 10, 1, 12) };
    const { request, db } = await serve(
      fakeDiscord({ id: "1", username: "a" }, [TESTER]).fetchImpl,
      { smokeToken: "smoke-token-123", clock },
    );
    const post = (token: string, ip = "203.0.113.5") =>
      request("/auth/smoke", {
        method: "POST",
        body: new URLSearchParams({ token, next: "/play" }).toString(),
        headers: {
          "x-real-ip": ip,
          "content-type": "application/x-www-form-urlencoded",
        },
      });
    const ok = await post("smoke-token-123");
    expect(ok.status).toBe(303);
    expect(ok.headers.get("location")).toBe("/play");
    const cookie = `${COOKIE}=${cookieFrom(ok, COOKIE)}`;
    expect(sessionPlayer(SECRET, cookieFrom(ok, COOKIE), clock.t)).toBe(
      SMOKE_PLAYER_ID,
    );
    expect(playerById(db, SMOKE_PLAYER_ID)?.displayName).toBe("Smoke check");
    clock.t += 3 * ROLE_CHECK_MS;
    expect((await request("/play", { headers: { cookie } })).status).not.toBe(
      303,
    );
    for (let i = 0; i < TRIES_PER_MINUTE; i++)
      expect((await post("wrong")).status).toBe(401);
    expect((await post("smoke-token-123")).status).toBe(429);
    expect((await post("smoke-token-123", "198.51.100.9")).status).toBe(303);
  });

  it("there is no dev sign-in on the app server", async () => {
    const { request } = await serve(
      fakeDiscord({ id: "1", username: "a" }, [TESTER]).fetchImpl,
    );
    for (const path of ["/auth/dev", "/auth/dev?next=%2F"]) {
      const res = await request(path);
      expect(res.status).toBe(303);
      expect(res.headers.get("location")).toMatch(/^\/login\?next=/);
      expect(cookieFrom(res, COOKIE)).toBeUndefined();
    }
  });

  it("GOJISIM_AUTH picks the gate (password by default); Discord needs its four settings", () => {
    expect(authMode({})).toBe("password");
    expect(authMode({ GOJISIM_AUTH: "Discord " })).toBe("discord");
    expect(authMode({ GOJISIM_AUTH: "password" })).toBe("password");
    expect(
      discordSettings({ GOJISIM_AUTH: "discord", DISCORD_CLIENT_ID: "c" }),
    ).toEqual({
      ok: false,
      missing: [
        "DISCORD_CLIENT_SECRET",
        "DISCORD_GUILD_ID",
        "DISCORD_TESTER_ROLE_ID",
      ],
    });
    const found = discordSettings({
      DISCORD_CLIENT_ID: "c",
      DISCORD_CLIENT_SECRET: "s",
      DISCORD_GUILD_ID: "g",
      DISCORD_TESTER_ROLE_ID: "r",
    });
    expect(found).toMatchObject({
      ok: true,
      dbFile: "/data/gojisim.db",
      settings: {
        redirectUri: "https://gojisim.somanygames.app/auth/discord/callback",
      },
    });
  });
});

describe("the password gate keeps working (#150)", () => {
  it("with no Discord sign-in, /api/me is 404 (no accounts)", async () => {
    const server = createAppServer({
      distDir: dist,
      cardsDir: "/nonexistent",
      recordsDir: "/nonexistent",
    });
    servers.push(server);
    await new Promise<void>((r) => server.listen(0, r));
    const { port } = server.address() as AddressInfo;
    const res = await fetch(`http://localhost:${port}/api/me`);
    expect(res.status).toBe(404);
    expect(await res.json()).toEqual({ error: "no-accounts" });
  });
});
