import type { Card } from "@gojisim/cards";
import { getCardAbilities } from "@gojisim/cards";
import { describe, expect, it, onTestFinished } from "vitest";
import {
  advanceToDecision,
  applyAction,
  checkInvariants,
  counterPowerOf,
  type GameState,
  getCounterPower,
  getLegalActions,
  getThreat,
  type PlayerState,
  type ZoneNumber,
} from "../src";
import { setTestAbilities } from "../src/testing";
import {
  activate,
  choose,
  invade,
  invader,
  newLogTypes,
  opponentOf,
  opponentsTurn,
  play,
  playMonster,
  self,
  settle,
  settleUntil,
  setup,
} from "./fixtures/play";
import {
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
  monsterCard,
  newGame,
  runTo,
  strategyCard,
  turnPlayer,
} from "./fixtures/state";

// M12b-2: the rest of EBP02 and its tokens (docs/abilities/m12-plan.md: E6 tokens, T2 Revenge,
// E12, E15, E21). One test (or more) per card, named with its rules.

const pass = (state: GameState) =>
  applyAction(state, { type: "pass", player: state.turnPlayer });

const inStrategy = (
  state: GameState,
  player: PlayerState,
  card: Card,
  zone: 0 | 1 = 0,
  turn = state.turn,
) =>
  player.strategyZones[zone].push({
    card: addCard(state, card, player.id),
    placedOnTurn: turn,
  });

const tokenNames = (state: GameState, player: PlayerState) =>
  Object.values(self(state, player).zones)
    .flat()
    .map((stack) => state.cards[String(stack.at(-1)?.cardId)])
    .filter((c) => c?.type === "Token")
    .map((c) => c?.name);

const sg = (rank: number) => monsterCard(rank, { traits: ["SpaceGodzilla"] });

/** The opponent destroys all of my battle cards in zones 1-5 with EBP01-065 (an effect, 5.12). */
function opponentWipes(state: GameState, opp: PlayerState) {
  opp.monsterPosition = 6;
  return settle(activate(state, opp, inHand(state, opp, real("EBP01-065"))));
}

