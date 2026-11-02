import {
  createHash,
  createHmac,
  randomBytes,
  timingSafeEqual,
} from "node:crypto";
import type { IncomingMessage, ServerResponse } from "node:http";
import type { DatabaseSync } from "node:sqlite";
import {
  clientIp,
  COOKIE,
  cookieOf,
  escapeHtml,
  type Next,
  readBody,
  safeNext,
  samePassword,
  SESSION_DAYS,
  sendHtml,
  TRIES_PER_MINUTE,
} from "./gate.js";
import {
  type Player,
  playerById,
  SMOKE_PLAYER_ID,
  smokePlayer,
  touchPlayer,
  upsertDiscordPlayer,
} from "./players.js";

/**
 * Discord sign-in (#150), used with `GOJISIM_AUTH=discord` in place of the shared password.
 *
 * - `/auth/discord` starts OAuth2 (authorization code with PKCE, scopes `identify
 *   guilds.members.read`); the state and verifier ride in a short-lived signed cookie.
 * - `/auth/discord/callback` exchanges the code, reads the account and its roles in the GojiSim
 *   server, and lets in only members with the Tester role. A player is made or refreshed (Discord
 *   id, display name, avatar; no email), and the session cookie carries the player id.
 * - Roles are re-checked on each new sign-in, and when a page loads more than 24 hours after the
 *   last check (a silent trip through Discord); API calls keep working for the cookie's 30 days.
 * - `/auth/smoke` is the smoke check's sign-in (`SMOKE_LOGIN_TOKEN`): a constant-time compare of
 *   SHA-256 digests, limited like the password (wrong tries per IP per minute).
 * - `/auth/logout` clears the cookie. `/api/me` answers the signed-in player.
 *
 * There is no dev sign-in here: that lives only in the Vite dev server (`vite.config.ts`).
 */

export const OAUTH_COOKIE = "gojisim_oauth";
export const ROLE_CHECK_MS = 24 * 60 * 60_000;
const OAUTH_MINUTES = 10;
const MINUTE = 60_000;
const DISCORD = "https://discord.com/api/v10";

export interface DiscordAuthOptions {
  db: DatabaseSync;
  /** Signs the session and OAuth cookies (`SESSION_SECRET`, 32+ characters). */
  secret: string;
  clientId: string;
  clientSecret: string;
  guildId: string;
  testerRoleId: string;
  /** The OAuth redirect registered with Discord. */
  redirectUri: string;
  /** `SMOKE_LOGIN_TOKEN`; without it `/auth/smoke` answers 404. */
  smokeToken?: string | undefined;
  fetchImpl?: typeof fetch;
  now?: () => number;
}

const hmac = (secret: string, text: string) =>
  createHmac("sha256", secret).update(text).digest("base64url");

const equal = (a: string, b: string) => {
  const x = Buffer.from(a);
  const y = Buffer.from(b);
  return x.length === y.length && timingSafeEqual(x, y);
};

/** The session cookie with a player (`<expires>.<player>.<signature of v2.expires.player>`). */
export function playerSessionValue(
  secret: string,
  playerId: string,
  expires: number,
): string {
  const id = Buffer.from(playerId).toString("base64url");
  return `${expires}.${id}.${hmac(secret, `v2.${expires}.${id}`)}`;
}

/** The player id in a session cookie this server signed that hasn't ended, else `null`. */
export function sessionPlayer(
  secret: string,
  value: string | undefined,
  now: number,
): string | null {
  const [expiresText, id, signature, ...rest] = (value ?? "").split(".");
  if (rest.length || !expiresText || !id || !signature) return null;
  const expires = Number(expiresText);
  if (!Number.isSafeInteger(expires) || expires <= now) return null;
  if (!equal(signature, hmac(secret, `v2.${expires}.${id}`))) return null;
  return Buffer.from(id, "base64url").toString();
}

