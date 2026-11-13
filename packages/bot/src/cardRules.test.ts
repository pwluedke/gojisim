import { readFileSync } from "node:fs";
import type { Card } from "@gojisim/cards";
import { parseDeckList } from "@gojisim/cards/deck-lists";
import { getAllCards } from "@gojisim/cards/test-decks";
import {
  advanceToDecision,
  counterPowerOf,
  getThreat,
  applyAction,
  type CardInstance,
  type GameState,
  getLegalActions,
  type PlayerSetup,
  type PlayerState,
  startGame,
  type ZoneNumber,
} from "@gojisim/engine";
import { describe, expect, it } from "vitest";
import {
  cardRulesDead,
  losesWithoutStrategy,
  recursFromDiscard,
  slowCounterDeck,
} from "./cardRules";
import type { Decklist } from "./types";
import { difficultySettings, PRESETS } from "./difficulty";
import { botInput, decklistsOf, seededRng } from "./input";
import { decide } from "./ismcts";

/** Paul's card-play rules for Medium and Hard (Nov 12), on built positions at P1's play timing. */

function official(file: string): Omit<PlayerSetup, "id"> {
  const url = new URL(`../../cards/data/decks/${file}`, import.meta.url);
  const deck = parseDeckList(readFileSync(url, "utf8")).decks[0];
  if (!deck) throw new Error(file);
  return { monsterDeck: deck.monsterDeck, mainDeck: deck.mainDeck };
}
const DECKS: [PlayerSetup, PlayerSetup] = [
  { id: "P1", ...official("esd01-starter.txt") },
  { id: "P2", ...official("esd02-starter.txt") },
];
const real = (number: string): Card =>
  getAllCards().find(
    (c) => c.cardNumber === number && c.parentId === null,
  ) as Card;

let nextId = 970000;
function add(state: GameState, card: Card, owner: string): CardInstance {
  state.cards = { ...state.cards, [card.id]: card };
  return { instanceId: `c${nextId++}`, cardId: card.id, owner };
}

/** The decklists, with the cards the positions add, so the bot's own hidden cards fit its list. */
const LISTS = decklistsOf([
  {
    ...DECKS[0],
    monsterDeck: [...DECKS[0].monsterDeck, real("ESD01-004")],
    mainDeck: [...DECKS[0].mainDeck, real("EBP03-013"), real("ESD01-016")],
  },
  DECKS[1],
]);

/**
 * P1's main phase play timing: Godzilla (2023) ESD01-004 (rank IV) as its monster in zone 6, and
 * Godzilla (1995) EBP03-013 (rank IV, a Godzilla: 8.5.1) in hand, no strategy card anywhere.
 */