describe("EBP02 tokens (E6, 9.1)", () => {
  it("EBP02-020 9.1.2: with 5 strategy cards in your discard pile, a Conductorless Train Bombers token appears in each of your unoccupied zones; each one's [enter] reduces the opponent's rage (EBP02-T01)", () => {
    const { state, me, opp } = setup(6);
    for (let i = 0; i < 5; i++) inDiscard(state, me, strategyCard());
    place(state, me, battleCard(), 1);
    opp.rage = 9;
    const after = settle(
      activate(state, me, inHand(state, me, real("EBP02-020"))),
    );
    // Zones 2-5, 7 and 8: not zone 1 (a card) or 6 (the monster).
    expect(tokenNames(after, me)).toHaveLength(6);
    expect(opponentOf(after, me).rage).toBe(3);
  });

  it("EBP02-025 9.1.2: on enter, a Tentacles token appears adjacent to it; it can't advance or invade (M1)", () => {
    const { state, me } = setup(3);
    monster(state, me, monsterCard(2, { traits: ["Biollante"] }), 3);
    const played = settle(
      playMonster(state, me, inHand(state, me, real("EBP02-025"))),
    );
    expect(tokenNames(played, me)).toEqual(["Tentacles"]);
    const zone = Object.keys(zoneCardIds(self(played, me)))[0];
    expect(["2", "4", "8"]).toContain(zone);
    expect(
      getLegalActions(played, me.id).some((a) => a.type === "invade"),
    ).toBe(false);
  });

  it("EBP02-035 9.1.2: on enter, 2 Tentacles tokens appear adjacent to it; with 2 Biollante cards in your discard pile, the opponent's discard pile goes back to their deck", () => {
    const { state, me, opp } = setup();
    inDiscard(state, me, real("EBP02-032"));
    inDiscard(state, me, real("EBP02-032"));
    inDiscard(state, opp, battleCard());
    const after = settle(
      play(state, me, inHand(state, me, real("EBP02-035")), 3),
    );
    expect(tokenNames(after, me)).toEqual(["Tentacles", "Tentacles"]);
    expect(opponentOf(after, me).discard).toEqual([]);
    // A Tentacles token is a battle card with 3,000 counter power (Q39).
    expect(counterPowerOf(after, self(after, me))).toBe(5000 + 6000);
  });

  it("EBP02-052 12.3: when invading, you may discard a card to make a Crystals token", () => {
    const { state, me } = setup(1);
    monster(state, me, real("EBP02-052"), 1);
    inHand(state, me, battleCard());
    const after = settle(invade(state, me, invader(state, me)));
    expect(tokenNames(after, me)).toEqual(["Crystals"]);
  });

  it("EBP02-053 12.3: when invading, a Crystals token; +5,000 threat with a Crystals in your zones; Crystals adds +1,000 to SpaceGodzilla monsters (EBP02-T03)", () => {
    const { state, me } = setup(1);
    monster(state, me, real("EBP02-053"), 1);
    const after = settle(invade(state, me, invader(state, me)));
    expect(tokenNames(after, me)).toEqual(["Crystals"]);
    expect(getThreat(after, me.id)).toBe(12000 + 5000 + 1000);
  });

  it("EBP02-054 3.4: on enter 2 Crystals; when its rage goes up, destroy 1 rank 5 or lower battle card per Crystals", () => {
    const { state, me, opp } = setup();
    monster(state, me, sg(3), 2);
    for (const zone of [1, 2, 3] as ZoneNumber[])
      place(state, opp, battleCard({ rank: 5 }), zone);
    // The monster play's own +1 rage already triggers it, after the tokens appear.
    const after = settle(
      playMonster(state, me, inHand(state, me, real("EBP02-054"))),
    );
    expect(tokenNames(after, me)).toEqual(["Crystals", "Crystals"]);
    expect(Object.keys(zoneCardIds(opponentOf(after, me)))).toHaveLength(1);
  });

  it("EBP02-056 7.5.2: in your end phase it advances 1 more zone per Crystals; +20,000 threat with 3 (E15)", () => {
    const { state, me } = setup(2);
    monster(state, me, real("EBP02-056"), 2);
    for (let i = 0; i < 3; i++)
      place(state, me, real("EBP02-T03"), (i + 4) as ZoneNumber);
    // +20,000 for 3 Crystals, and each Crystals' own +1,000 (EBP02-T03).
    expect(getThreat(state, me.id)).toBe(32000 + 20000 + 3000);
    // 2 -> 3 by 7.5.2, then 3 more: 6. Crush and destroy (11.3) takes the Crystals in zones 4-6.
    // The extra advances resolve in the 7.5.3 check timing.
    const after = settleUntil(pass(state), "7.5.4");
    expect(self(after, me).monsterPosition).toBe(6);
    expect(newLogTypes(after, state)).toContain("tokenGone");
  });

  it("EBP02-057 5.2.1: on enter, you move an opponent's battle card in its column to their unoccupied zone; rage up makes 2 Crystals", () => {
    const { state, me, opp } = setup(3);
    // My zone 5 is in the same column as the opponent's zone 1.
    monster(state, me, sg(4), 5);
    place(state, opp, battleCard({ id: 967011 }), 1);
    let after = playMonster(state, me, inHand(state, me, real("EBP02-057")));
    if (after.pendingChoice?.kind === "zone") {
      expect(after.pendingChoice.player).toBe(me.id);
      after = choose(after, (id) => id === `${opp.id}:7`);
    }
    after = settle(after);
    expect(zoneCardIds(opponentOf(after, me))["1"]).toBeUndefined();
    expect(tokenNames(after, me)).toEqual(["Crystals", "Crystals"]);
  });

  it("EBP02-072 7.4.2: on your turn with 3 Crystals, +20,000 total counter power", () => {
    const { state, me } = setup();
    inStrategy(state, me, real("EBP02-072"));
    for (const zone of [1, 2, 3] as ZoneNumber[])
      place(state, me, real("EBP02-T03"), zone);
    expect(counterPowerOf(state, me)).toBe(20000);
  });

  it("EBP02-077 5.7.3: at your main phase it mills 2; a Godzilla card destroys it and makes a Chibi Godzilla 2nd Form token, which at your end phase swaps back to a Chibi Godzilla from the discard pile (EBP02-T04)", () => {
    let state = runTo(newGame(), "7.3.1");
    const me = turnPlayer(state);
    opponentOf(state, me).monsterPosition = 8;
    place(state, me, real("EBP02-077"), 2);
    onDeck(state, me, battleCard({ traits: ["Godzilla"] }));
    onDeck(state, me, battleCard());
    state = settle(state);
    expect(tokenNames(state, me)).toEqual(["Chibi Godzilla 2nd Form"]);
    // The Chibi Godzilla 2nd Form token has 10,000 counter power (Q39).
    expect(counterPowerOf(state, self(state, me))).toBe(10000);
    state = settleUntil(pass(state), "7.5.2");
    expect(tokenNames(state, me)).toEqual([]);
    expect(Object.values(zoneCardIds(self(state, me))).flat()).toContain(
      real("EBP02-077").id,
    );
  });

  it("EBP02-T02 Tentacles has no ability; every token's data is in EBP02.json", () => {
    expect(getCardAbilities("EBP02-T02")).toMatchObject({
      status: "implemented",
      abilities: [],
    });
    for (const n of ["EBP02-T01", "EBP02-T03", "EBP02-T04"])
      expect(getCardAbilities(n).status).toBe("implemented");
  });

  it("9.1.4.2: a destroyed token disappears instead of going to the discard pile", () => {
    const { state, me, opp } = opponentsTurn();
    place(state, me, real("EBP02-T02"), 2);
    const after = opponentWipes(state, opp);
    expect(zoneCardIds(self(after, me))).toEqual({});
    expect(self(after, me).discard).toEqual([]);
    expect(newLogTypes(after, state)).toContain("tokenGone");
  });
});