/** The OAuth cookie: state, PKCE verifier and where to go after, signed, for 10 minutes. */
function oauthValue(
  secret: string,
  state: string,
  verifier: string,
  next: string,
  expires: number,
) {
  const body = [
    state,
    verifier,
    Buffer.from(next).toString("base64url"),
    String(expires),
  ].join(".");
  return `${body}.${hmac(secret, `oauth.${body}`)}`;
}

function readOauth(secret: string, value: string | undefined, now: number) {
  const parts = (value ?? "").split(".");
  if (parts.length !== 5) return null;
  const [state, verifier, next, expires, signature] = parts as [
    string,
    string,
    string,
    string,
    string,
  ];
  const body = [state, verifier, next, expires].join(".");
  if (!equal(signature, hmac(secret, `oauth.${body}`))) return null;
  if (!(Number(expires) > now)) return null;
  return {
    state,
    verifier,
    next: safeNext(Buffer.from(next, "base64url").toString()),
  };
}

const challengeOf = (verifier: string) =>
  createHash("sha256").update(verifier).digest("base64url");

const cookieHeader = (name: string, value: string, maxAgeSeconds: number) =>
  `${name}=${value}; Max-Age=${maxAgeSeconds}; Path=/; HttpOnly; Secure; SameSite=Lax`;

