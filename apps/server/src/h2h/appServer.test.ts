import { mkdtempSync, writeFileSync } from "node:fs";
import type { AddressInfo } from "node:net";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { io as connect, type Socket } from "socket.io-client";
import { afterEach, describe, expect, it } from "vitest";
import { openDb } from "../db/db.js";
import { playerSessionValue } from "../discordAuth.js";
import { COOKIE } from "../gate.js";
import { createAppServer } from "../index.js";
import { indexH2hGame } from "../playerGames.js";
import type { BoardModel, GameState } from "@gojisim/engine";
import { getLegalActions } from "@gojisim/engine";
import { resolveDeck } from "./decks.js";
import {
  act,
  actionsFor,
  concede,
  createRoom,
  joinRoom,
  pickFirst,
  type SeatMessage,
  setConnected,
} from "./room.js";
import { storeRecord } from "./store.js";
import {
  SMOKE_PLAYER_ID,
  smokePlayer,
  upsertDiscordPlayer,
} from "../players.js";

/*
 * M9a in the app server: head to head is on with Discord sign-in, on the same port, signed in by
 * the same session cookie; uploads can't take a head to head game's id.
 */

const SECRET = "s".repeat(40);
const NOW = Date.UTC(2026, 10, 11, 4);
const dist = mkdtempSync(join(tmpdir(), "gojisim-dist-"));
writeFileSync(join(dist, "index.html"), "<title>GojiSim</title>");

let cleanup: (() => void)[] = [];
afterEach(() => {
  for (const done of cleanup) done();
  cleanup = [];
});

async function serve() {
  const db = openDb(":memory:", { log: () => {} });
  const recordsDir = mkdtempSync(join(tmpdir(), "gojisim-records-"));
  const server = createAppServer({
    distDir: dist,
    cardsDir: dist,
    recordsDir,
    roomsDir: mkdtempSync(join(tmpdir(), "gojisim-rooms-")),
    secret: SECRET,
    discord: {
      db,
      clientId: "c",
      clientSecret: "s",
      guildId: "g",
      testerRoleId: "r",
      redirectUri: "https://x/cb",
    },
    now: () => NOW,
  });
  await new Promise<void>((r) => server.listen(0, r));
  const { port } = server.address() as AddressInfo;
  const sockets: Socket[] = [];
  cleanup.push(() => {
    for (const s of sockets) s.disconnect();
    server.close();
  });
  const cookieOf = (playerId: string) =>
    `${COOKIE}=${playerSessionValue(SECRET, playerId, NOW + 86_400_000)}`;
  const socket = (cookie: string | null) => {
    const s = connect(`http://localhost:${port}`, {
      transports: ["websocket"],
      reconnection: false,
      extraHeaders: {
        origin: `http://localhost:${port}`,
        ...(cookie ? { cookie } : {}),
      },
    });
    sockets.push(s);
    return new Promise<Socket>((resolve, reject) => {
      s.on("connect", () => resolve(s));
      s.on("connect_error", reject);
    });
  };
  const player = (name: string, discordId: string) =>
    upsertDiscordPlayer(
      db,
      { discordId, displayName: name, avatarUrl: null },
      NOW,
    );
  const upload = (cookie: string, body: unknown) =>
    fetch(`http://localhost:${port}/api/games`, {
      method: "POST",
      body: JSON.stringify(body),
      headers: { cookie, "x-real-ip": "198.51.100.7" },
    });
  const get = (path: string, cookie?: string) =>
    fetch(`http://localhost:${port}${path}`, {
      redirect: "manual",
      headers: cookie ? { cookie } : {},
    });
  return { db, socket, cookieOf, player, upload, get, recordsDir };
}

const record = (gameId: string) => ({
  version: 1,
  seed: 7,
  gameId,
  decks: [
    { id: "P1", monsterDeck: [], mainDeck: [] },
    { id: "P2", monsterDeck: [], mainDeck: [] },
  ],
  actions: [],
  seats: {
    P1: { kind: "human" },
    P2: { kind: "bot", bot: "ismcts", settings: {} },
  },
});