describe("EBP02 Revenge (T2, 12.7, Q17)", () => {
  it("EBP02-058 12.7.2: destroyed by an opponent's effect, you may return a King Ghidorah monster card from your discard pile to your hand", () => {
    const { state, me, opp } = opponentsTurn();
    place(state, me, real("EBP02-058"), 2);
    inDiscard(
      state,
      me,
      monsterCard(2, { id: 967021, traits: ["King Ghidorah"] }),
    );
    const after = opponentWipes(state, opp);
    expect(self(after, me).hand.map((c) => c.cardId)).toContain(967021);
  });

  it("EBP02-059 12.7.2: destroyed, you may discard a card to return a Godzilla (1991) battle card", () => {
    const { state, me, opp } = opponentsTurn();
    place(state, me, real("EBP02-059"), 2);
    inDiscard(state, me, real("EBP02-065"));
    inHand(state, me, battleCard());
    const after = opponentWipes(state, opp);
    expect(self(after, me).hand.map((c) => c.cardId)).toContain(
      real("EBP02-065").id,
    );
  });

  it("EBP02-060 4.4.5.4: +3,000 in the opponent's monster's column", () => {
    const { state, me, opp } = opponentsTurn();
    opp.monsterPosition = 1;
    expect(getCounterPower(state, place(state, me, real("EBP02-060"), 5))).toBe(
      5000,
    );
  });

  it("EBP02-060 12.7.2: destroyed with the opponent's monster in zones 1-5, you may return it to your hand", () => {
    const run = (position: ZoneNumber) => {
      const { state, me, opp } = opponentsTurn();
      place(state, me, real("EBP02-060"), 2);
      opp.monsterPosition = position;
      opp.rage = 2;
      // The opponent's EBP02-018: destroy 1 battle card at or before their monster's zone.
      const after = settle(
        activate(state, opp, inHand(state, opp, real("EBP02-018"))),
      );
      return self(after, me).hand.map((c) => c.cardId);
    };
    expect(run(5)).toContain(real("EBP02-060").id);
    expect(run(6)).not.toContain(real("EBP02-060").id);
  });

  it("EBP02-062 12.7.2: destroyed, return up to 1 SpaceGodzilla monster card", () => {
    const { state, me, opp } = opponentsTurn();
    place(state, me, real("EBP02-062"), 2);
    inDiscard(state, me, sg(3));
    const after = opponentWipes(state, opp);
    expect(
      self(after, me).hand.some((c) =>
        after.cards[c.cardId]?.traits.includes("SpaceGodzilla"),
      ),
    ).toBe(true);
  });

  it("EBP02-064 12.7.2: destroyed, return up to 1 King Ghidorah monster card; +3,000 with a King Ghidorah or Megalon card in your zones", () => {
    const { state, me, opp } = opponentsTurn();
    const card = place(state, me, real("EBP02-064"), 2);
    place(state, me, battleCard({ traits: ["Megalon"] }), 3);
    expect(getCounterPower(state, card)).toBe(6000);
    inDiscard(
      state,
      me,
      monsterCard(1, { id: 967031, traits: ["King Ghidorah"] }),
    );
    const after = opponentWipes(state, opp);
    expect(self(after, me).hand.map((c) => c.cardId)).toContain(967031);
  });

  it("12.7.2, 11.3: crush and destroy also triggers Revenge", () => {
    const { state, me } = setup(1);
    place(state, me, real("EBP02-058"), 2);
    inDiscard(
      state,
      me,
      monsterCard(2, { id: 967041, traits: ["King Ghidorah"] }),
    );
    const after = settle(invade(state, me, invader(state, me)));
    expect(self(after, me).hand.map((c) => c.cardId)).toContain(967041);
  });

  it("12.7.2, Q17: overload (11.5, duplicate card processing) doesn't trigger Revenge", () => {
    const { state, me } = setup();
    place(state, me, real("EBP02-058"), 2);
    inDiscard(
      state,
      me,
      monsterCard(2, { id: 967051, traits: ["King Ghidorah"] }),
    );
    const after = settle(play(state, me, inHand(state, me, battleCard()), 2));
    expect(self(after, me).hand.map((c) => c.cardId)).not.toContain(967051);
    expect(newLogTypes(after, state)).not.toContain("enterStandby");
  });

  it("12.7.3: a Revenge card stacked under another card doesn't trigger", () => {
    const { state, me, opp } = opponentsTurn();
    const top = place(state, me, battleCard({ id: 967061 }), 2);
    const stack = me.zones[2][0] ?? [];
    stack.unshift(addCard(state, real("EBP02-058"), me.id));
    expect(stack.at(-1)?.instanceId).toBe(top.instanceId);
    inDiscard(
      state,
      me,
      monsterCard(2, { id: 967062, traits: ["King Ghidorah"] }),
    );
    const after = opponentWipes(state, opp);
    expect(self(after, me).hand.map((c) => c.cardId)).not.toContain(967062);
  });
});

