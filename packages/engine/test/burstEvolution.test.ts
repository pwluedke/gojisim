import { describe, expect, it } from "vitest";
import {
  activeMonster,
  advance,
  applyAction,
  type GameState,
  getCounterPower,
  getLegalActions,
  type PlayerState,
} from "../src";
import { counterMonster } from "../src/counter";
import {
  atPlayTiming,
  inHand,
  monster,
  onDeck,
  place,
  real,
  zoneCardIds,
} from "./fixtures/real";
import {
  addCard,
  battleCard,
  logTypes,
  newGame,
  nonTurnPlayer,
  runTo,
  turnPlayer,
} from "./fixtures/state";

function choose(state: GameState, option: string | number): GameState {
  const choice = state.pendingChoice;
  if (!choice) throw new Error("No pending choice");
  const picked = choice.options.find((o) =>
    typeof option === "number" ? o.cardId === option : o.id === option,
  );
  if (!picked) throw new Error(`No option ${option}`);
  return applyAction(state, {
    type: "choose",
    player: choice.player,
    choiceId: choice.id,
    optionId: picked.id,
  });
}

const byId = (state: GameState, id: string) =>
  state.players.find((p) => p.id === id) as PlayerState;

function playMonster(state: GameState, card: { instanceId: string }) {
  return applyAction(state, {
    type: "playMonster",
    player: state.turnPlayer,
    cardInstanceId: card.instanceId,
  });
}

describe("Burst (12.5): ESD01-007 Godzilla (2023)", () => {
  function setup() {
    const state = atPlayTiming();
    const me = turnPlayer(state);
    const opp = nonTurnPlayer(state);
    monster(state, me, real("ESD01-003"), 3); // rank III
    opp.monsterPosition = 1;
    for (const zone of [3, 8, 2] as const)
      place(state, opp, battleCard({ id: 968000 + zone }), zone);
    const card = inHand(state, me, real("ESD01-007"));
    return { state, card };
  }

  it("ESD01-007 12.5.2: playable on a rank III monster with Burst 3, and its [enter] destroys every opponent battle card in its column", () => {
    const { state, card } = setup();
    expect(
      getLegalActions(state, state.turnPlayer).some(
        (a) => a.type === "playMonster" && a.cardInstanceId === card.instanceId,
      ),
    ).toBe(true);
    const after = playMonster(state, card);
    // Its zone 3 is in the same column as the opponent's zones 3 and 8 (4.4.5.4).
    expect(zoneCardIds(nonTurnPlayer(after))).toEqual({ "2": [968002] });
    expect(turnPlayer(after).invadingMonsterZone.at(-1)?.playedVia).toBe(
      "burst",
    );
    expect(turnPlayer(after).rage).toBe(1); // 8.5.1.1
  });

  it("ESD01-007 12.5.2: during the turn the monster reads the Burst card's printed rank (IV)", () => {
    const { state, card } = setup();
    const after = playMonster(state, card);
    expect(activeMonster(after, turnPlayer(after))?.rank).toBe(4);
  });

  it("ESD01-007 12.5.3: at the beginning of your end phase it goes to the discard pile; the rank III underneath is the top again, with no [enter]", () => {
    const { state, card } = setup();
    const played = playMonster(state, card);
    const seq = played.log.length;
    const after = runTo(
      applyAction(played, { type: "pass", player: played.turnPlayer }),
      "7.5.2",
    );
    const me = turnPlayer(after);
    expect(me.invadingMonsterZone.map((c) => c.cardId)).toEqual([
      real("ESD01-003").id,
    ]);
    expect(me.discard.map((c) => c.cardId)).toContain(real("ESD01-007").id);
    expect(activeMonster(after, me)?.rank).toBe(3);
    const later = logTypes(after, seq);
    expect(later).toContain("burstDiscard");
    expect(later).not.toContain("place");
    expect(later).not.toContain("newInvadingMonster");
    expect(after.timedTriggers).toEqual([]);
  });

  it("ESD01-007 8.5: no second monster play in the turn after a Burst play (Paul's ruling)", () => {
    const { state, card } = setup();
    const me = turnPlayer(state);
    const another = inHand(state, me, real("ESD01-004")); // rank IV: would match the new rank
    const after = playMonster(state, card);
    expect(
      getLegalActions(after, after.turnPlayer).some(
        (a) =>
          a.type === "playMonster" && a.cardInstanceId === another.instanceId,
      ),
    ).toBe(false);
  });
});

