import { buildTestDeck, getAllCards } from "@gojisim/cards/test-decks";
import {
  type Action,
  advanceToDecision,
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
    state.cards = { ...state.cards, [card.id]: card };
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
      `${opp} is choosing what to discard for Godzilla (2023): discard 1 card, down to 4 during ${state.turnPlayer}'s turn`,
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

describe("choose-one option labels (M12a-2, E7)", () => {
  it("an option choice names each option by its card's ● line", () => {
    const decks = (["ESD01", "ESD02"] as const).map((set, i) => ({
      id: `P${i + 1}`,
      ...buildTestDeck(set, `labels-${i}`),
    }));
    const state = startGame({ seed: 3, decks: [decks[0]!, decks[1]!] });
    const me = state.players.find((p) => p.id === state.turnPlayer)!;
    const add = (number: string) => {
      const card = real(number);
      state.cards = { ...state.cards, [card.id]: card };
      return {
        instanceId: `c${state.nextInstanceId++}`,
        cardId: card.id,
        owner: me.id,
      };
    };
    // EBP01-064 offers its second option with 4 battle cards in your zones.
    for (const zone of [2, 3, 4, 5] as const)
      me.zones[zone].push([add("EBP01-016")]);
    me.monsterPosition = 6;
    const card = add("EBP01-064");
    me.hand.push(card);
    const after = applyAction(state, {
      type: "activateStrategy",
      player: me.id,
      cardInstanceId: card.instanceId,
      strategyZone: 1,
    });
    expect(after.pendingChoice?.kind).toBe("option");
    expect(decisionHeading(after)).toContain("choosing one of the options");
    const labels = getLegalActions(after, me.id)
      .filter((a) => a.type === "choose")
      .map((a) => actionLabel(after, a));
    expect(labels).toEqual([
      "[destroy] 1 of your opponent's rank 4 or lower battle cards.",
      "If you have 4 or more battle cards in your zones, choose 1 of your opponent's zones and [destroy] all battle cards in that zone and zones adjacent to it.",
    ]);
  });
});

describe("an opponent's optional discard (M12b-1, EBP02-070)", () => {
  it("names the decision as discarding down to 5", () => {
    const decks = (["ESD01", "ESD02"] as const).map((set, i) => ({
      id: `P${i + 1}`,
      ...buildTestDeck(set, `labels-${i}`),
    }));
    let state = startGame({ seed: 3, decks: [decks[0]!, decks[1]!] });
    const turn = state.players.find((p) => p.id === state.turnPlayer)!;
    const other = state.players.find((p) => p.id !== state.turnPlayer)!;
    const card = real("EBP02-070");
    state.cards = { ...state.cards, [card.id]: card };
    // Back at the start of the turn player's main phase, with EBP02-070 on the other side.
    other.strategyZones[0].push({
      card: {
        instanceId: `c${state.nextInstanceId++}`,
        cardId: card.id,
        owner: other.id,
      },
      placedOnTurn: state.turn,
    });
    const filler = real("ESD02-011");
    state.cards = { ...state.cards, [filler.id]: filler };
    while (turn.hand.length < 7)
      turn.hand.push({
        instanceId: `c${state.nextInstanceId++}`,
        cardId: filler.id,
        owner: turn.id,
      });
    state = { ...state, step: "7.3.1", phase: "main" };
    state = advanceToDecision(state);
    expect(state.pendingChoice).toMatchObject({
      kind: "confirm",
      player: turn.id,
    });
    expect(decisionHeading(state)).toContain(
      "deciding whether to discard down to 5 cards",
    );
  });
});

describe("cards under a card and monster deck plays (M12c-1)", () => {
  /** The turn player at the play timing, with `setup` applied, then `act`. */
  function after(
    setup: (
      state: GameState,
      me: GameState["players"][number],
      add: (number: string) => GameState["players"][number]["hand"][number],
    ) => Action,
  ): GameState {
    const decks = (["ESD01", "ESD02"] as const).map((set, i) => ({
      id: `P${i + 1}`,
      ...buildTestDeck(set, `labels-${i}`),
    }));
    const state = startGame({ seed: 3, decks: [decks[0]!, decks[1]!] });
    const me = state.players.find((p) => p.id === state.turnPlayer)!;
    const add = (number: string) => {
      const card = real(number);
      state.cards = { ...state.cards, [card.id]: card };
      return {
        instanceId: `c${state.nextInstanceId++}`,
        cardId: card.id,
        owner: me.id,
      };
    };
    return advanceToDecision(applyAction(state, setup(state, me, add)));
  }

  it("EBP03-042: picking which Mothra battle card it goes under", () => {
    const state = after((_, me, add) => {
      me.monsterPosition = 1;
      me.zones[8].push([add("EBP03-042")]);
      // Out of the monster's way: it advances from zone 1 to zone 2 (11.3).
      me.zones[4].push([add("EBP03-044")]);
      me.zones[5].push([add("EBP03-044")]);
      const invader = add("ESD02-011");
      me.hand.push(invader);
      return {
        type: "invade",
        player: me.id,
        cardInstanceId: invader.instanceId,
      };
    });
    // First "use the ability?", then the card it goes under.
    const yes = applyAction(state, {
      type: "choose",
      player: state.pendingChoice!.player,
      choiceId: state.pendingChoice!.id,
      optionId: "yes",
    });
    expect(decisionHeading(advanceToDecision(yes))).toContain(
      "choosing the card to put cards under for Ghogo",
    );
  });

  it("EBP03-074: picking a monster card to play from the monster deck", () => {
    const state = after((_, me, add) => {
      me.monsterPosition = 6;
      me.invadingMonsterZone = [add("EBP03-019")];
      me.monsterDeck = [add("EBP03-020"), add("EBP03-021")];
      const journey = add("EBP03-074");
      me.hand.push(journey);
      return {
        type: "activateStrategy",
        player: me.id,
        cardInstanceId: journey.instanceId,
        strategyZone: 1,
      };
    });
    expect(decisionHeading(state)).toContain(
      "choosing a monster card to play from their monster deck",
    );
  });
});

describe("M12c-2 action labels", () => {
  it("names an invasion paid with the deck's top card (EBP03-004) and a play on top of a card (EBP03-051)", () => {
    const decks = (["ESD01", "ESD02"] as const).map((set, i) => ({
      id: `P${i + 1}`,
      ...buildTestDeck(set, `labels-${i}`),
    }));
    const state = startGame({ seed: 3, decks: [decks[0]!, decks[1]!] });
    const me = state.players.find((p) => p.id === state.turnPlayer)!;
    expect(actionLabel(state, { type: "invadeFromDeck", player: me.id })).toBe(
      "Invade: send the top card of your deck to the discard pile",
    );
    const add = (number: string) => {
      const card = real(number);
      state.cards = { ...state.cards, [card.id]: card };
      return {
        instanceId: `c${state.nextInstanceId++}`,
        cardId: card.id,
        owner: me.id,
      };
    };
    const baby = add("EBP02-030");
    me.zones[2].push([baby]);
    const jr = add("EBP03-051");
    me.hand.push(jr);
    expect(
      actionLabel(state, {
        type: "playBattle",
        player: me.id,
        cardInstanceId: jr.instanceId,
        zone: 2,
        onTop: true,
      }),
    ).toBe(
      "Play Godzilla Jr. [EBP03-051] on top of Baby Godzilla [EBP02-030] → zone 2",
    );
  });
});
