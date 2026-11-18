import type { CardAbilities } from "@gojisim/cards";
import { describe, expect, it, onTestFinished } from "vitest";
import { advance, type GameState, type PlayerState } from "../src";
import { setTestAbilities } from "../src/testing";
import { invade, play, self, settle, setup } from "./fixtures/play";
import { inHand, place } from "./fixtures/real";
import { battleCard, runTo } from "./fixtures/state";

/*
 * "Can't advance during the next end phase" (only the 7.5.2 advance) as a grant lasting until
 * that player's next end phase advance step, and "this card entered this turn" for "at the
 * beginning of your next turn's end phase". On made-up cards.
 */

const abilities = (n: string, list: CardAbilities["abilities"]) => {
  setTestAbilities(n, {
    deckCardNumber: n,
    status: "implemented",
    abilities: list,
  });
  onTestFinished(() => setTestAbilities(n, null));
};

/** Runs on to the next end phase's 7.5.3, after its advance step, and returns that state. */
const nextEndPhase = (state: GameState) => runTo(advance(state), "7.5.3");
const at = (state: GameState, player: PlayerState) =>
  self(state, player).monsterPosition;
const holds = (state: GameState, player: PlayerState, id: string) =>
  Object.values(self(state, player).zones).some((stacks) =>
    stacks.some((stack) => stack.some((c) => c.instanceId === id)),
  );

describe("grant until the next end phase; this card entered this turn", () => {
  it("a nextEndPhase grant skips this turn's end phase advance only; a not-thisEntered end phase trigger fires on the next own turn", () => {
    const { state, me } = setup(3);
    const card = battleCard({ id: 973001, rank: 1 });
    abilities(card.deckCardNumber, [
      {
        kind: "triggered",
        id: "enter-hold",
        trigger: { on: "enter" },
        effects: [
          {
            effect: "grant",
            duration: "nextEndPhase",
            modifier: {
              flag: "cannotEndPhaseAdvance",
              target: { owner: "you", area: "monster" },
            },
          },
        ],
      },
      {
        kind: "triggered",
        id: "end-destroy",
        trigger: { on: "phaseBegins", phase: "end", whose: "yours" },
        condition: { not: { thisTurn: "thisEntered" } },
        effects: [
          {
            effect: "destroy",
            target: {
              select: { owner: "you", area: "zones", this: true },
              count: "all",
              chooser: "you",
            },
          },
        ],
      },
    ]);
    const played = settle(play(state, me, inHand(state, me, card), 5));
    const id = self(played, me).zones[5][0]!.at(-1)!.instanceId;
    // This turn's end phase: no advance (7.5.2), and the card stays (it entered this turn).
    const first = runTo(played, "7.5.3");
    expect(at(first, me)).toBe(3);
    expect(holds(first, me, id)).toBe(true);
    // The opponent's turn, then your next end phase: destroyed at its beginning, and you advance.
    const theirs = nextEndPhase(first);
    expect(theirs.turnPlayer).not.toBe(me.id);
    const second = nextEndPhase(theirs);
    expect(second.turnPlayer).toBe(me.id);
    expect(holds(second, me, id)).toBe(false);
    expect(at(second, me)).toBe(4);
  });

  it("a grant on the opponent's monster lasts until their next end phase advance step, not yours", () => {
    const { state, me, opp } = setup(3);
    opp.monsterPosition = 3;
    const card = battleCard({ id: 973002, rank: 1 });
    abilities(card.deckCardNumber, [
      {
        kind: "triggered",
        id: "enter-hold-theirs",
        trigger: { on: "enter" },
        effects: [
          {
            effect: "grant",
            duration: "nextEndPhase",
            modifier: {
              flag: "cannotEndPhaseAdvance",
              target: { owner: "opponent", area: "monster" },
            },
          },
        ],
      },
    ]);
    const played = settle(play(state, me, inHand(state, me, card), 5));
    const mine = runTo(played, "7.5.3");
    expect(at(mine, me)).toBe(4);
    const theirs = nextEndPhase(mine);
    expect(at(theirs, opp)).toBe(3);
    // It ended after their 7.5.2: their following end phase advances as usual.
    const theirNext = nextEndPhase(nextEndPhase(theirs));
    expect(theirNext.turnPlayer).toBe(opp.id);
    expect(at(theirNext, opp)).toBe(4);
  });

  it("only the end phase advance: an invasion still advances (8.6)", () => {
    const { state, me } = setup(3);
    const card = battleCard({ id: 973003, rank: 1 });
    abilities(card.deckCardNumber, [
      {
        kind: "continuous",
        id: "hold",
        modifiers: [
          {
            flag: "cannotEndPhaseAdvance",
            target: { owner: "you", area: "monster" },
          },
        ],
      },
    ]);
    place(state, me, card, 1);
    const invaded = settle(
      invade(state, me, inHand(state, me, battleCard({ invadeZones: 1 }))),
    );
    expect(at(invaded, me)).toBe(4);
  });
});
