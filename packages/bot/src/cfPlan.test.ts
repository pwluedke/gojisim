import { readFileSync } from "node:fs";
import type { Card } from "@gojisim/cards";
import { parseDeckList } from "@gojisim/cards/deck-lists";
import { getAllCards } from "@gojisim/cards/test-decks";
import {
  type Action,
  advanceToDecision,
  applyAction,
  type CardInstance,
  type GameState,
  getLegalActions,
  type PlayerSetup,
  type PlayerState,
  startGame,
} from "@gojisim/engine";
import { describe, expect, it } from "vitest";
import { cfPlanDead, crystalBonus, crystalsOn } from "./cfPlan";

// Paul's Constructed Future plan (`cfPlan=1`, Nov 5, 2026): play it for a target, before the
// Crystals rebuild, unless it breaks the GoD counter; first KG (2024) / MKG pay invade costs;
// Gravity Beam only for the counter or as disruption.

function official(file: string): Omit<PlayerSetup, "id"> {
  const url = new URL(`../../cards/data/decks/${file}`, import.meta.url);
  const deck = parseDeckList(readFileSync(url, "utf8")).decks[0];
  if (!deck) throw new Error(file);
  return { monsterDeck: deck.monsterDeck, mainDeck: deck.mainDeck };
}
const real = (number: string): Card =>
  getAllCards().find(
    (c) => c.cardNumber === number && c.parentId === null,
  ) as Card;

let nextId = 980000;
function add(state: GameState, number: string, owner: string): CardInstance {
  const card = real(number);
  state.cards = { ...state.cards, [card.id]: card };
  return { instanceId: `c${nextId++}`, cardId: card.id, owner };
}

interface Setup {
  monster?: string;
  crystals?: number;
  hand?: string[];
  deck?: string[];
  discard?: string[];
  oppMonster?: string;
  oppHand?: number;
}

/** P1's main phase, its monster in zone 7, the rest as given; P2's monster in zone 8. */
function position(setup: Setup) {
  let state = advanceToDecision(
    startGame({
      seed: "cf-plan",
      decks: [
        { id: "P1", ...official("esd01-starter.txt") },
        { id: "P2", ...official("esd02-starter.txt") },
      ],
    }),
  );
  while (state.turnPlayer !== "P1" || state.pendingChoice) {
    const decider = state.pendingChoice?.player ?? state.turnPlayer;
    const choice = state.pendingChoice;
    state = advanceToDecision(
      applyAction(
        state,
        choice
          ? {
              type: "choose",
              player: decider,
              choiceId: choice.id,
              optionId: choice.options[0]!.id,
            }
          : { type: "pass", player: decider },
      ),
    );
  }
  const p1 = state.players[0] as PlayerState;
  const p2 = state.players[1] as PlayerState;
  p1.monsterPosition = 7;
  p2.monsterPosition = 8;
  if (setup.monster) p1.invadingMonsterZone = [add(state, setup.monster, "P1")];
  if (setup.oppMonster)
    p2.invadingMonsterZone = [add(state, setup.oppMonster, "P2")];
  p1.hand = (setup.hand ?? []).map((n) => add(state, n, "P1"));
  if (setup.deck) p1.deck.push(...setup.deck.map((n) => add(state, n, "P1")));
  p1.discard = (setup.discard ?? []).map((n) => add(state, n, "P1"));
  for (const z of [1, 2, 3, 4, 5, 6, 7, 8] as const) p1.zones[z] = [];
  for (let i = 0; i < (setup.crystals ?? 0); i++)
    p1.zones[(i + 1) as 1 | 2 | 3 | 4 | 5 | 6]!.push([
      add(state, "EBP02-T03", "P1"),
    ]);
  if (setup.oppHand !== undefined)
    p2.hand = p2.hand.concat(p2.deck.splice(0)).slice(0, setup.oppHand);
  return { state, p1, legal: getLegalActions(state, "P1") };
}
const of = (state: GameState, p1: PlayerState, a: Action) => {
  const id = "cardInstanceId" in a ? a.cardInstanceId : null;
  const card = p1.hand.find((c) => c.instanceId === id);
  return card ? state.cards[card.cardId]?.deckCardNumber : undefined;
};
const types = (s: Set<Action>) => [...s].map((a) => a.type).sort();

