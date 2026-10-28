import { randomUUID } from "node:crypto";
import { mkdir, writeFile } from "node:fs/promises";
import type { IncomingMessage, ServerResponse } from "node:http";
import { join } from "node:path";
import { clientIp } from "./gate.js";

/**
 * Game collection (M13b): `GET /api/config` tells the web app whether the Test Site panel exists,
 * and `POST /api/games` stores a finished (or Bad Bot!) game record on the volume. There is no
 * route to read records back; Paul downloads them over `railway ssh` (docs/deploy.md). Both run
 * behind the login gate, in `apps/server` and as Vite dev-server middleware (one implementation,
 * like the Decklog route).
 */

/** What `GET /api/config` answers. */
export interface SiteConfig {
  /** The Test Site panel, uploads and the opponent's-hand toggle (M13b). */
  testSite: boolean;
}

/** The site config from the environment: `GOJISIM_TEST_SITE` is `on` (the default) or `off`. */
export function siteConfig(
  env: Record<string, string | undefined>,
): SiteConfig {
  return { testSite: env.GOJISIM_TEST_SITE?.trim().toLowerCase() !== "off" };
}

/**
 * Whether the Test Site features are on. The one place that decides it, so M9 can replace it with
 * the signed-in user's permission without touching the panel or the routes.
 */
export function testSiteEnabled(config: SiteConfig): boolean {
  return config.testSite;
}

/** The largest record body accepted, in bytes. */
export const MAX_RECORD_BYTES = 2 * 1024 * 1024;
/** Uploads per IP per minute. */
export const UPLOADS_PER_MINUTE = 30;
const MINUTE = 60_000;

/** Whether `value` has a game record's shape: `version`, `seed`, `decks` and `actions`. */
export function isGameRecord(value: unknown): boolean {
  if (typeof value !== "object" || value === null || Array.isArray(value))
    return false;
  const record = value as Record<string, unknown>;
  return (
    record["version"] === 1 &&
    (typeof record["seed"] === "number" ||
      typeof record["seed"] === "string") &&
    Array.isArray(record["decks"]) &&
    record["decks"].length === 2 &&
    Array.isArray(record["actions"])
  );
}

/** The body as text, or `null` once it passes `limit` bytes. */
function readBody(req: IncomingMessage, limit: number): Promise<string | null> {
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = [];
    let size = 0;
    let over = false;
    req.on("data", (chunk: Buffer) => {
      if (over) return;
      size += chunk.length;
      if (size > limit) {
        over = true;
        resolve(null);
        return;
      }
      chunks.push(chunk);
    });
    req.on("end", () => {
      if (!over) resolve(Buffer.concat(chunks).toString("utf8"));
    });
    req.on("error", reject);
  });
}

function sendJson(res: ServerResponse, status: number, body: unknown): void {
  res.writeHead(status, {
    "content-type": "application/json",
    "cache-control": "no-store",
  });
  res.end(JSON.stringify(body));
}

export interface GamesOptions {
  config: SiteConfig;
  /** Where records go: `<recordsDir>/<YYYY-MM-DD>/<uuid>.json`. */
  recordsDir: string;
  now?: () => number;
}

/**
 * The config and upload routes as middleware. An upload is stored as the client sent it (the
 * server adds nothing, so no IP address or user agent reaches the file); with the Test Site off
 * the upload route answers 404.
 */
export function gamesMiddleware({
  config,
  recordsDir,
  now = Date.now,
}: GamesOptions) {
  const uploads = new Map<string, number[]>();
  /** This IP's uploads in the last minute; IPs with none are forgotten. */
  const recent = (ip: string) => {
    const t = now();
    const kept = (uploads.get(ip) ?? []).filter((at) => t - at < MINUTE);
    if (kept.length) uploads.set(ip, kept);
    else uploads.delete(ip);
    return kept;
  };
  const prune = () => {
    for (const ip of [...uploads.keys()]) recent(ip);
  };
  return async (
    req: IncomingMessage,
    res: ServerResponse,
    next: () => void,
  ): Promise<void> => {
    const path = (req.url ?? "").split("?")[0] ?? "";
    if (path === "/api/config" && req.method === "GET") {
      sendJson(res, 200, config);
      return;
    }
    if (path !== "/api/games" || req.method !== "POST") {
      next();
      return;
    }
    if (!testSiteEnabled(config)) {
      sendJson(res, 404, { error: "not-found" });
      return;
    }
    const ip = clientIp(req);
    if (uploads.size > 1000) prune();
    if (recent(ip).length >= UPLOADS_PER_MINUTE) {
      sendJson(res, 429, { error: "rate-limited" });
      return;
    }
    uploads.set(ip, [...recent(ip), now()]);
    const text = await readBody(req, MAX_RECORD_BYTES);
    if (text === null) {
      sendJson(res, 413, { error: "too-large" });
      return;
    }
    let record: unknown;
    try {
      record = JSON.parse(text);
    } catch {
      sendJson(res, 400, { error: "not-json" });
      return;
    }
    if (!isGameRecord(record)) {
      sendJson(res, 400, { error: "not-a-record" });
      return;
    }
    const day = new Date(now()).toISOString().slice(0, 10);
    const id = randomUUID();
    await mkdir(join(recordsDir, day), { recursive: true });
    await writeFile(join(recordsDir, day, `${id}.json`), text);
    sendJson(res, 201, { id });
  };
}
