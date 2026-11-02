import {
  createServer,
  type IncomingMessage,
  type Server,
  type ServerResponse,
} from "node:http";
import { resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { decklogMiddleware } from "./decklog.js";
import { openDb } from "./db/db.js";
import { createDiscordGate, type DiscordAuthOptions } from "./discordAuth.js";
import { createGate } from "./gate.js";
import {
  gamesMiddleware,
  type SiteConfig,
  siteConfig,
  uploadsPerMinuteFrom,
} from "./games.js";
import { reportPoster } from "./reports.js";
import { cardImages, webApp } from "./static.js";

export interface AppServerOptions {
  fetchImpl?: typeof fetch;
  /** The testers' password; without it there is no gate (local runs, e2e). */
  password?: string | undefined;
  /** Signs the session cookie; required with a password. */
  secret?: string | undefined;
  /** The built web app (`apps/web/dist`). */
  distDir?: string;
  /** The card images (`/cards/*`): the volume on Railway, `apps/web/public/cards` locally. */
  cardsDir?: string;
  /** Uploaded game records (M13b): the volume's `/data/records` on Railway. */
  recordsDir?: string;
  /** The records folder's size cap in bytes (default 1 GB; tests set a small one). */
  maxRecordsBytes?: number;
  /** Uploads per IP per minute (default 30; Playwright raises it, #123). */
  uploadsPerMinute?: number;
  /** #136: the Discord staff #reports webhook (`DISCORD_REPORTS_WEBHOOK`); unset posts nothing. */
  reportsWebhook?: string | undefined;
  /** #146: the Slack #gojisim-reports webhook (`SLACK_REPORTS_WEBHOOK`); unset posts nothing there. */
  slackReportsWebhook?: string | undefined;
  /** The Discord posts' `fetch` (tests pass a fake webhook); defaults to `fetchImpl`. */
  reportsFetch?: typeof fetch;
  /**
   * #92: the commit `/healthz` reports (Railway's `RAILWAY_GIT_COMMIT_SHA`), or `null` when the
   * server doesn't know it (local runs).
   */
  commit?: string | null;
  /**
   * #150: Discord sign-in in place of the password (`GOJISIM_AUTH=discord`): the database and
   * the OAuth app. Without it, the password gate (or none) as before.
   */
  discord?: Omit<DiscordAuthOptions, "fetchImpl" | "now" | "secret">;
  /** The Discord sign-in's `fetch` (tests pass a fake Discord); defaults to `fetchImpl`. */
  discordFetch?: typeof fetch;
  /** The Test Site switch (M13b, `GOJISIM_TEST_SITE`); on by default. */
  config?: SiteConfig;
  now?: () => number;
}

const ROBOTS = "User-agent: *\nDisallow: /\n";

/** A request handler that may throw or reject. */
export type Handler = (req: IncomingMessage, res: ServerResponse) => unknown;

/**
 * Runs `handler` so that no error can stop the server: a throw or a rejection is logged and
 * answered with 500 if nothing was sent yet (otherwise the response is cut off), and the server
 * keeps serving. Node exits on an unhandled rejection, so every request goes through this.
 */
export function safeHandler(
  handler: Handler,
  log: (error: unknown) => void = (error) =>
    console.error("Request failed:", error),
) {
  return (req: IncomingMessage, res: ServerResponse): void => {
    const fail = (error: unknown) => {
      log(error);
      if (!res.headersSent) {
        res.writeHead(500, { "content-type": "text/plain; charset=utf-8" });
        res.end("Something went wrong.");
      } else res.destroy();
    };
    try {
      Promise.resolve(handler(req, res)).catch(fail);
    } catch (error) {
      fail(error);
    }
  };
}

/**
 * The app server (deploy for testers): the built web app, its card images and
 * `GET /api/decklog/<code>`, `GET /api/config` and `POST /api/games` (M13b), behind the testers'
 * password when one is set. `robots.txt` and the
 * health route (`/healthz`) answer without it, and every response says `noindex`.
 */
export function createAppServer({
  fetchImpl = fetch,
  password,
  secret,
  distDir = fileURLToPath(new URL("../../web/dist/", import.meta.url)),
  cardsDir = fileURLToPath(new URL("../../web/public/cards/", import.meta.url)),
  recordsDir = "/data/records",
  maxRecordsBytes,
  uploadsPerMinute,
  reportsWebhook,
  slackReportsWebhook,
  reportsFetch,
  discord,
  discordFetch,
  config = { testSite: true },
  commit = null,
  now,
}: AppServerOptions = {}): Server {
  if ((password || discord) && (!secret || secret.length < 32))
    throw new Error(
      "SESSION_SECRET must be set (32 characters or more) with GOJISIM_PASSWORD or Discord sign-in",
    );
  const gate =
    discord && secret
      ? createDiscordGate({
          ...discord,
          secret,
          fetchImpl: discordFetch ?? fetchImpl,
          ...(now ? { now } : {}),
        })
      : password && secret
        ? createGate({ password, secret, ...(now ? { now } : {}) })
        : null;
  const decklog = decklogMiddleware(fetchImpl);
  const games = gamesMiddleware({
    config,
    recordsDir,
    ...(maxRecordsBytes === undefined ? {} : { maxRecordsBytes }),
    ...(uploadsPerMinute === undefined ? {} : { uploadsPerMinute }),
    onStored: reportPoster({
      webhook: reportsWebhook,
      slackWebhook: slackReportsWebhook,
      fetchImpl: reportsFetch ?? fetchImpl,
    }),
    ...(now ? { now } : {}),
  });
  const cards = cardImages(cardsDir);
  const app = webApp(distDir);
  return createServer(
    safeHandler(async (req, res) => {
      // Testers only: nothing here is for search engines.
      res.setHeader("x-robots-tag", "noindex, nofollow");
      const path = new URL(req.url ?? "/", "http://localhost").pathname;
      if (path === "/robots.txt") {
        res.writeHead(200, { "content-type": "text/plain; charset=utf-8" });
        res.end(ROBOTS);
        return;
      }
      if (path === "/healthz") {
        res.writeHead(200, { "content-type": "application/json" });
        // #92: the deployed commit, so the smoke check knows Railway runs the pushed one.
        res.end(JSON.stringify({ status: "ok", commit }));
        return;
      }
      // Each step says whether it passed the request on (its `next`), and is awaited, so its
      // errors reach `safeHandler`.
      const passes = async (
        step: (next: () => void) => unknown,
      ): Promise<boolean> => {
        let passed = false;
        await step(() => {
          passed = true;
        });
        return passed;
      };
      if (gate && !(await passes((next) => gate(req, res, next)))) return;
      // #150: without Discord sign-in there's no player (the Discord gate answers it itself).
      if (path === "/api/me") {
        res.writeHead(404, { "content-type": "application/json" });
        res.end(JSON.stringify({ error: "no-accounts" }));
        return;
      }
      if (!(await passes((next) => decklog(req, res, next)))) return;
      if (!(await passes((next) => games(req, res, next)))) return;
      if (!(await passes((next) => cards(req, res, next)))) return;
      await app(req, res);
    }),
  );
}

/**
 * The warning to log at startup, if any: on Railway (`RAILWAY_ENVIRONMENT` is set) with no
 * password, the site is open to anyone, which must be obvious in the deploy log.
 */
export function openSiteWarning(
  env: Record<string, string | undefined>,
): string | null {
  return env.RAILWAY_ENVIRONMENT &&
    !env.GOJISIM_PASSWORD &&
    authMode(env) !== "discord"
    ? "WARNING: no password gate, the site is open to anyone. Set GOJISIM_PASSWORD and SESSION_SECRET (docs/deploy.md)."
    : null;
}

/** `GOJISIM_AUTH` (#150): `discord` for Discord sign-in; anything else keeps the password gate. */
export function authMode(
  env: Record<string, string | undefined>,
): "password" | "discord" {
  return env.GOJISIM_AUTH?.trim().toLowerCase() === "discord"
    ? "discord"
    : "password";
}

/**
 * The Discord sign-in settings from the environment (#150), or an error naming what's missing.
 * The server refuses to start with `GOJISIM_AUTH=discord` and any of them unset.
 */
export function discordSettings(env: Record<string, string | undefined>):
  | {
      ok: true;
      settings: Omit<NonNullable<AppServerOptions["discord"]>, "db">;
      dbFile: string;
    }
  | { ok: false; missing: string[] } {
  const need = [
    "DISCORD_CLIENT_ID",
    "DISCORD_CLIENT_SECRET",
    "DISCORD_GUILD_ID",
    "DISCORD_TESTER_ROLE_ID",
  ] as const;
  const missing = need.filter((name) => !env[name]?.trim());
  if (missing.length > 0) return { ok: false, missing };
  return {
    ok: true,
    settings: {
      clientId: env.DISCORD_CLIENT_ID?.trim() ?? "",
      clientSecret: env.DISCORD_CLIENT_SECRET?.trim() ?? "",
      guildId: env.DISCORD_GUILD_ID?.trim() ?? "",
      testerRoleId: env.DISCORD_TESTER_ROLE_ID?.trim() ?? "",
      redirectUri:
        env.DISCORD_REDIRECT_URI?.trim() ||
        "https://gojisim.somanygames.app/auth/discord/callback",
      smokeToken: env.SMOKE_LOGIN_TOKEN?.trim() || undefined,
    },
    dbFile: env.GOJISIM_DB?.trim() || "/data/gojisim.db",
  };
}

if (
  process.argv[1] &&
  import.meta.url === pathToFileURL(process.argv[1]).href
) {
  const port = Number(process.env.PORT ?? 3000);
  const warning = openSiteWarning(process.env);
  if (warning) console.warn(warning);
  let discord: AppServerOptions["discord"];
  if (authMode(process.env) === "discord") {
    const found = discordSettings(process.env);
    if (!found.ok)
      throw new Error(
        `GOJISIM_AUTH=discord needs ${found.missing.join(", ")} (docs/deploy.md).`,
      );
    // Migrations run here, after a backup; a failure stops the start (Railway keeps the old deploy).
    discord = { ...found.settings, db: openDb(resolve(found.dbFile)) };
  }
  createAppServer({
    ...(discord ? { discord } : {}),
    password: process.env.GOJISIM_PASSWORD || undefined,
    secret: process.env.SESSION_SECRET || undefined,
    ...(process.env.CARDS_DIR
      ? { cardsDir: resolve(process.env.CARDS_DIR) }
      : {}),
    recordsDir: resolve(process.env.RECORDS_DIR ?? "/data/records"),
    uploadsPerMinute: uploadsPerMinuteFrom(process.env),
    reportsWebhook: process.env.DISCORD_REPORTS_WEBHOOK,
    slackReportsWebhook: process.env.SLACK_REPORTS_WEBHOOK,
    commit: process.env.RAILWAY_GIT_COMMIT_SHA || null,
    config: siteConfig(process.env),
  }).listen(port, () => {
    console.log(
      `GojiSim server listening on http://localhost:${port}${discord ? " (Discord sign-in on)" : process.env.GOJISIM_PASSWORD ? " (password gate on)" : ""}`,
    );
    // Again after the listening line, so it is next to the last line the deploy check reads.
    if (warning) console.warn(warning);
  });
}
