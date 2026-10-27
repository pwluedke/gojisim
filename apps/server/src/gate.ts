import { createHash, createHmac, timingSafeEqual } from "node:crypto";
import type { IncomingMessage, ServerResponse } from "node:http";

/**
 * The testers' password gate (deploy for testers): one shared password (`GOJISIM_PASSWORD`) in
 * front of every route. A right password sets a signed cookie for 30 days; the signature uses
 * `SESSION_SECRET`, so changing it signs everyone out. Wrong tries are limited per IP, and no
 * error hints at the password. Only the login page, `robots.txt` and the health route answer
 * without the cookie.
 */

export const COOKIE = "gojisim_session";
export const SESSION_DAYS = 30;
/** Wrong tries per IP in one minute; after them, every try waits until the minute has passed. */
export const TRIES_PER_MINUTE = 10;
const MINUTE = 60_000;

export interface GateOptions {
  password: string;
  secret: string;
  now?: () => number;
}

export type Next = () => void;

const sign = (secret: string, expires: number) =>
  createHmac("sha256", secret).update(`v1.${expires}`).digest("base64url");

/** The cookie value for a session that ends at `expires` (ms since the epoch). */
export function sessionValue(secret: string, expires: number): string {
  return `${expires}.${sign(secret, expires)}`;
}

/** Whether `value` is a session this server signed that hasn't ended. */
export function validSession(
  secret: string,
  value: string | undefined,
  now: number,
): boolean {
  if (!value) return false;
  const [expiresText, signature, ...rest] = value.split(".");
  if (rest.length || !expiresText || !signature) return false;
  const expires = Number(expiresText);
  if (!Number.isSafeInteger(expires) || expires <= now) return false;
  const expected = Buffer.from(sign(secret, expires));
  const given = Buffer.from(signature);
  return expected.length === given.length && timingSafeEqual(expected, given);
}

/** Same-length digests, so the comparison takes the same time whatever was typed. */
const samePassword = (a: string, b: string) =>
  timingSafeEqual(
    createHash("sha256").update(a).digest(),
    createHash("sha256").update(b).digest(),
  );

function cookieOf(req: IncomingMessage, name: string): string | undefined {
  for (const part of (req.headers.cookie ?? "").split(";")) {
    const [key, ...value] = part.trim().split("=");
    if (key === name) return value.join("=");
  }
  return undefined;
}

const header = (req: IncomingMessage, name: string) => {
  const value = req.headers[name];
  return Array.isArray(value) ? value[value.length - 1] : value;
};

/**
 * The client's IP, for the rate limit. Railway's edge sets `X-Real-IP` to the client's address
 * (its public networking docs: "X-Real-IP for identifying client's remote IP") and overwrites any
 * copy the client sent. Without it, the last `X-Forwarded-For` entry, the one the nearest proxy
 * added; never the first, which the client controls. Then the socket's own address.
 */
export function clientIp(req: IncomingMessage): string {
  const real = header(req, "x-real-ip")?.trim();
  if (real) return real;
  const last = header(req, "x-forwarded-for")?.split(",").at(-1)?.trim();
  return last || req.socket.remoteAddress || "unknown";
}

/**
 * Only a local path, so the login can never redirect to another site: it starts with one `/`,
 * and has no backslash (browsers read `/\evil.com` like `//evil.com`), no control character
 * (CR, LF, tab, ...) and no percent-encoded form of either. Anything else becomes `/`.
 */
export function safeNext(next: string | null | undefined): string {
  if (!next || !next.startsWith("/") || next.startsWith("//")) return "/";
  // eslint-disable-next-line no-control-regex
  if (/[\\\u0000-\u001f\u007f]/.test(next)) return "/";
  if (/%(5c|[01][0-9a-f]|7f)/i.test(next)) return "/";
  return next;
}