describe("head to head in the app server (M9a)", () => {
  it("a signed-in player's session cookie opens a socket; no cookie, a forged one or the smoke player's doesn't", async () => {
    const { socket, cookieOf, player, db } = await serve();
    const ann = player("Ann", "1");
    const s = await socket(cookieOf(ann.id));
    const made = (await s.emitWithAck("create", {
      deck: { source: "official", set: "ESD01" },
    })) as { ok: boolean };
    expect(made.ok).toBe(true);
    await expect(socket(null)).rejects.toThrow("not-signed-in");
    await expect(socket(`${COOKIE}=1.YW5u.forged`)).rejects.toThrow(
      "not-signed-in",
    );
    smokePlayer(db, NOW);
    await expect(socket(cookieOf(SMOKE_PLAYER_ID))).rejects.toThrow(
      "not-signed-in",
    );
  });

  it("an upload can't take a live head to head game's id, nor a finished one's", async () => {
    const { socket, cookieOf, player, upload, db } = await serve();
    const ann = player("Ann", "1");
    const bo = player("Bo", "2");
    const s = await socket(cookieOf(ann.id));
    const { gameId } = (await s.emitWithAck("create", {
      deck: { source: "official", set: "ESD01" },
    })) as { gameId: string };
    const live = await upload(cookieOf(ann.id), record(gameId));
    expect(live.status).toBe(403);
    expect(await live.json()).toEqual({ error: "h2h-game" });

    const finished = "33333333-2222-4333-8444-555555555555";
    indexH2hGame(
      db,
      {
        gameId: finished,
        file: "2026-11-11/x.json",
        players: { P1: ann.id, P2: bo.id },
        winner: "P1",
        abandoned: false,
        deckNames: "A vs B",
        startedAt: NOW,
      },
      NOW,
    );
    expect((await upload(cookieOf(bo.id), record(finished))).status).toBe(403);
  });

  it("the dev sign-in's /auth/dev?as=<name> doesn't exist here: no cookie, no player", async () => {
    const { get } = await serve();
    const res = await get("/auth/dev?as=Bob&next=%2F");
    expect(res.headers.get("set-cookie") ?? "").not.toContain(
      "gojisim_dev_player",
    );
    expect((await get("/api/me", "gojisim_dev_player=Bob")).status).not.toBe(
      200,
    );
  });

  it("neither player can load a finished head to head game's record (it holds the other's deck, Q42); My games lists it", async () => {
    const { cookieOf, player, db, get } = await serve();
    const ann = player("Ann", "1");
    const bo = player("Bo", "2");
    const gameId = "44444444-2222-4333-8444-555555555555";
    indexH2hGame(
      db,
      {
        gameId,
        file: "2026-11-11/x.json",
        players: { P1: ann.id, P2: bo.id },
        winner: "P2",
        abandoned: false,
        deckNames: "A vs B",
        startedAt: NOW,
      },
      NOW,
    );
    for (const who of [ann, bo]) {
      const res = await get(`/api/games/${gameId}`, cookieOf(who.id));
      expect(res.status).toBe(404);
      expect(await res.json()).toEqual({ error: "h2h-record" });
      const mine = (await (
        await get("/api/games/mine", cookieOf(who.id))
      ).json()) as {
        games: { gameId: string; h2h: boolean; result: string }[];
      };
      expect(mine.games).toEqual([
        expect.objectContaining({
          gameId,
          h2h: true,
          result: who === ann ? "loss" : "win",
        }),
      ]);
    }
  });

  it("M9c: Replay sends each player only their own seat of a finished online game; nobody else gets it", async () => {
    const { cookieOf, player, db, get, recordsDir } = await serve();
    const ann = player("Ann", "1");
    const bo = player("Bo", "2");
    const carol = player("Carol", "3");
    // A real finished game, stored as the server stores one.
    const deck = (set: "ESD01" | "ESD02") => {
      const found = resolveDeck(
        db,
        "x",
        { source: "official", set },
        "casual",
        new Date(NOW),
      );
      if (!found.ok) throw new Error(found.error);
      return found.deck;
    };
    const gameId = "55555555-2222-4333-8444-555555555555";
    const room = createRoom({
      gameId,
      seed: 9,
      mode: "casual",
      creator: {
        playerId: ann.id,
        name: "Ann",
        deckName: "Ann deck",
        deck: deck("ESD01"),
      },
      now: NOW,
    });
    joinRoom(
      room,
      { playerId: bo.id, name: "Bo", deckName: "Bo deck", deck: deck("ESD02") },
      () => "P1",
    );
    setConnected(room, "P1", true, NOW);
    pickFirst(room, "P1", 0, NOW);
    for (let i = 0; i < 30; i++) {
      const state = room.states.at(-1) as GameState;
      const who = (state.pendingChoice?.player ?? state.turnPlayer) as
        "P1" | "P2";
      const move = getLegalActions(state, who).find(
        (a) => a.type !== "concede",
      );
      act(room, who, room.data.record?.actions.length ?? 0, move, NOW);
    }
    concede(room, "P2", NOW);
    await storeRecord(recordsDir, db, room, NOW);
    const n = room.data.record?.actions.length ?? 0;

    for (const [who, seat] of [
      [ann, "P1"],
      [bo, "P2"],
    ] as const) {
      const res = await get(`/api/games/${gameId}/replay`, cookieOf(who.id));
      expect(res.status).toBe(200);
      const body = (await res.json()) as {
        message: SeatMessage;
        actions: unknown[];
      };
      expect(body.message.you).toBe(seat);
      expect(body.message.phase).toBe("over");
      expect(body.message.model?.bottom).toBe(seat);
      expect(body.actions).toHaveLength(n);
      expect(body.actions).toEqual(actionsFor(room, seat));
      // Nothing of the other player's hidden cards: their hand at the end isn't in the start, and
      // their hand after 10 actions isn't in that board (a card played later is public by then).
      const other = seat === "P1" ? "P2" : "P1";
      const text = JSON.stringify(body);
      const handAt = (i: number) =>
        (room.states[i] as GameState).players.find((p) => p.id === other)
          ?.hand ?? [];
      expect(handAt(n).length).toBeGreaterThan(0);
      for (const card of handAt(n))
        expect(text).not.toContain(`"${card.instanceId}"`);
      const past = await get(
        `/api/games/${gameId}/replay/10`,
        cookieOf(who.id),
      );
      const board = ((await past.json()) as { model: BoardModel }).model;
      expect(board.bottom).toBe(seat);
      expect(board.view.turn).toBe((room.states[10] as GameState).turn);
      for (const card of (room.states[10] as GameState).players.find(
        (p) => p.id === other,
      )?.hand ?? [])
        expect(JSON.stringify(board)).not.toContain(`"${card.instanceId}"`);
      expect(
        (await get(`/api/games/${gameId}/replay/99999`, cookieOf(who.id)))
          .status,
      ).toBe(404);
    }
    // Not Carol's game; and the record route still refuses it (#232).
    expect(
      (await get(`/api/games/${gameId}/replay`, cookieOf(carol.id))).status,
    ).toBe(404);
    expect((await get(`/api/games/${gameId}`, cookieOf(ann.id))).status).toBe(
      404,
    );
  });
});
