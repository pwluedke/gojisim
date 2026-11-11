import { existsSync, mkdtempSync, readdirSync, readFileSync } from "node:fs";
import { createServer, type Server as HttpServer } from "node:http";
import type { AddressInfo } from "node:net";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { DatabaseSync } from "node:sqlite";
import type { Action } from "@gojisim/engine";
import { io as connect, type Socket } from "socket.io-client";
import { afterEach, describe, expect, it } from "vitest";
import { openDb } from "../db/db.js";
import { playerById } from "../players.js";
import { CLAIM_AFTER_MS } from "./room.js";
import type { SeatMessage } from "./room.js";
import { attachH2h, type H2h, LIMITS } from "./socket.js";
import { saveRoom } from "./store.js";

/*
 * The head to head socket (M9a) end to end: two signed-in clients over a real Socket.io
 * connection. Sign-in is faked by a `player=<id>` cookie (the app server reads the signed session
 * cookie instead, `cookiePlayer`).
 */

const quiet = () => {};
let open: { server: HttpServer; h2h: H2h; sockets: Socket[] }[] = [];

function database(): DatabaseSync {
  const db = openDb(":memory:", { log: quiet });
  db.exec(`INSERT INTO players (id, display_name, created_at, last_seen_at)
    VALUES ('alice', 'Alice', 0, 0), ('bob', 'Bob', 0, 0), ('carol', 'Carol', 0, 0)`);
  return db;
}

async function start(
  dirs = {
    roomsDir: mkdtempSync(join(tmpdir(), "gojisim-rooms-")),
    recordsDir: mkdtempSync(join(tmpdir(), "gojisim-records-")),
  },
  db = database(),
  clock = { t: 1_000_000 },
) {
  const server = createServer();
  const h2h = attachH2h(server, {
    db,
    playerOf: (req) => {
      const id = /player=(\w+)/.exec(req.headers.cookie ?? "")?.[1];
      return id ? playerById(db, id) : null;
    },
    ...dirs,
    now: () => clock.t,
    log: quiet,
    sweepEveryMs: null,
  });
  await new Promise<void>((done) => server.listen(0, done));
  const port = (server.address() as AddressInfo).port;
  const entry = { server, h2h, sockets: [] as Socket[] };
  open.push(entry);
  const client = (
    player: string | null,
    origin = `http://localhost:${port}`,
  ) => {
    const socket = connect(`http://localhost:${port}`, {
      transports: ["websocket"],
      reconnection: false,
      extraHeaders: {
        origin,
        ...(player ? { cookie: `player=${player}` } : {}),
      },
    });
    entry.sockets.push(socket);
    return socket;
  };
  await h2h.ready;
  return { h2h, client, dirs, db, clock, port };
}

afterEach(async () => {
  for (const { h2h, sockets } of open) {
    for (const s of sockets) s.disconnect();
    await h2h.close();
  }
  open = [];
});

const ask = (socket: Socket, event: string, payload: object = {}) =>
  socket.emitWithAck(event, payload) as Promise<Record<string, unknown>>;

/** The next `state` event that passes `test`. */
const nextState = (
  socket: Socket,
  test: (m: SeatMessage) => boolean = () => true,
) =>
  new Promise<SeatMessage>((resolve) => {
    const on = (m: SeatMessage) => {
      if (!test(m)) return;
      socket.off("state", on);
      resolve(m);
    };
    socket.on("state", on);
  });

const connected = (socket: Socket) =>
  new Promise<void>((resolve, reject) => {
    socket.on("connect", () => resolve());
    socket.on("connect_error", reject);
  });

const ESD01 = { source: "official", set: "ESD01" };
const ESD02 = { source: "official", set: "ESD02" };

