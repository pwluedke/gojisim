import type { Card, CardAbilities, Effect } from "@gojisim/cards";
import { afterAll, beforeAll } from "vitest";
import { applyAction, type GameState, type PlayerState } from "../../src";
import { setTestAbilities } from "../../src/testing";
import { choose, play, settle } from "./play";
import { inHand } from "./real";
import { addCard, battleCard } from "./state";

/** Helpers for the EBP04 tests (M12d). */

export const pass = (state: GameState) =>
  applyAction(state, { type: "pass", player: state.turnPlayer });

export const inStrategy = (
  state: GameState,
  player: PlayerState,
  card: Card,
  index = 0,
) =>
  player.strategyZones[index]?.push({
    card: addCard(state, card, player.id),
    placedOnTurn: state.turn,
  });

/** Ids of the player's strategy cards, zone by zone. */
export const strategyIds = (player: PlayerState) =>
  player.strategyZones.flatMap((z) => z.map((p) => p.card.cardId));

export const handOf = (state: GameState, player: PlayerState, n: number) => {
  player.hand = [];
  for (let i = 0; i < n; i++) inHand(state, player, battleCard());
};

export const green = (overrides: Partial<Card> = {}) =>
  battleCard({ colors: ["Green"], ...overrides });

/** Fixture battle cards whose [enter] does one thing (test abilities, decision 137). */
function enterCard(id: number, effect: Effect): [Card, CardAbilities] {
  const card = battleCard({ id, rank: 1 });
  return [
    card,
    {
      deckCardNumber: card.deckCardNumber,
      status: "implemented",
      abilities: [
        {
          kind: "triggered",
          id: "enter",
          trigger: { on: "enter" },
          effects: [effect],
        },
      ],
    },
  ];
}

const fixtures = [
  /** Destroys exactly 1 of the opponent's battle cards, which its player picks. */
  enterCard(964900, {
    effect: "destroy",
    target: {
      select: { owner: "opponent", area: "zones", type: "Battle" },
      count: { exact: 1 },
      chooser: "you",
    },
  }),
  /** The opponent discards their whole hand (by this card's player's effect). */
  enterCard(964901, { effect: "discardDownTo", player: "opponent", size: 0 }),
  /** Plays 1 battle card from its player's deck. */
  enterCard(964902, {
    effect: "play",
    from: "deck",
    filter: { owner: "you", area: "deck", type: "Battle" },
    count: { exact: 1 },
  }),
] as const;
export const [[DESTROYER], [DISCARDER], [DECK_PLAYER]] = fixtures;

/** Registers the fixture abilities for the test file that calls it. */
export function useFixtures() {
  beforeAll(() => {
    for (const [card, data] of fixtures)
      setTestAbilities(card.deckCardNumber, data);
  });
  afterAll(() => {
    for (const [card] of fixtures) setTestAbilities(card.deckCardNumber, null);
  });
}

/** `player` plays a fixture card into zone 1 and settles; a target pick takes `targetId`. */
export function playFixture(
  state: GameState,
  player: PlayerState,
  card: Card,
  targetId?: string,
): GameState {
  let after = play(state, player, inHand(state, player, card), 1);
  if (
    targetId !== undefined &&
    after.pendingChoice?.options.some((o) => o.id === targetId)
  )
    after = choose(after, (id) => id === targetId);
  return settle(after);
}

/** Plays the destroyer and destroys the opponent's card `targetId`. */
export const destroyWith = (
  state: GameState,
  player: PlayerState,
  targetId: string,
) => playFixture(state, player, DESTROYER, targetId);
