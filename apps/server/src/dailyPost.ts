import type { DatabaseSync } from "node:sqlite";
import { playersReport } from "./admin.js";
import { BETA } from "./seasons.js";

/*
 * #235: the daily players post to #gojisim-dev, at 8:00 am Central: the totals, and the players
 * new since the last post (names only). It goes to the Slack webhook in `SLACK_DEV_WEBHOOK_URL`;
 * without one, nothing is posted and nothing is logged. The URL is never logged or posted.
 * Each Central day posts once (`daily_posts`): the server checks every minute, so a restart
 * after 8:00 posts that day's (once), and never twice.
 */

export const POST_HOUR = 8;
export const POST_ZONE = "America/Chicago";
const DAY = 24 * 60 * 60_000;

/** The Central date ("2026-11-12") and hour at `now`. */
export function centralTime(now: number): { day: string; hour: number } {
  const parts = Object.fromEntries(
    new Intl.DateTimeFormat("en-CA", {
      timeZone: POST_ZONE,
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      hourCycle: "h23",
    })
      .formatToParts(new Date(now))
      .map((p) => [p.type, p.value]),
  );
  return {
    day: `${parts["year"]}-${parts["month"]}-${parts["day"]}`,
    hour: Number(parts["hour"]),
  };
}

/** When the last post went out, or `null` before the first. */
function lastPostedAt(db: DatabaseSync): number | null {
  const row = db
    .prepare(
      "SELECT posted_at FROM daily_posts ORDER BY posted_at DESC LIMIT 1",
    )
    .get() as { posted_at: number } | undefined;
  return row?.posted_at ?? null;
}

/** The post's text: totals (beta apart), and new players since `since` (names only). */
export function dailyPostText(
  db: DatabaseSync,
  now: number,
  since: number,
): string {
  const report = playersReport(db, now, null);
  const { players, games, gamesLast7Days, gamesBySeason } = report.totals;
  const beta = gamesBySeason[BETA] ?? 0;
  const newPlayers = (
    db
      .prepare(
        "SELECT display_name AS name FROM players WHERE discord_id IS NOT NULL AND created_at > ? ORDER BY created_at",
      )
      .all(since) as { name: string }[]
  ).map((p) => p.name);
  const lines = [
    `GojiSim players, ${centralTime(now).day}: ${players} players · ${games} games${beta && beta !== games ? ` (beta ${beta})` : ""} · ${gamesLast7Days} in the last 7 days`,
    newPlayers.length > 0
      ? `New since the last post (${newPlayers.length}): ${newPlayers.join(", ")}`
      : "No new players since the last post.",
  ];
  return lines.join("\n");
}

export type PostResult =
  "posted" | "no-webhook" | "not-yet" | "done-today" | "failed";

/**
 * One check: posts if it's 8:00 Central or later and today hasn't posted yet. A failed post
 * still marks the day (no retry every minute); the log says it failed, never the URL.
 */
export async function dailyPostTick({
  db,
  webhook,
  now,
  fetchImpl = fetch,
  log = (line) => console.error(line),
}: {
  db: DatabaseSync;
  webhook: string | undefined;
  now: number;
  fetchImpl?: typeof fetch;
  log?: (line: string) => void;
}): Promise<PostResult> {
  if (!webhook) return "no-webhook";
  const { day, hour } = centralTime(now);
  if (hour < POST_HOUR) return "not-yet";
  const done = db.prepare("SELECT 1 FROM daily_posts WHERE day = ?").get(day);
  if (done) return "done-today";
  const since = lastPostedAt(db) ?? now - DAY;
  const text = dailyPostText(db, now, since);
  db.prepare("INSERT INTO daily_posts (day, posted_at) VALUES (?, ?)").run(
    day,
    now,
  );
  try {
    const res = await fetchImpl(webhook, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ text }),
    });
    if (!res.ok) {
      log(
        `GojiSim: the daily players post failed (Slack answered ${res.status}).`,
      );
      return "failed";
    }
    return "posted";
  } catch {
    log("GojiSim: the daily players post failed (Slack unreachable).");
    return "failed";
  }
}

/** Checks every minute; returns a stop function. */
export function startDailyPost(options: {
  db: DatabaseSync;
  webhook: string | undefined;
  now?: () => number;
  fetchImpl?: typeof fetch;
}): () => void {
  if (!options.webhook) return () => {};
  const now = options.now ?? Date.now;
  const tick = () => {
    void dailyPostTick({ ...options, now: now() }).catch(() => {
      // dailyPostTick logs its own failures.
    });
  };
  const timer = setInterval(tick, 60_000);
  timer.unref();
  tick();
  return () => clearInterval(timer);
}
