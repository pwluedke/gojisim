import {
  mkdir,
  readdir,
  readFile,
  rename,
  rm,
  writeFile,
} from "node:fs/promises";
import { join, relative } from "node:path";
import type { DatabaseSync } from "node:sqlite";
import type { GameRecord } from "@gojisim/engine";
import { indexH2hGame } from "../playerGames.js";
import { type Room, type RoomData, roomFromData } from "./room.js";

/*
 * Head to head rooms on the volume (M9a). Each room's data is saved after every change to
 * `<roomsDir>/<gameId>.json` (written to a temporary file, then renamed, so a crash never leaves
 * half a file), and a restart rebuilds the rooms by replaying them: a deploy is a short
 * "reconnecting", not a lost game. A finished game's record goes with the uploads, in
 * `<recordsDir>/<day>/<gameId>.json`, so `pnpm feedback` downloads it with the rest; then the
 * room file is removed.
 */

const GAME_ID = /^[0-9a-f-]{36}$/;

/**
 * Each room's file operations run one after another (a move and a disconnect can save the same
 * room at once), so the temporary file is never shared and the last save writes the latest data.
 */
const queues = new Map<string, Promise<void>>();
function queued(gameId: string, run: () => Promise<void>): Promise<void> {
  const next = (queues.get(gameId) ?? Promise.resolve()).then(run, run);
  queues.set(gameId, next);
  void next.finally(() => {
    if (queues.get(gameId) === next) queues.delete(gameId);
  });
  return next;
}

export function saveRoom(roomsDir: string, room: Room): Promise<void> {
  const { gameId } = room.data;
  if (!GAME_ID.test(gameId))
    return Promise.reject(new Error(`Bad game id ${gameId}`));
  return queued(gameId, async () => {
    await mkdir(roomsDir, { recursive: true });
    const path = join(roomsDir, `${gameId}.json`);
    const temporary = `${path}.tmp`;
    // The data as it is now, when this save runs.
    await writeFile(temporary, JSON.stringify(room.data));
    await rename(temporary, path);
  });
}

export function removeRoom(roomsDir: string, gameId: string): Promise<void> {
  if (!GAME_ID.test(gameId)) return Promise.resolve();
  return queued(gameId, () =>
    rm(join(roomsDir, `${gameId}.json`), { force: true }),
  );
}

/** Every saved room, replayed; a file that can't be read or replayed is logged and skipped. */
export async function loadRooms(
  roomsDir: string,
  now: number,
  log: (line: string) => void = (line) => console.error(line),
): Promise<Room[]> {
  let names: string[];
  try {
    names = await readdir(roomsDir);
  } catch {
    return [];
  }
  const rooms: Room[] = [];
  for (const name of names) {
    if (!name.endsWith(".json") || !GAME_ID.test(name.slice(0, -5))) continue;
    try {
      const data = JSON.parse(
        await readFile(join(roomsDir, name), "utf8"),
      ) as RoomData;
      if (data.version !== 1)
        throw new Error(`version ${String(data.version)}`);
      rooms.push(roomFromData(data, now));
    } catch (error) {
      log(
        `GojiSim: head to head room ${name} could not be loaded (${error instanceof Error ? error.message : String(error)}); it stays on disk.`,
      );
    }
  }
  return rooms;
}

/**
 * A finished (or abandoned) game's record, written once with the uploads, and its two `games`
 * rows (one per player). Returns the record's path under `recordsDir`.
 */
export async function storeRecord(
  recordsDir: string,
  db: DatabaseSync,
  room: Room,
  now: number,
): Promise<string> {
  const record = room.data.record as GameRecord;
  const { P1, P2 } = room.data.seats;
  if (!P1 || !P2) throw new Error("A head to head record needs both seats");
  const day = new Date(now).toISOString().slice(0, 10);
  await mkdir(join(recordsDir, day), { recursive: true });
  const path = join(recordsDir, day, `${room.data.gameId}.json`);
  await writeFile(path, JSON.stringify(record));
  const file = relative(recordsDir, path);
  indexH2hGame(
    db,
    {
      gameId: room.data.gameId,
      file,
      players: { P1: P1.playerId, P2: P2.playerId },
      winner: record.outcome?.winner ?? null,
      abandoned: record.h2hEnd === "abandoned",
      deckNames: `${P1.deckName} vs ${P2.deckName}`,
      startedAt: room.data.createdAt,
    },
    now,
  );
  return file;
}
