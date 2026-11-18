import type { CardAbilities } from "@gojisim/cards";
import { describe, expect, it, onTestFinished } from "vitest";
import { type ZoneNumber } from "../src";
import { setTestAbilities } from "../src/testing";
import { activate, play, self, settle, setup } from "./fixtures/play";
import { inHand, place } from "./fixtures/real";
import { battleCard, strategyCard } from "./fixtures/state";

/*
 * Zone sets for columns on both fields, "toward a column" and empty zones (4.4.5.2, 4.4.5.4,
 * 4.4.5.5), on made-up cards. On a player's own field a column holds the zones at one
 * left-right position: 3 and 8, 4 and 7, 5 and 6; 1 and 2 are each alone in theirs.
 */

const abilities = (n: string, list: CardAbilities["abilities"]) => {
  setTestAbilities(n, {
    deckCardNumber: n,
    status: "implemented",
    abilities: list,
  });
  onTestFinished(() => setTestAbilities(n, null));
};

/** A strategy that plays a Crystals token in an empty zone of yours in your monster's column. */
function columnToken() {
  const card = strategyCard({ id: 968001 });
  abilities(card.deckCardNumber, [
    {
      kind: "triggered",
      id: "column-token",
      trigger: { on: "placedInStrategyZone" },
      effects: [
        {
          effect: "createToken",
          name: "Crystals",
          zones: {
            relation: "sharesColumnWith",
            of: "yourMonster",
            unoccupied: true,
          },
        },
      ],
    },
  ]);
  return card;
}

const crystalZones = (state: ReturnType<typeof setup>["state"], id: string) => {
  const player = state.players.find((p) => p.id === id);
  return ([1, 2, 3, 4, 5, 6, 7, 8] as ZoneNumber[]).filter((z) =>
    player?.zones[z].some((stack) =>
      stack.some((c) => state.cards[c.cardId]?.name === "Crystals"),
    ),
  );
};

describe("zone sets for columns (4.4.5.4, 4.4.5.5)", () => {
  it("sharesColumnWith + unoccupied: the token goes to the empty zone of yours in your monster's column (monster in 3: zone 8)", () => {
    const { state, me } = setup(3);
    const card = columnToken();
    const after = settle(activate(state, me, inHand(state, me, card)));
    expect(crystalZones(after, me.id)).toEqual([8]);
  });

  it("unoccupied: with that zone taken, no token (no empty zone in the column)", () => {
    const { state, me } = setup(4);
    place(state, me, battleCard(), 7);
    const card = columnToken();
    const after = settle(activate(state, me, inHand(state, me, card)));
    expect(crystalZones(after, me.id)).toEqual([]);
  });

  it("zones 1 and 2 are alone in their columns: a monster in zone 1 has no other zone of yours in its column", () => {
    const { state, me } = setup(1);
    const card = columnToken();
    const after = settle(activate(state, me, inHand(state, me, card)));
    expect(crystalZones(after, me.id)).toEqual([]);
  });

  it("towardColumnOf (4.4.5.2): [enter] moves this card to an adjacent zone of yours one column closer to your monster's; none closer, it stays", () => {
    const run = (monsterAt: ZoneNumber, playAt: ZoneNumber) => {
      const { state, me, opp } = setup(monsterAt);
      opp.monsterPosition = 8;
      const card = battleCard({ id: 968002, rank: 1 });
      abilities(card.deckCardNumber, [
        {
          kind: "triggered",
          id: "toward",
          trigger: { on: "enter" },
          effects: [
            {
              effect: "moveBattle",
              target: { owner: "you", area: "zones", this: true },
              to: { relation: "towardColumnOf", of: "yourMonster" },
            },
          ],
        },
      ]);
      const after = settle(play(state, me, inHand(state, me, card), playAt));
      const zones = self(after, me).zones;
      return (Object.keys(zones) as unknown as ZoneNumber[]).filter((z) =>
        zones[z].some((s) =>
          s.some((c) => after.cards[c.cardId]?.id === card.id),
        ),
      );
    };
    // Monster in 6 (the column of 5 and 6): from zone 1 the only adjacent zone, 2, is closer.
    expect(run(6, 1).map(Number)).toEqual([2]);
    // Monster in 1: from zone 2, zone 1 is the monster's zone (never a target, Q5); zone 3 is
    // farther, so it stays in 2.
    expect(run(1, 2).map(Number)).toEqual([2]);
  });
});
