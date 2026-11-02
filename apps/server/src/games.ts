import { randomUUID } from "node:crypto";
import { mkdir, readdir, readFile, stat, writeFile } from "node:fs/promises";
import type { DatabaseSync } from "node:sqlite";
import type { IncomingMessage, ServerResponse } from "node:http";
import { join, relative } from "node:path";
import { clientIp } from "./gate.js";
import { indexGame, playerGame, playerGames } from "./playerGames.js";

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
/** The records folder's total size cap (1 GB, 1024³ bytes): past it, uploads answer 507. */
export const MAX_RECORDS_DIR_BYTES = 1024 ** 3;
/** Uploads per IP per minute. */
export const UPLOADS_PER_MINUTE = 30;

/**
 * The upload limit from `GOJISIM_UPLOADS_PER_MINUTE` (#123): only Playwright sets it, since every
 * e2e worker uploads from one IP to one server; anything else, or a value that isn't a positive
 * whole number, keeps `UPLOADS_PER_MINUTE`.
 */
export function uploadsPerMinuteFrom(
  env: Record<string, string | undefined>,
): number {
  const raw = env["GOJISIM_UPLOADS_PER_MINUTE"]?.trim() ?? "";
  const n = Number(raw);
  return /^\d+$/.test(raw) && n > 0 ? n : UPLOADS_PER_MINUTE;
}
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

/** A game id: a UUID as `crypto.randomUUID()` makes it (any case). */
const GAME_ID =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * The record's `gameId`: `undefined` without one (older clients), `null` if it isn't a UUID.
 * Lowercased, so it is one file name whatever the case.
 */
export function gameIdOf(record: object): string | null | undefined {
  const id = (record as { gameId?: unknown }).gameId;
  if (id === undefined) return undefined;
  return typeof id === "string" && GAME_ID.test(id) ? id.toLowerCase() : null;
}

/** The stored file of game `id` in any day folder, with its size, or `null`. */
/** A stored file's JSON, or `null` when it can't be read. */
async function readJson(path: string): Promise<unknown> {
  try {
    return JSON.parse(await readFile(path, "utf8"));
  } catch {
    return null;
  }
}

async function storedGame(
  recordsDir: string,
  id: string,
): Promise<{ path: string; size: number } | null> {
  let days;
  try {
    days = await readdir(recordsDir, { withFileTypes: true });
  } catch {
    return null;
  }
  for (const day of days) {
    if (!day.isDirectory()) continue;
    const path = join(recordsDir, day.name, `${id}.json`);
    try {
      return { path, size: (await stat(path)).size };
    } catch {
      // Not in this day.
    }
  }
  return null;
}

/** The total size of the files under `dir`, in bytes; 0 if it doesn't exist yet. */
async function folderBytes(dir: string): Promise<number> {
  let entries;
  try {
    entries = await readdir(dir, { withFileTypes: true });
  } catch {
    return 0;
  }
  let total = 0;
  for (const entry of entries) {
    const path = join(dir, entry.name);
    if (entry.isDirectory()) total += await folderBytes(path);
    else if (entry.isFile()) total += (await stat(path)).size;
  }
  return total;
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
  /**
   * Where records go: `<recordsDir>/<YYYY-MM-DD>/<gameId>.json`, one file per game (a record with
   * no `gameId` gets a random name).
   */
  recordsDir: string;
  /** The records folder's size cap, in bytes (default `MAX_RECORDS_DIR_BYTES`). */
  maxRecordsBytes?: number;
  /** Uploads per IP per minute (default `UPLOADS_PER_MINUTE`; Playwright raises it, #123). */
  uploadsPerMinute?: number;
  /**
   * Called after a game is stored, with the record, the game's earlier upload (or `null`) and the
   * file under `recordsDir` (`<day>/<id>.json`). The answer doesn't wait for it (#136's Discord
   * posts, `reports.ts`).
   */
  onStored?: (
    record: unknown,
    earlier: unknown,
    file: string,
  ) => Promise<unknown>;
  /**
   * #151: the request's signed-in player (Discord sign-in), recorded in the upload by the server
   * (`playerId`, `playerName`); the client's own copies of those fields are dropped.
   */
  playerOf?: (
    req: IncomingMessage,
  ) => { id: string; displayName: string } | null;
  /** #151: the database for each player's games index and history (Discord sign-in only). */
  db?: DatabaseSync | undefined;
  now?: () => number;
  /** Where the "records folder full" line goes (default `console.error`). */
  log?: (line: string) => void;
}

