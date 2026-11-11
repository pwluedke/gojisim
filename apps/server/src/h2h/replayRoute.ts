import { readFile } from "node:fs/promises";
import type { IncomingMessage, ServerResponse } from "node:http";
import { join } from "node:path";
import type { DatabaseSync } from "node:sqlite";
import type { GameRecord } from "@gojisim/engine";
import { playerGame } from "../playerGames.js";
import {
  replayBoard,
  replayCache,
  replayRoom,
  replaySeat,
  replayStart,
} from "./replay.js";

/*
 * M9c: My games' Replay for a finished head to head game. The record route refuses such games
 * (#232); these routes answer from the record on the server, with only the asking player's seat:
 *
 * - `GET /api/games/<id>/replay`: `{ message, actions }`, the seat's message at the end of the
 *   game and every action as the seat knew it (the other player's hidden picks read "hidden");
 * - `GET /api/games/<id>/replay/<n>`: `{ model }`, the seat's board after `n` actions.
 *
 * A game that isn't the player's, or isn't a finished head to head game, is 404.
 */

const ROUTE = /^\/api\/games\/([0-9a-f-]{36})\/replay(?:\/(\d{1,6}))?$/;

function sendJson(res: ServerResponse, status: number, body: unknown): void {
  res.writeHead(status, {
    "content-type": "application/json",
    "cache-control": "no-store",
  });
  res.end(JSON.stringify(body));
}

export function replayMiddleware({
  db,
  recordsDir,
  playerOf,
}: {
  db: DatabaseSync;
  recordsDir: string;
  playerOf: (req: IncomingMessage) => { id: string } | null;
}) {
  const cached = replayCache();
  return async (
    req: IncomingMessage,
    res: ServerResponse,
    next: () => void,
  ): Promise<void> => {
    const path = new URL(req.url ?? "/", "http://localhost").pathname;
    const match = ROUTE.exec(path);
    if (!match || req.method !== "GET") {
      next();
      return;
    }
    const [, gameId = "", index] = match;
    const player = playerOf(req);
    const game = player ? playerGame(db, player.id, gameId) : null;
    if (!player || !game?.h2h || game.endedAt === null) {
      sendJson(res, 404, { error: "not-found" });
      return;
    }
    const text = await readFile(join(recordsDir, game.file), "utf8").catch(
      () => null,
    );
    if (!text) {
      sendJson(res, 404, { error: "not-found" });
      return;
    }
    const room = cached(gameId, () =>
      replayRoom(JSON.parse(text) as GameRecord),
    );
    const seat = replaySeat(room, player.id);
    if (!seat) {
      sendJson(res, 404, { error: "not-found" });
      return;
    }
    if (index === undefined) {
      sendJson(res, 200, replayStart(room, seat));
      return;
    }
    const model = replayBoard(room, seat, Number(index));
    if (!model) sendJson(res, 404, { error: "bad-index" });
    else sendJson(res, 200, { model });
  };
}
