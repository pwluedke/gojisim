import { readFileSync } from "node:fs";
import type { Card } from "@gojisim/cards";
import { parseDeckList } from "@gojisim/cards/deck-lists";
import { getAllCards } from "@gojisim/cards/test-decks";
import {
  type Action,
  advanceToDecision,
  applyAction,
  counterPowerOf,
  type GameState,
  getLegalActions,
  getThreat,
  type PlayerSetup,
  type PlayerState,
  startGame,
} from "@gojisim/engine";
import { describe, expect, it } from "vitest";
import { decide } from "./ismcts";
import { botInput, decklistsOf, seededRng } from "./input";

// Paul's combo (Nov 5, 2026): Constructed Future (SD05-005) brings back King Ghidorah (2024)
// (EBP01-074), which lets Gravity Beam (EPR-019) be played at rank 4; with Gravity Beam in play
// King Ghidorah (2024) has 28,000 counter power, enough to counter (7.4.3) where nothing else is.

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

/** ESD01 with three of its cards made Constructed Future, Gravity Beam and King Ghidorah (2024). */
function decks(): [PlayerSetup, PlayerSetup] {
  const esd01 = official("esd01-starter.txt");
  const main = [...esd01.mainDeck];
  for (const n of ["SD05-005", "EPR-019", "EBP01-074"]) {
    const i = main.findIndex((c) => c.deckCardNumber === "ESD01-012");
    main[i] = real(n);
  }
  return [
    { id: "P1", monsterDeck: esd01.monsterDeck, mainDeck: main },
    { id: "P2", ...official("esd02-starter.txt") },
  ];
}

/**
 * P1's main phase, monster in zone 6: Constructed Future and Gravity Beam in hand, King Ghidorah
 * (2024) in the discard pile, three Shinseimaru (2,000 each) in zones 1 to 3. P2's invading
 * monster is Godzilla (1992), threat 18,000. Every card comes from P1's decklist.
 */
function position() {
  const setups = decks();
  let state = advanceToDecision(startGame({ seed: "cf-combo", decks: setups }));
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
  // Everything back to the deck, then take the cards the position needs out of it.
  p1.deck.push(...p1.hand, ...p1.discard);
  p1.hand = [];
  p1.discard = [];
  for (const z of [1, 2, 3, 4, 5, 6, 7, 8] as const) {
    for (const stack of p1.zones[z]) p1.deck.push(...stack);
    p1.zones[z] = [];
  }
  const take = (n: string) => {
    const i = p1.deck.findIndex(
      (c) => state.cards[c.cardId]?.deckCardNumber === n,
    );
    if (i < 0) throw new Error(`no ${n} in P1's deck`);
    return p1.deck.splice(i, 1)[0]!;
  };
  p1.hand = [take("SD05-005"), take("EPR-019")];
  p1.discard = [take("EBP01-074")];
  for (const z of [1, 2, 3] as const) p1.zones[z] = [[take("ESD01-008")]];
  p1.monsterPosition = 6;
  p1.rage = 0;
  // P2's invading monster: a Godzilla (1992) from its monster deck, threat 18,000.
  const i = p2.monsterDeck.findIndex(
    (c) => state.cards[c.cardId]?.deckCardNumber === "ESD02-003",
  );
  if (i >= 0) {
    const g = p2.monsterDeck.splice(i, 1)[0]!;
    p2.monsterDeck.push(...p2.invadingMonsterZone);
    p2.invadingMonsterZone = [g];
  }
  p2.monsterPosition = 3;
  p2.rage = 0;
  return { state, setups };
}

const play = (state: GameState, number: string): GameState => {
  const p1 = state.players[0] as PlayerState;
  const card = p1.hand.find(
    (c) => state.cards[c.cardId]?.deckCardNumber === number,
  );
  const action = getLegalActions(state, "P1").find(
    (a) =>
      a.type === "activateStrategy" && a.cardInstanceId === card?.instanceId,
  ) as Action;
  if (!action) throw new Error(`${number} can't be activated`);
  let s = advanceToDecision(applyAction(state, action));
  for (let k = 0; k < 20 && s.pendingChoice; k++) {
    const c = s.pendingChoice;
    s = advanceToDecision(
      applyAction(s, {
        type: "choose",
        player: c.player,
        choiceId: c.id,
        optionId: (c.options.find((o) => o.id !== "done") ?? c.options[0])!.id,
      }),
    );
  }
  return s;
};

