import { afterEach, describe, expect, it } from "vitest";
import {
  advanceToDecision,
  applyAction,
  type GameState,
  getPlayerView,
  type PlayerState,
  type ZoneNumber,
} from "../src";
import { checkTiming } from "../src/rules";
import { appendLog } from "../src/state";
import { setTestAbilities } from "../src/testing";
import {
  atPlayTiming,
  inDiscard,
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
  monsterCard,
  nonTurnPlayer,
  turnPlayer,
} from "./fixtures/state";

/** Answers the pending choice with the option whose id or card id matches. */
function choose(state: GameState, option: string | number): GameState {
  const choice = state.pendingChoice;
  if (!choice) throw new Error("No pending choice");
  const picked = choice.options.find((o) =>
    typeof option === "number" ? o.cardId === option : o.id === option,
  );
  if (!picked)
    throw new Error(`No option ${option} in ${JSON.stringify(choice.options)}`);
  return applyAction(state, {
    type: "choose",
    player: choice.player,
    choiceId: choice.id,
    optionId: picked.id,
  });
}

/** Invades with a plain card whose invasion icon is `icon`. */
function invade(state: GameState, icon: number): GameState {
  const me = turnPlayer(state);
  const card = addCard(state, battleCard({ invadeZones: icon }), me.id);
  me.hand.push(card);
  return applyAction(state, {
    type: "invade",
    player: me.id,
    cardInstanceId: card.instanceId,
  });
}

/** Fills a player's hand with `count` plain cards. */
function handOf(state: GameState, player: PlayerState, count: number): void {
  player.hand = [];
  for (let i = 0; i < count; i++)
    player.hand.push(addCard(state, battleCard(), player.id));
}

const resolved = (state: GameState) =>
  state.log
    .filter((e) => e.type === "resolveAbility")
    .map((e) => e.payload["abilityId"]);

describe("Paul's ruling: [enter] fires when a card enters the board", () => {
  it("ESD02-002 5.15.1.2: coming in as rank II after a counter triggers [enter]", () => {
    const state = atPlayTiming();
    const me = turnPlayer(state);
    const opp = nonTurnPlayer(state);
    monster(state, opp, real("ESD02-001"), 6);
    opp.rage = 0;
    opp.monsterDeck = [addCard(state, real("ESD02-002"), opp.id)];
    place(
      state,
      me,
      battleCard({ id: 963001, rank: 3, counterOrThreat: 10000 }),
      2,
    );
    const after = advanceToDecision(
      applyAction(state, { type: "pass", player: me.id }),
    );
    const byId = (id: string) =>
      after.players.find((p) => p.id === id) as PlayerState;
    expect(byId(opp.id).invadingMonsterZone.at(-1)?.cardId).toBe(
      real("ESD02-002").id,
    );
    expect(resolved(after)).toContain("ESD02-002#enter-destroy");
    // Its master's opponent is the countering player: their only rank 4 or lower card is gone.
    expect(zoneCardIds(byId(me.id))).toEqual({});
  });
});

