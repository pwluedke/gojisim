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
import { DECK_GOALS, TYPE_GOALS } from "./rulePhrases";
import { adviceStory, deckGoal } from "./story";
import type { Decklist } from "./types";
import type { DecisionTrace } from "./trace";

/*
 * #478 phase 2b (Nov 19): the Why as a short story. The target is the owner's Monster X vs SpaceG
 * paragraph (turn 1): the deck's goal, the board, King Caesar into zone 1 and Kumonga into zone 8
 * for its effect, not enough to counter SpaceGodzilla but battle cards on the board and cards
 * drawn at the end of the turn, and why it doesn't invade.
 */

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

let nextId = 970000;
function add(state: GameState, card: Card, owner: string): CardInstance {
  state.cards = { ...state.cards, [card.id]: card };
  return { instanceId: `s${nextId++}`, cardId: card.id, owner };
}

/** P1's main phase: Monster X against SpaceGodzilla Flying Form in zone 3. */
function monsterXVersusSpaceG() {
  const decks: [PlayerSetup, PlayerSetup] = [
    { id: "P1", ...official("esd01-starter.txt") },
    { id: "P2", ...official("esd02-starter.txt") },
  ];
  let state = advanceToDecision(startGame({ seed: "story", decks }));
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
  const [p1, p2] = state.players as [PlayerState, PlayerState];
  p1.invadingMonsterZone = [add(state, real("EBP04-031"), "P1")];
  p1.monsterDeck = [add(state, real("EBP04-032"), "P1")];
  // Turn 1: Monster X hasn't entered the zones yet.
  p1.monsterPosition = null;
  p1.rage = 0;
  p1.discard.push(...p1.hand);
  p1.hand = [
    add(state, real("EBP02-010"), "P1"),
    add(state, real("EBP01-017"), "P1"),
  ];
  for (const z of [1, 2, 3, 4, 5, 6, 7, 8] as const) {
    p1.zones[z] = [];
    p2.zones[z] = [];
  }
  p2.invadingMonsterZone = [add(state, real("EBP02-053"), "P2")];
  p2.monsterPosition = 3;
  p2.rage = 1;
  return { state, p1 };
}

/** Plays the turn: King Caesar into zone 1, Kumonga into zone 8, then pass. */
function kingCaesarAndKumonga() {
  const { state, p1 } = monsterXVersusSpaceG();
  const [caesar, kumonga] = p1.hand as [CardInstance, CardInstance];
  const line: { action: Action; state: GameState }[] = [];
  let s = state;
  const play = (card: CardInstance, zone: number) => {
    const a = getLegalActions(s, "P1").find(
      (x) =>
        x.type === "playBattle" &&
        x.cardInstanceId === card.instanceId &&
        x.zone === zone,
    );
    if (!a) throw new Error(`can't play into zone ${zone}`);
    line.push({ action: a, state: s });
    s = advanceToDecision(applyAction(s, a));
  };
  play(caesar, 1);
  play(kumonga, 8);
  const pass: Action = { type: "pass", player: "P1" };
  line.push({ action: pass, state: s });
  return { start: state, line };
}

const trace = (pick: Action): DecisionTrace => ({
  pick,
  blundered: false,
  alternatives: [{ action: pick, visits: 40, winRate: 0.55 }],
  rules: [],
});

describe("the Advisor's Why as a short story (#478 phase 2b)", () => {
  it("the owner's Monster X vs SpaceG turn: goal, board, the two plays, not enough to counter, the end-phase draw, no invasion", () => {
    const { start, line } = kingCaesarAndKumonga();
    const legal = getLegalActions(start, "P1");
    const story = adviceStory({
      start,
      me: "P1",
      line,
      trace: trace(line[0]!.action),
      own: undefined,
      legal,
    });
    // The deck's goal (Monster X, read from its monster).
    expect(story.startsWith(DECK_GOALS["Monster X"] ?? "?")).toBe(true);
    // The board.
    expect(story).toMatch(
      /Their SpaceGodzilla is in zone 3 with [\d,]+ threat/,
    );
    // The plays, with Kumonga's zone 8 effect.
    expect(story).toContain("King Caesar (2004) into zone 1");
    expect(story).toContain("Kumonga (2004) into zone 8 for its effect there");
    // Not enough to counter, with the battle cards on the board.
    expect(story).toMatch(
      /That makes 5,000 counter power, not enough to counter SpaceGodzilla \(threat [\d,]+\), but it puts 2 battle cards on the board\./,
    );
    // The end phase's draw: an empty hand draws 5.
    expect(story).toContain("draws 5 at the end of the turn");
    // No rule pointed at the move: the gap line.
    expect(story).toContain(
      "No rule explains this move; the search picked it (55% to win).",
    );
    // No card numbers or rule ids in the Why.
    expect(story).not.toMatch(/[A-Z]{2,4}\d{2}-\d{3}|card rule|play rule/);
  });

  it("a rule that pushed the pick gives its reason, and the no-rule line goes", () => {
    const { start, line } = kingCaesarAndKumonga();
    const pick = line[0]!.action;
    const story = adviceStory({
      start,
      me: "P1",
      line,
      trace: {
        ...trace(pick),
        rules: [
          {
            id: "play rule 6",
            effect: "favored",
            actions: [pick],
            text: "",
          },
        ],
      },
      own: undefined,
      legal: getLegalActions(start, "P1"),
    });
    expect(story).toMatch(/It plays .*, because /);
    expect(story).not.toContain("No rule explains this move");
  });
});

describe("the deck's goal, the story's first sentence (#478 phase 2b)", () => {
  const deck = (monsters: string[], main: string[]): Decklist => ({
    monsterDeck: monsters.map(real),
    mainDeck: main.map(real),
  });
  const { state } = monsterXVersusSpaceG();
  const noMonsterX = () => {
    const p1 = state.players[0] as PlayerState;
    p1.invadingMonsterZone = [];
    p1.monsterDeck = [];
    return state;
  };

  it("a Wrangler list (red Godzilla monsters and its core cards) gets the Wrangler goal", () => {
    const wrangler = deck(
      ["ESD01-001", "ESD01-002", "ESD01-003", "ESD01-004"],
      ["EBP01-075", "EBP01-073", "ESC01-004", ...Array(47).fill("ESD01-005")],
    );
    expect(deckGoal(noMonsterX(), "P1", wrangler)).toBe(DECK_GOALS["Wrangler"]);
  });

  it("a Tangler list (a rage-lowering monster and Entangling Fear) gets the Tangler goal", () => {
    const tangler = deck(
      ["EBP03-014", "EBP03-015", "EPR-020", "EBP03-017"],
      ["EBP04-081", ...Array(49).fill("EBP01-044")],
    );
    expect(deckGoal(noMonsterX(), "P1", tangler)).toBe(DECK_GOALS["Tangler"]);
  });

  it("a deck with no plan gets a goal by type: few monster cards read as a counter deck", () => {
    const starter = deck(
      ["ESD02-001", "ESD02-002", "ESD02-003", "ESD02-004"],
      Array(50).fill("ESD02-007"),
    );
    expect(deckGoal(noMonsterX(), "P1", starter)).toBe(TYPE_GOALS.counter);
  });
});
