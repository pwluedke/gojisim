import { readFileSync, statSync } from "node:fs";
import { getAllCards } from "@gojisim/cards/all-cards";
import type { LogEntry } from "@gojisim/engine";
import { afterEach, describe, expect, it } from "vitest";
import { DEFAULT_SETTINGS, loadSettings } from "../play/settings";
import {
  CARD_SOUNDS,
  ROAR_AFTER_MS,
  SOUNDS,
  type SoundKind,
  stepIsHeard,
  stepSounds,
  Throttle,
} from "./sounds";

let seq = 0;
const entry = (
  type: string,
  payload: Record<string, unknown> = {},
): LogEntry => ({
  seq: seq++,
  type,
  player: "P1",
  payload,
});
const cards = {
  1: { type: "Battle", deckCardNumber: "TEST-001" },
  2: { type: "Monster", deckCardNumber: "TEST-002" },
} as const;
const kinds = (entries: LogEntry[], speed: "off" | "normal" | "fast" = "off") =>
  stepSounds(entries, cards, speed).map((c) => c.kind);

describe("sound effects", () => {
  it("each event plays its sound kind", () => {
    const cases: [LogEntry, SoundKind | null][] = [
      [entry("place", { to: "zone 3", cardId: 1, played: true }), "card"],
      [entry("place", { to: "invadingMonsterZone", cardId: 2 }), "monster"],
      [entry("newInvadingMonster", { cardId: 2, zone: 4 }), "monster"],
      [entry("place", { to: "strategy zone 1", cardId: 9 }), "strategy"],
      [entry("evolve", { from: 1, to: 1, zone: 2 }), "evolve"],
      [entry("destroy", { zone: 1, cardIds: [1] }), "destroy"],
      [entry("advance", { from: 3, to: 4, invasion: true }), "stomp"],
      [entry("counter"), "counter"],
      [entry("rageChanged", { from: 0, to: 1 }), "rage"],
      [entry("draw", { count: 1 }), "draw"],
      [entry("shuffleDeck", { count: 50 }), "shuffle"],
      [entry("reshuffle", { count: 41 }), "shuffle"],
      // Quiet: an end-phase advance, a rage decrease, an empty draw, Evolution's own place.
      [entry("advance", { from: 3, to: 4 }), null],
      [entry("rageChanged", { from: 2, to: 0 }), null],
      [entry("draw", { count: 0 }), null],
      [entry("place", { to: "zone 2", cardId: 1, rule: "12.6.2" }), null],
      [entry("pass"), null],
    ];
    for (const [e, kind] of cases)
      expect(kinds([e]), e.type).toEqual(kind ? [kind] : []);
    // Every kind has a file in sounds.json.
    for (const def of Object.values(SOUNDS)) expect(def.file).toMatch(/\.mp3$/);
  });

  it("a card thuds as it lands (after the move); with Animation Off, at the step", () => {
    const play = [entry("place", { to: "zone 1", cardId: 1 })];
    expect(stepSounds(play, cards, "normal")[0]?.at).toBe(450);
    expect(stepSounds(play, cards, "fast")[0]?.at).toBe(220);
    expect(stepSounds(play, cards, "off")[0]?.at).toBe(0);
    // A destroy's crunch starts with the shards, at the step.
    expect(
      stepSounds([entry("destroy", { cardIds: [1] })], cards, "normal")[0]?.at,
    ).toBe(0);
  });

  it("an invasion stomps once per zone advanced, spaced out", () => {
    const steps = [3, 4].map((from) =>
      entry("advance", { from, to: from + 1, invasion: true }),
    );
    expect(stepSounds(steps, cards, "normal")).toEqual([
      { kind: "stomp", at: 0 },
      { kind: "stomp", at: 180 },
    ]);
  });

  it("an invasion win: the slam plays the crash and roar; with Animation Off the step does", () => {
    const win = [entry("gameOver", { winner: "P1", reason: "invasion" })];
    expect(stepSounds(win, cards, "normal")).toEqual([]);
    expect(stepSounds(win, cards, "off")).toEqual([
      { kind: "slamCrash", at: 0 },
      { kind: "roar", at: ROAR_AFTER_MS },
    ]);
  });

  it("the same sound plays at most once per 80 ms: 5 destroys in one step play 3", () => {
    const destroys = Array.from({ length: 5 }, () =>
      entry("destroy", { cardIds: [1] }),
    );
    const cues = stepSounds(destroys, cards, "normal");
    const throttle = new Throttle();
    expect(cues.filter((c) => throttle.allow(c.kind, c.at))).toHaveLength(3);
    // Different sounds don't hold each other back.
    const other = new Throttle();
    expect(other.allow("card", 0)).toBe(true);
    expect(other.allow("draw", 10)).toBe(true);
    expect(other.allow("card", 40)).toBe(false);
    expect(other.allow("card", 80)).toBe(true);
  });

  describe("card sounds (#99)", () => {
    const all = getAllCards();
    /** Every print of a deck card number, as a cards catalog by id. */
    const prints = (number: string) =>
      Object.fromEntries(
        all.filter((c) => c.deckCardNumber === number).map((c) => [c.id, c]),
      );
    const idsOf = (number: string) => Object.keys(prints(number)).map(Number);
    /** Paul's 14 cards and the event each one's sound replaces. */
    const events: [string, (cardId: number) => LogEntry, SoundKind][] = [
      [
        "ESD01-016",
        (id) => entry("place", { to: "strategy zone 1", cardId: id }),
        "strategy",
      ],
      [
        "EBP03-067",
        (id) => entry("place", { to: "zone 3", cardId: id, played: true }),
        "card",
      ],
      [
        "EBP02-053",
        (id) => entry("place", { to: "invadingMonsterZone", cardId: id }),
        "monster",
      ],
      [
        "EBP01-031",
        (id) => entry("place", { to: "strategy zone 2", cardId: id }),
        "strategy",
      ],
      [
        "EBP03-069",
        (id) => entry("place", { to: "strategy zone 1", cardId: id }),
        "strategy",
      ],
      [
        "EBP01-079",
        (id) => entry("place", { to: "strategy zone 1", cardId: id }),
        "strategy",
      ],
      [
        "EBP02-T03",
        (id) =>
          entry("place", {
            rule: "5.11.4",
            to: "zone 2",
            cardId: id,
            played: true,
          }),
        "card",
      ],
      [
        "EBP01-069",
        (id) => entry("place", { to: "zone 8", cardId: id, played: true }),
        "card",
      ],
      [
        "EBP01-077",
        (id) => entry("place", { to: "strategy zone 1", cardId: id }),
        "strategy",
      ],
      [
        "EBP03-058",
        (id) => entry("place", { to: "zone 5", cardId: id, played: true }),
        "card",
      ],
      [
        "EBP01-030",
        (id) => entry("place", { to: "strategy zone 1", cardId: id }),
        "strategy",
      ],
      [
        "EBP01-033",
        (id) => entry("place", { to: "strategy zone 1", cardId: id }),
        "strategy",
      ],
      [
        "EBP04-081",
        (id) => entry("place", { to: "strategy zone 1", cardId: id }),
        "strategy",
      ],
      [
        "EBP01-078",
        (id) => entry("place", { to: "strategy zone 1", cardId: id }),
        "strategy",
      ],
      [
        // #139: alien_05 is Mecha-King Ghidorah's (rank 23), not Ghidorah (2001)'s.
        "EBP02-068",
        (id) => entry("place", { to: "zone 5", cardId: id, played: true }),
        "card",
      ],
    ];

    it("each card's play, activation or token plays its own sound, with the generic kind's timing; every print shares it", () => {
      expect(Object.keys(CARD_SOUNDS).sort()).toEqual(
        events.map(([n]) => n).sort(),
      );
      for (const [number, event, kind] of events) {
        const ids = idsOf(number);
        expect(ids.length, number).toBeGreaterThan(0);
        // Parallel prints included: each plays the same card sound.
        for (const id of ids)
          expect(
            stepSounds([event(id)], prints(number), "normal"),
            `${number} ${id}`,
          ).toEqual([{ kind, at: 450, card: number }]);
      }
      expect(idsOf("EBP01-031").length).toBeGreaterThan(1);
      // Both Space Beams share one file.
      expect(CARD_SOUNDS["EBP01-031"]?.file).toBe(
        CARD_SOUNDS["EBP03-069"]?.file,
      );
    });

    it("#139: Ghidorah (2001) (EBP03-027) plays the generic monster sound again", () => {
      for (const id of idsOf("EBP03-027"))
        expect(
          stepSounds(
            [entry("place", { to: "invadingMonsterZone", cardId: id })],
            prints("EBP03-027"),
            "normal",
          ),
        ).toEqual([{ kind: "monster", at: 450 }]);
    });

    it("monster plays include a Burst play and the next monster after a counter; Evolution keeps its own sound", () => {
      const [id] = idsOf("EBP02-053");
      const catalog = prints("EBP02-053");
      expect(
        stepSounds(
          [entry("newInvadingMonster", { cardId: id, zone: 5 })],
          catalog,
          "off",
        ),
      ).toEqual([{ kind: "monster", at: 0, card: "EBP02-053" }]);
      const zilla = idsOf("EBP03-058")[0];
      expect(
        stepSounds(
          [
            entry("place", { rule: "12.6.2", to: "zone 2", cardId: zilla }),
            entry("evolve", { from: 1, to: 1, zone: 2 }),
          ],
          prints("EBP03-058"),
          "off",
        ),
      ).toEqual([{ kind: "evolve", at: 0 }]);
      // A card without one keeps the generic sound.
      expect(kinds([entry("place", { to: "zone 3", cardId: 1 })])).toEqual([
        "card",
      ]);
      expect(
        stepSounds(
          [entry("place", { to: "zone 3", cardId: 1 })],
          cards,
          "off",
        )[0],
      ).not.toHaveProperty("card");
    });

    it("card sounds throttle on their own, not with the generic kind", () => {
      const throttle = new Throttle();
      expect(throttle.allow("strategy", 0)).toBe(true);
      expect(throttle.allow("card:ESD01-016", 10)).toBe(true);
      expect(throttle.allow("card:ESD01-016", 50)).toBe(false);
      expect(throttle.allow("card:EBP01-030", 50)).toBe(true);
    });

    it("every card sound is a committed MP3 listed in LICENSES.md, 400 KB in all at most", () => {
      const dir = new URL("../../public/sounds/", import.meta.url);
      const files = [...new Set(Object.values(CARD_SOUNDS).map((d) => d.file))];
      const licenses = readFileSync(new URL("LICENSES.md", dir), "utf8");
      let total = 0;
      for (const file of files) {
        expect(file).toMatch(/^cards\/[a-z0-9-]+\.mp3$/);
        total += statSync(new URL(file, dir)).size;
        expect(licenses, file).toContain(`\`${file}\``);
      }
      expect(total).toBeLessThanOrEqual(400 * 1024);
    });
  });

  it("only a live game's new step is heard: not the history view, an undo or a loaded record", () => {
    expect(stepIsHeard({ grew: true, live: true, index: 4, from: 0 })).toBe(
      true,
    );
    // The history view.
    expect(stepIsHeard({ grew: true, live: false, index: 4, from: 0 })).toBe(
      false,
    );
    // An undo shrinks the record.
    expect(stepIsHeard({ grew: false, live: true, index: 3, from: 0 })).toBe(
      false,
    );
    // A loaded record's 30 actions are history; the next one is heard.
    expect(stepIsHeard({ grew: true, live: true, index: 29, from: 30 })).toBe(
      false,
    );
    expect(stepIsHeard({ grew: true, live: true, index: 30, from: 30 })).toBe(
      true,
    );
  });

  describe("settings", () => {
    const store = new Map<string, string>();
    const g = globalThis as { window?: unknown };
    afterEach(() => {
      delete g.window;
      store.clear();
    });

    it("Sound defaults on at 50% and reads back what was saved", () => {
      expect(DEFAULT_SETTINGS.sound).toBe(true);
      expect(DEFAULT_SETTINGS.volume).toBe(50);
      g.window = {
        localStorage: {
          getItem: (k: string) => store.get(k) ?? null,
          setItem: (k: string, v: string) => store.set(k, v),
        },
      };
      store.set(
        "gojisim.settings",
        JSON.stringify({ sound: false, volume: 20 }),
      );
      expect(loadSettings()).toMatchObject({ sound: false, volume: 20 });
    });
  });
});
