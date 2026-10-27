import { createServer, type Server } from "node:http";
import { resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { decklogMiddleware } from "./decklog.js";
import { createGate } from "./gate.js";
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
  now?: () => number;
}

const ROBOTS = "User-agent: *\nDisallow: /\n";

/**
 * The app server (deploy for testers): the built web app, its card images and
 * `GET /api/decklog/<code>`, behind the testers' password when one is set. `robots.txt` and the
 * health route (`/healthz`) answer without it, and every response says `noindex`.
 */
export function createAppServer({
  fetchImpl = fetch,
  password,
  secret,
  distDir = fileURLToPath(new URL("../../web/dist/", import.meta.url)),
  cardsDir = fileURLToPath(new URL("../../web/public/cards/", import.meta.url)),
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
  const cards = cardImages(cardsDir);
  const app = webApp(distDir);
  return createServer((req, res) => {
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
    const serve = () =>
      decklog(req, res, () => {
        void cards(req, res, () => void app(req, res));
      });
    if (gate) void gate(req, res, serve);
    else serve();
  });
}

if (
  process.argv[1] &&
  import.meta.url === pathToFileURL(process.argv[1]).href
) {
  const port = Number(process.env.PORT ?? 3000);
  createAppServer({
    password: process.env.GOJISIM_PASSWORD || undefined,
    secret: process.env.SESSION_SECRET || undefined,
    ...(process.env.CARDS_DIR
      ? { cardsDir: resolve(process.env.CARDS_DIR) }
      : {}),
  }).listen(port, () => {
    console.log(
      `GojiSim server listening on http://localhost:${port}${process.env.GOJISIM_PASSWORD ? " (password gate on)" : ""}`,
    );
  });
}
