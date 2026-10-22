import { buildTestDeck, getAllCards } from "@gojisim/cards/test-decks";
import {
  type Action,
  applyAction,
  type GameState,
  getLegalActions,
  startGame,
} from "@gojisim/engine";
import { describe, expect, it } from "vitest";
import { actionLabel, decisionHeading } from "./labels";

const real = (number: string) =>
  getAllCards().find((c) => c.cardNumber === number && c.parentId === null)!;

/** P1 plays ESD01-005 with Burst 1 on a rank I monster; P2 holds 5 cards. */
function burstPlay(): GameState {
  const decks = (["ESD01", "ESD02"] as const).map((set, i) => ({
    id: `P${i + 1}`,
    ...buildTestDeck(set, `labels-${i}`),
  }));
  const state = startGame({ seed: 3, decks: [decks[0]!, decks[1]!] });
  const me = state.players.find((p) => p.id === state.turnPlayer)!;
  const opp = state.players.find((p) => p.id !== state.turnPlayer)!;
  const add = (number: string, owner: string) => {
    const card = real(number);
    state.cards[card.id] = card;
    return { instanceId: `c${state.nextInstanceId++}`, cardId: card.id, owner };
  };
  me.invadingMonsterZone = [add("ESD01-001", me.id)];
  const burst = add("ESD01-005", me.id);
  me.hand.push(burst);
  while (opp.hand.length < 5) opp.hand.push(add("ESD02-011", opp.id));
  opp.hand = opp.hand.slice(0, 5);
  return applyAction(state, {
    type: "playMonster",
    player: me.id,
    cardInstanceId: burst.instanceId,
  });
}

describe("debug decision heading and choice labels", () => {
  it("says the opponent is choosing what to discard during the turn player's turn, with Discard buttons", () => {
    const state = burstPlay();
    const opp = state.pendingChoice!.player;
    expect(opp).not.toBe(state.turnPlayer);
    expect(decisionHeading(state)).toBe(
      `${opp} is choosing what to discard for Godzilla (2023), down to 4 cards (discard 1 more) during ${state.turnPlayer}'s turn`,
    );
    const choices = getLegalActions(state, opp).filter(
      (a) => a.type === "choose",
    );
    expect(
      choices.every((a) => actionLabel(state, a).startsWith("Discard ")),
    ).toBe(true);
    // One pick is all it takes: the turn player's play timing comes back.
    const after = applyAction(state, choices[0] as Action);
    expect(after.pendingChoice).toBeNull();
    expect(after.players.find((p) => p.id === opp)?.hand).toHaveLength(4);
  });

  it("at the play timing, names the turn player", () => {
    let state = burstPlay();
    while (state.pendingChoice) {
      const choice = state.pendingChoice;
      state = applyAction(state, {
        type: "choose",
        player: choice.player,
        choiceId: choice.id,
        optionId: choice.options[0]!.id,
      });
    }
    expect(decisionHeading(state)).toBe(
      `${state.turnPlayer}'s turn: choose an action`,
    );
  });
});
