import type { IncomingMessage, ServerResponse } from "node:http";
import type { DatabaseSync } from "node:sqlite";

/**
 * My decks and Settings per player (#152), for the signed-in player only:
 *
 * - `GET /api/me/decks`: every deck, tombstones included (`deleted: true`), so a browser drops
 *   decks deleted elsewhere.
 * - `PUT /api/me/decks/<id>` `{ name, list, updatedAt }` and `DELETE /api/me/decks/<id>`
 *   `{ updatedAt }`: kept only when newer than what's stored (the newest edit wins); the answer is
 *   the stored deck either way, so the browser can take the newer one.
 * - `GET /api/me/settings`, `PUT /api/me/settings` `{ settings, updatedAt }`: the same rule.
 *
 * Times are ISO strings from the browsers. Without Discord sign-in every route answers 404.
 */

export const MAX_DECKS = 500;
export const MAX_LIST_CHARS = 64 * 1024;
export const MAX_NAME_CHARS = 200;
export const MAX_SETTINGS_CHARS = 16 * 1024;

export interface AccountDeck {
  id: string;
  name: string;
  list: string;
  updatedAt: string;
  deleted: boolean;
}

interface DeckRow {
  deck_id: string;
  name: string;
  list: string;
  updated_at: string;
  deleted: number;
}

const toDeck = (r: DeckRow): AccountDeck => ({
  id: r.deck_id,
  name: r.name,
  list: r.list,
  updatedAt: r.updated_at,
  deleted: r.deleted === 1,
});

/** An ISO time `Date` can read, so edits compare by time. */
const isTime = (v: unknown): v is string =>
  typeof v === "string" && v.length <= 40 && !Number.isNaN(Date.parse(v));
const newer = (a: string, b: string) => Date.parse(a) > Date.parse(b);
const validId = (id: string) => /^[A-Za-z0-9_-]{1,64}$/.test(id);

export function playerDecks(db: DatabaseSync, playerId: string): AccountDeck[] {
  return (
    db
      .prepare(
        "SELECT * FROM player_decks WHERE player_id = ? ORDER BY updated_at",
      )
      .all(playerId) as unknown as DeckRow[]
  ).map(toDeck);
}

function deckRow(
  db: DatabaseSync,
  playerId: string,
  id: string,
): AccountDeck | null {
  const row = db
    .prepare("SELECT * FROM player_decks WHERE player_id = ? AND deck_id = ?")
    .get(playerId, id) as DeckRow | undefined;
  return row ? toDeck(row) : null;
}

/** Stores the deck (or its tombstone) when newer than the stored one; returns what's stored. */
export function putDeck(
  db: DatabaseSync,
  playerId: string,
  deck: AccountDeck,
): AccountDeck | "full" {
  const stored = deckRow(db, playerId, deck.id);
  if (stored && !newer(deck.updatedAt, stored.updatedAt)) return stored;
  if (!stored) {
    const count = (
      db
        // Only live decks count: tombstones don't fill the limit (Monarch's #156 note).
        .prepare(
          "SELECT COUNT(*) AS n FROM player_decks WHERE player_id = ? AND deleted = 0",
        )
        .get(playerId) as {
        n: number;
      }
    ).n;
    if (count >= MAX_DECKS) return "full";
  }
  db.prepare(
    `INSERT INTO player_decks (player_id, deck_id, name, list, updated_at, deleted) VALUES (?, ?, ?, ?, ?, ?)
     ON CONFLICT(player_id, deck_id) DO UPDATE SET name = excluded.name, list = excluded.list,
       updated_at = excluded.updated_at, deleted = excluded.deleted`,
  ).run(
    playerId,
    deck.id,
    deck.name,
    deck.list,
    deck.updatedAt,
    deck.deleted ? 1 : 0,
  );
  return deckRow(db, playerId, deck.id) as AccountDeck;
}

export interface AccountSettings {
  settings: Record<string, unknown>;
  updatedAt: string;
}

export function playerSettings(
  db: DatabaseSync,
  playerId: string,
): AccountSettings | null {
  const row = db
    .prepare(
      "SELECT settings, updated_at FROM player_settings WHERE player_id = ?",
    )
    .get(playerId) as { settings: string; updated_at: string } | undefined;
  return row
    ? {
        settings: JSON.parse(row.settings) as Record<string, unknown>,
        updatedAt: row.updated_at,
      }
    : null;
}