describe("Paul's combo: Constructed Future → King Ghidorah (2024) → Gravity Beam (Nov 5, 2026)", () => {
  it("7.4.3: the combo makes the counter (28,000 against 18,000); without it, 6,000 doesn't", () => {
    const { state } = position();
    const p1 = state.players[0] as PlayerState;
    expect(getThreat(state, "P2")).toBe(18000);
    expect(counterPowerOf(state, p1)).toBe(6000);
    const afterCf = play(state, "SD05-005");
    const afterGb = play(afterCf, "EPR-019");
    expect(counterPowerOf(afterGb, afterGb.players[0] as PlayerState)).toBe(
      28000,
    );
  });

  it("Hard's search activates Constructed Future first", () => {
    const { state, setups } = position();
    const lists = decklistsOf(setups);
    const picks: string[] = [];
    for (let i = 0; i < 5; i++) {
      const decision = decide(
        botInput(state, "P1", lists, seededRng(`cf-combo-${i}`), {
          iterations: 400,
          maxMs: 1e9,
          prune: 1,
          rules: 1,
        }),
      );
      const a = decision.action;
      const card =
        a.type === "activateStrategy"
          ? (state.players[0] as PlayerState).hand.find(
              (c) => c.instanceId === a.cardInstanceId,
            )
          : undefined;
      picks.push(
        card ? (state.cards[card.cardId]?.deckCardNumber ?? a.type) : a.type,
      );
    }
    expect(picks).toEqual(Array(5).fill("SD05-005"));
  }, 120000);

  it("after Constructed Future brings back King Ghidorah (2024), the search plays Gravity Beam", () => {
    const { state, setups } = position();
    const after = play(state, "SD05-005");
    const lists = decklistsOf(setups);
    const p1 = after.players[0] as PlayerState;
    const picks: string[] = [];
    for (let i = 0; i < 5; i++) {
      const a = decide(
        botInput(after, "P1", lists, seededRng(`cf-combo-gb-${i}`), {
          iterations: 400,
          maxMs: 1e9,
          prune: 1,
          rules: 1,
        }),
      ).action;
      const card =
        a.type === "activateStrategy"
          ? p1.hand.find((c) => c.instanceId === a.cardInstanceId)
          : undefined;
      picks.push(
        card ? (after.cards[card.cardId]?.deckCardNumber ?? a.type) : a.type,
      );
    }
    expect(picks).toEqual(Array(5).fill("EPR-019"));
  }, 120000);

  it("Paul's rule: with a target to bring back, Hard activates Constructed Future before its turn ends", () => {
    const { setups } = position();
    const lists = decklistsOf(setups);
    for (let seed = 0; seed < 3; seed++) {
      let state = position().state;
      const turn = state.turn;
      let played = false;
      for (
        let step = 0;
        step < 30 && state.turn === turn && state.result === null;
        step++
      ) {
        const decider = state.pendingChoice?.player ?? state.turnPlayer;
        if (decider !== "P1") break;
        const action = decide(
          botInput(state, "P1", lists, seededRng(`cf-now-${seed}-${step}`), {
            iterations: 150,
            maxMs: 1e9,
            prune: 1,
            rules: 1,
          }),
        ).action;
        if (action.type === "activateStrategy") {
          const card = (state.players[0] as PlayerState).hand.find(
            (c) => c.instanceId === action.cardInstanceId,
          );
          if (state.cards[card?.cardId ?? -1]?.deckCardNumber === "SD05-005")
            played = true;
        }
        state = advanceToDecision(applyAction(state, action));
      }
      expect(played, `seed ${seed}`).toBe(true);
    }
  }, 180000);
});
