import {
  createServer,
  type IncomingMessage,
  type Server,
  type ServerResponse,
} from "node:http";
import { resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { decklogMiddleware } from "./decklog.js";
import { createGate } from "./gate.js";
import { gamesMiddleware, type SiteConfig, siteConfig } from "./games.js";
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
  config = { testSite: true },
  now,
}: AppServerOptions = {}): Server {
  if (password && (!secret || secret.length < 32))
    throw new Error(
      "SESSION_SECRET must be set (32 characters or more) when GOJISIM_PASSWORD is",
    );
  const gate =
    password && secret
      ? createGate({ password, secret, ...(now ? { now } : {}) })
      : null;
  const decklog = decklogMiddleware(fetchImpl);
  const games = gamesMiddleware({
    config,
    recordsDir,
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
        res.end(JSON.stringify({ status: "ok" }));
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
  return env.RAILWAY_ENVIRONMENT && !env.GOJISIM_PASSWORD
    ? "WARNING: no password gate, the site is open to anyone. Set GOJISIM_PASSWORD and SESSION_SECRET (docs/deploy.md)."
    : null;
}

if (
  process.argv[1] &&
  import.meta.url === pathToFileURL(process.argv[1]).href
) {
  const port = Number(process.env.PORT ?? 3000);
  const warning = openSiteWarning(process.env);
  if (warning) console.warn(warning);
  createAppServer({
    password: process.env.GOJISIM_PASSWORD || undefined,
    secret: process.env.SESSION_SECRET || undefined,
    ...(process.env.CARDS_DIR
      ? { cardsDir: resolve(process.env.CARDS_DIR) }
      : {}),
    recordsDir: resolve(process.env.RECORDS_DIR ?? "/data/records"),
    config: siteConfig(process.env),
  }).listen(port, () => {
    console.log(
      `GojiSim server listening on http://localhost:${port}${process.env.GOJISIM_PASSWORD ? " (password gate on)" : ""}`,
    );
    // Again after the listening line, so it is next to the last line the deploy check reads.
    if (warning) console.warn(warning);
  });
}