describe("ESD01-002 Godzilla (2023)", () => {
  function setup() {
    const state = atPlayTiming();
    const me = turnPlayer(state);
    monster(state, me, real("ESD01-002"), 2);
    onDeck(state, me, real("ESD01-003")); // rank III, no Burst: not a legal target
    onDeck(state, me, real("ESD01-006")); // rank III with Burst
    onDeck(state, me, real("ESD01-006"));
    return state;
  }

  it("ESD01-002 12.3: when invading, searches the deck for a rank III Godzilla (2023) with Burst, reveals it, adds it to the hand, then shuffles", () => {
    const paused = invade(setup(), 1);
    const choice = paused.pendingChoice;
    expect(choice).toMatchObject({
      kind: "target",
      rule: "5.8.1",
      private: true,
    });
    expect(choice?.options.map((o) => o.cardId)).toEqual([
      real("ESD01-006").id,
      real("ESD01-006").id,
      null,
    ]);
    // The opponent sees the option count but not the deck's cards (4.8.2).
    const oppView = getPlayerView(paused, nonTurnPlayer(paused).id);
    expect(oppView.pendingChoice).toMatchObject({
      optionCount: 3,
      options: null,
    });
    const after = choose(paused, real("ESD01-006").id);
    expect(turnPlayer(after).hand.map((c) => c.cardId)).toContain(
      real("ESD01-006").id,
    );
    expect(logTypes(after)).toEqual(
      expect.arrayContaining(["search", "reveal", "addToHand", "shuffleDeck"]),
    );
    expect(after.revealed).toEqual([]);
  });

  it("ESD01-002 Q4: an icon 2 invasion searches twice", () => {
    const first = invade(setup(), 2);
    const second = choose(first, real("ESD01-006").id);
    expect(second.pendingChoice).toMatchObject({
      kind: "target",
      rule: "5.8.1",
    });
    const after = choose(second, real("ESD01-006").id);
    expect(resolved(after)).toEqual([
      "ESD01-002#invading-search",
      "ESD01-002#invading-search",
    ]);
    expect(
      turnPlayer(after).hand.filter((c) => c.cardId === real("ESD01-006").id),
    ).toHaveLength(2);
  });

  it("ESD01-002 5.8.1.2: a search may find nothing, and the deck is still shuffled", () => {
    const after = choose(invade(setup(), 1), "done");
    expect(after.log.find((e) => e.type === "search")?.payload).toMatchObject({
      found: 0,
    });
    expect(logTypes(after)).toContain("shuffleDeck");
    expect(logTypes(after)).not.toContain("addToHand");
  });

  it("ESD01-002 12.3.2.1: an invasion that doesn't move the monster does not trigger it", () => {
    const state = setup();
    const opp = nonTurnPlayer(state);
    turnPlayer(state).monsterPosition = 8;
    place(state, opp, battleCard(), 8); // blocks the victory: the monster can't advance
    expect(logTypes(invade(state, 1))).not.toContain("enterStandby");
  });
});

describe("ESD01-004 Godzilla (2023)", () => {
  function invadeWith(rage: number, handSize: number) {
    const state = atPlayTiming();
    const me = turnPlayer(state);
    monster(state, me, real("ESD01-004"), 2);
    me.rage = rage;
    handOf(state, nonTurnPlayer(state), handSize);
    return invade(state, 1);
  }

  it("ESD01-004 5.7.2: when invading with 2 or more rage, the opponent chooses cards to discard down to 2 (Paul's ruling: pick discards, not keeps)", () => {
    const paused = invadeWith(2, 5);
    const opp = nonTurnPlayer(paused);
    expect(paused.pendingChoice).toMatchObject({
      player: opp.id,
      kind: "target",
      rule: "5.7.2",
      private: true,
    });
    const [a, b, c, d, e] = opp.hand.map((x) => x.instanceId) as string[];
    // 5 cards down to 2: three picks, each a card to discard.
    const after = choose(
      choose(choose(paused, c as string), a as string),
      e as string,
    );
    expect(nonTurnPlayer(after).hand.map((x) => x.instanceId)).toEqual([b, d]);
    expect(nonTurnPlayer(after).discard).toHaveLength(3);
  });

  it("ESD01-004 5.7.2.1: against a hand of 2 or fewer it does nothing", () => {
    const after = invadeWith(2, 2);
    expect(after.pendingChoice).toBeNull();
    expect(nonTurnPlayer(after).hand).toHaveLength(2);
  });

  it("ESD01-004 10.5.2.3.3: with less than 2 rage it does nothing", () => {
    const after = invadeWith(1, 5);
    expect(logTypes(after)).toContain("conditionNotMet");
    expect(nonTurnPlayer(after).hand).toHaveLength(5);
  });
});

describe("ESD01-015 Operation Wadatsumi", () => {
  function activate(handSize: number) {
    const state = atPlayTiming();
    const me = turnPlayer(state);
    me.monsterPosition = 7;
    handOf(state, nonTurnPlayer(state), handSize);
    const card = inHand(state, me, real("ESD01-015"));
    return applyAction(state, {
      type: "activateStrategy",
      player: me.id,
      cardInstanceId: card.instanceId,
      strategyZone: 1,
    });
  }

  it("ESD01-015 5.7.2: the opponent discards down to 2 cards", () => {
    const paused = activate(4);
    const opp = nonTurnPlayer(paused);
    const after = choose(
      choose(paused, opp.hand[3]?.instanceId as string),
      opp.hand[1]?.instanceId as string,
    );
    // The two picks are the discards; the other two stay.
    expect(nonTurnPlayer(after).hand.map((x) => x.instanceId)).toEqual([
      opp.hand[0]?.instanceId,
      opp.hand[2]?.instanceId,
    ]);
    expect(nonTurnPlayer(after).discard).toHaveLength(2);
  });

  it("ESD01-015 5.7.2.1: against a hand of 2 or fewer it does nothing", () => {
    const after = activate(1);
    expect(after.pendingChoice).toBeNull();
    expect(nonTurnPlayer(after).hand).toHaveLength(1);
  });
});