const escapeHtml = (text: string) =>
  text.replace(
    /[&<>"']/g,
    (c) =>
      ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[
        c
      ] as string,
  );

/** The login page, in the Showa Poster theme (all inline, so it needs nothing behind the gate). */
export function loginPage(next: string, message?: string): string {
  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="robots" content="noindex, nofollow">
<title>GojiSim</title>
<style>
  :root { --ink: #1a1410; --paper: #f1e6cf; --panel: #fbf4e4; --red: #d7261e; --marigold: #f4b323; }
  * { box-sizing: border-box; }
  body { margin: 0; min-height: 100vh; background: var(--paper); color: var(--ink);
    font-family: "Zen Kaku Gothic New", system-ui, sans-serif; }
  header { height: 56px; display: flex; align-items: center; padding: 0 16px;
    background: var(--red); border-bottom: 3px solid var(--ink); color: #fff;
    font: 900 26px/1 system-ui, sans-serif; letter-spacing: 0.04em; }
  main { display: flex; justify-content: center; padding: 64px 16px; }
  form { width: min(360px, 100%); padding: 24px; background: var(--panel);
    border: 3px solid var(--ink); border-radius: 4px; box-shadow: 6px 6px 0 var(--ink); }
  h1 { margin: 0 0 16px; font-size: 22px; }
  label { display: block; margin-bottom: 8px; font-weight: 700; }
  input { width: 100%; min-height: 44px; padding: 0 8px; border: 2px solid var(--ink);
    border-radius: 4px; background: #fff; font: inherit; }
  button { margin-top: 16px; min-height: 44px; padding: 0 24px; border: 3px solid var(--ink);
    border-radius: 4px; background: var(--marigold); color: var(--ink); font: 900 16px system-ui, sans-serif;
    box-shadow: 3px 3px 0 var(--ink); cursor: pointer; }
  .error { margin: 12px 0 0; color: #a3150f; font-weight: 700; }
</style>
</head>
<body>
<header>GOJISIM!</header>
<main>
<form method="post" action="/login">
  <h1>Testers only</h1>
  <label for="password">Password</label>
  <input id="password" name="password" type="password" autocomplete="current-password" required autofocus>
  <input type="hidden" name="next" value="${escapeHtml(next)}">
  <button type="submit">Enter</button>
  ${message ? `<p class="error" role="alert">${escapeHtml(message)}</p>` : ""}
</form>
</main>
</body>
</html>
`;
}

function readBody(req: IncomingMessage, limit = 4096): Promise<string> {
  return new Promise((resolve, reject) => {
    let body = "";
    req.on("data", (chunk: Buffer) => {
      body += chunk.toString("utf8");
      if (body.length > limit) {
        reject(new Error("too large"));
        req.destroy();
      }
    });
    req.on("end", () => resolve(body));
    req.on("error", reject);
  });
}

function sendHtml(res: ServerResponse, status: number, html: string): void {
  res.writeHead(status, {
    "content-type": "text/html; charset=utf-8",
    "cache-control": "no-store",
  });
  res.end(html);
}

/**
 * The gate as middleware. With a valid cookie, `next()`; otherwise a page request goes to the
 * login page (`303`), and anything else (assets, card images, `/api/*`) gets `401`.
 */
export function createGate({ password, secret, now = Date.now }: GateOptions) {
  const wrong = new Map<string, number[]>();
  /** Forgets every IP whose wrong tries are all over a minute old, so the map stays small. */
  const prune = () => {
    const t = now();
    for (const [ip, times] of wrong)
      if (times.every((at) => t - at >= MINUTE)) wrong.delete(ip);
  };
  /** The wrong tries from `ip` in the last minute (older ones are forgotten). */
  const recent = (ip: string) => {
    const t = now();
    const kept = (wrong.get(ip) ?? []).filter((at) => t - at < MINUTE);
    if (kept.length) wrong.set(ip, kept);
    else wrong.delete(ip);
    return kept;
  };

  return async (
    req: IncomingMessage,
    res: ServerResponse,
    next: Next,
  ): Promise<void> => {
    const url = new URL(req.url ?? "/", "http://localhost");
    if (url.pathname === "/login") {
      if (req.method === "POST") {
        const ip = clientIp(req);
        if (wrong.size > 1000) prune();
        if (recent(ip).length >= TRIES_PER_MINUTE) {
          sendHtml(
            res,
            429,
            loginPage("/", "Too many tries. Wait a minute and try again."),
          );
          return;
        }
        let form: URLSearchParams;
        try {
          form = new URLSearchParams(await readBody(req));
        } catch {
          sendHtml(res, 413, loginPage("/", "That didn't work."));
          return;
        }
        const target = safeNext(form.get("next"));
        if (!samePassword(form.get("password") ?? "", password)) {
          wrong.set(ip, [...recent(ip), now()]);
          sendHtml(res, 401, loginPage(target, "Wrong password."));
          return;
        }
        const expires = now() + SESSION_DAYS * 24 * 60 * MINUTE;
        res.writeHead(303, {
          location: target,
          "set-cookie": `${COOKIE}=${sessionValue(secret, expires)}; Max-Age=${SESSION_DAYS * 24 * 60 * 60}; Path=/; HttpOnly; Secure; SameSite=Lax`,
          "cache-control": "no-store",
        });
        res.end();
        return;
      }
      sendHtml(res, 200, loginPage(safeNext(url.searchParams.get("next"))));
      return;
    }
    if (validSession(secret, cookieOf(req, COOKIE), now())) {
      next();
      return;
    }
    // A page (the app's routes, not files or the API): to the login page, and back after.
    const page =
      req.method === "GET" &&
      !url.pathname.startsWith("/api/") &&
      !/\.[a-z0-9]+$/i.test(url.pathname);
    if (page) {
      res.writeHead(303, {
        location: `/login?next=${encodeURIComponent(url.pathname + url.search)}`,
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
