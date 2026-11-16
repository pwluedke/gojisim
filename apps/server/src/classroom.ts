import { mkdir, readFile, rename, writeFile } from "node:fs/promises";
import type { IncomingMessage, ServerResponse } from "node:http";
import { join } from "node:path";
import { agreementRows, type ClassroomPoint } from "@gojisim/cards/results";

/*
 * #365 Kaiju Classroom: the `/results` agreement chart's data. Each uploaded game record with rated
 * Classroom turns leaves one entry per game in `<resultsDir>/classroom.json` (replaced when the
 * game uploads again), holding only the day, the bot's deck name, the bot version and how each
 * turn compared. `GET /api/results/classroom` answers the rows by day, deck and version, behind
 * the site sign-in like `/api/results`.
 */

type Json = Record<string, unknown>;
const obj = (v: unknown): Json | null =>
  typeof v === "object" && v !== null && !Array.isArray(v) ? (v as Json) : null;

const RATINGS = ["same", "aboutSame", "worse", "better"] as const;

/** A record's rated Classroom turns as points, or none (no Classroom, nothing rated). */
export function classroomPoints(record: unknown): ClassroomPoint[] {
  const r = obj(record);
  if (!r || r["classroom"] !== true || !Array.isArray(r["classroomTurns"]))
    return [];
  const names = obj(r["deckNames"]) ?? {};
  const points: ClassroomPoint[] = [];
  for (const t of r["classroomTurns"]) {
    const turn = obj(t);
    if (!turn) continue;
    const rating = turn["rating"];
    if (!RATINGS.includes(rating as (typeof RATINGS)[number])) continue;
    const at = typeof turn["at"] === "string" ? turn["at"] : "";
    if (!/^\d{4}-\d{2}-\d{2}/.test(at)) continue;
    const seat = turn["player"];
    const deck =
      typeof seat === "string" && typeof names[seat] === "string"
        ? (names[seat] as string)
        : "Mystery Deck";
    points.push({
      date: at.slice(0, 10),
      deck,
      botVersion:
        typeof turn["botVersion"] === "string" ? turn["botVersion"] : "unknown",
      same: turn["same"] === true,
      rating: rating as ClassroomPoint["rating"],
    });
  }
  return points;
}

interface Stored {
  games: Record<string, ClassroomPoint[]>;
}

async function readStored(dir: string): Promise<Stored> {
  try {
    const data = JSON.parse(
      await readFile(join(dir, "classroom.json"), "utf8"),
    ) as Partial<Stored>;
    return { games: obj(data.games) ? (data.games as Stored["games"]) : {} };
  } catch {
    return { games: {} };
  }
}

/**
 * The store: `record` (an uploaded game, stored as `file`) updates its game's points, one write
 * at a time. A record without rated Classroom turns changes nothing.
 */
export function classroomStore(dir: string) {
  let queue: Promise<unknown> = Promise.resolve();
  const onStored = (record: unknown, file: string): Promise<void> => {
    const points = classroomPoints(record);
    if (points.length === 0) return Promise.resolve();
    const id =
      typeof obj(record)?.["gameId"] === "string"
        ? (obj(record)?.["gameId"] as string)
        : file;
    const done = queue.then(async () => {
      const stored = await readStored(dir);
      stored.games[id] = points;
      await mkdir(dir, { recursive: true });
      const path = join(dir, "classroom.json");
      // Written whole, then renamed over the old file: a reader never sees half a file.
      await writeFile(`${path}.tmp`, JSON.stringify(stored));
      await rename(`${path}.tmp`, path);
    });
    queue = done.catch(() => undefined);
    return done;
  };
  const middleware = async (
    req: IncomingMessage,
    res: ServerResponse,
    next: () => void,
  ): Promise<void> => {
    const path = new URL(req.url ?? "/", "http://localhost").pathname;
    if (path !== "/api/results/classroom" || req.method !== "GET") {
      next();
      return;
    }
    const stored = await readStored(dir);
    res.writeHead(200, {
      "content-type": "application/json",
      "cache-control": "no-store",
    });
    res.end(
      JSON.stringify({
        rows: agreementRows(Object.values(stored.games).flat()),
      }),
    );
  };
  return { onStored, middleware };
}