describe("Burst (12.5): ESD01-005 Godzilla (2023)", () => {
  function setup() {
    const state = atPlayTiming();
    const me = turnPlayer(state);
    const opp = nonTurnPlayer(state);
    monster(state, me, real("ESD01-001"), 2); // rank I
    opp.hand = opp.hand.slice(0, 4); // its [enter] then has nothing to discard
    me.monsterDeck = [
      addCard(state, real("ESD01-002"), me.id), // rank II
      addCard(state, real("ESD01-003"), me.id), // rank III
    ];
    const card = inHand(state, me, real("ESD01-005"));
    return playMonster(state, card);
  }

  it("ESD01-005 5.15.1.2: after a Burst 1 play the monster reads rank II, so a counter that turn needs a rank III next monster sharing a trait", () => {
    const played = setup();
    const me = turnPlayer(played);
    expect(activeMonster(played, me)?.rank).toBe(2);
    // A counter against the Burst monster within the same turn, set up directly in state.
    counterMonster(played, me);
    expect(me.invadingMonsterZone.at(-1)?.cardId).toBe(real("ESD01-003").id);
    expect(me.monsterDeck.map((c) => c.cardId)).toEqual([real("ESD01-002").id]);
  });

  it("ESD01-005 12.5.2.1: after the end-phase discard the monster reads rank I again (and the discard happens even if the Burst card isn't on top)", () => {
    const played = setup();
    const after = runTo(
      applyAction(played, { type: "pass", player: played.turnPlayer }),
      "7.5.2",
    );
    expect(activeMonster(after, turnPlayer(after))?.rank).toBe(1);

    const countered = setup();
    counterMonster(countered, turnPlayer(countered));
    const later = runTo(
      applyAction(countered, { type: "pass", player: countered.turnPlayer }),
      "7.5.2",
    );
    const me = turnPlayer(later);
    expect(me.invadingMonsterZone.map((c) => c.cardId)).toEqual([
      real("ESD01-001").id,
      real("ESD01-003").id,
    ]);
    expect(me.discard.map((c) => c.cardId)).toContain(real("ESD01-005").id);
  });

  it("ESD01-005 12.2: a Burst play triggers [enter]: the opponent discards down to 4", () => {
    const state = atPlayTiming();
    const me = turnPlayer(state);
    const opp = nonTurnPlayer(state);
    monster(state, me, real("ESD01-001"), 2);
    opp.hand = Array.from({ length: 6 }, () =>
      addCard(state, battleCard(), opp.id),
    );
    const paused = playMonster(state, inHand(state, me, real("ESD01-005")));
    expect(paused.pendingChoice).toMatchObject({
      player: opp.id,
      rule: "5.7.2",
    });
  });
});

describe("Burst (12.5): ESD01-006 Godzilla (2023)", () => {
  it("ESD01-006 12.2: a Burst 2 play destroys 1 of the opponent's rank 4 or lower battle cards", () => {
    const state = atPlayTiming();
    const me = turnPlayer(state);
    const opp = nonTurnPlayer(state);
    monster(state, me, real("ESD01-002"), 2); // rank II
    place(state, opp, battleCard({ id: 969004, rank: 4 }), 4);
    place(state, opp, battleCard({ id: 969005, rank: 5 }), 5);
    const after = playMonster(state, inHand(state, me, real("ESD01-006")));
    expect(zoneCardIds(nonTurnPlayer(after))).toEqual({ "5": [969005] });
  });
});