describe("EBP02-012 Godzilla (2016) Frozen (E21, E12)", () => {
  it("EBP02-012 10.9, 7.2.3: in zone 8, each strategy card leaving at your start phase may go under it instead", () => {
    let state = runTo(newGame(), "7.2.1");
    const me = turnPlayer(state);
    place(state, me, real("EBP02-012"), 8);
    me.strategyZones[0].push({
      card: addCard(state, strategyCard({ id: 967071 }), me.id),
      placedOnTurn: state.turn - 1,
    });
    me.strategyZones[1].push({
      card: addCard(state, strategyCard({ id: 967072 }), me.id),
      placedOnTurn: state.turn - 1,
    });
    state = advanceToDecision(state);
    expect(state.pendingChoice).toMatchObject({
      kind: "confirm",
      rule: "10.9",
      player: me.id,
    });
    expect(
      checkInvariants(state).filter((p) => p.startsWith("resolution")),
    ).toEqual([]);
    state = advanceToDecision(choose(state, (id) => id === "yes"));
    expect(state.pendingChoice).toMatchObject({
      kind: "confirm",
      rule: "10.9",
    });
    state = advanceToDecision(choose(state, (id) => id === "no"));
    const player = self(state, me);
    expect(player.zones[8][0]?.map((c) => c.cardId)).toEqual([
      967071,
      real("EBP02-012").id,
    ]);
    expect(player.discard.map((c) => c.cardId)).toContain(967072);
    expect(player.strategyZones.flat()).toEqual([]);
    expect(state.replacementAsks).toBeUndefined();
  });

  it("EBP02-012 10.9, 7.2.3 (#104): for a player who confirms single options, Yes pauses the step for the placeUnder picks and the start phase goes on; No discards", () => {
    const run = (answers: ["yes" | "no", "yes" | "no"]) => {
      let state = runTo(newGame(), "7.2.1");
      const me = turnPlayer(state);
      state.confirmSingleOption = [me.id];
      place(state, me, real("EBP02-012"), 8);
      me.strategyZones[0].push({
        card: addCard(state, strategyCard({ id: 967073 }), me.id),
        placedOnTurn: state.turn - 1,
      });
      me.strategyZones[1].push({
        card: addCard(state, strategyCard({ id: 967074 }), me.id),
        placedOnTurn: state.turn - 1,
      });
      state = advanceToDecision(state);
      const picks: string[] = [];
      for (const answer of answers) {
        expect(state.pendingChoice).toMatchObject({
          kind: "confirm",
          rule: "10.9",
        });
        state = advanceToDecision(choose(state, (id) => id === answer));
        // Where it goes (Frozen itself) and which card (the replaced one): one option each.
        while (state.pendingChoice?.kind === "target") {
          expect(state.pendingChoice.options).toHaveLength(1);
          expect(
            checkInvariants(state).filter((p) => p.startsWith("resolution")),
          ).toEqual([]);
          picks.push(state.pendingChoice.rule);
          state = advanceToDecision(choose(state, () => true));
        }
      }
      const player = self(state, me);
      expect(state.step).toBe("7.3.2");
      expect(player.strategyZones.flat()).toEqual([]);
      expect(state.replacementAsks).toBeUndefined();
      return {
        picks,
        under: player.zones[8][0]?.map((c) => c.cardId).slice(0, -1),
        discarded: player.discard
          .map((c) => c.cardId)
          .filter((id) => id === 967073 || id === 967074),
      };
    };
    expect(run(["yes", "yes"])).toEqual({
      picks: ["3.2", "3.2", "3.2", "3.2"],
      under: [967073, 967074],
      discarded: [],
    });
    expect(run(["no", "yes"])).toEqual({
      picks: ["3.2", "3.2"],
      under: [967074],
      discarded: [967073],
    });
  });

  it("EBP02-012 5.15.1: at your main phase in zone 4+, with 2 cards under it, counter the opponent's monster (Q24)", () => {
    let state = runTo(newGame(), "7.3.1");
    const me = turnPlayer(state);
    me.monsterPosition = 4;
    const frozen = place(state, me, real("EBP02-012"), 8);
    const stack = me.zones[8][0] ?? [];
    stack.unshift(
      addCard(state, strategyCard(), me.id),
      addCard(state, strategyCard(), me.id),
    );
    expect(stack.at(-1)?.instanceId).toBe(frozen.instanceId);
    state = settle(state);
    expect(newLogTypes(state, state)).toEqual([]);
    expect(state.log.some((e) => e.type === "counter")).toBe(true);
    expect(opponentOf(state, me).invadingMonsterZone.length).toBe(2);
  });

  it("E12 5.15.1.2.1: countering by an effect a monster with no next monster wins the game (Q24)", () => {
    let state = runTo(newGame(), "7.3.1");
    const me = turnPlayer(state);
    const opp = opponentOf(state, me);
    me.monsterPosition = 4;
    opp.monsterDeck = [];
    place(state, me, real("EBP02-012"), 8);
    const stack = me.zones[8][0] ?? [];
    stack.unshift(
      addCard(state, strategyCard(), me.id),
      addCard(state, strategyCard(), me.id),
    );
    state = settle(state);
    expect(state.result).toMatchObject({
      winner: me.id,
      reason: "victoryThroughCountering",
    });
  });
});