/** Alice creates, Bob joins, the picker picks: both are in a running game. */
async function running(client: (p: string) => Socket, mode = "casual") {
  const alice = client("alice");
  const bob = client("bob");
  await Promise.all([connected(alice), connected(bob)]);
  const made = await ask(alice, "create", { mode, deck: ESD01 });
  expect(made.ok).toBe(true);
  const gameId = made["gameId"] as string;
  const peek = await ask(bob, "peek", { gameId });
  expect(peek).toMatchObject({
    ok: true,
    host: "Alice",
    mode,
    phase: "waiting",
    seat: null,
  });
  const picking = nextState(alice, (m) => m.phase === "picking");
  expect(await ask(bob, "join", { gameId, deck: ESD02 })).toMatchObject({
    ok: true,
    seat: "P2",
  });
  const { picker } = await picking;
  const playing = [
    nextState(alice, (m) => m.phase === "playing"),
    nextState(bob, (m) => m.phase === "playing"),
  ];
  const pickerSocket = picker === "P1" ? alice : bob;
  expect(await ask(pickerSocket, "pick", { gameId, card: 0 })).toEqual({
    ok: true,
  });
  const [a, b] = await Promise.all(playing);
  return {
    alice,
    bob,
    gameId,
    states: { P1: a as SeatMessage, P2: b as SeatMessage },
  };
}

const moveOf = (m: SeatMessage): Action | undefined =>
  m.legal.find((a) => a.type !== "concede");

