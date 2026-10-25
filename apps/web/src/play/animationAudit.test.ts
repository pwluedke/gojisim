import { stateBoard, weightedPick } from "@gojisim/bot";
import { buildTestDeck } from "@gojisim/cards/test-decks";
import {
  advanceToDecision,
  applyAction,
  type GameState,
  getLegalActions,
  startGame,
  ZONE_NUMBERS,
} from "@gojisim/engine";
import { describe, expect, it } from "vitest";
import {
  bottomedCards,
  type Box,
  type CardSpot,
  destroyedCards,
  planMoves,
  type Snapshot,
} from "./animation";
import { boardModel, type BoardModel } from "./model";

/**
 * M5h #8 animation audit: every card move animates. A snapshot is built from the board model as
 * the board draws it (zone stack tops, monsters, strategy cards, discard tops, your hand, the
 * opponent's revealed cards), at made-up positions, with pile counts and stack sizes. Real games
 * then run through every kind of event that moves a card, and each step's plan must explain
 * every pile change; only tokens may appear from, or vanish into, nowhere (9.1.4.2).
 */

let nextBox = 0;
const boxes = new Map<string, Box>();
/** A made-up place for each location, the same every time it's asked. */
const at = (key: string): Box => {
  let box = boxes.get(key);
  if (!box) {
    box = {
      x: (nextBox % 50) * 100,
      y: Math.floor(nextBox / 50) * 100,
      width: 63,
      height: 88,
    };
    nextBox++;
    boxes.set(key, box);
  }
  return box;
};

function modelSnapshot(model: BoardModel, step: number): Snapshot {
  const cards = new Map<string, CardSpot>();
  // One place per location, as on the board: a new top card lands where the old one was.
  const put = (
    instanceId: string,
    cardId: number,
    owner: string,
    place: string,
    stack?: number,
  ) =>
    cards.set(instanceId, {
      instanceId,
      cardId,
      owner,
      box: at(`${owner}|${place}`),
      ...(stack && stack > 1 ? { stack } : {}),
      ...(place.startsWith("hand")
        ? { pile: "hand" as const }
        : place === "discard"
          ? { pile: "discard" as const }
          : {}),
      ...(place === "monster" ? { monster: true as const } : {}),
      ...(model.view.cards[cardId]?.traits.includes("Token")
        ? { token: true as const }
        : {}),
    });
  const anchors: Record<string, Box> = {};
  const counts: Record<string, number> = {};
  for (const p of model.view.players) {
    for (const zone of ZONE_NUMBERS)
      (p.zones[zone].cards ?? []).forEach((stack, i) => {
        const top = stack.at(-1);
        if (top)
          put(top.instanceId, top.cardId, p.id, `z${zone}.${i}`, stack.length);
      });
    const monster = p.invadingMonsterZone.cards ?? [];
    const top = monster.at(-1);
    if (top) put(top.instanceId, top.cardId, p.id, "monster", monster.length);
    p.strategyZones.forEach((zone, z) =>
      (zone.cards ?? []).forEach(({ card }, i) =>
        put(card.instanceId, card.cardId, p.id, `s${z}.${i}`),
      ),
    );
    const discard = p.discard.cards?.at(-1);
    if (discard) put(discard.instanceId, discard.cardId, p.id, "discard");
    (p.hand.cards ?? []).forEach((card, i) => {
      if (card) put(card.instanceId, card.cardId, p.id, `hand${i}`);
    });
    for (const pile of ["hand", "deck", "monsterDeck", "discard"] as const) {
      anchors[`${p.id}|${pile}`] = at(`${p.id}|${pile}`);
      counts[`${p.id}|${pile}`] = p[pile].count;
    }
  }
  return {
    step,
    bottom: model.bottom,
    logLength: model.view.log.length,
    cards,
    anchors,
    counts,
  };
}

function rng(seed: number) {
  let s = seed >>> 0;
  return () => (s = (s * 1664525 + 1013904223) >>> 0) / 2 ** 32;
}

/** Log entry types that move a card, as the audit saw them. */
const MOVES = new Set([
  "draw",
  "addToHand",
  "place",
  "newInvadingMonster",
  "evolve",
  "placeUnder",
  "putOnDeck",
  "mill",
  "destroy",
  "discard",
  "discardStrategy",
  "returnDiscardToDeck",
  "reshuffle",
  "tokenGone",
  "swap",
  "moveBattle",
]);

describe("animation audit (M5h #8)", () => {
  it("every card move in real games has a flight; only tokens appear or vanish in place", () => {
    const seen = new Set<string>();
    const problems: string[] = [];
    const sets = ["EBP01", "EBP02", "EBP03", "EBP04", "ESD01", "ESD02"];
    for (let g = 0; g < 24; g++) {
      const a = sets[g % sets.length] as string;
      const b = sets[(g * 5 + 1) % sets.length] as string;
      let state: GameState = startGame({
        seed: `audit-${g}`,
        decks: [
          { id: "P1", ...buildTestDeck(a as never, `audit-${g}-a`) },
          { id: "P2", ...buildTestDeck(b as never, `audit-${g}-b`) },
        ],
      });
      const pick = rng(g + 1);
      let prev = modelSnapshot(boardModel(state, "P1"), 0);
      for (let step = 1; step < 400 && !state.result; step++) {
        const who = state.pendingChoice?.player ?? state.turnPlayer;
        const legal = getLegalActions(state, who).filter(
          (x) => x.type !== "concede",
        );
        const action = weightedPick(stateBoard(state), legal, (n) =>
          Math.floor(pick() * n),
        );
        const before = state.log.length;
        state = advanceToDecision(applyAction(state, action));
        const next = modelSnapshot(boardModel(state, "P1"), step);
        const entries = state.log.slice(before);
        for (const e of entries) if (MOVES.has(e.type)) seen.add(e.type);
        const view = boardModel(state, "P1").view;
        const { flights, unexplained } = planMoves(
          prev,
          next,
          destroyedCards(view.log, prev.logLength),
          null,
          bottomedCards(view.log, prev.logLength),
        );
        if (Object.keys(unexplained).length > 0)
          problems.push(
            `game ${g} step ${step} (${[...new Set(entries.map((e) => e.type))].join(",")}): no flight for ${JSON.stringify(unexplained)}`,
          );
        // Only a token appears from, or vanishes into, nowhere.
        const odd = flights.filter(
          (f) =>
            f.kind &&
            !(
              f.cardId !== null &&
              state.cards[f.cardId]?.traits.includes("Token")
            ),
        );
        if (odd.length > 0)
          problems.push(
            `game ${g} step ${step} (${[...new Set(entries.map((e) => e.type))].join(",")}): ${odd.map((f) => `${f.kind} ${f.cardId}`).join(", ")}`,
          );
        prev = next;
      }
    }
    expect(problems.slice(0, 10)).toEqual([]);
    // The games went through the moves the audit is about.
    for (const kind of [
      "draw",
      "addToHand",
      "place",
      "newInvadingMonster",
      "evolve",
      "placeUnder",
      "mill",
      "destroy",
      "discard",
      "discardStrategy",
      "tokenGone",
    ])
      expect(seen, kind).toContain(kind);
  }, 60_000);
});
