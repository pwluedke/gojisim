import { describe, expect, it } from "vitest";
import {
  type Action,
  advanceToDecision,
  applyAction,
  checkInvariants,
  type GameState,
  getLegalActions,
} from "../src";
import {
  addCard,
  battleCard,
  newGame,
  runTo,
  turnPlayer,
} from "./fixtures/state";

const atDecision = () => runTo(newGame(), "7.3.2");

describe("checkInvariants (spec case 52)", () => {
  it("Engine: a new game at its first decision has no violations", () => {
    expect(checkInvariants(atDecision())).toEqual([]);
  });

  it("1.2.1 a manual window queued just before a win is not a violation once the game is over", () => {
    const state = atDecision();
    const card = addCard(state, battleCard(), turnPlayer(state).id);
    state.manualQueue = [
      {
        instanceId: card.instanceId,
        cardId: card.cardId,
        master: turnPlayer(state).id,
        reason: "invading",
      },
    ];
    expect(checkInvariants(state)).toContain(
      "1 manual windows queued at the play timing",
    );
    state.result = {
      winner: turnPlayer(state).id,
      reason: "invasion",
      rule: "5.13.1.1.2",
    };
    expect(checkInvariants(state)).not.toContain(
      "1 manual windows queued at the play timing",
    );
  });

  it("Engine: 20 random games of fixture decks keep every invariant after every action", () => {
    for (let game = 0; game < 20; game++) {
      let state: GameState = advanceToDecision(newGame(game));
      let seed = game + 1;
      for (let i = 0; i < 400 && state.result === null; i++) {
        const decider = state.pendingChoice?.player ?? state.turnPlayer;
        const options = getLegalActions(state, decider).filter(
          (a) => a.type !== "concede",
        );
        seed = (seed * 1103515245 + 12345) % 2147483648;
        state = advanceToDecision(
          applyAction(state, options[seed % options.length] as Action),
        );
        expect(checkInvariants(state)).toEqual([]);
      }
    }
  }, 30_000);

  it("Engine: a missing card breaks card conservation", () => {
    const state = atDecision();
    turnPlayer(state).deck.pop();
    expect(checkInvariants(state).join()).toMatch(/card count/);
  });

  it("Engine: a duplicated instance id is reported", () => {
    const state = atDecision();
    const player = turnPlayer(state);
    const copy = player.deck.pop()!;
    player.deck.push({ ...copy, instanceId: player.hand[0]!.instanceId });
    expect(checkInvariants(state).join()).toMatch(/appears twice/);
  });

  it("Engine: negative rage, a missing monster and an overloaded zone are reported", () => {
    const state = atDecision();
    const player = turnPlayer(state);
    player.rage = -1;
    player.zones[4].push(
      [addCard(state, battleCard(), player.id)],
      [player.deck.pop()!],
    );
    const monster = player.invadingMonsterZone.pop()!;
    player.discard.push(monster);
    player.monsterPosition = null;
    const problems = checkInvariants(state).join("\n");
    expect(problems).toMatch(/rage is -1/);
    expect(problems).toMatch(/no invading monster/);
    expect(problems).toMatch(/monster position is null/);
    expect(problems).toMatch(/zone 4 holds 2 stacks/);
  });
});