/** Stores the settings when newer than the stored ones; returns what's stored. */
export function putSettings(
  db: DatabaseSync,
  playerId: string,
  next: AccountSettings,
): AccountSettings {
  const stored = playerSettings(db, playerId);
  if (stored && !newer(next.updatedAt, stored.updatedAt)) return stored;
  db.prepare(
    `INSERT INTO player_settings (player_id, settings, updated_at) VALUES (?, ?, ?)
     ON CONFLICT(player_id) DO UPDATE SET settings = excluded.settings, updated_at = excluded.updated_at`,
  ).run(playerId, JSON.stringify(next.settings), next.updatedAt);
  return playerSettings(db, playerId) as AccountSettings;
}

function sendJson(res: ServerResponse, status: number, body: unknown): void {
  res.writeHead(status, {
    "content-type": "application/json",
    "cache-control": "no-store",
  });
  res.end(JSON.stringify(body));
}

function readJson(req: IncomingMessage, limit: number): Promise<unknown> {
  return new Promise((resolve) => {
    let body = "";
    let over = false;
    req.on("data", (chunk: Buffer) => {
      body += chunk.toString("utf8");
      if (body.length > limit) over = true;
    });
    req.on("end", () => {
      if (over) return resolve(undefined);
      try {
        resolve(JSON.parse(body));
      } catch {
        resolve(undefined);
      }
    });
    req.on("error", () => resolve(undefined));
  });
}

/** The routes as middleware: everything under `/api/me/` (other paths go on). */
export function accountMiddleware({
  db,
  playerOf,
}: {
  db: DatabaseSync | undefined;
  playerOf: (req: IncomingMessage) => { id: string } | null;
}) {
  return async (
    req: IncomingMessage,
    res: ServerResponse,
    next: () => void,
  ): Promise<void> => {
    const path = (req.url ?? "").split("?")[0] ?? "";
    if (!path.startsWith("/api/me/")) {
      next();
      return;
    }
    const player = db ? playerOf(req) : null;
    if (!db || !player) {
      sendJson(res, 404, { error: "no-accounts" });
      return;
    }
    if (path === "/api/me/decks" && req.method === "GET") {
      sendJson(res, 200, { decks: playerDecks(db, player.id) });
      return;
    }
    if (
      path.startsWith("/api/me/decks/") &&
      (req.method === "PUT" || req.method === "DELETE")
    ) {
      const id = decodeURIComponent(path.slice("/api/me/decks/".length));
      const body = (await readJson(req, MAX_LIST_CHARS + 4096)) as
        Record<string, unknown> | undefined;
      if (!validId(id) || !body || !isTime(body["updatedAt"])) {
        sendJson(res, 400, { error: "bad-deck" });
        return;
      }
      const deleting = req.method === "DELETE";
      const name = deleting ? "" : body["name"];
      const list = deleting ? "" : body["list"];
      if (
        typeof name !== "string" ||
        typeof list !== "string" ||
        name.length > MAX_NAME_CHARS ||
        list.length > MAX_LIST_CHARS ||
        (!deleting && (name.trim() === "" || list.trim() === ""))
      ) {
        sendJson(res, 400, { error: "bad-deck" });
        return;
      }
      const stored = putDeck(db, player.id, {
        id,
        name,
        list,
        updatedAt: body["updatedAt"],
        deleted: deleting,
      });
      if (stored === "full") {
        sendJson(res, 507, { error: "too-many-decks" });
        return;
      }
      sendJson(res, 200, { deck: stored });
      return;
    }
    if (path === "/api/me/settings" && req.method === "GET") {
      sendJson(
        res,
        200,
        playerSettings(db, player.id) ?? { settings: null, updatedAt: null },
      );
      return;
    }
    if (path === "/api/me/settings" && req.method === "PUT") {
      const body = (await readJson(req, MAX_SETTINGS_CHARS)) as
        Record<string, unknown> | undefined;
      const settings = body?.["settings"];
      if (
        !body ||
        !isTime(body["updatedAt"]) ||
        typeof settings !== "object" ||
        settings === null ||
        Array.isArray(settings)
      ) {
        sendJson(res, 400, { error: "bad-settings" });
        return;
      }
      sendJson(
        res,
        200,
        putSettings(db, player.id, {
          settings: settings as Record<string, unknown>,
          updatedAt: body["updatedAt"],
        }),
      );
      return;
    }
    sendJson(res, 404, { error: "not-found" });
  };
}
