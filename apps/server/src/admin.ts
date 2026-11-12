import type { IncomingMessage, ServerResponse } from "node:http";
import type { DatabaseSync } from "node:sqlite";
import type { Player } from "./players.js";
import { BETA } from "./seasons.js";

/*
 * #235: the players page for admins (`/admin/players`), read live from the database. Admins are
 * the Discord ids in `ADMIN_DISCORD_IDS`. For anyone else (signed out, not an admin, or no
 * admins set), the page and its API answer 404, as if they didn't exist.
 *
 * Only Discord players count: the `smoke` player and the dev sign-ins have no Discord id, so the
 * page, the totals, the CSV and the daily post leave them out. Counts only (Q42): nothing here
 * reads a deck, a deck name or a record file.
 */

/** `ADMIN_DISCORD_IDS`: comma-separated Discord ids; unset or blank is nobody. */
export function adminIdsFrom(
  env: Record<string, string | undefined>,
): Set<string> {
  return new Set(
    (env["ADMIN_DISCORD_IDS"] ?? "")
      .split(",")
      .map((id) => id.trim())
      .filter((id) => /^\d{1,30}$/.test(id)),
  );
}

export function isAdmin(
  player: Pick<Player, "discordId"> | null,
  admins: ReadonlySet<string>,
): boolean {
  return !!player?.discordId && admins.has(player.discordId);
}

/** One player's row: their games in the chosen season (or all seasons). */
export interface PlayerRow {
  name: string;
  firstSeen: number;
  lastSeen: number;
  botGames: number;
  onlineGames: number;
  wins: number;
  losses: number;
  /** The bot levels they played against ("Easy", "Hard", …), in order. */
  botLevels: string[];
  /**
   * Their games in each season, whatever season is shown (Paul: every game tagged with its
   * season); seasons they didn't play in are left out.
   */
  gamesBySeason: Record<string, number>;
}

export interface PlayersReport {
  /** The season shown, or `null` for all seasons. */
  season: string | null;
  /** Every season, oldest first, and which is current. */
  seasons: string[];
  currentSeason: string;
  totals: {
    players: number;
    /** Games counted once each (an online game has a row per player). */
    games: number;
    gamesLast7Days: number;
    /** Games per season (all seasons), so each season shows apart, beta included. */
    gamesBySeason: Record<string, number>;
  };
  players: PlayerRow[];
}

const LEVEL_ORDER = ["Easy", "Medium", "Hard"];
const DAY = 24 * 60 * 60_000;

/** Only real Discord players: never `smoke` or a dev sign-in (neither has a Discord id). */
const REAL = "p.discord_id IS NOT NULL";

export function playersReport(
  db: DatabaseSync,
  now: number,
  season: string | null,
): PlayersReport {
  const seasons = (
    db.prepare("SELECT name FROM seasons ORDER BY started_at, rowid").all() as {
      name: string;
    }[]
  ).map((s) => s.name);
  const current = seasons.at(-1) ?? BETA;
  const shown = season && seasons.includes(season) ? season : null;
  const inSeason = shown ? "AND g.season = ?" : "";
  const args = shown ? [shown] : [];

  const rows = db
    .prepare(
      `SELECT p.id, p.display_name AS name, p.created_at AS firstSeen, p.last_seen_at AS lastSeen,
         COUNT(CASE WHEN g.h2h = 0 THEN 1 END) AS botGames,
         COUNT(CASE WHEN g.h2h = 1 THEN 1 END) AS onlineGames,
         COUNT(CASE WHEN g.result = 'win' THEN 1 END) AS wins,
         COUNT(CASE WHEN g.result = 'loss' THEN 1 END) AS losses,
         GROUP_CONCAT(DISTINCT CASE WHEN g.h2h = 0 THEN g.bot_level END) AS levels
       FROM players p LEFT JOIN games g ON g.player_id = p.id ${inSeason}
       WHERE ${REAL}
       GROUP BY p.id
       ORDER BY p.last_seen_at DESC`,
    )
    .all(...args) as unknown as (Omit<PlayerRow, "botLevels"> & {
    id: string;
    levels: string | null;
  })[];
  // Each player's games per season (all seasons), from the seasons the games carry.
  const perSeason = new Map<string, Record<string, number>>();
  for (const { id, season: s, n } of db
    .prepare(
      "SELECT player_id AS id, season, COUNT(*) AS n FROM games GROUP BY player_id, season",
    )
    .all() as { id: string; season: string; n: number }[])
    perSeason.set(id, { ...perSeason.get(id), [s]: n });
  const players = rows.map(({ id, levels, ...row }) => ({
    ...row,
    gamesBySeason: perSeason.get(id) ?? {},
    botLevels: (levels ? levels.split(",") : []).sort(
      (a, b) => LEVEL_ORDER.indexOf(a) - LEVEL_ORDER.indexOf(b),
    ),
  }));

  const count = (sql: string, ...more: (string | number)[]) =>
    (
      db
        .prepare(
          `SELECT COUNT(DISTINCT g.game_id) AS n FROM games g JOIN players p ON p.id = g.player_id
           WHERE ${REAL} ${sql}`,
        )
        .get(...more) as { n: number }
    ).n;
  const bySeason = db
    .prepare(
      `SELECT g.season, COUNT(DISTINCT g.game_id) AS n FROM games g JOIN players p ON p.id = g.player_id
       WHERE ${REAL} GROUP BY g.season`,
    )
    .all() as { season: string; n: number }[];
  return {
    season: shown,
    seasons,
    currentSeason: current,
    totals: {
      players: players.length,
      games: count(inSeason, ...args),
      gamesLast7Days: count(
        `${inSeason} AND g.started_at >= ?`,
        ...args,
        now - 7 * DAY,
      ),
      gamesBySeason: Object.fromEntries(bySeason.map((s) => [s.season, s.n])),
    },
    players,
  };
}

