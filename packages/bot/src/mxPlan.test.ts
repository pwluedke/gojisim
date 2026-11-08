import { readFileSync } from "node:fs";
import type { Card } from "@gojisim/cards";
import { parseDeckList } from "@gojisim/cards/deck-lists";
import { getAllCards } from "@gojisim/cards/test-decks";
import {
  type Action,
  activeMonster,
  advanceToDecision,
  applyAction,
  type CardInstance,
  counterPowerOf,
  type GameState,
  getLegalActions,
  getThreat,
  type PlayerSetup,
  type PlayerState,
  startGame,
  type ZoneNumber,
} from "@gojisim/engine";
import { describe, expect, it } from "vitest";
import { combineDead, ismctsSettings } from "./ismcts";
import {
  finalWarsDead,
  invadeReason,
  isMonsterXDeck,
  mxPlanDead,
  ownTurn,
  turnsToCounter,
  turnsToInvade,
} from "./mxPlan";

// Paul's Monster X plan (`mxPlan=1`, Nov 7, 2026) and his Final Wars ruling (Nov 7): every
// position below is made up, on the starter decks with the cards each rule needs.

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

let nextId = 990000;
function add(state: GameState, number: string, owner: string): CardInstance {
  const card = real(number);
  state.cards = { ...state.cards, [card.id]: card };
  return { instanceId: `m${nextId++}`, cardId: card.id, owner };
}

interface Setup {
  /** P1's own turn count (1 = its first turn). */
  turn?: number;
  position?: ZoneNumber;
  oppPosition?: ZoneNumber;
  monster?: string;
  oppMonster?: string;
  hand?: string[];
  deck?: string[];
  discard?: string[];
  zones?: Partial<Record<ZoneNumber, string>> | undefined;
  oppZones?: Partial<Record<ZoneNumber, string>> | undefined;
  oppRage?: number;
}