/** The sign-in page (Showa Poster, all inline like the password page). */
export function signInPage(next: string, message?: string): string {
  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="robots" content="noindex, nofollow">
<title>GojiSim</title>
<style>
  :root { --ink: #1a1410; --paper: #f1e6cf; --panel: #fbf4e4; --red: #d7261e; --blurple: #5865f2; }
  * { box-sizing: border-box; }
  body { margin: 0; min-height: 100vh; background: var(--paper); color: var(--ink);
    font-family: "Zen Kaku Gothic New", system-ui, sans-serif; }
  header { height: 56px; display: flex; align-items: center; padding: 0 16px;
    background: var(--red); border-bottom: 3px solid var(--ink); color: #fff;
    font: 900 26px/1 system-ui, sans-serif; letter-spacing: 0.04em; }
  main { display: flex; justify-content: center; padding: 64px 16px; }
  section { width: min(380px, 100%); padding: 24px; background: var(--panel);
    border: 3px solid var(--ink); border-radius: 4px; box-shadow: 6px 6px 0 var(--ink); }
  h1 { margin: 0 0 12px; font-size: 22px; }
  p { margin: 0 0 16px; line-height: 1.4; }
  a.button { display: inline-flex; align-items: center; min-height: 44px; padding: 0 20px;
    border: 3px solid var(--ink); border-radius: 4px; background: var(--blurple); color: #fff;
    font: 900 16px system-ui, sans-serif; text-decoration: none; box-shadow: 3px 3px 0 var(--ink); }
  .error { margin: 16px 0 0; color: #a3150f; font-weight: 700; }
</style>
</head>
<body>
<header>GOJISIM!</header>
<main>
<section>
  <h1>Testers only</h1>
  <p>Sign in with the Discord account you use in the GojiSim server.</p>
  <a class="button" href="/auth/discord?next=${encodeURIComponent(next)}">Sign in with Discord</a>
  ${message ? `<p class="error" role="alert">${escapeHtml(message)}</p>` : ""}
</section>
</main>
</body>
</html>
`;
}

/** The page for a Discord account without the Tester role. */
export function noAccessPage(name: string): string {
  return signInPage("/").replace(
    /<section>[\s\S]*<\/section>/,
    `<section>
  <h1>Not a tester yet</h1>
  <p>${escapeHtml(name)}, your Discord account isn't a GojiSim tester. Ask Paul in the GojiSim Discord server for the Tester role, then sign in again.</p>
  <a class="button" href="/auth/discord">Sign in again</a>
</section>`,
  );
}

/** A Discord avatar's URL, or `null` for the default avatar. */
export const avatarUrl = (id: string, avatar: string | null | undefined) =>
  avatar
    ? `https://cdn.discordapp.com/avatars/${id}/${avatar}.png?size=64`
    : null;

export function createDiscordGate({
  db,
  secret,
  clientId,
  clientSecret,
  guildId,
  testerRoleId,
  redirectUri,
  smokeToken,
  fetchImpl = fetch,
  now = Date.now,
}: DiscordAuthOptions) {
  const wrong = new Map<string, number[]>();
  const recent = (ip: string) => {
    const t = now();
    const kept = (wrong.get(ip) ?? []).filter((at) => t - at < MINUTE);
    if (kept.length) wrong.set(ip, kept);
    else wrong.delete(ip);
    return kept;
  };
  const signIn = (
    res: ServerResponse,
    player: Player,
    next: string,
    extra: string[] = [],
  ) => {
    const expires = now() + SESSION_DAYS * 24 * 60 * MINUTE;
    res.writeHead(303, {
      location: next,
      "set-cookie": [
        cookieHeader(
          COOKIE,
          playerSessionValue(secret, player.id, expires),
          SESSION_DAYS * 24 * 60 * 60,
        ),
        ...extra,
      ],
      "cache-control": "no-store",
    });
    res.end();
  };
  const startOAuth = (res: ServerResponse, next: string) => {
    const state = randomBytes(16).toString("base64url");
    const verifier = randomBytes(32).toString("base64url");
    const url = new URL("https://discord.com/oauth2/authorize");
    url.search = new URLSearchParams({
      client_id: clientId,
      response_type: "code",
      redirect_uri: redirectUri,
      scope: "identify guilds.members.read",
      state,
      code_challenge: challengeOf(verifier),
      code_challenge_method: "S256",
      // Skips Discord's consent screen once the app is authorized (the 24-hour re-check).
      prompt: "none",
    }).toString();
    res.writeHead(303, {
      location: url.toString(),
      "set-cookie": cookieHeader(
        OAUTH_COOKIE,
        oauthValue(
          secret,
          state,
          verifier,
          next,
          now() + OAUTH_MINUTES * MINUTE,
        ),
        OAUTH_MINUTES * 60,
      ),
      "cache-control": "no-store",
    });
    res.end();
  };

  /** The callback: the code for a token, the account and its roles, then the session. */
  const callback = async (
    req: IncomingMessage,
    res: ServerResponse,
    url: URL,
  ) => {
    const oauth = readOauth(secret, cookieOf(req, OAUTH_COOKIE), now());
    const clearOauth = cookieHeader(OAUTH_COOKIE, "", 0);
    if (url.searchParams.get("error")) {
      sendHtml(
        res,
        401,
        signInPage(oauth?.next ?? "/", "Discord sign-in was cancelled."),
      );
      return;
    }
    const code = url.searchParams.get("code");
    const state = url.searchParams.get("state") ?? "";
    if (!oauth || !code || !equal(state, oauth.state)) {
      sendHtml(
        res,
        400,
        signInPage("/", "That sign-in link expired. Try again."),
      );
      return;
    }
    const token = await fetchImpl(`${DISCORD}/oauth2/token`, {
      method: "POST",
      headers: { "content-type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        grant_type: "authorization_code",
        code,
        redirect_uri: redirectUri,
        code_verifier: oauth.verifier,
        client_id: clientId,
        client_secret: clientSecret,
      }).toString(),
    });
    if (!token.ok) {
      sendHtml(
        res,
        502,
        signInPage(oauth.next, "Discord didn't accept the sign-in. Try again."),
      );
      return;
    }
    const { access_token: accessToken } = (await token.json()) as {
      access_token?: string;
    };
    const auth = { authorization: `Bearer ${accessToken ?? ""}` };
    const me = await fetchImpl(`${DISCORD}/users/@me`, { headers: auth });
    if (!me.ok) {
      sendHtml(
        res,
        502,
        signInPage(oauth.next, "Discord didn't answer. Try again."),
      );
      return;
    }
    const user = (await me.json()) as {
      id: string;
      username: string;
      global_name?: string | null;
      avatar?: string | null;
    };
    const displayName = user.global_name || user.username;
    const member = await fetchImpl(
      `${DISCORD}/users/@me/guilds/${guildId}/member`,
      { headers: auth },
    );
    const roles = member.ok
      ? (((await member.json()) as { roles?: string[] }).roles ?? [])
      : [];
    if (!roles.includes(testerRoleId)) {
      res.setHeader("set-cookie", clearOauth);
      sendHtml(res, 403, noAccessPage(displayName));
      return;
    }
    const player = upsertDiscordPlayer(
      db,
      {
        discordId: user.id,
        displayName,
        avatarUrl: avatarUrl(user.id, user.avatar),
      },
      now(),
    );
    signIn(res, player, oauth.next, [clearOauth]);
  };

  return async (
    req: IncomingMessage,
    res: ServerResponse,
    next: Next,
  ): Promise<void> => {
    const url = new URL(req.url ?? "/", "http://localhost");
    const path = url.pathname;
    if (path === "/login" && req.method === "GET") {
      sendHtml(res, 200, signInPage(safeNext(url.searchParams.get("next"))));
      return;
    }
    if (path === "/auth/discord" && req.method === "GET") {
      startOAuth(res, safeNext(url.searchParams.get("next")));
      return;
    }
    if (path === "/auth/discord/callback" && req.method === "GET") {
      await callback(req, res, url);
      return;
    }
    if (path === "/auth/logout" && req.method === "POST") {
      res.writeHead(303, {
        location: "/login",
        "set-cookie": cookieHeader(COOKIE, "", 0),
        "cache-control": "no-store",
      });
      res.end();
      return;
    }
    if (path === "/auth/smoke" && req.method === "POST") {
      if (!smokeToken) {
        res.writeHead(404, { "content-type": "text/plain; charset=utf-8" });
        res.end("Not found.");
        return;
      }
      const ip = clientIp(req);
      if (recent(ip).length >= TRIES_PER_MINUTE) {
        res.writeHead(429, { "content-type": "text/plain; charset=utf-8" });
        res.end("Too many tries.");
        return;
      }
      let form: URLSearchParams;
      try {
        form = new URLSearchParams(await readBody(req));
      } catch {
        res.writeHead(413, { "content-type": "text/plain; charset=utf-8" });
        res.end("Too large.");
        return;
      }
      // samePassword compares SHA-256 digests with timingSafeEqual: no early exit, equal lengths.
      if (!samePassword(form.get("token") ?? "", smokeToken)) {
        wrong.set(ip, [...recent(ip), now()]);
        res.writeHead(401, { "content-type": "text/plain; charset=utf-8" });
        res.end("Wrong token.");
        return;
      }
      signIn(res, smokePlayer(db, now()), safeNext(form.get("next")));
      return;
    }

    const id = sessionPlayer(secret, cookieOf(req, COOKIE), now());
    const player = id ? playerById(db, id) : null;
    const page =
      req.method === "GET" &&
      !path.startsWith("/api/") &&
      !/\.[a-z0-9]+$/i.test(path);
    if (player) {
      // A page load more than a day after the roles were checked goes through Discord again.
      const stale =
        player.id !== SMOKE_PLAYER_ID &&
        now() - (player.rolesCheckedAt ?? 0) >= ROLE_CHECK_MS;
      if (page && stale) {
        startOAuth(res, safeNext(path + url.search));
        return;
      }
      if (path === "/api/me" && req.method === "GET") {
        touchPlayer(db, player.id, now());
        res.writeHead(200, {
          "content-type": "application/json",
          "cache-control": "no-store",
        });
        res.end(
          JSON.stringify({
            id: player.id,
            name: player.displayName,
            avatarUrl: player.avatarUrl,
          }),
        );
        return;
      }
      next();
      return;
    }
    if (page) {
      res.writeHead(303, {
        location: `/login?next=${encodeURIComponent(path + url.search)}`,
        "cache-control": "no-store",
      });
      res.end();
      return;
    }
    res.writeHead(401, {
      "content-type": "text/plain; charset=utf-8",
      "cache-control": "no-store",
    });
    res.end("Sign in first.");
  };
}