describe("Paul's Constructed Future plan (cfPlan=1)", () => {
  it("ability data: Flying Form IV makes 2 Crystals per rage increase, EBP04-026 3 on invading; GoD +20,000 with 3", () => {
    expect(crystalsOn("EBP02-057", "rageChanged")).toBe(2);
    expect(crystalsOn("EBP04-026", "invading")).toBe(3);
    expect(crystalsOn("EBP02-053", "invading")).toBe(1);
    expect(crystalBonus("EBP02-072")).toEqual({ amount: 20000, need: 3 });
  });

  it("with a target, pass is dead and Flying Form IV's rage discards wait for Constructed Future (order)", () => {
    const { state, p1, legal } = position({
      monster: "EBP02-057",
      crystals: 3,
      hand: ["SD05-005", "EBP02-045"],
      discard: ["EBP02-068"],
    });
    const dead = cfPlanDead(state, legal, "P1");
    expect(legal.some((a) => a.type === "gainRage")).toBe(true);
    expect(types(dead)).toEqual(["gainRage", "pass"]);
    expect([...dead].some((a) => of(state, p1, a) === "SD05-005")).toBe(false);
  });

  it("with EBP04-026 as the monster, invading waits for Constructed Future", () => {
    const { state, legal } = position({
      monster: "EBP04-026",
      crystals: 3,
      hand: ["SD05-005", "ESD01-008"],
      discard: ["EBP02-068"],
    });
    expect(legal.some((a) => a.type === "invade")).toBe(true);
    const dead = cfPlanDead(state, legal, "P1");
    expect(types(dead)).toContain("invade");
    expect(types(dead)).toContain("pass");
  });

  it("GoD: held when the counter needs GoD's +20,000 and the Crystals can't come back to 3", () => {
    // 3 Crystals, GoD in hand, P2's Godzilla (1989) threat 15,000: only GoD makes the counter.
    const { state, p1, legal } = position({
      monster: "EBP02-057",
      crystals: 3,
      hand: ["SD05-005", "EBP02-072"],
      discard: ["EBP02-068"],
      oppMonster: "ESD02-002",
    });
    state.turnFlags.invasionUsed = true;
    const dead = cfPlanDead(state, legal, "P1");
    expect([...dead].some((a) => of(state, p1, a) === "SD05-005")).toBe(true);
    expect(types(dead)).not.toContain("pass");
  });

  it("GoD: with 2 monster cards in hand, Flying Form IV rebuilds 4 Crystals, so Constructed Future is played", () => {
    const { state, p1, legal } = position({
      monster: "EBP02-057",
      crystals: 3,
      hand: ["SD05-005", "EBP02-072", "EBP02-045", "EBP02-046"],
      discard: ["EBP02-068"],
      oppMonster: "ESD02-002",
    });
    state.turnFlags.invasionUsed = true;
    const dead = cfPlanDead(state, legal, "P1");
    expect([...dead].some((a) => of(state, p1, a) === "SD05-005")).toBe(false);
    expect(types(dead)).toContain("pass");
  });

  it("GoD: not needed for the counter, Constructed Future is played", () => {
    // Godzilla (1984), threat 6,000: GoD's +20,000 isn't what makes the counter.
    const { state, p1, legal } = position({
      monster: "EBP02-057",
      crystals: 3,
      hand: ["SD05-005", "EBP02-072", "ESD01-012"],
      discard: ["EBP02-068"],
      oppMonster: "ESD02-001",
    });
    p1.zones[4] = [[add(state, "ESD01-012", "P1")]];
    state.turnFlags.invasionUsed = true;
    const dead = cfPlanDead(state, getLegalActions(state, "P1"), "P1");
    expect([...dead].some((a) => of(state, p1, a) === "SD05-005")).toBe(false);
    void legal;
  });

  it("invade costs: the first King Ghidorah (2024) pays; with one in the discard already, the next is kept", () => {
    const first = position({
      monster: "EBP02-052",
      hand: ["EBP01-074", "ESD01-008"],
      deck: ["SD05-005"],
    });
    const deadFirst = cfPlanDead(first.state, first.legal, "P1");
    const invades = first.legal.filter((a) => a.type === "invade");
    expect(invades.length).toBe(2);
    expect([...deadFirst].map((a) => of(first.state, first.p1, a))).toEqual([
      "ESD01-008",
    ]);

    const later = position({
      monster: "EBP02-052",
      hand: ["EBP01-074", "ESD01-008"],
      deck: ["SD05-005"],
      discard: ["EBP01-074"],
    });
    const deadLater = cfPlanDead(later.state, later.legal, "P1");
    expect(
      [...deadLater]
        .filter((a) => a.type === "invade")
        .map((a) => of(later.state, later.p1, a)),
    ).toEqual(["EBP01-074"]);
  });

  it("Gravity Beam is held without King Ghidorah (2024) on board, and played as disruption against 6+ cards", () => {
    const held = position({
      monster: "EBP02-057",
      hand: ["EPR-019"],
      oppHand: 4,
    });
    const gb = (p: ReturnType<typeof position>) =>
      p.legal.find((a) => of(p.state, p.p1, a) === "EPR-019");
    expect(gb(held)).toBeDefined();
    expect(cfPlanDead(held.state, held.legal, "P1").has(gb(held)!)).toBe(true);
    const disrupt = position({
      monster: "EBP02-057",
      hand: ["EPR-019"],
      oppHand: 7,
    });
    expect(
      cfPlanDead(disrupt.state, disrupt.legal, "P1").has(gb(disrupt)!),
    ).toBe(false);
  });
});