/** P1's main phase with a Monster X monster deck, the rest as given. */
function position(setup: Setup) {
  let state = advanceToDecision(
    startGame({
      seed: "mx-plan",
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
  // P1's turns are the odd ones when it went first, else the even ones.
  const offset = state.turn % 2 === 1 ? 1 : 0;
  state.turn = 2 * (setup.turn ?? 5) - offset;
  p1.monsterPosition = setup.position ?? 7;
  p2.monsterPosition = setup.oppPosition ?? 8;
  p1.invadingMonsterZone = [add(state, setup.monster ?? "EBP04-031", "P1")];
  p1.monsterDeck = [add(state, "EBP04-032", "P1")];
  if (setup.oppMonster)
    p2.invadingMonsterZone = [add(state, setup.oppMonster, "P2")];
  p1.rage = 0;
  p2.rage = setup.oppRage ?? 0;
  p1.hand = (setup.hand ?? []).map((n) => add(state, n, "P1"));
  if (setup.deck) p1.deck = setup.deck.map((n) => add(state, n, "P1"));
  p1.discard = (setup.discard ?? []).map((n) => add(state, n, "P1"));
  for (const z of [1, 2, 3, 4, 5, 6, 7, 8] as const) {
    p1.zones[z] = setup.zones?.[z] ? [[add(state, setup.zones[z], "P1")]] : [];
    p2.zones[z] = setup.oppZones?.[z]
      ? [[add(state, setup.oppZones[z], "P2")]]
      : [];
  }
  p1.strategyZones = [[], []];
  p2.strategyZones = [[], []];
  return { state, p1, p2, legal: getLegalActions(state, "P1") };
}
const numberOf = (state: GameState, p1: PlayerState, a: Action) => {
  const id = "cardInstanceId" in a ? a.cardInstanceId : null;
  const card = p1.hand.find((c) => c.instanceId === id);
  return card ? state.cards[card.cardId]?.deckCardNumber : undefined;
};
const live = (legal: Action[], dead: Set<Action>) =>
  legal.filter((a) => !dead.has(a));

describe("Paul's Monster X plan (mxPlan=1)", () => {
  it("defaults to on; mxPlan=0 turns it off", () => {
    expect(ismctsSettings({}).mxPlan).toBe(1);
    expect(ismctsSettings({ mxPlan: "0" }).mxPlan).toBe(0);
  });

  it("is active only with a Monster X monster deck", () => {
    const { state, p1, p2, legal } = position({ hand: ["EBP04-057"] });
    expect(isMonsterXDeck(state, p1)).toBe(true);
    expect(isMonsterXDeck(state, p2)).toBe(false);
    p1.invadingMonsterZone = [add(state, "ESD01-002", "P1")];
    p1.monsterDeck = [];
    expect(mxPlanDead(state, legal, "P1").size).toBe(0);
  });

  it("counts the player's own turns", () => {
    expect(ownTurn(position({ turn: 1 }).state)).toBe(1);
    expect(ownTurn(position({ turn: 3 }).state)).toBe(3);
  });

  it("rule 1: on turn 1 a battle card comes before any other play", () => {
    const { state, p1, legal } = position({
      turn: 1,
      position: 3,
      hand: ["EBP04-057", "EBP04-081"],
    });
    const left = live(legal, mxPlanDead(state, legal, "P1"));
    expect(left.length).toBeGreaterThan(0);
    expect(
      left.every((a) => a.type === "playBattle" || a.type === "concede"),
    ).toBe(true);
    expect(left.some((a) => numberOf(state, p1, a) === "EBP04-057")).toBe(true);
  });

  it("rule 2: a battle card that adds a color beats a stronger one of a color already in zones", () => {
    const { state, p1, legal } = position({
      hand: ["EBP04-044", "EBP04-057"],
      zones: { 1: "EBP04-038" },
    });
    const left = live(legal, mxPlanDead(state, legal, "P1"));
    const plays = left.filter((a) => a.type === "playBattle");
    // Hedorah (2004) is red like Kamacuras; King Caesar (2004) adds green, not over Kamacuras.
    expect(plays.every((a) => numberOf(state, p1, a) === "EBP04-057")).toBe(
      true,
    );
    expect(plays.some((a) => a.type === "playBattle" && a.zone === 1)).toBe(
      false,
    );
    expect(plays.length).toBeGreaterThan(0);
  });

  it("rule 2: with 4 colors in zones, the colors no longer decide", () => {
    const { state, p1, legal } = position({
      hand: ["EBP04-044"],
      zones: { 1: "EBP04-038", 2: "EBP04-057", 3: "EBP04-045", 4: "EBP01-077" },
    });
    const dead = mxPlanDead(state, legal, "P1");
    expect(
      legal.some((a) => numberOf(state, p1, a) === "EBP04-044" && !dead.has(a)),
    ).toBe(true);
  });

  it("rule 4: in turns 1-3, rank 3 or lower battle cards before rank 4 or higher", () => {
    const early = position({
      turn: 2,
      hand: ["EBP02-016", "EBP04-057"],
      zones: { 1: "EBP04-038" },
    });
    const dead = mxPlanDead(early.state, early.legal, "P1");
    expect(
      early.legal.some(
        (a) =>
          a.type === "playBattle" &&
          numberOf(early.state, early.p1, a) === "EBP02-016" &&
          !dead.has(a),
      ),
    ).toBe(false);
    const late = position({
      turn: 4,
      hand: ["EBP02-016", "EBP04-057", "EBP04-045"],
      zones: { 1: "EBP04-038" },
    });
    const lateDead = mxPlanDead(late.state, late.legal, "P1");
    // From turn 4, Anguirus (2004) (rank 7) is a candidate again (a new color is not it: red).
    expect(
      late.legal.filter((a) => a.type === "playBattle" && !lateDead.has(a))
        .length,
    ).toBeGreaterThan(0);
  });

  it("rules 5 and 6: Entangling Fear when the end-phase advance would take the monster from 5 to 6, then before the main phase ends", () => {
    const fear = (setup: Setup) => {
      // The opponent's zone 8 holds a battle card: no invasion this turn (rule 9).
      const s = position({
        hand: ["EBP04-081"],
        oppZones: { 8: "EBP04-038" },
        ...setup,
      });
      const dead = mxPlanDead(s.state, s.legal, "P1");
      const cast = s.legal.filter(
        (a) =>
          a.type === "activateStrategy" &&
          numberOf(s.state, s.p1, a) === "EBP04-081",
      );
      expect(cast.length).toBeGreaterThan(0);
      return {
        cast: cast.some((a) => !dead.has(a)),
        pass: s.legal.some((a) => a.type === "pass" && !dead.has(a)),
      };
    };
    expect(fear({ position: 5 })).toEqual({ cast: true, pass: false });
    expect(fear({ position: 4 })).toEqual({ cast: false, pass: true });
    expect(fear({ position: 6 })).toEqual({ cast: false, pass: true });
  });

  it("rule 5: one Entangling Fear in play is enough", () => {
    const s = position({ position: 5, hand: ["EBP04-081"] });
    s.p1.strategyZones[0] = [
      { card: add(s.state, "EBP04-081", "P1") } as never,
    ];
    const legal = getLegalActions(s.state, "P1");
    const dead = mxPlanDead(s.state, legal, "P1");
    expect(
      legal
        .filter(
          (a) =>
            a.type === "activateStrategy" &&
            numberOf(s.state, s.p1, a) === "EBP04-081",
        )
        .every((a) => dead.has(a)),
    ).toBe(true);
    expect(legal.some((a) => a.type === "pass" && !dead.has(a))).toBe(true);
  });

  it("rule 8: rage discards only with a monster card ranked below the monster's current rank (it can't be stacked)", () => {
    const { state, p1, legal } = position({
      monster: "EBP04-032",
      hand: ["EBP04-031", "EBP04-034"],
    });
    const dead = mxPlanDead(state, legal, "P1");
    const rage = legal.filter((a) => a.type === "gainRage");
    expect(
      rage.filter((a) => !dead.has(a)).map((a) => numberOf(state, p1, a)),
    ).toEqual(["EBP04-031"]);
  });

  it("rule 12: no Evolution of the Monster X battle card into Kaizer Ghidorah while it is the only blue battle card in zones", () => {
    const evolve = (zones: Setup["zones"]) => {
      const { state } = position({ zones });
      state.pendingChoice = {
        id: 991,
        player: "P1",
        kind: "confirm",
        rule: "12.6",
        options: ["yes", "no"].map((id) => ({
          id,
          cardId: null,
          abilityId: "EBP04-047#evolution",
        })),
      };
      const legal = getLegalActions(state, "P1");
      const dead = mxPlanDead(state, legal, "P1");
      return legal
        .filter((a) => a.type === "choose" && !dead.has(a))
        .map((a) => (a.type === "choose" ? a.optionId : ""));
    };
    expect(evolve({ 1: "EBP04-047", 2: "EBP04-057" })).toEqual(["no"]);
    // Manda (2004) is blue too: Evolution may go ahead.
    expect(evolve({ 1: "EBP04-047", 2: "EBP04-045" })).toEqual(["yes", "no"]);
  });

  it("rule 9: an invasion that doesn't win this turn is dead", () => {
    // The opponent's zone 8 holds a battle card: no invasion win in sight (d).
    const { state, legal } = position({
      position: 3,
      hand: ["EBP04-057"],
      oppZones: { 8: "EBP04-038" },
    });
    const invades = legal.filter((a) => a.type === "invade");
    expect(invades.length).toBeGreaterThan(0);
    const dead = mxPlanDead(state, legal, "P1");
    expect(invades.every((a) => dead.has(a))).toBe(true);
  });

  it("rule 9 (b): late, with the opponent knocked back (rank 3 or 4, theirs in zone 3 or lower), an invasion stays", () => {
    const alive = (setup: Setup) => {
      const s = position({
        position: 3,
        hand: ["EBP04-057"],
        oppZones: { 8: "EBP04-038" },
        ...setup,
      });
      const dead = mxPlanDead(s.state, s.legal, "P1");
      const invades = s.legal.filter((a) => a.type === "invade");
      expect(invades.length).toBeGreaterThan(0);
      expect(invadeReason(s.state, s.p1, s.p2)).toBe(
        setup.monster === "EBP04-034" && setup.oppPosition === 3 ? "b" : null,
      );
      return invades.some((a) => !dead.has(a));
    };
    expect(alive({ monster: "EBP04-034", oppPosition: 3 })).toBe(true);
    expect(alive({ monster: "EBP04-034", oppPosition: 5 })).toBe(false);
    expect(alive({ monster: "EBP04-032", oppPosition: 3 })).toBe(false);
  });

  it("rule 9 (c): a race: their counter power reaches your threat at your next rank and no hand card destroys their battle cards", () => {
    const run = (hand: string[], oppZones: Setup["oppZones"]) => {
      const s = position({ monster: "EBP04-036", position: 3, hand, oppZones });
      const dead = mxPlanDead(s.state, s.legal, "P1");
      return {
        reason: invadeReason(s.state, s.p1, s.p2),
        alive: s.legal.some((a) => a.type === "invade" && !dead.has(a)),
      };
    };
    // 3 Kaizer Ghidorah (2004) battle cards: 33,000 against the rank 4's 30,000; zone 8 is one.
    const strong = { 1: "EBP04-068", 2: "EBP04-068", 8: "EBP04-068" } as const;
    expect(run(["EBP04-057"], strong)).toEqual({ reason: "c", alive: true });
    // Godzilla vs. Megaguirus in hand can destroy their battle cards.
    expect(run(["EBP04-057", "EBP01-064"], strong)).toEqual({
      reason: null,
      alive: false,
    });
    expect(run(["EBP04-057"], { 8: "EBP04-038" })).toEqual({
      reason: null,
      alive: false,
    });
  });

  it("rule 9 (d): invade when it wins in fewer of your turns than countering", () => {
    // Zone 6, Kamacuras (2004) pays 2 icons: zone 8 this turn, out of it next turn (2 turns).
    const fast = position({ position: 6, hand: ["EBP04-038"] });
    expect(turnsToInvade(fast.state, fast.p1, fast.p2)).toBe(2);
    expect(turnsToCounter(fast.state, fast.p1, fast.p2)).toBeGreaterThan(2);
    expect(invadeReason(fast.state, fast.p1, fast.p2)).toBe("d");
    // Their rank 4 monster, countered this turn: 1 turn by countering beats 2 by invading.
    const slow = position({
      position: 6,
      hand: ["EBP04-038"],
      oppMonster: "EBP04-036",
      zones: { 1: "EBP04-068", 2: "EBP04-068", 3: "EBP04-068" },
    });
    expect(turnsToCounter(slow.state, slow.p1, slow.p2)).toBe(1);
    const dead = mxPlanDead(slow.state, slow.legal, "P1");
    expect(invadeReason(slow.state, slow.p1, slow.p2)).toBe(null);
    expect(
      slow.legal.filter((a) => a.type === "invade").every((a) => dead.has(a)),
    ).toBe(true);
  });

  it("rules 9 and 3: an invasion that wins stays, paid with a battle card of a new discard color", () => {
    const { state, p1, legal } = position({
      position: 8,
      hand: ["EBP04-044", "EBP04-057"],
      discard: ["EBP04-038"],
    });
    const dead = mxPlanDead(state, legal, "P1");
    const invades = legal.filter((a) => a.type === "invade");
    const alive = invades.filter((a) => !dead.has(a));
    // Red is already in the discard pile (Kamacuras); King Caesar (2004) adds green.
    expect(alive.map((a) => numberOf(state, p1, a))).toEqual(["EBP04-057"]);
  });

  it("rule 7: Final Wars only with 1 or fewer battle cards in zones, or a stronger [final-wars] card in the deck to cover with", () => {
    const fw = (s: ReturnType<typeof position>) =>
      s.legal.filter(
        (a) =>
          a.type === "activateStrategy" &&
          numberOf(s.state, s.p1, a) === "EBP04-079",
      );
    const one = position({ hand: ["EBP04-079"], zones: { 1: "EBP04-038" } });
    expect(fw(one).length).toBeGreaterThan(0);
    expect(
      fw(one).some((a) => !mxPlanDead(one.state, one.legal, "P1").has(a)),
    ).toBe(true);
    const two = position({
      hand: ["EBP04-079"],
      zones: { 1: "EBP04-038", 2: "EBP04-057" },
    });
    const twoDead = mxPlanDead(two.state, two.legal, "P1");
    // The starter deck holds no [final-wars] battle card to cover them with.
    expect(fw(two).every((a) => twoDead.has(a))).toBe(true);
    const cover = position({
      hand: ["EBP04-079"],
      deck: ["EBP04-068"],
      zones: { 1: "EBP04-038", 2: "EBP04-057" },
    });
    const coverDead = mxPlanDead(cover.state, cover.legal, "P1");
    expect(fw(cover).some((a) => !coverDead.has(a))).toBe(true);
    // Every zone but the monster's (7) full of rank 3 cards; a Kaizer Ghidorah left in the deck.
    const full = position({
      hand: ["EBP04-079"],
      deck: ["EBP04-068"],
      zones: Object.fromEntries(
        [1, 2, 3, 4, 5, 6, 8].map((z) => [z, "EBP04-038"]),
      ) as Setup["zones"],
    });
    const fullDead = mxPlanDead(full.state, full.legal, "P1");
    expect(fw(full).some((a) => !fullDead.has(a))).toBe(true);
  });

  it("rule 10: with the opponent's monster in zone 7 and the counter made, Landing comes before the main phase ends", () => {
    const { state, p1, p2, legal } = position({
      oppPosition: 7,
      hand: ["EBP01-030"],
      zones: { 1: "EBP04-068", 2: "EBP04-068", 3: "EBP04-068", 4: "EBP04-068" },
    });
    expect(counterPowerOf(state, p1)).toBeGreaterThanOrEqual(
      getThreat(state, p2.id),
    );
    const dead = mxPlanDead(state, legal, "P1");
    expect(
      legal.filter((a) => a.type === "pass").every((a) => dead.has(a)),
    ).toBe(true);
    expect(
      legal.some((a) => numberOf(state, p1, a) === "EBP01-030" && !dead.has(a)),
    ).toBe(true);
  });

  it("rule 11: Godzilla Captured! only when the rage reset makes this turn's counter", () => {
    const captured = (oppRage: number) => {
      const s = position({
        oppRage,
        hand: ["EBP03-079"],
        zones: { 1: "EBP04-068" },
      });
      const dead = mxPlanDead(s.state, s.legal, "P1");
      const play = s.legal.filter(
        (a) =>
          a.type === "activateStrategy" &&
          numberOf(s.state, s.p1, a) === "EBP03-079",
      );
      return { s, dead, play };
    };
    // Base threat at or under 11,000 with no rage: the reset makes the counter at rage 2.
    const base = captured(0);
    const threat = getThreat(base.s.state, "P2");
    const power = counterPowerOf(base.s.state, base.s.p1);
    expect(activeMonster(base.s.state, base.s.p2)).toBeTruthy();
    expect(threat).toBeLessThanOrEqual(power);
    const makes = captured(2);
    expect(makes.play.length).toBeGreaterThan(0);
    expect(makes.play.some((a) => !makes.dead.has(a))).toBe(true);
    expect(
      makes.s.legal
        .filter((a) => a.type === "pass")
        .every((a) => makes.dead.has(a)),
    ).toBe(true);
    // Already made without it: Captured! waits.
    expect(base.play.every((a) => base.dead.has(a))).toBe(true);
  });

  it("rule 13: Monster Island only when zones 1-5 all hold battle cards", () => {
    const island = (zones: Setup["zones"]) => {
      const s = position({ hand: ["EBP01-080"], zones });
      const dead = mxPlanDead(s.state, s.legal, "P1");
      const play = s.legal.filter(
        (a) =>
          a.type === "activateStrategy" &&
          numberOf(s.state, s.p1, a) === "EBP01-080",
      );
      expect(play.length).toBeGreaterThan(0);
      return play.some((a) => !dead.has(a));
    };
    expect(
      island({
        1: "EBP04-038",
        2: "EBP04-057",
        3: "EBP04-045",
        4: "EBP04-038",
      }),
    ).toBe(false);
    expect(
      island({
        1: "EBP04-038",
        2: "EBP04-057",
        3: "EBP04-045",
        4: "EBP04-038",
        5: "EBP04-057",
      }),
    ).toBe(true);
  });

  it("rule 14: vs King Ghidorah, the last removal for Mecha-King Ghidorah stays in hand until it lands", () => {
    const keep = (hand: string[], oppZones: Setup["oppZones"] = {}) => {
      const s = position({ oppMonster: "EBP02-047", hand, oppZones });
      const dead = mxPlanDead(s.state, s.legal, "P1");
      return s.legal
        .filter(
          (a) =>
            a.type === "activateStrategy" &&
            numberOf(s.state, s.p1, a) === "EBP01-064",
        )
        .every((a) => dead.has(a));
    };
    expect(keep(["EBP01-064"])).toBe(true);
    expect(keep(["EBP01-064", "EBP01-064"])).toBe(false);
    expect(keep(["EBP01-064"], { 2: "EBP02-068" })).toBe(false);
  });
});

describe("Godzilla Final Wars placement (Paul's ruling, Nov 7, 2026)", () => {
  /** P1 activates Final Wars with the given zones and deck top; returns the first zone pick. */
  const reveal = (zones: Setup["zones"], deck: string[]) => {
    const s = position({ hand: ["EBP04-079"], zones, deck });
    const activate = s.legal.find(
      (a) =>
        a.type === "activateStrategy" &&
        numberOf(s.state, s.p1, a) === "EBP04-079",
    );
    if (!activate) throw new Error("Final Wars not playable");
    const at = advanceToDecision(applyAction(s.state, activate));
    return { at, legal: getLegalActions(at, "P1") };
  };
  const zoneOf = (a: Action) =>
    a.type === "choose" ? Number(a.optionId.split(":")[1]) : null;

  it("5.11.1, 7.4.2: with empty zones left, the revealed card goes into one: covering a card lowers the total", () => {
    const { at, legal } = reveal({ 1: "EBP04-038", 2: "EBP04-057" }, [
      "EBP04-068",
    ]);
    expect(at.pendingChoice?.kind).toBe("zone");
    const dead = finalWarsDead(at, legal, "P1");
    const alive = live(legal, dead)
      .filter((a) => a.type === "choose")
      .map(zoneOf);
    expect(alive.length).toBeGreaterThan(0);
    expect(alive).not.toContain(1);
    expect(alive).not.toContain(2);
  });

  it("5.11.1, 7.4.2: with every zone full, it covers the weakest card", () => {
    const zones = Object.fromEntries(
      [1, 2, 3, 4, 5, 6, 8].map((z) => [
        z,
        z === 4 ? "EBP04-038" : "EBP04-068",
      ]),
    ) as Setup["zones"];
    const { at, legal } = reveal(zones, ["EBP04-068"]);
    const dead = finalWarsDead(at, legal, "P1");
    expect(
      live(legal, dead)
        .filter((a) => a.type === "choose")
        .map(zoneOf),
    ).toEqual([4]);
  });

  it("leaves other choices alone", () => {
    const { state, legal } = position({ hand: ["EBP04-057"] });
    expect(finalWarsDead(state, legal, "P1").size).toBe(0);
  });
});

describe("the root's dead actions: plans over the general rules (#223)", () => {
  const actions: Action[] = [
    { type: "gainRage", player: "P1", cardInstanceId: "c1" },
    { type: "pass", player: "P1" },
    { type: "concede", player: "P1" },
  ];
  const [rage, pass] = actions as [Action, Action];
  const keyOf = (a: Action) => a.type;
  const general = (a: Action) => ({
    dead: new Set([keyOf(a)]),
    killed: new Set([a]),
  });

  it("keeps every kill while an action other than conceding is left", () => {
    const kept = combineDead(
      actions,
      keyOf,
      new Set(),
      { dead: new Set(), killed: new Set() },
      new Set([rage]),
    );
    expect([...(kept?.dead ?? [])]).toEqual(["gainRage"]);
  });

  it("when the general rules and a plan together leave nothing, the plan wins", () => {
    const kept = combineDead(
      actions,
      keyOf,
      new Set(),
      general(pass),
      new Set([rage]),
    );
    expect([...(kept?.dead ?? [])]).toEqual(["gainRage"]);
    expect(kept?.killed.has(pass)).toBe(false);
  });

  it("a plan that leaves nothing on its own keeps only the prune", () => {
    expect(
      combineDead(
        actions,
        keyOf,
        new Set(),
        general(pass),
        new Set([rage, pass]),
      ),
    ).toBe(null);
  });
});