describe("ESD01-014 Godzilla Emerges", () => {
  function activate(rage: number) {
    const state = atPlayTiming();
    const me = turnPlayer(state);
    me.monsterPosition = 6;
    me.rage = rage;
    nonTurnPlayer(state).rage = 3;
    nonTurnPlayer(state).monsterPosition = 1; // the 8.2.1 limit would allow rank 1 only
    onDeck(state, me, real("ESD01-011"));
    onDeck(state, me, real("ESD01-012"));
    const card = inHand(state, me, real("ESD01-014"));
    return applyAction(state, {
      type: "activateStrategy",
      player: me.id,
      cardInstanceId: card.instanceId,
      strategyZone: 1,
    });
  }

  it("ESD01-014 5.11.1: with 2 or more rage, plays a Godzilla (2023) battle card from the deck to a zone the player chooses, ignoring 8.2.1, then shuffles", () => {
    const paused = activate(2);
    // Hidden options come in instance id order (M6a), never in deck order.
    expect(paused.pendingChoice?.options.map((o) => o.cardId)).toEqual([
      real("ESD01-011").id,
      real("ESD01-012").id,
      null,
    ]);
    const zoneChoice = choose(paused, real("ESD01-012").id);
    expect(zoneChoice.pendingChoice).toMatchObject({
      kind: "zone",
      rule: "5.11.1",
    });
    // Never the zone of the player's own monster (5.11.1.2).
    expect(zoneChoice.pendingChoice?.options.map((o) => o.id)).not.toContain(
      `${zoneChoice.turnPlayer}:6`,
    );
    const after = choose(zoneChoice, `${zoneChoice.turnPlayer}:3`);
    expect(zoneCardIds(turnPlayer(after))).toEqual({
      "3": [real("ESD01-012").id],
    });
    expect(logTypes(after)).toContain("shuffleDeck");
  });

  it("ESD01-014 12.2: the played card's [enter] chains (a found ESD01-011 triggers too)", () => {
    const zoneChoice = choose(activate(2), real("ESD01-011").id);
    const after = choose(zoneChoice, `${zoneChoice.turnPlayer}:3`);
    expect(resolved(after)).toEqual([
      "ESD01-014#emerges",
      "ESD01-011#enter-rage",
    ]);
    expect(nonTurnPlayer(after).rage).toBe(2);
  });

  it("ESD01-014 10.5.2.3.3: with less than 2 rage it does nothing", () => {
    const after = activate(1);
    expect(after.pendingChoice).toBeNull();
    expect(logTypes(after)).toContain("conditionNotMet");
  });
});

