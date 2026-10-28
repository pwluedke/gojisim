import { buildTestDeck, getAllCards } from "@gojisim/cards/test-decks";
import { applyAction, type GameState, startGame } from "@gojisim/engine";
import { describe, expect, it } from "vitest";
import { choiceHeading } from "./labels";
import { canConfirm, multiPick, toggle } from "./multiPick";

const real = (number: string) =>
  getAllCards().find((c) => c.cardNumber === number && c.parentId === null)!;

/**
 * P1 plays ESD01-005 with Burst 1 on a rank I monster: P2 discards down to 4 (5.7.2) from a hand
 * of `hand` cards.
 */
function discardDown(hand: number): GameState {
  const decks = (["ESD01", "ESD02"] as const).map((set, i) => ({
    id: `P${i + 1}`,
    ...buildTestDeck(set, `multi-${i}`),
  }));
  const state = startGame({ seed: 3, decks: [decks[0]!, decks[1]!] });
  const me = state.players.find((p) => p.id === state.turnPlayer)!;
  const opp = state.players.find((p) => p.id !== state.turnPlayer)!;
  const add = (number: string, owner: string) => {
    const card = real(number);
    state.cards = { ...state.cards, [card.id]: card };
    return { instanceId: `c${state.nextInstanceId++}`, cardId: card.id, owner };
  };
  me.invadingMonsterZone = [add("ESD01-001", me.id)];
  const burst = add("ESD01-005", me.id);
  me.hand.push(burst);
  opp.hand = [];
  for (let i = 0; i < hand; i++) opp.hand.push(add("ESD02-011", opp.id));
  return applyAction(state, {
    type: "playMonster",
    player: me.id,
    cardInstanceId: burst.instanceId,
  });
}

const pickOne = (state: GameState) => {
  const choice = state.pendingChoice!;
  return applyAction(state, {
    type: "choose",
    player: choice.player,
    choiceId: choice.id,
    optionId: choice.options[0]!.id,
  });
};

describe("multi-card picks: select, then Confirm (Tester fixes 1)", () => {
  it("5.7.2: discarding down to 4 from 7 is a pick of exactly 3; the heading names the total", () => {
    const state = discardDown(7);
    expect(state.pendingChoice?.rule).toBe("5.7.2");
    expect(multiPick(state)).toEqual({ min: 3, max: 3, total: 3 });
    expect(choiceHeading(state, (id) => id)).toContain(
      "discard 3 cards, down to 4",
    );
    // After one pick, 2 are left of the same 3; the heading still names 3.
    const next = pickOne(state);
    expect(multiPick(next)).toEqual({ min: 2, max: 2, total: 3 });
    expect(choiceHeading(next, (id) => id)).toContain(
      "discard 3 cards, down to 4",
    );
  });

  it("5.7.2: a discard of 1 is a single-card pick (no selection)", () => {
    expect(multiPick(discardDown(5))).toBeNull();
  });

  it("legal selections: exactly N, or 1 to N when the pick may stop (Done covers 0)", () => {
    const exact = { min: 3, max: 3, total: 3 };
    expect([0, 1, 2, 3].map((n) => canConfirm(exact, n))).toEqual([
      false,
      false,
      false,
      true,
    ]);
    const upTo = { min: 0, max: 2, total: 2 };
    expect([0, 1, 2, 3].map((n) => canConfirm(upTo, n))).toEqual([
      false,
      true,
      true,
      false,
    ]);
  });

  it("a click selects a card last, a second click deselects it, and the order is kept", () => {
    let selected = toggle([], "c1", 3);
    selected = toggle(selected, "c5", 3);
    selected = toggle(selected, "c3", 3);
    expect(selected).toEqual(["c1", "c5", "c3"]);
    // Full: another card isn't added.
    expect(toggle(selected, "c9", 3)).toEqual(["c1", "c5", "c3"]);
    selected = toggle(selected, "c5", 3);
    expect(selected).toEqual(["c1", "c3"]);
    expect(toggle(selected, "c5", 3)).toEqual(["c1", "c3", "c5"]);
  });
});
