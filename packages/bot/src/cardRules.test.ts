import { readFileSync } from "node:fs";
import type { Card } from "@gojisim/cards";
import { parseDeckList } from "@gojisim/cards/deck-lists";
import { getAllCards } from "@gojisim/cards/test-decks";
import {
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
import { cardRulesDead, losesWithoutStrategy } from "./cardRules";
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
  },
);