describe("ESD02-003 Godzilla (1992)", () => {
  /** Plays ESD02-003 on a rank III monster in zone 7: adjacent zones are 4, 6 and 8 (4.4.5.2). */
  function playIt(setup: (state: GameState, me: PlayerState) => void) {
    const state = atPlayTiming();
    const me = turnPlayer(state);
    monster(state, me, monsterCard(3, { traits: ["Godzilla"] }), 7);
    setup(state, me);
    const card = inHand(state, me, real("ESD02-003"));
    return applyAction(state, {
      type: "playMonster",
      player: me.id,
      cardInstanceId: card.instanceId,
    });
  }

  it("ESD02-003 5.11.1.3: plays 2 rank 4 or lower [evolution] battle cards from the discard pile into different adjacent zones", () => {
    const paused = playIt((state, me) => {
      inDiscard(state, me, real("ESD02-007"));
      inDiscard(state, me, real("ESD02-008"));
      inDiscard(state, me, real("ESD02-010")); // rank 5: not legal
      inDiscard(state, me, battleCard({ rank: 2 })); // no [evolution]: not legal
    });
    expect(paused.pendingChoice?.options.map((o) => o.id).sort()).toEqual(
      [4, 6, 8].map((z) => `${paused.turnPlayer}:${z}`).sort(),
    );
    const second = choose(paused, `${paused.turnPlayer}:4`);
    expect(second.pendingChoice?.options.map((o) => o.id).sort()).toEqual(
      [6, 8].map((z) => `${second.turnPlayer}:${z}`).sort(),
    );
    const after = choose(second, `${second.turnPlayer}:8`);
    expect(zoneCardIds(turnPlayer(after))).toEqual({
      "4": [real("ESD02-007").id],
      "8": [real("ESD02-008").id],
    });
  });

  it("ESD02-003 Q3: with 1 legal card it plays 1", () => {
    const after = choose(
      playIt((state, me) => inDiscard(state, me, real("ESD02-007"))),
      `${turnPlayer(atPlayTiming()).id}:6`,
    );
    expect(zoneCardIds(turnPlayer(after))).toEqual({
      "6": [real("ESD02-007").id],
    });
  });

  it("ESD02-003 Q3: with occupied adjacent zones and no empty one, it plays there and 11.5 destroys the old card", () => {
    const paused = playIt((state, me) => {
      inDiscard(state, me, real("ESD02-007"));
      for (const zone of [4, 6, 8] as ZoneNumber[])
        place(state, me, battleCard({ id: 964000 + zone }), zone);
    });
    const after = choose(paused, `${paused.turnPlayer}:6`);
    expect(zoneCardIds(turnPlayer(after))).toEqual({
      "4": [964004],
      "6": [real("ESD02-007").id],
      "8": [964008],
    });
    expect(
      after.log.some(
        (e) => e.type === "destroy" && e.payload["rule"] === "11.5",
      ),
    ).toBe(true);
  });

  it("ESD02-003 Q3: empty adjacent zones are preferred over occupied ones", () => {
    const after = playIt((state, me) => {
      inDiscard(state, me, real("ESD02-007"));
      place(state, me, battleCard(), 4);
      place(state, me, battleCard(), 8);
    });
    // Only zone 6 is empty, so there is no zone choice.
    expect(after.pendingChoice).toBeNull();
    expect(zoneCardIds(turnPlayer(after))["6"]).toEqual([real("ESD02-007").id]);
  });
});

describe("ESD02-004 Godzilla (1994)", () => {
  function setup() {
    const state = atPlayTiming();
    const me = turnPlayer(state);
    const opp = nonTurnPlayer(state);
    monster(state, me, real("ESD02-004"), 2);
    opp.monsterPosition = 1;
    place(state, opp, battleCard({ id: 965003, rank: 3 }), 3);
    place(state, opp, battleCard({ id: 965004, rank: 4 }), 4);
    return state;
  }

  it("ESD02-004 Q2: with no battle card in hand it does nothing", () => {
    const state = setup();
    turnPlayer(state).hand = [];
    const after = invade(state, 1);
    expect(after.pendingChoice).toBeNull();
    expect(logTypes(after)).toContain("costNotPaid");
    expect(zoneCardIds(nonTurnPlayer(after))).toEqual({
      "3": [965003],
      "4": [965004],
    });
  });

  it("ESD02-004 10.10: paying the cost destroys every opponent battle card up to the discarded card's rank, read after it left the hand", () => {
    const state = setup();
    const me = turnPlayer(state);
    me.hand = [addCard(state, battleCard({ id: 965100, rank: 3 }), me.id)];
    const paused = invade(state, 1);
    expect(paused.pendingChoice).toMatchObject({
      kind: "confirm",
      rule: "10.5.4",
    });
    const after = choose(paused, "yes");
    expect(turnPlayer(after).discard.map((c) => c.cardId)).toContain(965100);
    expect(zoneCardIds(nonTurnPlayer(after))).toEqual({ "4": [965004] });
  });

  it("ESD02-004 10.5.4: declining the optional cost does nothing", () => {
    const state = setup();
    const me = turnPlayer(state);
    me.hand = [addCard(state, battleCard({ rank: 4 }), me.id)];
    const after = choose(invade(state, 1), "no");
    expect(zoneCardIds(nonTurnPlayer(after))).toEqual({
      "3": [965003],
      "4": [965004],
    });
  });
});

describe("ESD02-005 Godzilla (1993)", () => {
  it("ESD02-005 Q4: an icon 2 invasion reduces the opponent's rage by 2", () => {
    const state = atPlayTiming();
    monster(state, turnPlayer(state), real("ESD02-005"), 2);
    nonTurnPlayer(state).rage = 3;
    expect(nonTurnPlayer(invade(state, 2)).rage).toBe(1);
  });
});

