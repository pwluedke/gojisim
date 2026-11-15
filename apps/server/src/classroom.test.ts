import { mkdtempSync } from "node:fs";
import type { IncomingMessage, ServerResponse } from "node:http";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { classroomPoints, classroomStore } from "./classroom.js";

const record = (turns: unknown[], extra: Record<string, unknown> = {}) => ({
  version: 1,
  seed: 1,
  decks: [{}, {}],
  actions: [],
  gameId: "11111111-1111-4111-8111-111111111111",
  classroom: true,
  deckNames: { P1: "Player deck", P2: "Wrangler" },
  classroomTurns: turns,
  ...extra,
});

const turn = (rating: string | undefined, same: boolean) => ({
  turn: 2,
  player: "P2",
  actionIndex: 4,
  playerActions: [{ type: "pass", player: "P2" }],
  playerLabels: ["Pass"],
  botVersion: "2026-11-15",
  at: "2026-11-15T10:00:00.000Z",
  same,
  ...(rating ? { rating } : {}),
  reason: "never leaves the record",
});

/** Calls the middleware for a GET and returns its JSON. */
async function get(
  middleware: ReturnType<typeof classroomStore>["middleware"],
  url: string,
): Promise<{ status: number; body: unknown; passed: boolean }> {
  let status = 0;
  let text = "";
  let passed = false;
  await middleware(
    { url, method: "GET" } as IncomingMessage,
    {
      writeHead: (s: number) => {
        status = s;
      },
      end: (t: string) => {
        text = t;
      },
    } as unknown as ServerResponse,
    () => {
      passed = true;
    },
  );
  return { status, body: text ? JSON.parse(text) : null, passed };
}

describe("#365 Kaiju Classroom agreement on the server", () => {
  it("a record's rated turns become points: the day, the bot's deck, the version and the result, nothing else", () => {
    expect(
      classroomPoints(record([turn("same", true), turn(undefined, false)])),
    ).toEqual([
      {
        date: "2026-11-15",
        deck: "Wrangler",
        botVersion: "2026-11-15",
        same: true,
        rating: "same",
      },
    ]);
    expect(
      classroomPoints(record([turn("worse", false)], { classroom: undefined })),
    ).toEqual([]);
    expect(classroomPoints({ version: 1 })).toEqual([]);
  });

  it("an upload replaces its game's points; the route answers rows only", async () => {
    const dir = join(mkdtempSync(join(tmpdir(), "classroom-")), "results");
    const store = classroomStore(dir);
    expect(
      (await get(store.middleware, "/api/results/classroom")).body,
    ).toEqual({ rows: [] });
    await store.onStored(record([turn("worse", false)]), "a.json");
    await store.onStored(
      record([turn("worse", false), turn("same", true)]),
      "a.json",
    );
    await store.onStored(
      record([turn("better", false)], {
        gameId: "22222222-2222-4222-8222-222222222222",
      }),
      "b.json",
    );
    const answer = await get(store.middleware, "/api/results/classroom");
    expect(answer.status).toBe(200);
    expect(answer.body).toEqual({
      rows: [
        {
          date: "2026-11-15",
          deck: "Wrangler",
          botVersion: "2026-11-15",
          turns: 3,
          same: 1,
          aboutSame: 0,
          worse: 1,
          better: 1,
        },
      ],
    });
    expect(JSON.stringify(answer.body)).not.toContain("never leaves");
    // Other paths pass on.
    expect((await get(store.middleware, "/api/results")).passed).toBe(true);
  });
});