/** "beta 80 · launch 40": each season with games, in the order the seasons started. */
export function seasonCounts(
  seasons: readonly string[],
  counts: Record<string, number>,
): string {
  return seasons
    .filter((s) => (counts[s] ?? 0) > 0)
    .map((s) => `${s} ${counts[s]}`)
    .join(" · ");
}

const iso = (ms: number) => new Date(ms).toISOString();

/** A CSV cell: quoted when it holds a comma, a quote or a line break; a leading =+-@ is defused. */
function cell(value: string | number): string {
  let text = String(value);
  // Spreadsheets run a cell starting with one of these as a formula (a display name could).
  if (/^[=+\-@]/.test(text)) text = `'${text}`;
  return /[",\r\n]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
}

/**
 * The table as CSV, one row per player, with the season shown in its own column. In All seasons
 * it also has one "Games <season>" column per season, in the order they started.
 */
export function playersCsv(report: PlayersReport): string {
  const header = [
    "Discord name",
    "First seen",
    "Last seen",
    "Games vs bot",
    "Online games",
    "Wins",
    "Losses",
    "Bot levels",
    ...(report.season === null ? report.seasons.map((s) => `Games ${s}`) : []),
    "Season",
  ];
  const lines = report.players.map((p) =>
    [
      p.name,
      iso(p.firstSeen),
      iso(p.lastSeen),
      p.botGames,
      p.onlineGames,
      p.wins,
      p.losses,
      p.botLevels.join(" "),
      ...(report.season === null
        ? report.seasons.map((s) => p.gamesBySeason[s] ?? 0)
        : []),
      report.season ?? "all",
    ]
      .map(cell)
      .join(","),
  );
  return `${[header.join(","), ...lines].join("\r\n")}\r\n`;
}

function notFound(res: ServerResponse, api: boolean): void {
  if (api) {
    res.writeHead(404, { "content-type": "application/json" });
    res.end(JSON.stringify({ error: "not-found" }));
  } else {
    res.writeHead(404, { "content-type": "text/plain; charset=utf-8" });
    res.end("Not found");
  }
}

/** Whether a path is the admin page or its API (answered 404 for anyone but an admin). */
export const isAdminPath = (path: string) =>
  path === "/admin" ||
  path.startsWith("/admin/") ||
  path === "/api/admin" ||
  path.startsWith("/api/admin/");

/**
 * The admin routes, run before the sign-in gate so a signed-out visitor gets 404 too, not the
 * sign-in page: `GET /api/admin/players?season=<name>` (JSON) and `GET /api/admin/players.csv`.
 * For an admin, the page path (`/admin/players`) is passed on to be served like any page.
 */
export function adminMiddleware({
  db,
  admins,
  playerOf,
  now = Date.now,
}: {
  db: DatabaseSync | undefined;
  admins: ReadonlySet<string>;
  playerOf: (req: IncomingMessage) => Player | null;
  now?: () => number;
}) {
  return (
    req: IncomingMessage,
    res: ServerResponse,
    next: () => void,
  ): void => {
    const url = new URL(req.url ?? "/", "http://localhost");
    const path = url.pathname;
    if (!isAdminPath(path)) {
      next();
      return;
    }
    const api = path.startsWith("/api/");
    if (!db || admins.size === 0 || !isAdmin(playerOf(req), admins)) {
      notFound(res, api);
      return;
    }
    if (!api) {
      next();
      return;
    }
    const season = url.searchParams.get("season");
    if (req.method === "GET" && path === "/api/admin/players") {
      res.writeHead(200, {
        "content-type": "application/json",
        "cache-control": "no-store",
      });
      res.end(JSON.stringify(playersReport(db, now(), season)));
      return;
    }
    if (req.method === "GET" && path === "/api/admin/players.csv") {
      const report = playersReport(db, now(), season);
      const day = new Date(now()).toISOString().slice(0, 10);
      res.writeHead(200, {
        "content-type": "text/csv; charset=utf-8",
        "cache-control": "no-store",
        "content-disposition": `attachment; filename="gojisim-players-${report.season ?? "all"}-${day}.csv"`,
      });
      res.end(playersCsv(report));
      return;
    }
    notFound(res, true);
  };
}
