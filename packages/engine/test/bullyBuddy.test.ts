import type { CardAbilities } from "@gojisim/cards";
import { describe, expect, it, onTestFinished } from "vitest";
import {
  advance,
  type GameState,
  type PlayerState,
  type ZoneNumber,
} from "../src";
import { setTestAbilities } from "../src/testing";
import { invade, self, settle, setup } from "./fixtures/play";
import { inHand, place } from "./fixtures/real";
import {
  addCard,
  at,
  battleCard,
  monsterCard,
  newGame,
  turnPlayer,
} from "./fixtures/state";

/*
 * The [bully] and [buddy] keywords stand for flags on the card itself: `repelsEndPhaseAdvance`
 * and `hostsMonster`. On made-up cards.
 */

const abilities = (n: string, list: CardAbilities["abilities"]) => {
  setTestAbilities(n, {
    deckCardNumber: n,
    status: "implemented",
    abilities: list,
  });
  onTestFinished(() => setTestAbilities(n, null));
};

function monsterWith(state: GameState, me: PlayerState, traits: string[]) {
  me.invadingMonsterZone = [addCard(state, monsterCard(1, { traits }), me.id)];
}

const holds = (
  state: GameState,
  me: PlayerState,
  zone: ZoneNumber,
  id: string,
) =>
  self(state, me).zones[zone].some((stack) =>
    stack.some((c) => c.instanceId === id),
  );

describe("[bully] and [buddy]", () => {
  it("[bully]: the end phase advance into its zone becomes a retreat, and the token is played in the zone left", () => {
    const state = at(newGame(), "7.5.2");
    const me = turnPlayer(state);
    me.monsterPosition = 4;
    monsterWith(state, me, ["Godzilla"]);
    const card = battleCard({ id: 974001 });
    abilities(card.deckCardNumber, [
      {
        kind: "keyword",
        keyword: { name: "bully", traits: ["Godzilla"], token: "Crystals" },
      },
    ]);
    const placed = place(state, me, card, 5);
    const after = advance(state);
    expect(self(after, me).monsterPosition).toBe(3);
    expect(holds(after, me, 5, placed.instanceId)).toBe(true);
    expect(
      self(after, me).zones[4].some((stack) =>
        stack.some((c) => after.cards[c.cardId]?.name === "Crystals"),
      ),
    ).toBe(true);
  });

  it("[bully] with traits: a monster without them advances and crushes it (11.3)", () => {
    const state = at(newGame(), "7.5.2");
    const me = turnPlayer(state);
    me.monsterPosition = 4;
    monsterWith(state, me, ["Other"]);
    const card = battleCard({ id: 974002 });
    abilities(card.deckCardNumber, [
      { kind: "keyword", keyword: { name: "bully", traits: ["Godzilla"] } },
    ]);
    const placed = place(state, me, card, 5);
    const after = advance(state);
    expect(self(after, me).monsterPosition).toBe(5);
    expect(holds(after, me, 5, placed.instanceId)).toBe(false);
  });

  it("[buddy]: your monster moves into its zone and it stays (an exception to 11.3)", () => {
    const { state, me } = setup(3);
    monsterWith(state, me, ["Godzilla"]);
    const card = battleCard({ id: 974003 });
    abilities(card.deckCardNumber, [
      { kind: "keyword", keyword: { name: "buddy", traits: ["Godzilla"] } },
    ]);
    const placed = place(state, me, card, 4);
    const after = settle(
      invade(state, me, inHand(state, me, battleCard({ invadeZones: 1 }))),
    );
    expect(self(after, me).monsterPosition).toBe(4);
    expect(holds(after, me, 4, placed.instanceId)).toBe(true);
  });
});
