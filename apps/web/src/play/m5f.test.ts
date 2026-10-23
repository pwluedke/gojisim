import { IDBFactory } from "fake-indexeddb";
import { describe, expect, it } from "vitest";
import {
  type CardSpot,
  centered,
  moveTransform,
  destroyedCards,
  flightsTime,
  planFlights,
  type Snapshot,
} from "./animation";
import { glowCycle } from "./glow";
import { area, clipPath, shardLayout } from "./shards";
import { MAT_MAX_BYTES, matFileProblem, matStore } from "./matStore";

describe("turn glow colors (M5f)", () => {
  it("a single-color monster: its color, then grey", () => {
    expect(glowCycle(["Red"])).toEqual(["Red", "grey"]);
    expect(glowCycle(["Blue"])).toEqual(["Blue", "grey"]);
  });

  it("a white (or colorless) monster glows grey only", () => {
    expect(glowCycle(["White"])).toEqual(["grey"]);
    expect(glowCycle([])).toEqual(["grey"]);
  });

  it("a multicolor monster: each color in turn, then grey", () => {
    expect(glowCycle(["Red", "Blue"])).toEqual(["Red", "Blue", "grey"]);
    expect(glowCycle(["Green", "White", "Red"])).toEqual([
      "Green",
      "Red",
      "grey",
    ]);
  });
});

describe("custom mat storage (M5f)", () => {
  const image = () => new Blob(["mat"], { type: "image/png" });

  it("saves, loads and resets the mat image with its scale and position", async () => {
    const idb = new IDBFactory();
    const store = matStore(idb);
    expect(await store.load()).toBeNull();
    expect(await store.save({ blob: image(), scale: 120, x: 30, y: 70 })).toBe(
      true,
    );
    // A new store on the same database (a reload) finds it.
    const loaded = await matStore(idb).load();
    expect(loaded).toMatchObject({ scale: 120, x: 30, y: 70 });
    expect(loaded?.blob).toBeInstanceOf(Blob);
    expect(await store.clear()).toBe(true);
    expect(await matStore(idb).load()).toBeNull();
  });

  it("falls back to the default mat when storage is missing or fails", async () => {
    const missing = matStore(undefined);
    expect(await missing.load()).toBeNull();
    expect(
      await missing.save({ blob: image(), scale: 100, x: 50, y: 50 }),
    ).toBe(false);
    const broken = matStore({
      open: () => {
        throw new Error("SecurityError");
      },
    } as unknown as IDBFactory);
    expect(await broken.load()).toBeNull();
    expect(await broken.save({ blob: image(), scale: 100, x: 50, y: 50 })).toBe(
      false,
    );
    expect(await broken.clear()).toBe(false);
  });

  it("accepts PNG, JPG and WebP under the size limit", () => {
    expect(matFileProblem({ type: "image/png", size: 1000 })).toBeNull();
    expect(
      matFileProblem({ type: "image/webp", size: MAT_MAX_BYTES }),
    ).toBeNull();
    expect(matFileProblem({ type: "image/gif", size: 1000 })).toMatch(/PNG/);
    expect(
      matFileProblem({ type: "image/jpeg", size: MAT_MAX_BYTES + 1 }),
    ).toMatch(/limit/);
  });
});

