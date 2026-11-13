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
  hasFlag,
} from "@gojisim/engine";
import { describe, expect, it } from "vitest";
import {
  blockingPlays,
  cardRulesDead,
  enterAwakening,
  hasRevenge,
  losesWithoutStrategy,
  reachZone,
  recursFromDiscard,
  rescuedPlays,
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

/** #265's position's decklists: the starter plus the cards `exposed` adds, nothing it takes out. */
const LISTS_265 = decklistsOf([
  {
    ...DECKS[0],
    monsterDeck: [...DECKS[0].monsterDeck, real("ESD01-004")],
    mainDeck: [
      ...DECKS[0].mainDeck,
      real("EBP01-073"),
      real("ESD01-007"),
      real("EBP03-004"),
      // As in LISTS: the hidden deck holds one card more than the starter's count leaves.
      real("ESD01-016"),
      ...Array.from({ length: 6 }, () => real("EBP01-002")),
    ],
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

// Some tests run the search (24 decisions), which takes seconds on a slow CI runner.
describe(
  "Paul's card-play rules (Nov 12), Medium and Hard",
  { timeout: 60_000 },
  () => {
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
      expect(legal.filter((a) => a.type === "invade").length).toBeGreaterThan(
        0,
      );
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
      // Their zone 5 faces your zone 1 (in their zone 6, your open zone 8 would come first: rule 7).
      expect(mechaKing(4, 5).zonesLeft()).toEqual([1]);
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

    it("#248: a slow counter deck has 4 or fewer monster cards in its main deck (the Tangler the bot played in #248 has 4)", () => {
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
        expect(
          cardRulesDead(state, early.legal, "P1", deckWith(4)).has(a),
        ).toBe(true);
        expect(
          cardRulesDead(state, early.legal, "P1", deckWith(20)).has(a),
        ).toBe(false);
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

    /**
     * #265: your zone 8 open, the opponent's monster in their zone 7; in hand Godzilla Against
     * Mechagodzilla EBP01-073 (playable with 8 or more monster cards in your discard pile) and two
     * rank IV Godzilla monster cards; 6 monster cards in your discard pile.
     */
    function exposed() {
      const { state, p1 } = withGodzilla1995();
      (state.players[1] as PlayerState).monsterPosition = 7;
      p1.hand = [
        add(state, real("EBP01-073"), "P1"),
        add(state, real("ESD01-007"), "P1"),
        add(state, real("EBP03-004"), "P1"),
      ];
      for (let i = 0; i < 6; i++)
        p1.discard.push(add(state, real("EBP01-002"), "P1"));
      return { state, p1 };
    }

    it("#265: with zone 8 open and their monster in reach, the plays that lead to a block are found (two rage discards, then Godzilla Against Mechagodzilla); passing is left out", () => {
      const { state } = exposed();
      const legal = getLegalActions(state, "P1");
      const blocks = blockingPlays(state, legal, "P1");
      expect([...blocks].map((a) => a.type)).toEqual(["gainRage", "gainRage"]);
      const dead = cardRulesDead(state, legal, "P1");
      for (const a of legal)
        if (a.type === "pass") expect(dead.has(a)).toBe(true);
      for (const a of blocks) expect(dead.has(a)).toBe(false);
    });

    it("#265: Hard takes a block even when Paul's rule 2 holds those monster cards (Level 100 passed in the report)", () => {
      const { state } = exposed();
      const action = decide(
        botInput(state, "P1", LISTS_265, seededRng("block"), {
          ...difficultySettings(PRESETS.hard),
          iterations: 60,
          maxMs: 1e9,
          blunder: 0,
        }),
      ).action;
      expect(action.type).toBe("gainRage");
    });

    it("#265: with no threat (their monster in zone 4) or zone 8 already blocked, nothing is forced", () => {
      const far = exposed();
      (far.state.players[1] as PlayerState).monsterPosition = 4;
      expect(
        blockingPlays(far.state, getLegalActions(far.state, "P1"), "P1").size,
      ).toBe(0);
      const held = exposed();
      held.p1.zones[8] = [[add(held.state, real("ESD02-011"), "P1")]];
      expect(
        blockingPlays(held.state, getLegalActions(held.state, "P1"), "P1").size,
      ).toBe(0);
    });

    it("#272: Godzilla, King of the Monsters EBP01-075 (protected in zones 1-5) goes in zones 1-5 when it can", () => {
      const { state, p1 } = withGodzilla1995();
      // Their monster far back, so your zone 8 isn't threatened (rule 7 stays out of it).
      (state.players[1] as PlayerState).monsterPosition = 3;
      p1.monsterPosition = 6;
      const card = add(state, { ...real("EBP01-075"), rank: 1 }, "P1");
      p1.hand = [card];
      const legal = getLegalActions(state, "P1");
      const dead = cardRulesDead(state, legal, "P1");
      const left = legal
        .filter((a) => a.type === "playBattle" && !dead.has(a))
        .map((a) => (a.type === "playBattle" ? a.zone : 0))
        .sort();
      expect(left.length).toBeGreaterThan(0);
      for (const z of left) expect(z).toBeLessThanOrEqual(5);
      expect(legal.some((a) => a.type === "playBattle" && a.zone === 7)).toBe(
        true,
      );
    });

    it("#274: under threat, with Godzilla, King of the Monsters (+3000 per rage) on the board, the rage discards that make the counter are freed from Paul's rule 2 holds", () => {
      const { state, p1 } = exposed();
      // Zone 8 already blocked, so it's the counter that matters, not rule 7.
      p1.zones[8] = [
        [
          add(
            state,
            { ...real("ESD02-011"), rank: 1, counterOrThreat: 0 },
            "P1",
          ),
        ],
      ];
      p1.zones[1] = [[add(state, { ...real("EBP01-075"), rank: 1 }, "P1")]];
      p1.hand = p1.hand.filter(
        (c) => state.cards[c.cardId]?.type === "Monster",
      );
      const opp = state.players[1] as PlayerState;
      // A big threat, then counter power filled to 4000 short: two more rage (+6000 on
      // EBP01-075, 3000 each) make the counter.
      opp.rage = 0;
      while (getThreat(state, opp.id) - counterPowerOf(state, p1) < 10000)
        opp.rage++;
      const filler = add(
        state,
        { ...real("ESD01-008"), rank: 1, counterOrThreat: 0 },
        "P1",
      );
      p1.zones[2] = [[filler]];
      // The filler's printed counter power, set so the counter is 4000 short (its own bonuses
      // counted as they stand).
      const short = getThreat(state, opp.id) - counterPowerOf(state, p1) - 4000;
      const setFiller = (value: number) => {
        state.cards = {
          ...state.cards,
          [filler.cardId]: {
            ...(state.cards[filler.cardId] as Card),
            counterOrThreat: value,
          },
        };
      };
      // A card with no ability: its printed counter power is all it adds.
      setFiller(short);
      const gap = getThreat(state, opp.id) - counterPowerOf(state, p1);
      expect(gap).toBeGreaterThan(0);
      expect(gap).toBeLessThanOrEqual(6000);
      const legal = getLegalActions(state, "P1");
      const rescued = rescuedPlays(state, legal, "P1");
      // The rage discards (and a monster play, +1 rage by 8.5.1.1) are ways to make it.
      expect([...rescued].some((a) => a.type === "gainRage")).toBe(true);
      expect(
        [...rescued].every(
          (a) => a.type === "gainRage" || a.type === "playMonster",
        ),
      ).toBe(true);
    });

    it("#275: Godzilla Landing EBP01-030 (advances the opponent's monster) waits when nothing then makes the counter or blocks zone 8; with zone 8 blocked it may go", () => {
      const { state, p1 } = withGodzilla1995();
      const opp = state.players[1] as PlayerState;
      opp.monsterPosition = 6;
      opp.rage = 6;
      p1.hand = [add(state, real("EBP01-030"), "P1")];
      const activation = () => {
        const legal = getLegalActions(state, "P1");
        const a = legal.find((x) => x.type === "activateStrategy");
        if (!a) throw new Error("Godzilla Landing can't be activated here");
        return cardRulesDead(state, legal, "P1").has(a);
      };
      expect(activation()).toBe(true);
      p1.zones[8] = [[add(state, { ...real("ESD01-008"), rank: 1 }, "P1")]];
      expect(activation()).toBe(false);
    });

    /**
     * Paul, Nov 12 (Ian): the opponent's King Ghidorah (1991) EBP02-047 monster in their zone 6; your
     * zone 8 held by a rank 4 battle card; Mechagodzilla (1993) ESD02-012 (rank 7) in hand.
     */
    function versusKingGhidorah(trait: "King Ghidorah" | "Godzilla") {
      const { state, p1 } = withGodzilla1995();
      const opp = state.players[1] as PlayerState;
      opp.invadingMonsterZone.push(
        add(
          state,
          trait === "King Ghidorah" ? real("EBP02-047") : real("ESD02-004"),
          "P2",
        ),
      );
      opp.monsterPosition = 7;
      p1.zones[8] = [[add(state, { ...real("ESD01-008"), rank: 4 }, "P1")]];
      p1.hand = [add(state, real("ESD02-012"), "P1")];
      return state;
    }

    it("rule 11 (Paul, Nov 12): against a green opponent (it can run Godzilla vs. King Ghidorah) in reach of zone 7, a rank 4 zone 8 blocker doesn't count: a rank 7+ one is looked for", () => {
      const kg = versusKingGhidorah("King Ghidorah");
      expect(
        blockingPlays(kg, getLegalActions(kg, "P1"), "P1").size,
      ).toBeGreaterThan(0);
      // Against a blue monster (no Godzilla vs. King Ghidorah), the rank 4 blocker holds.
      const other = versusKingGhidorah("Godzilla");
      expect(
        blockingPlays(other, getLegalActions(other, "P1"), "P1").size,
      ).toBe(0);
    });

    it("rule 2 (Paul, Nov 12): from zone 7, Godzilla vs. King Ghidorah EBP02-071 (awakening 6: destroy rank 6 or lower) clears the zone 8 blocker before the winning invasion", () => {
      const { state, p1 } = withGodzilla1995();
      const opp = state.players[1] as PlayerState;
      p1.monsterPosition = 7;
      p1.hand = [
        add(state, real("EBP02-071"), "P1"),
        // Icon 2: from zone 7 the invasion goes 7 to 8, then wins (5.13.1.1.2).
        add(state, real("EBP01-073"), "P1"),
      ];
      opp.zones[8] = [[add(state, { ...real("ESD02-011"), rank: 4 }, "P2")]];
      const legal = getLegalActions(state, "P1");
      const dead = cardRulesDead(state, legal, "P1");
      expect(legal.some((a) => a.type === "invade")).toBe(true);
      for (const a of legal)
        if (a.type === "invade") expect(dead.has(a)).toBe(true);
      expect(
        legal.some((a) => a.type === "activateStrategy" && !dead.has(a)),
      ).toBe(true);
    });

    it("rule 12 (#130, 12.6.2): an Evolution's pick no stronger than the evolving card (Battra (Larva) onto Battra (Larva)) is left out; Battra (Imago) and done stay", () => {
      const { state } = withGodzilla1995();
      const larva = real("ESD02-008");
      const imago = real("ESD02-011");
      state.cards = { ...state.cards, [larva.id]: larva, [imago.id]: imago };
      // The Evolution of a Battra (Larva) in play, at its pick (as the engine asks it).
      state.resolution = {
        standby: {
          standbyId: "s1",
          abilityId: "ESD02-008#evolution",
          sourceInstanceId: "c-larva",
          sourceCardId: larva.id,
          master: "P1",
          timestamp: 0,
          event: { seq: 0, type: "phase", player: "P1", payload: {} },
        },
        stage: "main",
        path: [0],
        bindings: {},
        chosen: [],
        zonePicks: [],
        answer: null,
        replacementPicks: [],
        subject: null,
      };
      state.pendingChoice = {
        id: 99,
        player: "P1",
        kind: "target",
        rule: "12.6.2",
        options: [
          {
            id: "c-other-larva",
            cardId: larva.id,
            abilityId: "ESD02-008#evolution",
          },
          { id: "c-imago", cardId: imago.id, abilityId: "ESD02-008#evolution" },
          { id: "done", cardId: null, abilityId: "ESD02-008#evolution" },
        ],
      };
      const pick = (optionId: string) => ({
        type: "choose" as const,
        player: "P1" as const,
        choiceId: 99,
        optionId,
      });
      const actions = [pick("c-other-larva"), pick("c-imago"), pick("done")];
      const dead = cardRulesDead(state, actions, "P1");
      expect([...dead]).toEqual([actions[0]]);
    });

    it("rule 13 (#131): Super-X ESD02-009 ([enter] needs Awakening 4) waits while an invasion can take the monster from zone 3 to 4; in zone 4 it's played", () => {
      expect(enterAwakening("ESD02-009")).toBe(4);
      expect(enterAwakening("ESD01-016")).toBeNull();
      const early = (at: ZoneNumber) => {
        const { state, p1 } = withGodzilla1995();
        p1.monsterPosition = at;
        // Their monster far back: no zone 8 threat (rule 7 stays out).
        (state.players[1] as PlayerState).monsterPosition = 3;
        p1.hand = [
          add(state, { ...real("ESD02-009"), rank: 1 }, "P1"),
          add(state, real("ESD01-016"), "P1"),
        ];
        const legal = getLegalActions(state, "P1");
        const dead = cardRulesDead(state, legal, "P1");
        const plays = legal.filter((a) => a.type === "playBattle");
        expect(plays.length).toBeGreaterThan(0);
        return plays.every((a) => dead.has(a));
      };
      expect(early(3)).toBe(true);
      expect(early(4)).toBe(false);
    });

    it("rule 14 (#263): on turns 1-2 a rage discard that isn't needed is left out, and passing is freed; from turn 3 nothing changes", () => {
      const at = (turn: number) => {
        const { state, p1 } = withGodzilla1995();
        state.turn = turn;
        (state.players[1] as PlayerState).monsterPosition = 2;
        p1.hand = [add(state, real("EBP01-008"), "P1")];
        const legal = getLegalActions(state, "P1");
        const rage = legal.filter((a) => a.type === "gainRage");
        expect(rage.length).toBeGreaterThan(0);
        return {
          dead: rage.every((a) => cardRulesDead(state, legal, "P1").has(a)),
          passFreed: [...rescuedPlays(state, legal, "P1")].some(
            (a) => a.type === "pass",
          ),
        };
      };
      expect(at(1)).toEqual({ dead: true, passFreed: true });
      expect(at(2)).toEqual({ dead: true, passFreed: true });
      expect(at(3)).toEqual({ dead: false, passFreed: false });
    });

    it("rule 15 (#264): Godzilla (1954) EBP01-004 (on reaching zone 8, destroy all) isn't stacked while the monster can't reach zone 8 this turn; from zone 6 it can (invasion to 7, end-phase advance to 8)", () => {
      expect(reachZone("EBP01-004")).toBe(8);
      expect(reachZone("ESD01-004")).toBeNull();
      const held = (at: ZoneNumber) => {
        const { state, p1 } = withGodzilla1995();
        p1.monsterPosition = at;
        (state.players[1] as PlayerState).monsterPosition = 2;
        p1.hand = [
          add(state, real("EBP01-004"), "P1"),
          add(state, real("ESD01-016"), "P1"),
        ];
        const legal = getLegalActions(state, "P1");
        const stack = legal.find((a) => a.type === "playMonster");
        if (!stack) throw new Error("Godzilla (1954) can't be stacked here");
        return cardRulesDead(state, legal, "P1").has(stack);
      };
      expect(held(3)).toBe(true);
      expect(held(6)).toBe(false);
    });

    it("rule 16 (#290, 10.5.2.2.1): King Ghidorah (1991) EBP02-049's destroy mode, with no rank 5 or lower battle card to hit, isn't picked while the hand discard does something", () => {
      const { state, p1 } = withGodzilla1995();
      const opponent = state.players[1] as PlayerState;
      opponent.monsterPosition = 2;
      // P1's monster: King Ghidorah ranks 1-3; a second rank 3 from hand goes on top, 3 under it.
      p1.invadingMonsterZone = [
        add(state, real("EBP02-047"), "P1"),
        add(state, real("EBP02-048"), "P1"),
        add(state, real("EBP02-049"), "P1"),
      ];
      p1.hand = [add(state, real("EBP02-049"), "P1")];
      // The opponent: 6 cards in hand, and only a rank 7 battle card in their zones.
      opponent.hand = Array.from({ length: 6 }, () =>
        add(state, real("ESD01-016"), "P2"),
      );
      for (const z of [1, 2, 3, 4, 5, 6, 7, 8] as const) opponent.zones[z] = [];
      opponent.zones[1] = [[add(state, real("EBP01-073"), "P2")]];
      const play = getLegalActions(state, "P1").find(
        (a) => a.type === "playMonster",
      );
      if (!play) throw new Error("King Ghidorah (1991) can't be stacked here");
      let s = advanceToDecision(applyAction(state, play));
      for (
        let i = 0;
        i < 4 && s.pendingChoice && s.pendingChoice.kind !== "option";
        i++
      ) {
        const c = s.pendingChoice;
        s = advanceToDecision(
          applyAction(s, {
            type: "choose",
            player: c.player,
            choiceId: c.id,
            optionId: c.options[0]!.id,
          }),
        );
      }
      expect(s.pendingChoice?.kind).toBe("option");
      const legal = getLegalActions(s, "P1");
      const mode = (i: number) =>
        legal.find((a) => a.type === "choose" && a.optionId === String(i))!;
      const dead = cardRulesDead(s, legal, "P1");
      expect(dead.has(mode(0))).toBe(true);
      expect(dead.has(mode(1))).toBe(false);
    });

    it("#289: Mecha-King Ghidorah EBP02-068 in the opponent's monster column blocks their invasion, so rule 7 takes it over zone 8; it isn't stacked on your own Mecha-King there while zone 1 or 2 is empty", () => {
      const setup = () => {
        const { state, p1 } = withGodzilla1995();
        const opponent = state.players[1] as PlayerState;
        opponent.monsterPosition = 6;
        // P1's monster in zone 4, so zones 1 and 2 are open to play in.
        p1.monsterPosition = 4;
        // 9 King Ghidorah cards in the discard pile: Mecha-King at rank 23 - 18 = 5.
        p1.discard = Array.from({ length: 9 }, () =>
          add(state, real("EBP02-047"), "P1"),
        );
        p1.hand = [add(state, real("EBP02-068"), "P1")];
        for (const z of [1, 2, 3, 4, 5, 6, 7, 8] as const) p1.zones[z] = [];
        return { state, p1 };
      };
      const { state } = setup();
      const legal = getLegalActions(state, "P1");
      const plays = legal.filter(
        (a): a is Extract<typeof a, { type: "playBattle" }> =>
          a.type === "playBattle",
      );
      expect(plays.length).toBeGreaterThan(0);
      const column = plays.filter((a) => {
        const after = advanceToDecision(applyAction(state, a));
        const top = after.players[1]!.invadingMonsterZone.at(-1)!;
        return hasFlag(after, top, "cannotInvade");
      });
      expect(column.length).toBeGreaterThan(0);
      const dead = cardRulesDead(state, legal, "P1");
      for (const a of column) expect(dead.has(a)).toBe(false);
      for (const a of plays) if (a.zone === 8) expect(dead.has(a)).toBe(true);

      // Stacking: your own Mecha-King already in that column, zone 2 empty.
      const zone = column[0]!.zone;
      const second = setup();
      second.p1.zones[zone] = [[add(second.state, real("EBP02-068"), "P1")]];
      const legal2 = getLegalActions(second.state, "P1");
      const dead2 = cardRulesDead(second.state, legal2, "P1");
      for (const a of legal2)
        if (a.type === "playBattle" && a.zone === zone)
          expect(dead2.has(a)).toBe(true);
      expect(
        legal2.some(
          (a) =>
            a.type === "playBattle" &&
            (a.zone === 1 || a.zone === 2) &&
            a.zone !== zone &&
            !dead2.has(a),
        ),
      ).toBe(true);
    });

    it("rule 17 (#288, 11.3): Dorat EBP02-058 [revenge] goes ahead of your own monster, where its advance crushes it, an empty zone first, never zone 8; nothing is played on top of your own Dorat while another zone is open", () => {
      expect(hasRevenge("EBP02-058")).toBe(true);
      expect(hasRevenge("EBP02-068")).toBe(false);
      const { state, p1 } = withGodzilla1995();
      // The opponent's monster out of zone 8's reach (rule 7 stays out).
      (state.players[1] as PlayerState).monsterPosition = 3;
      p1.monsterPosition = 3;
      for (const z of [1, 2, 3, 4, 5, 6, 7, 8] as const) p1.zones[z] = [];
      p1.hand = [add(state, real("EBP02-058"), "P1")];
      const legal = getLegalActions(state, "P1");
      const plays = legal.filter(
        (a): a is Extract<typeof a, { type: "playBattle" }> =>
          a.type === "playBattle",
      );
      expect(plays.some((a) => a.zone > 3 && a.zone < 8)).toBe(true);
      const dead = cardRulesDead(state, legal, "P1");
      for (const a of plays)
        expect(dead.has(a)).toBe(!(a.zone > 3 && a.zone < 8));
      // Over your own Dorat (zone 4): no, while zone 5 is open.
      p1.zones[4] = [[add(state, real("EBP02-058"), "P1")]];
      const legal2 = getLegalActions(state, "P1");
      const dead2 = cardRulesDead(state, legal2, "P1");
      for (const a of legal2)
        if (a.type === "playBattle" && a.zone === 4)
          expect(dead2.has(a)).toBe(true);
    });

    it("#289 (Keldroc's record): Mecha-King Ghidorah EBP02-068 still goes in the opponent monster's column when your own Dorat (rule 17's [revenge]) is there, and not to zone 8", () => {
      const { state, p1 } = withGodzilla1995();
      const opponent = state.players[1] as PlayerState;
      opponent.monsterPosition = 6;
      p1.monsterPosition = 4;
      p1.discard = Array.from({ length: 9 }, () =>
        add(state, real("EBP02-047"), "P1"),
      );
      p1.hand = [add(state, real("EBP02-068"), "P1")];
      for (const z of [1, 2, 3, 4, 5, 6, 7, 8] as const) p1.zones[z] = [];
      const first = getLegalActions(state, "P1").filter(
        (a): a is Extract<typeof a, { type: "playBattle" }> =>
          a.type === "playBattle",
      );
      const column = first.find((a) => {
        const top = advanceToDecision(
          applyAction(state, a),
        ).players[1]!.invadingMonsterZone.at(-1)!;
        return hasFlag(
          advanceToDecision(applyAction(state, a)),
          top,
          "cannotInvade",
        );
      });
      if (!column) throw new Error("no column zone");
      // Your own Dorat in the column zone and in zone 8.
      p1.zones[column.zone] = [[add(state, real("EBP02-058"), "P1")]];
      p1.zones[8] = [[add(state, real("EBP02-058"), "P1")]];
      const legal = getLegalActions(state, "P1");
      const dead = cardRulesDead(state, legal, "P1");
      for (const a of legal)
        if (a.type === "playBattle")
          expect(dead.has(a)).toBe(a.zone !== column.zone);
    });
  },
);
