import { randomInt, randomUUID } from "node:crypto";
import type { IncomingMessage, Server as HttpServer } from "node:http";
import type { DatabaseSync } from "node:sqlite";
import type { SeatId } from "@gojisim/engine";
import { Server, type Socket } from "socket.io";
import type { Player } from "../players.js";
import { resolveDeck } from "./decks.js";
import {
  abandon,
  act,
  actionsFor,
  answerUndo,
  askUndo,
  claimWin,
  concede,
  createRoom,
  historyBoard,
  joinRoom,
  phaseOf,
  pickCards,
  pickFirst,
  type Result,
  type Room,
  SEATS,
  seatMessage,
  seatOf,
  setConnected,
  stepsFor,
  sweepVerdict,
} from "./room.js";
import { loadRooms, removeRoom, saveRoom, storeRecord } from "./store.js";

/*
 * Head to head over Socket.io (M9a), on the app server's own port, path `/socket.io`. A socket
 * is a signed-in player (the session cookie, checked at the handshake) and joins one game at a
 * time. Every event is answered through its acknowledgement (`{ ok, ... }` or `{ ok: false,
 * error }`); after any change each seat's sockets get a `state` event with that seat's
 * `seatMessage` only.
 */

const MINUTE = 60_000;
/** Per account per minute, like the upload routes' limit (moves allow a fast game). */
export const LIMITS = {
  create: 10,
  join: 30,
  move: 300,
  history: 300,
} as const;
/** How often rooms are checked for abandoned and finished games. */
export const SWEEP_MS = 30_000;

export interface H2hOptions {
  db: DatabaseSync;
  /** The signed-in player of a handshake request (the session cookie), or `null`. */
  playerOf: (req: IncomingMessage) => Player | null;
  /** Saved rooms (`/data/h2h-rooms` on Railway). */
  roomsDir: string;
  /** Finished games' records go with the uploads. */
  recordsDir: string;
  now?: () => number;
  log?: (line: string) => void;
  /** Tests run the sweep by hand. */
  sweepEveryMs?: number | null;
  /** The dev server's e2e tests shorten the claim time (`H2H_CLAIM_MS`); default 5 minutes. */
  claimAfterMs?: number;
}

export interface H2h {
  io: Server;
  /** Whether `gameId` is a head to head game (uploads can't use its id). */
  isGame: (gameId: string) => boolean;
  sweep: () => Promise<void>;
  /** Rooms in memory (tests). */
  rooms: Map<string, Room>;
  /** Resolves once the saved rooms are loaded. */
  ready: Promise<void>;
  close: () => Promise<void>;
}

/** A browser's handshake from another site is refused (the cookie alone isn't enough). */
export function sameOrigin(req: IncomingMessage): boolean {
  const origin = req.headers.origin;
  const host = req.headers.host;
  if (!origin || !host) return false;
  try {
    return new URL(origin).host === host;
  } catch {
    return false;
  }
}

type Ack = (answer: object) => void;
const GAME_ID = /^[0-9a-f-]{36}$/;