describe("ESD02-010 Mothra (Imago) (1992)", () => {
  function enter(playedVia?: "evolution" | "effect") {
    const state = atPlayTiming();
    const me = turnPlayer(state);
    const card = place(state, me, real("ESD02-010"), 3);
    if (playedVia) card.playedVia = playedVia;
    // The card has just been played into zone 3 (12.2); M4f's Evolution will record playedVia.
    appendLog(state, "place", me.id, {
      rule: "5.11.1",
      cardId: card.cardId,
      instanceId: card.instanceId,
      from: "deck",
      to: "zone 3",
      played: true,
    });
    const hand = me.hand.length;
    checkTiming(state, "test");
    return { state, hand };
  }

  it("ESD02-010 12.6.2: if played through evolution, draws 1 card", () => {
    const { state, hand } = enter("evolution");
    expect(turnPlayer(state).hand).toHaveLength(hand + 1);
  });

  it("ESD02-010 12.2: played any other way, it draws nothing", () => {
    const { state, hand } = enter("effect");
    expect(turnPlayer(state).hand).toHaveLength(hand);
    expect(logTypes(state)).toContain("conditionNotMet");
  });
});

describe("optional abilities and revealed cards (Q2, 5.10)", () => {
  const numbers: string[] = [];
  afterEach(() => {
    for (const n of numbers.splice(0)) setTestAbilities(n, null);
  });

  it("10.5.4 an optional ability asks 'use this ability?' first", () => {
    const state = atPlayTiming();
    const me = turnPlayer(state);
    const source = battleCard();
    numbers.push(source.deckCardNumber);
    setTestAbilities(source.deckCardNumber, {
      deckCardNumber: source.deckCardNumber,
      status: "implemented",
      abilities: [
        {
          kind: "triggered",
          id: "may-draw",
          optional: true,
          trigger: { on: "enter" },
          effects: [{ effect: "draw", player: "you", count: 1 }],
        },
      ],
    });
    nonTurnPlayer(state).monsterPosition = 8;
    const card = inHand(state, me, source);
    const paused = applyAction(state, {
      type: "playBattle",
      player: me.id,
      cardInstanceId: card.instanceId,
      zone: 2,
    });
    expect(paused.pendingChoice).toMatchObject({ kind: "confirm" });
    const hand = turnPlayer(paused).hand.length;
    expect(turnPlayer(choose(paused, "yes")).hand).toHaveLength(hand + 1);
    expect(turnPlayer(choose(paused, "no")).hand).toHaveLength(hand);
  });

  it("5.10.1.1 a revealed card is shown to both players until the effect ends", () => {
    const state = atPlayTiming();
    const me = turnPlayer(state);
    const opp = nonTurnPlayer(state);
    const source = battleCard();
    numbers.push(source.deckCardNumber);
    setTestAbilities(source.deckCardNumber, {
      deckCardNumber: source.deckCardNumber,
      status: "implemented",
      abilities: [
        {
          kind: "triggered",
          id: "reveal-then-choose",
          trigger: { on: "enter" },
          effects: [
            {
              effect: "search",
              player: "you",
              filter: { owner: "you", area: "deck", name: "Godzilla (2023)" },
              count: { upTo: 1 },
              reveal: true,
              as: "found",
              effects: [],
            },
            { effect: "chooseZone", owner: "opponent", as: "zone" },
          ],
        },
      ],
    });
    opp.monsterPosition = 8;
    const target = onDeck(state, me, real("ESD01-003"));
    const card = inHand(state, me, source);
    const searching = applyAction(state, {
      type: "playBattle",
      player: me.id,
      cardInstanceId: card.instanceId,
      zone: 2,
    });
    const revealed = choose(searching, real("ESD01-003").id);
    expect(revealed.pendingChoice?.kind).toBe("zone");
    expect(
      getPlayerView(revealed, opp.id).revealed.map((r) => r.card.instanceId),
    ).toEqual([target.instanceId]);
    expect(
      getPlayerView(revealed, opp.id).cards[real("ESD01-003").id],
    ).toBeDefined();
    const done = choose(revealed, `${opp.id}:1`);
    expect(done.revealed).toEqual([]);
    expect(getPlayerView(done, opp.id).revealed).toEqual([]);
  });
});
