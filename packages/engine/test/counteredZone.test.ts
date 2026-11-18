import { describe, expect, it, onTestFinished } from "vitest";
import type { ZoneNumber } from "../src";
import { counterMonster } from "../src/counter";
import { checkTiming } from "../src/rules";
import { setTestAbilities } from "../src/testing";
import { self, settle, setup } from "./fixtures/play";
import { addCard, monsterCard } from "./fixtures/state";

/*
 * A countered trigger that binds the zone the monster was countered in (5.15.1, before it moves
 * behind, 5.15.1.1), on a made-up monster: it plays Crystals in that zone.
 */
describe("countered with zoneAs: the zone it occupied when countered", () => {
  it("countered in zone 7: the monster moves to 4 (5.15.1.1) and Crystals is played in 7", () => {
    const { state, me } = setup(7);
    const card = monsterCard(1, { id: 971001 });
    setTestAbilities(card.deckCardNumber, {
      deckCardNumber: card.deckCardNumber,
      status: "implemented",
      abilities: [
        {
          kind: "triggered",
          id: "countered-token",
          trigger: { on: "countered", whose: "this", zoneAs: "was" },
          effects: [
            {
              effect: "createToken",
              name: "Crystals",
              zones: { relation: "sameNumberAs", of: { bound: "was" } },
            },
          ],
        },
      ],
    });
    onTestFinished(() => setTestAbilities(card.deckCardNumber, null));
    me.invadingMonsterZone = [addCard(state, card, me.id)];
    counterMonster(state, me);
    // Its ability resolves at the next check timing (10.6.2).
    checkTiming(state, "7.4.4");
    const after = settle(state);
    expect(self(after, me).monsterPosition).toBe(4);
    const crystals = ([1, 2, 3, 4, 5, 6, 7, 8] as ZoneNumber[]).filter((z) =>
      self(after, me).zones[z].some((stack) =>
        stack.some((c) => after.cards[c.cardId]?.name === "Crystals"),
      ),
    );
    expect(crystals).toEqual([7]);
  });
});