describe("Evolution (12.6.2): ESD02-007 Mothra (Larva) (1992)", () => {
  /** A game just before the main phase begins, with ESD02-007 in zone 2. */
  function setup(deck: string[]) {
    const state = runTo(newGame(), "7.3.1");
    const me = turnPlayer(state);
    const larva = place(state, me, real("ESD02-007"), 2);
    for (const number of deck) onDeck(state, me, real(number));
    return { state, larva };
  }

  it("ESD02-007 12.6.2: at the start of your main phase it may evolve into ESD02-010, whose [enter] draws 1 (playedVia evolution)", () => {
    const { state, larva } = setup(["ESD02-010"]);
    const hand = turnPlayer(state).hand.length;
    const asked = advance(state);
    expect(asked.pendingChoice).toMatchObject({ kind: "confirm" });
    const searching = choose(asked, "yes");
    expect(searching.pendingChoice).toMatchObject({
      kind: "target",
      rule: "12.6.2",
      private: true,
    });
    const after = choose(searching, real("ESD02-010").id);
    const me = turnPlayer(after);
    const stack = me.zones[2][0] ?? [];
    expect(stack.map((c) => c.cardId)).toEqual([
      real("ESD02-007").id,
      real("ESD02-010").id,
    ]);
    expect(stack[0]?.instanceId).toBe(larva.instanceId);
    expect(stack.at(-1)?.playedVia).toBe("evolution");
    expect(me.hand).toHaveLength(hand + 1);
    // 3.2.3.1: only the top card is active; its counter power is the stack's.
    expect(getCounterPower(after, stack.at(-1) as never)).toBe(5000);
    expect(logTypes(after)).toEqual(
      expect.arrayContaining(["evolve", "shuffleDeck"]),
    );
  });

  it("ESD02-007 10.5.4: declining the evolution does nothing; the deck is not shuffled, since no search ran", () => {
    const { state } = setup(["ESD02-010"]);
    const after = choose(advance(state), "no");
    expect(turnPlayer(after).zones[2][0]?.map((c) => c.cardId)).toEqual([
      real("ESD02-007").id,
    ]);
    expect(
      after.log.some((e) => e.type === "shuffleDeck" && e.payload["abilityId"]),
    ).toBe(false);
  });

  it("ESD02-007 5.8.1.2: an evolution search that finds nothing still shuffles", () => {
    const { state } = setup([]);
    turnPlayer(state).deck = turnPlayer(state).deck.filter(
      (c) => !(state.cards[c.cardId]?.traits ?? []).includes("Mothra"),
    );
    const searching = choose(advance(state), "yes");
    const after = searching.pendingChoice
      ? choose(searching, "done")
      : searching;
    expect(after.log.find((e) => e.type === "search")?.payload).toMatchObject({
      found: 0,
    });
    expect(
      after.log.some((e) => e.type === "shuffleDeck" && e.payload["abilityId"]),
    ).toBe(true);
  });
});

describe("Evolution (12.6.2): ESD02-008 Battra (Larva)", () => {
  it("ESD02-008 12.6.2: may evolve into a rank 6 or lower Battra battle card", () => {
    const state = runTo(newGame(), "7.3.1");
    const me = turnPlayer(state);
    place(state, me, real("ESD02-008"), 2);
    onDeck(state, me, real("ESD02-011"));
    const after = choose(choose(advance(state), "yes"), real("ESD02-011").id);
    expect(turnPlayer(after).zones[2][0]?.map((c) => c.cardId)).toEqual([
      real("ESD02-008").id,
      real("ESD02-011").id,
    ]);
  });
});

describe("Evolve (5.17): ESD02-014 The Legend of Infant Island", () => {
  function activate(setup: (state: GameState, me: PlayerState) => void) {
    const state = atPlayTiming();
    const me = turnPlayer(state);
    me.monsterPosition = 5;
    setup(state, me);
    const card = inHand(state, me, real("ESD02-014"));
    return applyAction(state, {
      type: "activateStrategy",
      player: me.id,
      cardInstanceId: card.instanceId,
      strategyZone: 1,
    });
  }

  it("ESD02-014 Q8: with ESD02-007 and ESD02-008 in zones, offers a choice between them and evolves the chosen one", () => {
    const paused = activate((state, me) => {
      place(state, me, real("ESD02-007"), 2);
      place(state, me, real("ESD02-008"), 3);
      onDeck(state, me, real("ESD02-011"));
    });
    expect(paused.pendingChoice).toMatchObject({
      kind: "target",
      rule: "5.17",
    });
    expect(paused.pendingChoice?.options.map((o) => o.cardId).sort()).toEqual(
      [real("ESD02-007").id, real("ESD02-008").id].sort(),
    );
    const searching = choose(paused, real("ESD02-008").id);
    const after = choose(searching, real("ESD02-011").id);
    const me = byId(after, paused.turnPlayer);
    expect(me.zones[3][0]?.map((c) => c.cardId)).toEqual([
      real("ESD02-008").id,
      real("ESD02-011").id,
    ]);
    expect(me.zones[2][0]?.map((c) => c.cardId)).toEqual([
      real("ESD02-007").id,
    ]);
  });

  it("ESD02-014 5.17: with no Evolution card in zones it does nothing", () => {
    const after = activate((state, me) => {
      place(state, me, battleCard(), 2);
    });
    expect(after.pendingChoice).toBeNull();
    expect(logTypes(after)).not.toContain("search");
  });
});