/**
 * The config and upload routes as middleware. An upload is stored as the client sent it, except
 * that with Discord sign-in the server records the player (#151); no IP address or user agent
 * reaches the file; with the Test Site off
 * the upload route answers 404. Once the records folder would pass `maxRecordsBytes`, uploads
 * answer 507 and the server logs it (once until an upload fits again), so a looping client can't
 * fill the volume.
 */
export function gamesMiddleware({
  config,
  recordsDir,
  maxRecordsBytes = MAX_RECORDS_DIR_BYTES,
  uploadsPerMinute = UPLOADS_PER_MINUTE,
  onStored,
  playerOf,
  db,
  now = Date.now,
  log = (line) => console.error(line),
}: GamesOptions) {
  // The folder's size, read from disk at the first upload, then kept by adding each stored file
  // (only this server writes there). Paul's downloads don't change it; a restart re-reads it.
  let folderSize: Promise<number> | null = null;
  let full = false;
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
    // #151: the signed-in player's own games: the list, and one record to load.
    if (req.method === "GET" && path.startsWith("/api/games/")) {
      const player = playerOf?.(req) ?? null;
      if (!db || !player) {
        sendJson(res, 404, { error: "no-accounts" });
        return;
      }
      const which = decodeURIComponent(path.slice("/api/games/".length));
      if (which === "mine") {
        sendJson(res, 200, {
          games: playerGames(db, player.id).map(
            ({ file: _file, ...game }) => game,
          ),
        });
        return;
      }
      const game = playerGame(db, player.id, which);
      const text = game
        ? await readFile(join(recordsDir, game.file), "utf8").catch(() => null)
        : null;
      if (!text) {
        sendJson(res, 404, { error: "not-found" });
        return;
      }
      res.writeHead(200, {
        "content-type": "application/json",
        "cache-control": "no-store",
      });
      res.end(text);
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
    if (recent(ip).length >= uploadsPerMinute) {
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
    // #151: the player is the server's to record, from the session; never the client's word.
    const player = playerOf?.(req) ?? null;
    const fields = record as Record<string, unknown>;
    const claimed = "playerId" in fields || "playerName" in fields;
    delete fields["playerId"];
    delete fields["playerName"];
    if (player) {
      fields["playerId"] = player.id;
      fields["playerName"] = player.displayName;
    }
    const body = player || claimed ? JSON.stringify(fields) : text;
    // One file per game: a record with a game id replaces that game's earlier upload, in whichever
    // day folder it went to (a game may cross midnight). Without one (older clients), a new file.
    const gameId = gameIdOf(record as object);
    if (gameId === null) {
      sendJson(res, 400, { error: "bad-game-id" });
      return;
    }
    // #151: a game id that is another player's game can't be overwritten.
    if (db && gameId && player) {
      const owner = db
        .prepare("SELECT player_id FROM games WHERE game_id = ?")
        .get(gameId) as { player_id: string } | undefined;
      if (owner && owner.player_id !== player.id) {
        sendJson(res, 403, { error: "not-yours" });
        return;
      }
    }
    const earlier = gameId ? await storedGame(recordsDir, gameId) : null;
    folderSize ??= folderBytes(recordsDir);
    const size = Buffer.byteLength(body);
    // The replaced file's size is freed.
    const total = (await folderSize) - (earlier?.size ?? 0);
    if (total + size > maxRecordsBytes) {
      if (!full)
        log(
          `GojiSim: the records folder is full (${total} of ${maxRecordsBytes} bytes in ${recordsDir}); uploads answer 507 until there is room.`,
        );
      full = true;
      sendJson(res, 507, { error: "storage-full" });
      return;
    }
    full = false;
    folderSize = Promise.resolve(total + size);
    const id = gameId ?? randomUUID();
    // The earlier upload, read before it is replaced, so its reports aren't posted again (#136).
    const before = onStored && earlier ? await readJson(earlier.path) : null;
    let stored: string;
    if (earlier) {
      stored = earlier.path;
      await writeFile(stored, body);
    } else {
      const day = new Date(now()).toISOString().slice(0, 10);
      await mkdir(join(recordsDir, day), { recursive: true });
      stored = join(recordsDir, day, `${id}.json`);
      await writeFile(stored, body);
    }
    if (db && player && gameId)
      indexGame(
        db,
        {
          gameId,
          playerId: player.id,
          file: relative(recordsDir, stored),
          record: fields,
        },
        now(),
      );
    sendJson(res, 201, { id });
    if (onStored)
      void onStored(record, before, relative(recordsDir, stored)).catch(() => {
        // The poster logs its own failures; nothing reaches the upload.
      });
  };
}