export function attachH2h(
  server: HttpServer,
  {
    db,
    playerOf,
    roomsDir,
    recordsDir,
    now = Date.now,
    log = (line) => console.error(line),
    sweepEveryMs = SWEEP_MS,
    claimAfterMs,
  }: H2hOptions,
): H2h {
  const rooms = new Map<string, Room>();
  // Saved rooms come back after a restart; every event waits for them.
  const ready = loadRooms(roomsDir, now(), log).then((saved) => {
    for (const room of saved) rooms.set(room.data.gameId, room);
  });
  const io = new Server(server, {
    path: "/socket.io",
    serveClient: false,
    // Other WebSocket upgrades on the same server are left alone (the Vite dev server's own).
    destroyUpgrade: false,
    allowRequest: (req, callback) => callback(null, sameOrigin(req)),
  });
  const hits = new Map<string, number[]>();
  const allowed = (playerId: string, kind: keyof typeof LIMITS) => {
    const key = `${kind}:${playerId}`;
    const t = now();
    const recent = (hits.get(key) ?? []).filter((at) => t - at < MINUTE);
    if (recent.length >= LIMITS[kind]) return false;
    recent.push(t);
    hits.set(key, recent);
    return true;
  };

  const channel = (gameId: string, seat: SeatId) => `${gameId}:${seat}`;
  /**
   * Sends each seat its own state, with the steps after the first `from` actions (the count
   * before the change; none by default), and saves the room.
   */
  const changed = async (room: Room, from?: number) => {
    for (const seat of SEATS)
      if (room.data.seats[seat])
        io.to(channel(room.data.gameId, seat)).emit(
          "state",
          seatMessage(
            room,
            seat,
            now(),
            from === undefined ? [] : stepsFor(room, seat, from),
          ),
        );
    if (phaseOf(room) === "over") return;
    await saveRoom(roomsDir, room);
  };
  /** A game that just ended: its record goes with the uploads, then the room file goes. */
  const ended = async (room: Room) => {
    await storeRecord(recordsDir, db, room, now());
    await removeRoom(roomsDir, room.data.gameId);
  };

  const sweep = async () => {
    await ready;
    for (const room of [...rooms.values()]) {
      const verdict = sweepVerdict(room, now());
      if (verdict === "abandon") {
        abandon(room, now());
        await ended(room);
        await changed(room);
      } else if (verdict === "drop") {
        rooms.delete(room.data.gameId);
        await removeRoom(roomsDir, room.data.gameId);
      }
    }
  };
  const timer =
    sweepEveryMs === null
      ? null
      : setInterval(() => {
          sweep().catch((error: unknown) =>
            log(`GojiSim: head to head sweep failed: ${String(error)}`),
          );
        }, sweepEveryMs);
  timer?.unref();

  io.use((socket, next) => {
    const player = playerOf(socket.request);
    if (!player) {
      next(new Error("not-signed-in"));
      return;
    }
    socket.data.player = player;
    next();
  });

  io.on("connection", (socket: Socket) => {
    const player = socket.data.player as Player;
    /** The game this socket is in, and its seat. */
    let joined: { room: Room; seat: SeatId } | null = null;

    const enter = async (room: Room, seat: SeatId) => {
      if (joined) await leave();
      joined = { room, seat };
      await socket.join(channel(room.data.gameId, seat));
      setConnected(room, seat, true, now());
      await changed(room);
    };
    const leave = async () => {
      if (!joined) return;
      const { room, seat } = joined;
      joined = null;
      await socket.leave(channel(room.data.gameId, seat));
      const others = await io
        .in(channel(room.data.gameId, seat))
        .fetchSockets();
      if (others.length === 0) {
        setConnected(room, seat, false, now());
        if (rooms.has(room.data.gameId)) await changed(room);
      }
    };

    /** Runs a handler with its errors answered, never thrown (a socket error must not stop the server). */
    const on = (
      event: string,
      handler: (payload: Record<string, unknown>) => Promise<object>,
    ) => {
      socket.on(event, (payload: unknown, ack?: unknown) => {
        const reply: Ack = typeof ack === "function" ? (ack as Ack) : () => {};
        const body =
          typeof payload === "object" && payload !== null
            ? (payload as Record<string, unknown>)
            : {};
        ready
          .then(() => handler(body))
          .then(reply)
          .catch((error: unknown) => {
            log(`GojiSim: head to head ${event} failed: ${String(error)}`);
            reply({ ok: false, error: "server-error" });
          });
      });
    };
    const roomOf = (body: Record<string, unknown>) => {
      const id = body["gameId"];
      return typeof id === "string" && GAME_ID.test(id)
        ? rooms.get(id)
        : undefined;
    };
    /** The socket's own game and seat, for the in-game events. */
    const mine = (body: Record<string, unknown>) => {
      const room = roomOf(body);
      return room && joined?.room === room ? joined : null;
    };
    /** Runs a room change; a game it ends is stored once, then every seat hears of it. */
    const answer = async (room: Room, change: () => Result) => {
      const wasOver = phaseOf(room) === "over";
      const from = room.data.record?.actions.length ?? 0;
      const result = change();
      if (!result.ok) return result;
      if (!wasOver && phaseOf(room) === "over") await ended(room);
      await changed(room, from);
      return { ok: true };
    };

    on("create", async (body) => {
      if (!allowed(player.id, "create"))
        return { ok: false, error: "rate-limited" };
      const mode = body["mode"] === "tournament" ? "tournament" : "casual";
      const deck = resolveDeck(
        db,
        player.id,
        body["deck"],
        mode,
        new Date(now()),
      );
      if (!deck.ok) return deck;
      const gameId = randomUUID();
      const room = createRoom({
        gameId,
        seed: randomInt(2 ** 31),
        mode,
        creator: {
          playerId: player.id,
          name: player.displayName,
          deckName: deck.deckName,
          deck: deck.deck,
        },
        now: now(),
        ...(claimAfterMs === undefined ? {} : { claimAfterMs }),
      });
      rooms.set(gameId, room);
      await enter(room, "P1");
      return { ok: true, gameId };
    });

    /** Before joining: who invited you, and whether the game is still open. */
    on("peek", async (body) => {
      const room = roomOf(body);
      if (!room) return { ok: false, error: "no-such-game" };
      const seat = seatOf(room, player.id);
      return {
        ok: true,
        host: room.data.seats.P1?.name ?? null,
        mode: room.data.mode,
        phase: phaseOf(room),
        seat,
      };
    });

    on("join", async (body) => {
      if (!allowed(player.id, "join"))
        return { ok: false, error: "rate-limited" };
      const room = roomOf(body);
      if (!room) return { ok: false, error: "no-such-game" };
      if (seatOf(room, player.id) === null) {
        const deck = resolveDeck(
          db,
          player.id,
          body["deck"],
          room.data.mode,
          new Date(now()),
        );
        if (!deck.ok) return deck;
        const result = joinRoom(room, {
          playerId: player.id,
          name: player.displayName,
          deckName: deck.deckName,
          deck: deck.deck,
        });
        if (!result.ok) return result;
      }
      const seat = seatOf(room, player.id) as SeatId;
      await enter(room, seat);
      return { ok: true, seat, actions: actionsFor(room, seat) };
    });

    /** A refresh or a dropped connection: back into the player's own seat. */
    on("rejoin", async (body) => {
      if (!allowed(player.id, "join"))
        return { ok: false, error: "rate-limited" };
      const room = roomOf(body);
      const seat = room ? seatOf(room, player.id) : null;
      if (!room || !seat) return { ok: false, error: "no-such-game" };
      await enter(room, seat);
      return { ok: true, seat, actions: actionsFor(room, seat) };
    });

    on("leave", async () => {
      await leave();
      return { ok: true };
    });

    on("pick", async (body) => {
      const at = mine(body);
      if (!at) return { ok: false, error: "not-in-game" };
      const card = body["card"];
      if (card !== 0 && card !== 1) return { ok: false, error: "bad-card" };
      return answer(at.room, () => pickFirst(at.room, at.seat, card));
    });

    on("act", async (body) => {
      const at = mine(body);
      if (!at) return { ok: false, error: "not-in-game" };
      if (!allowed(player.id, "move"))
        return { ok: false, error: "rate-limited" };
      const seq = body["seq"];
      if (typeof seq !== "number") return { ok: false, error: "bad-action" };
      return answer(at.room, () =>
        act(at.room, at.seat, seq, body["action"], now()),
      );
    });

    /** A confirmed multi-card pick: the option ids in pick order, then Done if `done`. */
    on("pick-cards", async (body) => {
      const at = mine(body);
      if (!at) return { ok: false, error: "not-in-game" };
      if (!allowed(player.id, "move"))
        return { ok: false, error: "rate-limited" };
      const seq = body["seq"];
      if (typeof seq !== "number") return { ok: false, error: "bad-pick" };
      return answer(at.room, () =>
        pickCards(
          at.room,
          at.seat,
          seq,
          body["optionIds"],
          body["done"] === true,
          now(),
        ),
      );
    });

    on("concede", async (body) => {
      const at = mine(body);
      if (!at) return { ok: false, error: "not-in-game" };
      return answer(at.room, () => concede(at.room, at.seat, now()));
    });

    on("undo-ask", async (body) => {
      const at = mine(body);
      if (!at) return { ok: false, error: "not-in-game" };
      return answer(at.room, () => askUndo(at.room, at.seat));
    });

    on("undo-answer", async (body) => {
      const at = mine(body);
      if (!at) return { ok: false, error: "not-in-game" };
      return answer(at.room, () =>
        answerUndo(at.room, at.seat, body["accept"] === true, now()),
      );
    });

    on("claim", async (body) => {
      const at = mine(body);
      if (!at) return { ok: false, error: "not-in-game" };
      return answer(at.room, () => claimWin(at.room, at.seat, now()));
    });

    on("history", async (body) => {
      const at = mine(body);
      if (!at) return { ok: false, error: "not-in-game" };
      if (!allowed(player.id, "history"))
        return { ok: false, error: "rate-limited" };
      const model = historyBoard(at.room, at.seat, Number(body["index"]));
      return model ? { ok: true, model } : { ok: false, error: "bad-index" };
    });

    socket.on("disconnect", () => {
      leave().catch((error: unknown) =>
        log(`GojiSim: head to head leave failed: ${String(error)}`),
      );
    });
  });

  return {
    io,
    isGame: (gameId) => rooms.has(gameId.toLowerCase()),
    sweep,
    rooms,
    ready,
    close: async () => {
      if (timer) clearInterval(timer);
      await io.close();
    },
  };
}