describe("head to head over Socket.io (M9a)", () => {
  it("a signed-out socket, or one from another site, is refused", async () => {
    const { client, port } = await start();
    await expect(connected(client(null))).rejects.toThrow("not-signed-in");
    await expect(
      connected(client("alice", "https://evil.example")),
    ).rejects.toThrow();
    // The same origin works.
    await connected(client("alice", `http://localhost:${port}`));
  });

  it("create, join, pick, play: each seat sees only its own board; the game ends in a record and two My games rows", async () => {
    const { client, dirs, db } = await start();
    const { alice, bob, gameId, states } = await running(client);
    expect(states.P1.you).toBe("P1");
    expect(states.P2.you).toBe("P2");
    expect(states.P1.opponent).toMatchObject({
      name: "Bob",
      connected: true,
      deckName: null,
    });
    // Hidden cards: P1's message has none of P2's hand, and the other way round.
    const p2Hand =
      states.P2.model?.view.players.find((p) => p.id === "P2")?.hand.cards ??
      [];
    expect(p2Hand.length).toBeGreaterThan(0);
    const p1Text = JSON.stringify(states.P1);
    for (const card of p2Hand)
      expect(p1Text).not.toContain(`"${card.instanceId}"`);
    expect(p1Text).not.toContain(`"seed"`);

    // The deciding seat moves; a stale repeat is refused.
    const mover = states.P1.legal.some((a) => a.type !== "concede")
      ? "P1"
      : "P2";
    const socket = mover === "P1" ? alice : bob;
    const action = moveOf(states[mover]) as Action;
    const seq = states[mover].seq;
    const seen = nextState(
      mover === "P1" ? bob : alice,
      (m) => m.seq === seq + 1,
    );
    expect(await ask(socket, "act", { gameId, seq, action })).toEqual({
      ok: true,
    });
    await seen;
    expect(await ask(socket, "act", { gameId, seq, action })).toEqual({
      ok: false,
      error: "stale",
    });
    // The other player can't move for them.
    const other = mover === "P1" ? bob : alice;
    expect(
      (await ask(other, "act", { gameId, seq: seq + 1, action }))["ok"],
    ).toBe(false);

    const over = nextState(alice, (m) => m.phase === "over");
    expect(await ask(bob, "concede", { gameId })).toEqual({ ok: true });
    const end = await over;
    expect(end.outcome?.winner).toBe("P1");
    expect(end.opponent?.deckName).toBe("ESD02 official");

    const day = readdirSync(dirs.recordsDir)[0] as string;
    const record = JSON.parse(
      readFileSync(join(dirs.recordsDir, day, `${gameId}.json`), "utf8"),
    );
    expect(record).toMatchObject({
      h2h: true,
      gameId,
      seats: {
        P1: { kind: "human", playerId: "alice" },
        P2: { kind: "human", playerId: "bob" },
      },
      outcome: { winner: "P1" },
    });
    expect(record.botSeed).toBeUndefined();
    expect(
      db
        .prepare(
          "SELECT player_id, result, h2h FROM games WHERE game_id = ? ORDER BY player_id",
        )
        .all(gameId),
    ).toEqual([
      { player_id: "alice", result: "win", h2h: 1 },
      { player_id: "bob", result: "loss", h2h: 1 },
    ]);
    // The room file is gone once the record is written.
    expect(existsSync(join(dirs.roomsDir, `${gameId}.json`))).toBe(false);
  });

  it("a third player can't join a full game, and only the players get its moves", async () => {
    const { client } = await start();
    const { gameId } = await running(client);
    const carol = client("carol");
    await connected(carol);
    expect(await ask(carol, "join", { gameId, deck: ESD01 })).toEqual({
      ok: false,
      error: "full",
    });
    expect(await ask(carol, "rejoin", { gameId })).toEqual({
      ok: false,
      error: "no-such-game",
    });
    expect(await ask(carol, "concede", { gameId })).toEqual({
      ok: false,
      error: "not-in-game",
    });
    expect(await ask(carol, "peek", { gameId: "not-an-id" })).toEqual({
      ok: false,
      error: "no-such-game",
    });
  });

  it("a refresh rejoins the same seat; the other player sees them gone, then back", async () => {
    const { client } = await start();
    const { alice, bob, gameId } = await running(client);
    const gone = nextState(alice, (m) => m.opponent?.connected === false);
    bob.disconnect();
    await gone;
    const back = client("bob");
    await connected(back);
    const returned = nextState(alice, (m) => m.opponent?.connected === true);
    expect(await ask(back, "rejoin", { gameId })).toMatchObject({
      ok: true,
      seat: "P2",
    });
    await returned;
  });

  it("after a restart the room is replayed from disk and both players rejoin where they were", async () => {
    const first = await start();
    const { alice, bob, gameId, states } = await running(first.client);
    const mover = states.P1.legal.some((a) => a.type !== "concede")
      ? "P1"
      : "P2";
    const socket = mover === "P1" ? alice : bob;
    expect(
      await ask(socket, "act", {
        gameId,
        seq: states[mover].seq,
        action: moveOf(states[mover]),
      }),
    ).toEqual({ ok: true });
    const seq = states[mover].seq + 1;
    // The deploy: the old server goes away.
    for (const s of open[0]?.sockets ?? []) s.disconnect();
    await first.h2h.close();
    open = [];

    const second = await start(first.dirs, first.db);
    expect(second.h2h.rooms.has(gameId)).toBe(true);
    const again = second.client("alice");
    await connected(again);
    const state = nextState(again);
    expect(await ask(again, "rejoin", { gameId })).toMatchObject({
      ok: true,
      seat: "P1",
    });
    expect((await state).seq).toBe(seq);
  });

  it("undo by agreement in a Casual game: the asker asks, the other player says yes", async () => {
    const { client } = await start();
    const { alice, bob, gameId, states } = await running(client, "casual");
    let latest = states;
    const sockets = { P1: alice, P2: bob };
    // Play until someone may ask to undo their last action.
    for (let i = 0; i < 200; i++) {
      const asker = (["P1", "P2"] as const).find((s) => latest[s].undo.canAsk);
      if (asker) {
        const answerer = asker === "P1" ? "P2" : "P1";
        const before = latest[asker].seq;
        const asked = nextState(
          sockets[answerer],
          (m) => m.undo.asked === asker,
        );
        expect(await ask(sockets[asker], "undo-ask", { gameId })).toEqual({
          ok: true,
        });
        await asked;
        const undone = nextState(sockets[asker], (m) => m.seq === before - 1);
        expect(
          await ask(sockets[answerer], "undo-answer", { gameId, accept: true }),
        ).toEqual({ ok: true });
        await undone;
        return;
      }
      const mover = (["P1", "P2"] as const).find((s) => moveOf(latest[s])) as
        "P1" | "P2";
      const seq = latest[mover].seq;
      const next = [
        nextState(alice, (m) => m.seq === seq + 1),
        nextState(bob, (m) => m.seq === seq + 1),
      ];
      expect(
        await ask(sockets[mover], "act", {
          gameId,
          seq,
          action: moveOf(latest[mover]),
        }),
      ).toEqual({ ok: true });
      const [a, b] = await Promise.all(next);
      latest = { P1: a as SeatMessage, P2: b as SeatMessage };
    }
    throw new Error("No undoable action came up");
  });

  it("the history view sends that seat's past board", async () => {
    const { client } = await start();
    const { alice, gameId } = await running(client);
    const past = await ask(alice, "history", { gameId, index: 0 });
    expect(past["ok"]).toBe(true);
    expect((past["model"] as { bottom: string }).bottom).toBe("P1");
    expect(await ask(alice, "history", { gameId, index: 9999 })).toEqual({
      ok: false,
      error: "bad-index",
    });
  });

  it("a player gone 5 minutes lets the other claim the win", async () => {
    const { client, clock } = await start();
    const { alice, bob, gameId } = await running(client);
    const gone = nextState(alice, (m) => m.opponent?.connected === false);
    bob.disconnect();
    await gone;
    expect(await ask(alice, "claim", { gameId })).toEqual({
      ok: false,
      error: "no-claim",
    });
    clock.t += CLAIM_AFTER_MS;
    const over = nextState(alice, (m) => m.phase === "over");
    expect(await ask(alice, "claim", { gameId })).toEqual({ ok: true });
    expect((await over).h2hEnd).toBe("claimed");
  });

  it("both gone 30 minutes: the sweep abandons the game and keeps its record", async () => {
    const { client, clock, dirs, h2h, db } = await start();
    const { alice, bob, gameId } = await running(client);
    alice.disconnect();
    bob.disconnect();
    await new Promise((r) => setTimeout(r, 50));
    clock.t += 30 * 60_000;
    await h2h.sweep();
    const day = readdirSync(dirs.recordsDir)[0] as string;
    const record = JSON.parse(
      readFileSync(join(dirs.recordsDir, day, `${gameId}.json`), "utf8"),
    );
    expect(record.h2hEnd).toBe("abandoned");
    expect(record.outcome).toEqual({ winner: null, reason: "abandoned" });
    expect(
      db
        .prepare(
          "SELECT COUNT(*) AS n FROM games WHERE game_id = ? AND result IS NULL",
        )
        .get(gameId),
    ).toEqual({ n: 2 });
  });

  it("creating games is rate limited per account", async () => {
    const { client } = await start();
    const alice = client("alice");
    await connected(alice);
    for (let i = 0; i < LIMITS.create; i++)
      expect((await ask(alice, "create", { deck: ESD01 }))["ok"]).toBe(true);
    expect(await ask(alice, "create", { deck: ESD01 })).toEqual({
      ok: false,
      error: "rate-limited",
    });
  });

  it("a deck must be the player's own My decks deck or a starter; Tournament takes legal decks only", async () => {
    const { client, db } = await start();
    db.prepare(
      "INSERT INTO player_decks (player_id, deck_id, name, list, updated_at, deleted) VALUES ('bob', 'b1', 'Bob deck', 'not a deck list', '2026-11-10T00:00:00Z', 0)",
    ).run();
    const alice = client("alice");
    await connected(alice);
    expect(
      await ask(alice, "create", { deck: { source: "mine", id: "b1" } }),
    ).toEqual({ ok: false, error: "no-such-deck" });
    expect(
      await ask(alice, "create", { deck: { source: "elsewhere" } }),
    ).toEqual({ ok: false, error: "bad-deck" });
    expect(
      (await ask(alice, "create", { mode: "tournament", deck: ESD01 }))["ok"],
    ).toBe(true);
  });

  it("M9b: saves of one room at once never fail, and the file holds the latest data", async () => {
    const { client, dirs, h2h } = await start();
    const alice = client("alice");
    await connected(alice);
    const { gameId } = (await ask(alice, "create", { deck: ESD01 })) as {
      gameId: string;
    };
    const room = h2h.rooms.get(gameId);
    if (!room) throw new Error("no room");
    await Promise.all(
      Array.from({ length: 20 }, (_, i) => {
        room.data.seed = i;
        return saveRoom(dirs.roomsDir, room);
      }),
    );
    const saved = JSON.parse(
      readFileSync(join(dirs.roomsDir, `${gameId}.json`), "utf8"),
    );
    expect(saved.seed).toBe(19);
  });
});