describe("card movement flights (M5f)", () => {
  const box = (x: number, y = 0) => ({ x, y, width: 60, height: 84 });
  const spot = (
    instanceId: string,
    cardId: number | null,
    x: number,
    owner = "P1",
  ): [string, CardSpot] => [
    instanceId,
    { instanceId, cardId, owner, box: box(x) },
  ];
  const anchors = {
    "P1|hand": box(0, 500),
    "P1|deck": box(900, 300),
    "P1|discard": box(900, 400),
    "P1|monsterDeck": box(0, 400),
    "P2|hand": box(0, -100),
    "P2|deck": box(0, 100),
    "P2|discard": box(0, 0),
    "P2|monsterDeck": box(900, 0),
  };
  const counts = (change: Record<string, number> = {}) => ({
    "P1|hand": 5,
    "P1|deck": 40,
    "P1|discard": 0,
    "P1|monsterDeck": 3,
    "P2|hand": 5,
    "P2|deck": 40,
    "P2|discard": 0,
    "P2|monsterDeck": 3,
    ...change,
  });
  const snap = (
    cards: [string, CardSpot][],
    change: Record<string, number> = {},
  ): Snapshot => ({
    step: 1,
    bottom: "P1",
    logLength: 0,
    cards: new Map(cards),
    anchors,
    counts: counts(change),
  });

  it("a card that moved (new instance id, same card) flies from its old place to its new one", () => {
    const before = snap([spot("c1", 10, 100), spot("c2", 11, 200)], {
      "P1|hand": 5,
    });
    const after = snap([spot("c7", 10, 500), spot("c2", 11, 200)], {
      "P1|hand": 4,
    });
    const flights = planFlights(before, after, []);
    expect(flights).toEqual([
      {
        id: "c7",
        cardId: 10,
        from: box(100),
        to: box(500),
        target: "c7",
        shatter: false,
        seed: "c1",
      },
    ]);
  });

  it("a dropped card settles from where it was let go", () => {
    const before = snap([spot("c1", 10, 100)]);
    const after = snap([spot("c7", 10, 500)]);
    const drop = { instanceId: "c1", box: box(450, 20) };
    expect(planFlights(before, after, [], drop)[0]?.from).toEqual(box(450, 20));
  });

  it("a drawn card flies from the deck; an opponent's draw flies a card back", () => {
    const before = snap([]);
    const after = snap([spot("c9", 12, 300)], {
      "P1|hand": 6,
      "P1|deck": 39,
      "P2|hand": 6,
      "P2|deck": 39,
    });
    const flights = planFlights(before, after, []);
    expect(flights).toHaveLength(2);
    expect(flights[0]).toMatchObject({ cardId: 12, from: anchors["P1|deck"] });
    expect(flights[1]).toMatchObject({
      cardId: null,
      from: anchors["P2|deck"],
      to: anchors["P2|hand"],
    });
  });

  it("destroyed cards shatter, all in the same step, and the hidden ones fly to their pile", () => {
    const before = snap([spot("c1", 20, 100, "P2"), spot("c2", 21, 200, "P2")]);
    // Both go to P2's discard pile; only the last one is its shown top card.
    const after = snap([spot("c8", 21, 0, "P2")], { "P2|discard": 2 });
    const flights = planFlights(before, after, [20, 21]);
    expect(flights.map((f) => [f.cardId, f.shatter, f.target])).toEqual([
      [21, true, "c8"],
      [20, true, null],
    ]);
    expect(flights[1]?.to).toEqual(anchors["P2|discard"]);
    // They play together: the total is one shatter plus one move.
    // Explode 320 ms, hang 300 ms, then reassemble over the 450 ms move.
    expect(flightsTime(flights, "normal")).toBe(320 + 300 + 450);
    expect(flightsTime(flights, "off")).toBe(0);
  });

  it("a replaced destroy (ESD01-011 to the deck bottom) shatters and flies to the deck", () => {
    const before = snap([spot("c1", 30, 100)]);
    const after = snap([], { "P1|deck": 41 });
    const log = [
      {
        seq: 1,
        type: "replace",
        player: "P1" as const,
        payload: { cardId: 30, replaces: "destroyed" },
      },
    ];
    const flights = planFlights(before, after, destroyedCards(log, 0));
    expect(flights).toMatchObject([
      { cardId: 30, shatter: true, to: anchors["P1|deck"], target: null },
    ]);
  });

  it("destroyedCards reads destroy and replaced-destroy entries after a point", () => {
    const log = [
      {
        seq: 1,
        type: "destroy",
        player: "P1" as const,
        payload: { cardIds: [1] },
      },
      {
        seq: 2,
        type: "destroy",
        player: "P2" as const,
        payload: { cardIds: [2, 3] },
      },
      { seq: 3, type: "draw", player: "P2" as const, payload: { count: 1 } },
    ];
    expect(destroyedCards(log, 0)).toEqual([1, 2, 3]);
    expect(destroyedCards(log, 1)).toEqual([2, 3]);
  });
});

describe("destroy shards (M5f)", () => {
  it("angular shards, triangles and 4 to 5 sided, that tile the whole card", () => {
    const sides = new Set<number>();
    for (const seed of ["c1", "c42", "c317", "c9000"]) {
      const shards = shardLayout(seed);
      expect(shards.length).toBeGreaterThanOrEqual(12);
      const total = shards.reduce((sum, s) => sum + area(s.points), 0);
      expect(total).toBeCloseTo(1, 9);
      for (const shard of shards) {
        expect(shard.points.length).toBeGreaterThanOrEqual(3);
        expect(shard.points.length).toBeLessThanOrEqual(5);
        sides.add(shard.points.length);
        for (const [x, y] of shard.points) {
          expect(x).toBeGreaterThanOrEqual(0);
          expect(x).toBeLessThanOrEqual(1);
          expect(y).toBeGreaterThanOrEqual(0);
          expect(y).toBeLessThanOrEqual(1);
        }
      }
      // Varied sizes, and every shard turns as it flies.
      const areas = shards.map((s) => area(s.points));
      expect(Math.max(...areas) / Math.min(...areas)).toBeGreaterThan(1.5);
    }
    expect([...sides].sort()).toEqual([3, 4, 5]);
  });

  it("the layout is seeded by the instance id: the same on replay, different per card", () => {
    expect(shardLayout("c12")).toEqual(shardLayout("c12"));
    expect(shardLayout("c12")).not.toEqual(shardLayout("c13"));
    expect(clipPath(shardLayout("c12")[0] as never)).toMatch(/^polygon\(/);
  });
});

describe("moving cards keep their shape (M5f fix)", () => {
  it("one uniform scale, centers lined up, never past the larger card", () => {
    const from = { x: 100, y: 100, width: 63, height: 88 };
    const to = { x: 500, y: 300, width: 94.5, height: 132 };
    expect(moveTransform(from, to)).toEqual({ x: 415.75, y: 222, scale: 1.5 });
    // A landscape strategy card to a portrait pile: it scales by the longer sides only.
    const landscape = { x: 0, y: 0, width: 88, height: 63 };
    expect(moveTransform(landscape, from).scale).toBe(1);
  });

  it("a pile with no card shows a card-sized spot at its center", () => {
    expect(centered({ x: 0, y: 0, width: 600, height: 50 }, 25, 35)).toEqual({
      x: 287.5,
      y: 7.5,
      width: 25,
      height: 35,
    });
  });
});
