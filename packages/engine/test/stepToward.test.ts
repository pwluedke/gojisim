import { describe, expect, it, onTestFinished } from "vitest";
import type { ZoneNumber } from "../src";
import { setTestAbilities } from "../src/testing";
import { play, self, settle, setup } from "./fixtures/play";
import { inHand, place } from "./fixtures/real";
import { battleCard } from "./fixtures/state";

/*
 * `oneTowardMonster` (one zone number toward your monster) with `unoccupied` (only an empty zone,
 * never the monster's own, Q5), on a made-up battle card: on [enter], from zone 3, 4 or 5, it
 * moves 1 zone toward your monster if that zone is empty.
 */
describe("oneTowardMonster + unoccupied", () => {
  const run = (
    monsterAt: ZoneNumber,
    playAt: ZoneNumber,
    block?: ZoneNumber,
  ) => {
    const { state, me, opp } = setup(monsterAt);
    opp.monsterPosition = 8;
    if (block) place(state, me, battleCard(), block);
    const card = battleCard({ id: 972001, rank: 1 });
    setTestAbilities(card.deckCardNumber, {
      deckCardNumber: card.deckCardNumber,
      status: "implemented",
      abilities: [
        {
          kind: "triggered",
          id: "step",
          trigger: { on: "enter" },
          condition: { zoneOf: "this", in: [3, 4, 5] },
          effects: [
            {
              effect: "moveBattle",
              target: { owner: "you", area: "zones", this: true },
              to: {
                relation: "oneTowardMonster",
                of: "this",
                unoccupied: true,
              },
            },
          ],
        },
      ],
    });
    onTestFinished(() => setTestAbilities(card.deckCardNumber, null));
    const after = settle(play(state, me, inHand(state, me, card), playAt));
    return ([1, 2, 3, 4, 5, 6, 7, 8] as ZoneNumber[]).filter((z) =>
      self(after, me).zones[z].some((stack) =>
        stack.some((c) => after.cards[c.cardId]?.id === card.id),
      ),
    );
  };

  it("monster in 6, played in 4: it moves up to 5", () => {
    expect(run(6, 4)).toEqual([5]);
  });

  it("monster in 6, zone 5 taken: it stays in 4", () => {
    expect(run(6, 4, 5)).toEqual([4]);
  });

  it("monster in 5, played in 4: the next zone is the monster's (not empty), so it stays", () => {
    expect(run(5, 4)).toEqual([4]);
  });

  it("played in zone 2 (not 3, 4 or 5): it stays", () => {
    expect(run(6, 2)).toEqual([2]);
  });

  it("monster in 1, played in 4: it moves down to 3", () => {
    expect(run(1, 4)).toEqual([3]);
  });
});