function withGodzilla1995() {
  let state = advanceToDecision(
    startGame({ seed: "card-rules", decks: DECKS }),
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
  const [p1] = state.players as [PlayerState, PlayerState];
  p1.monsterPosition = 6;
  p1.discard.push(...p1.hand);
  p1.hand = [];
  for (const zone of p1.strategyZones) zone.length = 0;
  // This turn's monster play (8.5) is still to come.
  state.turnFlags = { ...state.turnFlags, monsterPlayed: false };
  p1.invadingMonsterZone.push(add(state, real("ESD01-004"), "P1"));
  const godzilla1995 = add(state, real("EBP03-013"), "P1");
  p1.hand.push(godzilla1995);
  /** Whether the card rules leave out playing it (the same action objects as `getLegalActions`). */
  const ruledOut = () => {
    const legal = getLegalActions(state, "P1");
    const action = legal.find(
      (a) =>
        a.type === "playMonster" &&
        a.cardInstanceId === godzilla1995.instanceId,
    );
    if (!action) throw new Error("Godzilla (1995) can't be played here");
    return cardRulesDead(state, legal, "P1").has(action);
  };
  const play = () =>
    getLegalActions(state, "P1").find(
      (a) =>
        a.type === "playMonster" &&
        a.cardInstanceId === godzilla1995.instanceId,
    );
  return { state, p1, play, ruledOut };
}

describe("Paul's card-play rules (Nov 12), Medium and Hard", () => {
  it("#255: Godzilla (1995) EBP03-013 loses the game with empty strategy zones, read from its ability data", () => {
    expect(losesWithoutStrategy("EBP03-013")).toBe(true);
    expect(losesWithoutStrategy("ESD01-003")).toBe(false);
    expect(losesWithoutStrategy("EBP02-072")).toBe(false);
  });

  it("#255: with no strategy card in play or playable this turn, playing it is left out", () => {
    expect(withGodzilla1995().ruledOut()).toBe(true);
  });

  it("#255: with a strategy card already in a strategy zone, or one in hand it can play this turn, it may be played", () => {
    const inZone = withGodzilla1995();
    inZone.p1.strategyZones[0] = [
      {
        card: add(inZone.state, real("ESD01-016"), "P1"),
        placedOnTurn: inZone.state.turn,
      },
    ];
    expect(inZone.ruledOut()).toBe(false);
    const inHand = withGodzilla1995();
    inHand.p1.hand.push(add(inHand.state, real("ESD01-016"), "P1"));
    expect(
      getLegalActions(inHand.state, "P1").some(
        (a) => a.type === "activateStrategy",
      ),
    ).toBe(true);
    expect(inHand.ruledOut()).toBe(false);
  });

  it("#255: Medium (12% blunders included) and Hard never play it there; Easy has no card rules", () => {
    expect(difficultySettings(PRESETS.easy).cardRules).toBe(0);
    expect(difficultySettings(PRESETS.medium).cardRules).toBe(1);
    expect(difficultySettings(PRESETS.hard).cardRules).toBe(1);
    const { state, play } = withGodzilla1995();
    const action = play();
    expect(action).toBeDefined();
    for (const level of [PRESETS.medium, PRESETS.hard])
      for (let seed = 0; seed < 12; seed++) {
        const settings = {
          ...difficultySettings(level),
          iterations: 40,
          maxMs: 1e9,
          // Every pick a blunder at Medium, to check blunders too.
          ...(level === PRESETS.medium && seed % 2 ? { blunder: 1 } : {}),
        };
        const picked = decide(
          botInput(
            state,
            "P1",
            LISTS,
            seededRng(`card-rules-${level}-${seed}`),
            settings,
          ),
        ).action;
        expect(picked).not.toEqual(action);
      }
  });

  /**
   * #246: P1 in its zone 8; the opponent's zone 8 holds a rank 4 battle card, and a rank 3 one is
   * in zone 1. In hand: Godzilla 2000: Millennium EBP02-038 (destroy 1 of the opponent's rank 5
   * or lower battle cards) and Heat Ray ESD01-016 to pay for the invasion.
   */
  function blockedZone8() {
    const { state, p1 } = withGodzilla1995();
    p1.hand = [];
    p1.monsterPosition = 8;
    const opp = state.players[1] as PlayerState;
    const blocker = add(state, { ...real("ESD02-011"), rank: 4 }, "P2");
    const other = add(state, { ...real("ESD02-012"), rank: 3 }, "P2");
    opp.zones[8] = [[blocker]];
    opp.zones[1] = [[other]];
    p1.hand.push(
      add(state, real("EBP02-038"), "P1"),
      add(state, real("ESD01-016"), "P1"),
    );
    return { state, blocker, other };
  }

  it("#246, 8.6.2: in zone 8 behind a blocker a play can destroy, no invading into it and no pass; the clearing play stays", () => {
    const { state } = blockedZone8();
    const legal = getLegalActions(state, "P1");
    const dead = cardRulesDead(state, legal, "P1");
    expect(legal.filter((a) => a.type === "invade").length).toBeGreaterThan(0);
    for (const a of legal)
      if (a.type === "invade" || a.type === "pass")
        expect(dead.has(a)).toBe(true);
    expect(
      legal.some((a) => a.type === "activateStrategy" && !dead.has(a)),
    ).toBe(true);
  });

  it("#246: inside the clearing play, only the answers that clear zone 8 stay (the blocker as the target)", () => {
    const { state, blocker, other } = blockedZone8();
    let s = state;
    const activate = getLegalActions(s, "P1").find(
      (a) => a.type === "activateStrategy",
    )!;
    s = advanceToDecision(applyAction(s, activate));
    // Answer until the target pick, taking any answer that keeps the blocker reachable.
    for (let i = 0; i < 5 && s.pendingChoice?.kind !== "target"; i++) {
      const legal = getLegalActions(s, "P1");
      const dead = cardRulesDead(s, legal, "P1");
      const keep = legal.find((a) => a.type === "choose" && !dead.has(a))!;
      s = advanceToDecision(applyAction(s, keep));
    }
    expect(s.pendingChoice?.kind).toBe("target");
    const legal = getLegalActions(s, "P1");
    const dead = cardRulesDead(s, legal, "P1");
    const target = (id: string) =>
      legal.find((a) => a.type === "choose" && a.optionId === id)!;
    expect(dead.has(target(blocker.instanceId))).toBe(false);
    expect(dead.has(target(other.instanceId))).toBe(true);
  });

  it("#246: with nothing that can clear it, invading and passing stay (no rule to apply)", () => {
    const { state } = blockedZone8();
    const p1 = state.players[0] as PlayerState;
    p1.hand = p1.hand.filter(
      (c) => state.cards[c.cardId]?.cardNumber !== "EBP02-038",
    );
    const legal = getLegalActions(state, "P1");
    expect(cardRulesDead(state, legal, "P1").size).toBe(0);
  });

  /**
   * #258: Mecha-King Ghidorah EBP02-068 in P1's hand (its rank lowered, so it can be played
   * anywhere: the test is where), P1's monster in `mine`, the opponent's in `theirs`.
   */
  function mechaKing(mine: ZoneNumber, theirs: ZoneNumber) {
    const { state, p1 } = withGodzilla1995();
    p1.hand = [];
    p1.monsterPosition = mine;
    (state.players[1] as PlayerState).monsterPosition = theirs;
    const card = add(state, { ...real("EBP02-068"), rank: 1 }, "P1");
    p1.hand.push(card);
    const zonesLeft = () => {
      const legal = getLegalActions(state, "P1");
      const dead = cardRulesDead(state, legal, "P1");
      return legal
        .filter(
          (a) =>
            a.type === "playBattle" &&
            a.cardInstanceId === card.instanceId &&
            !dead.has(a),
        )
        .map((a) => (a.type === "playBattle" ? a.zone : 0))
        .sort();
    };
    return { state, p1, zonesLeft };
  }

  it("#258, 4.4.5.5: Mecha-King goes in the opponent's monster column (their zone 4 faces your zone 2)", () => {
    expect(mechaKing(5, 4).zonesLeft()).toEqual([2]);
    // Their zone 6 faces your zone 1.
    expect(mechaKing(4, 6).zonesLeft()).toEqual([1]);
  });

  it("#247: Mechagodzilla (1993) ESD02-012's column bonus (+3000) counts too: it goes in the opponent's monster column", () => {
    const { state, p1 } = withGodzilla1995();
    p1.hand = [];
    p1.monsterPosition = 7;
    (state.players[1] as PlayerState).monsterPosition = 3;
    const card = add(state, { ...real("ESD02-012"), rank: 1 }, "P1");
    p1.hand.push(card);
    const legal = getLegalActions(state, "P1");
    const dead = cardRulesDead(state, legal, "P1");
    // Their zone 3 faces your 3 and 8; 8 is straight ahead of your monster in 7.
    expect(
      legal
        .filter((a) => a.type === "playBattle" && !dead.has(a))
        .map((a) => (a.type === "playBattle" ? a.zone : 0)),
    ).toEqual([3]);
  });

  it("#258: with the column out of reach (their monster in zone 1 faces your 5 and 6: your monster's zone and the one straight ahead), zone 1 or 2", () => {
    expect(mechaKing(5, 1).zonesLeft()).toEqual([1, 2]);
  });

  it("#258: never the zone straight ahead of your own monster; an empty zone before stacking", () => {
    // Their monster in zone 3 faces your 3 and 8; yours in 7, so 8 is straight ahead: zone 3.
    expect(mechaKing(7, 3).zonesLeft()).toEqual([3]);
    // Zone 1 holds your card: with the column out of reach, empty zone 2 over stacking on it.
    const stacked = mechaKing(5, 1);
    stacked.p1.zones[1] = [[add(stacked.state, real("ESD01-016"), "P1")]];
    expect(stacked.zonesLeft()).toEqual([2]);
  });

  it("#259: King Ghidorah (1998) EBP03-063 plays itself from the discard pile, read from its ability data", () => {
    expect(recursFromDiscard("EBP03-063")).toBe(true);
    expect(recursFromDiscard("EBP02-068")).toBe(false);
    expect(recursFromDiscard("ESD01-016")).toBe(false);
  });

  it("#259: from the hand, a recurring card goes in an empty zone, not on your own card", () => {
    const { state, p1 } = withGodzilla1995();
    // Rank 1, so it can be played anywhere (8.2.1): the test is where.
    p1.hand = [add(state, { ...real("EBP03-063"), rank: 1 }, "P1")];
    p1.zones[1] = [[add(state, real("ESD01-016"), "P1")]];
    const legal = getLegalActions(state, "P1");
    const dead = cardRulesDead(state, legal, "P1");
    const plays = legal.filter((a) => a.type === "playBattle");
    expect(plays.length).toBeGreaterThan(1);
    for (const a of plays)
      if (a.type === "playBattle") expect(dead.has(a)).toBe(a.zone === 1);
  });

  it("#259, 7.2.3: with its monster card played (zone 4 or beyond), it comes back from the discard: No is left out while a zone is empty", () => {
    const { state, p1 } = withGodzilla1995();
    p1.hand = [add(state, real("ESD01-007"), "P1")];
    p1.discard.push(add(state, real("EBP03-063"), "P1"));
    let s = state;
    const play = getLegalActions(s, "P1").find(
      (a) => a.type === "playMonster",
    )!;
    s = advanceToDecision(applyAction(s, play));
    // Its [enter] and the King Ghidorah card's ask may come in either order: answer up to it.
    for (let i = 0; i < 5 && s.pendingChoice?.kind !== "confirm"; i++) {
      const next = getLegalActions(s, "P1").find((a) => a.type === "choose");
      if (!next) break;
      s = advanceToDecision(applyAction(s, next));
    }
    expect(s.pendingChoice).toMatchObject({ kind: "confirm" });
    const legal = getLegalActions(s, "P1");
    const dead = cardRulesDead(s, legal, "P1");
    const answer = (id: string) =>
      legal.find((a) => a.type === "choose" && a.optionId === id)!;
    expect(dead.has(answer("no"))).toBe(true);
    expect(dead.has(answer("yes"))).toBe(false);
  });

  it("#259, 5.12: a destroy of the opponent's cards leaves their recurring King Ghidorah (1998) while another target is there", () => {
    const { state, p1 } = withGodzilla1995();
    const opp = state.players[1] as PlayerState;
    p1.hand = [add(state, real("EBP02-018"), "P1")];
    p1.rage = 2;
    // Low ranks, so neither breaks 11.3 where it stands (the rule reads the ability, not the rank).
    const kg = add(state, { ...real("EBP03-063"), rank: 1 }, "P2");
    const other = add(state, { ...real("ESD02-011"), rank: 1 }, "P2");
    // Their monster in zone 5, clear of both cards (11.3).
    opp.monsterPosition = 5;
    opp.zones[1] = [[kg]];
    opp.zones[2] = [[other]];
    let s = state;
    const activate = getLegalActions(s, "P1").find(
      (a) => a.type === "activateStrategy",
    )!;
    s = advanceToDecision(applyAction(s, activate));
    expect(s.pendingChoice?.kind).toBe("target");
    const legal = getLegalActions(s, "P1");
    const dead = cardRulesDead(s, legal, "P1");
    const target = (id: string) =>
      legal.find((a) => a.type === "choose" && a.optionId === id)!;
    expect(dead.has(target(kg.instanceId))).toBe(true);
    expect(dead.has(target(other.instanceId))).toBe(false);
  });

  /**
   * #254: Godzilla vs. Destoroyah EBP01-062 (+10,000 total counter power with a Destoroyah battle
   * card in your zones) in hand, Destoroyah Perfect Form EBP01-060 in your zone 1, and a battle
   * card in zone 2 worth `extra` more than the counter power needs to reach the threat.
   */
  function destoroyah(extra: number) {
    const { state, p1 } = withGodzilla1995();
    const opp = state.players[1] as PlayerState;
    p1.hand = [add(state, real("EBP01-062"), "P1")];
    p1.zones[1] = [[add(state, real("EBP01-060"), "P1")]];
    // A threat well above the board's counter power (3.4.5: +5,000 per rage).
    opp.rage = 6;
    const need = getThreat(state, opp.id) - counterPowerOf(state, p1);
    expect(need).toBeGreaterThan(20000);
    p1.zones[2] = [
      [
        add(
          state,
          {
            ...real("ESD02-011"),
            rank: 1,
            counterOrThreat: Math.max(0, need + extra),
          },
          "P1",
        ),
      ],
    ];
    const legal = getLegalActions(state, "P1");
    const play = legal.find((a) => a.type === "activateStrategy");
    if (!play) throw new Error("no activation");
    return cardRulesDead(state, legal, "P1").has(play);
  }

  it("#254, 7.4.3: Godzilla vs. Destoroyah is kept while the counter is already made without it", () => {
    expect(destoroyah(0)).toBe(true);
  });

  it("#254: it's played when its +10,000 makes the counter", () => {
    expect(destoroyah(-5000)).toBe(false);
  });

  it("#254: it's kept when even with it the counter isn't made", () => {
    expect(destoroyah(-20000)).toBe(true);
  });

  /** A decklist with `monsters` monster cards in its 50-card main deck. */
  const deckWith = (monsters: number): Decklist => ({
    monsterDeck: [],
    mainDeck: [
      ...Array.from({ length: monsters }, () => real("ESD01-004")),
      ...Array.from({ length: 50 - monsters }, () => real("ESD01-016")),
    ],
  });

  it("#248: a slow counter deck has 4 or fewer monster cards in its main deck (the Wrangler has 4)", () => {
    expect(slowCounterDeck(deckWith(4))).toBe(true);
    expect(slowCounterDeck(deckWith(5))).toBe(false);
    expect(slowCounterDeck(undefined)).toBe(false);
  });

  it("#248, 8.6: a slow counter deck doesn't invade, unless the invasion wins now", () => {
    const { state, p1 } = withGodzilla1995();
    p1.hand = [add(state, real("ESD01-016"), "P1")];
    p1.monsterPosition = 2;
    const invasions = () => {
      const legal = getLegalActions(state, "P1");
      return { legal, invade: legal.filter((a) => a.type === "invade") };
    };
    const early = invasions();
    expect(early.invade.length).toBeGreaterThan(0);
    for (const a of early.invade) {
      expect(cardRulesDead(state, early.legal, "P1", deckWith(4)).has(a)).toBe(
        true,
      );
      expect(cardRulesDead(state, early.legal, "P1", deckWith(20)).has(a)).toBe(
        false,
      );
    }
    // In zone 8 with the opponent's zone 8 open, the invasion wins (5.13.1.1.2): it stays.
    p1.monsterPosition = 8;
    (state.players[1] as PlayerState).zones[8] = [];
    const winning = invasions();
    expect(winning.invade.length).toBeGreaterThan(0);
    for (const a of winning.invade)
      expect(
        cardRulesDead(state, winning.legal, "P1", deckWith(4)).has(a),
      ).toBe(false);
  });
});