describe("M12b-2 token rules", () => {
  it("9.1.4.2: a token put on the deck disappears", () => {
    const { state, me, opp } = setup();
    place(state, opp, real("EBP02-T02"), 2);
    const card = strategyCard({ id: 967081 });
    setTestAbilities(card.deckCardNumber, {
      deckCardNumber: card.deckCardNumber,
      status: "implemented",
      abilities: [
        {
          kind: "triggered",
          id: "bounce",
          trigger: { on: "placedInStrategyZone" },
          effects: [
            {
              effect: "putOnDeck",
              target: { owner: "opponent", area: "zones" },
              where: "top",
            },
          ],
        },
      ],
    });
    onTestFinished(() => setTestAbilities(card.deckCardNumber, null));
    const deck = opp.deck.length;
    const after = settle(activate(state, me, inHand(state, me, card)));
    expect(zoneCardIds(opponentOf(after, me))).toEqual({});
    expect(opponentOf(after, me).deck).toHaveLength(deck);
    expect(newLogTypes(after, state)).toContain("tokenGone");
  });

  it('Q39: tokens count for "battle cards in your zones" (EBP01-027 Hedorah with 3 Crystals)', () => {
    const { state, me, opp } = setup();
    opp.monsterPosition = 5;
    for (const zone of [1, 2, 3] as ZoneNumber[])
      place(state, me, real("EBP02-T03"), zone);
    const card = inHand(state, me, real("EBP01-027"));
    expect(
      getLegalActions(state, me.id).some(
        (a) => a.type === "playBattle" && a.cardInstanceId === card.instanceId,
      ),
    ).toBe(true);
  });

  it("invariants: tokens don't count against the presented deck (card conservation)", () => {
    const { state, me } = setup(6);
    for (let i = 0; i < 5; i++)
      me.discard.push(addCard(state, strategyCard(), me.id));
    const after = settle(
      activate(state, me, inHand(state, me, real("EBP02-020"))),
    );
    const before = checkInvariants(state).filter((p) =>
      p.startsWith("card count"),
    ).length;
    expect(
      checkInvariants(after).filter((p) => p.startsWith("card count")),
    ).toHaveLength(before);
  });
});
