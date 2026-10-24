import { describe, expect, it } from "vitest";
import {
  type Action,
  advanceToDecision,
  applyAction,
  type CardInstance,
  type ComboHit,
  detectCombos,
  type GameState,
  newComboTracker,
  type PlayerState,
} from "../src";
import {
  atPlayTiming,
  inDiscard,
  inHand,
  monster,
  onDeck,
  place,
  real,
} from "./fixtures/real";
import { battleCard, nonTurnPlayer, turnPlayer } from "./fixtures/state";

/**
 * Plays actions on a state and feeds every step to a combo tracker, as the board and the bot
 * reports do (M5g). `act` applies one action and advances to the next decision; `choose` takes
 * the chooser's option.
 */
function driver(start: GameState) {
  const tracker = newComboTracker();
  const hits: ComboHit[] = [];
  let state = start;
  let index = 0;
  // Every action runs on to the next decision, as in a real game (`withAction`).
  const act = (action: Action) => {
    const next = advanceToDecision(applyAction(state, action));
    hits.push(...detectCombos(tracker, state, action, next, index++));
    state = next;
    return next;
  };

  const choose = (optionId: string) => {
    const choice = state.pendingChoice;
    if (!choice) throw new Error("No pending choice");
    if (!choice.options.some((o) => o.id === optionId))
      throw new Error(
        `No option ${optionId} in ${JSON.stringify(choice.options)}`,
      );
    return act({
      type: "choose",
      player: choice.player,
      choiceId: choice.id,
      optionId,
    });
  };
  /** Answers choices with a simple rule until none is pending (yes, first card, first zone). */
  const answerAll = (
    rule: (ids: string[]) => string = (ids) => ids[0] ?? "",
  ) => {
    for (let i = 0; i < 20 && state.pendingChoice; i++) {
      const ids = state.pendingChoice.options.map((o) => o.id);
      choose(
        ids.includes("yes") ? "yes" : rule(ids.filter((id) => id !== "done")),
      );
    }
  };
  const pickCard = (cardId: number) => {
    const option = state.pendingChoice?.options.find(
      (o) => o.cardId === cardId,
    );
    if (!option) throw new Error(`No option for card ${cardId}`);
    return choose(option.id);
  };
  /** Passes until `player` is at their main phase play timing again (opponents pass too). */
  const passTo = (player: string) => {
    act({ type: "pass", player: state.turnPlayer });
    for (let i = 0; i < 20; i++) {
      if (state.pendingChoice) {
        answerAll();
        continue;
      }
      if (state.turnPlayer === player && state.step === "7.3.2") return;
      act({ type: "pass", player: state.turnPlayer });
    }
    throw new Error(`never reached ${player}'s main phase`);
  };
  return {
    get state() {
      return state;
    },
    act,
    choose,
    pickCard,
    answerAll,
    passTo,
    hits,
    names: () => hits.map((h) => `${h.name} (${h.player})`),
  };
}

const named = (hits: ComboHit[], name: string) =>
  hits.filter((h) => h.name === name);

/** Puts a card in `player`'s strategy zone `index` as if it was activated on this turn. */
const activate = (
  d: ReturnType<typeof driver>,
  player: PlayerState,
  card: CardInstance,
) =>
  d.act({
    type: "activateStrategy",
    player: player.id,
    cardInstanceId: card.instanceId,
    strategyZone: 1,
  });

const me = (s: GameState) => turnPlayer(s);
const opp = (s: GameState) => nonTurnPlayer(s);

describe("Ginza Inferno (ESD01)", () => {
  function setup(emergesFinds: boolean) {
    const state = atPlayTiming();
    const p = me(state);
    const o = opp(state);
    monster(state, p, real("ESD01-003"), 6);
    p.rage = 1;
    o.monsterPosition = 8;
    place(state, o, battleCard({ id: 980001, rank: 3 }), 3);
    p.hand = [];
    const ginza = inHand(state, p, real("ESD01-013"));
    const fodder = inHand(state, p, real("ESD01-001"));
    const emerges = inHand(state, p, real("ESD01-014"));
    p.deck = [];
    if (emergesFinds) onDeck(state, p, real("ESD01-012"));
    onDeck(state, p, battleCard({ id: 980002 }));
    return { state, p, ginza, fodder, emerges };
  }

  it("Ginza Annihilated destroys, then Godzilla Emerges plays a battle card: fires once", () => {
    const { state, p, ginza, fodder, emerges } = setup(true);
    const d = driver(state);
    activate(d, p, ginza);
    // 8.4: gaining rage triggers Ginza Annihilated: the one rank 6 or lower card is destroyed.
    d.act({
      type: "gainRage",
      player: p.id,
      cardInstanceId: fodder.instanceId,
    });
    expect(
      d.state.log.some(
        (e) =>
          e.type === "destroy" &&
          e.payload["cause"] === "ESD01-013#rage-destroy",
      ),
    ).toBe(true);
    expect(d.hits).toEqual([]);
    d.act({
      type: "activateStrategy",
      player: p.id,
      cardInstanceId: emerges.instanceId,
      strategyZone: 2,
    });
    d.pickCard(real("ESD01-012").id);
    d.answerAll();
    expect(d.names()).toEqual([`Ginza Inferno (${p.id})`]);
    expect(d.hits[0]).toMatchObject({
      comboId: "ginza-inferno",
      cards: ["ESD01-013", "ESD01-014"],
    });
  });

  it("near-miss: Ginza Annihilated destroys but Godzilla Emerges finds nothing", () => {
    const { state, p, ginza, fodder, emerges } = setup(false);
    const d = driver(state);
    activate(d, p, ginza);
    d.act({
      type: "gainRage",
      player: p.id,
      cardInstanceId: fodder.instanceId,
    });
    d.act({
      type: "activateStrategy",
      player: p.id,
      cardInstanceId: emerges.instanceId,
      strategyZone: 2,
    });
    d.answerAll();
    expect(d.hits).toEqual([]);
  });
});

describe("Tokyo Wall (ESD01)", () => {
  it("ESD01-012 in zone 8 with City of Tokyo's and its own bonus: fires once for that card", () => {
    const state = atPlayTiming();
    const p = me(state);
    const o = opp(state);
    monster(state, p, real("ESD01-003"), 3);
    o.monsterPosition = 8;
    p.rage = 2;
    place(state, p, real("ESD01-010"), 2);
    const wall = inHand(state, p, real("ESD01-012"));
    const d = driver(state);
    d.act({
      type: "playBattle",
      player: p.id,
      cardInstanceId: wall.instanceId,
      zone: 8,
    });
    d.answerAll();
    expect(d.names()).toEqual([`Tokyo Wall (${p.id})`]);
    // The same card staying there is the same occurrence.
    const more = inHand(
      d.state,
      me(d.state),
      battleCard({ id: 980003, rank: 1 }),
    );
    d.act({
      type: "playBattle",
      player: p.id,
      cardInstanceId: more.instanceId,
      zone: 5,
    });
    expect(named(d.hits, "Tokyo Wall")).toHaveLength(1);
  });

  it("near-miss: City of Tokyo's bonus off (1 rage, monster before zone 6) does not fire", () => {
    const state = atPlayTiming();
    const p = me(state);
    const o = opp(state);
    monster(state, p, real("ESD01-003"), 3);
    o.monsterPosition = 8;
    p.rage = 1;
    place(state, p, real("ESD01-010"), 2);
    const wall = inHand(state, p, real("ESD01-012"));
    const d = driver(state);
    d.act({
      type: "playBattle",
      player: p.id,
      cardInstanceId: wall.instanceId,
      zone: 8,
    });
    expect(d.hits).toEqual([]);
  });
});

describe("Deep Sea Ambush (ESD01)", () => {
  function setup() {
    const state = atPlayTiming();
    const p = me(state);
    const o = opp(state);
    monster(state, p, real("ESD01-002"), 2);
    onDeck(state, p, real("ESD01-006"));
    o.monsterPosition = 2;
    return { state, p, o };
  }

  it("ESD01-006 found by ESD01-002's search, Burst-played next turn, destroys: fires once across turns", () => {
    const { state, p } = setup();
    const invader = inHand(
      state,
      p,
      battleCard({ id: 980010, invadeZones: 1 }),
    );
    const d = driver(state);
    d.act({ type: "invade", player: p.id, cardInstanceId: invader.instanceId });
    d.pickCard(real("ESD01-006").id);
    d.answerAll();
    const found = me(d.state).hand.find(
      (c) => c.cardId === real("ESD01-006").id,
    );
    if (!found) throw new Error("not found");
    d.passTo(p.id);
    // Next turn: the monster is still rank II, so ESD01-006 is a Burst play; give it a target.
    const o = d.state.players.find((x) => x.id !== p.id) as PlayerState;
    place(d.state, o, battleCard({ id: 980011, rank: 2 }), 1);
    const mine = d.state.players.find((x) => x.id === p.id) as PlayerState;
    mine.monsterPosition = 3;
    expect(d.hits).toEqual([]);
    d.act({
      type: "playMonster",
      player: p.id,
      cardInstanceId: found.instanceId,
    });
    d.answerAll();
    expect(d.names()).toEqual([`Deep Sea Ambush (${p.id})`]);
  });

  it("near-miss: ESD01-006 played with Burst from hand without ESD01-002's search", () => {
    const { state, p, o } = setup();
    place(state, o, battleCard({ id: 980012, rank: 2 }), 1);
    const fromHand = inHand(state, p, real("ESD01-006"));
    const d = driver(state);
    d.act({
      type: "playMonster",
      player: p.id,
      cardInstanceId: fromHand.instanceId,
    });
    d.answerAll();
    expect(
      d.state.log.some(
        (e) => e.type === "place" && e.payload["burst"] === true,
      ),
    ).toBe(true);
    expect(
      d.state.log.some((e) => e.payload["cause"] === "ESD01-006#enter-destroy"),
    ).toBe(true);
    expect(d.hits).toEqual([]);
  });
});

describe("Oxygen Destroyer (ESD02)", () => {
  function invadeWith(rank: number) {
    const state = atPlayTiming();
    const p = me(state);
    const o = opp(state);
    monster(state, p, real("ESD02-004"), 4);
    place(state, o, battleCard({ id: 980020, rank: 3 }), 2);
    place(state, o, battleCard({ id: 980021, rank: 5 }), 3);
    p.hand = [];
    const invader = inHand(
      state,
      p,
      battleCard({ id: 980022, invadeZones: 1 }),
    );
    const paid =
      rank === 8
        ? inHand(state, p, real("ESD02-013"))
        : inHand(state, p, battleCard({ id: 980023, rank }));
    const d = driver(state);
    d.act({ type: "invade", player: p.id, cardInstanceId: invader.instanceId });
    d.answerAll((ids) =>
      ids.includes(paid.instanceId) ? paid.instanceId : (ids[0] ?? ""),
    );
    return { d, p };
  }

  it("ESD02-004's cost paid with Destoroyah Perfect Form (rank 8) destroys: fires once", () => {
    const { d, p } = invadeWith(8);
    expect(opp(d.state).zones[2]).toEqual([]);
    expect(d.names()).toEqual([`Oxygen Destroyer (${p.id})`]);
  });

  it("near-miss: the cost paid with a rank 7 card destroys, but does not fire", () => {
    const { d } = invadeWith(7);
    expect(
      d.state.log.filter(
        (e) => e.payload["cause"] === "ESD02-004#invading-destroy",
      ),
    ).not.toHaveLength(0);
    expect(d.hits).toEqual([]);
  });
});

describe("Twin Cocoons (ESD02)", () => {
  function setup() {
    const state = atPlayTiming();
    const p = me(state);
    const o = opp(state);
    // A rank III monster: ESD02-003 (rank III) stacks on it as a normal play.
    monster(state, p, real("ESD02-005"), 5);
    o.monsterPosition = 2;
    inDiscard(state, p, real("ESD02-007"));
    inDiscard(state, p, real("ESD02-008"));
    onDeck(state, p, real("ESD02-010"));
    onDeck(state, p, real("ESD02-011"));
    const godzilla = inHand(state, p, real("ESD02-003"));
    return { state, p, godzilla };
  }

  it("ESD02-003 plays both Larvae, one evolves at the next main phase: fires once across turns", () => {
    const { state, p, godzilla } = setup();
    const d = driver(state);
    d.act({
      type: "playMonster",
      player: p.id,
      cardInstanceId: godzilla.instanceId,
    });
    d.answerAll();
    const larvae = Object.values(me(d.state).zones)
      .flat()
      .map((stack) => stack[stack.length - 1]?.cardId);
    expect(larvae).toEqual(
      expect.arrayContaining([real("ESD02-007").id, real("ESD02-008").id]),
    );
    expect(d.hits).toEqual([]);
    // Next turn: Evolution (yes) on each Larva at the beginning of the main phase.
    d.passTo(p.id);
    expect(named(d.hits, "Twin Cocoons")).toEqual([
      expect.objectContaining({ player: p.id, comboId: "twin-cocoons" }),
    ]);
  });

  it("near-miss: no Larva evolves by the end of the next main phase", () => {
    const { state, p, godzilla } = setup();
    const d = driver(state);
    d.act({
      type: "playMonster",
      player: p.id,
      cardInstanceId: godzilla.instanceId,
    });
    d.answerAll();
    // Decline every Evolution, then pass the next main phase too.
    d.act({ type: "pass", player: p.id });
    for (
      let i = 0;
      i < 40 &&
      !(
        d.state.turnPlayer === p.id &&
        d.state.step === "7.3.2" &&
        !d.state.pendingChoice
      );
      i++
    ) {
      const choice = d.state.pendingChoice;
      if (choice)
        d.choose(
          choice.options.some((o) => o.id === "no")
            ? "no"
            : (choice.options[0]?.id ?? ""),
        );
      else d.act({ type: "pass", player: d.state.turnPlayer });
    }
    d.act({ type: "pass", player: p.id });
    expect(d.hits).toEqual([]);
  });
});

describe("Cosmos Call (ESD02)", () => {
  it("The Legend of Infant Island evolves Mothra (Larva) and Mothra (Imago) draws: fires once", () => {
    const state = atPlayTiming();
    const p = me(state);
    monster(state, p, real("ESD02-002"), 5);
    place(state, p, real("ESD02-007"), 3);
    onDeck(state, p, real("ESD02-010"));
    onDeck(state, p, battleCard({ id: 980030 }));
    const legend = inHand(state, p, real("ESD02-014"));
    const d = driver(state);
    activate(d, p, legend);
    d.answerAll((ids) => {
      const imago = d.state.pendingChoice?.options.find(
        (o) => o.cardId === real("ESD02-010").id,
      );
      return imago?.id ?? ids[0] ?? "";
    });
    expect(
      d.state.log.some(
        (e) =>
          e.type === "draw" &&
          e.payload["abilityId"] === "ESD02-010#enter-draw",
      ),
    ).toBe(true);
    expect(d.names()).toEqual([`Cosmos Call (${p.id})`]);
  });

  it("near-miss: Evolution at the start of the main phase is not The Legend of Infant Island", () => {
    const state = atPlayTiming();
    const p = me(state);
    monster(state, p, real("ESD02-002"), 5);
    place(state, p, real("ESD02-007"), 3);
    onDeck(state, p, real("ESD02-010"));
    // Under the cards drawn before the next main phase.
    for (let i = 0; i < 4; i++)
      onDeck(state, p, battleCard({ id: 980031 + i }));
    const d = driver(state);
    d.passTo(p.id);
    expect(
      d.state.log.some(
        (e) =>
          e.type === "draw" &&
          e.payload["abilityId"] === "ESD02-010#enter-draw",
      ),
    ).toBe(true);
    expect(named(d.hits, "Cosmos Call")).toEqual([]);
  });
});

describe("Cadmium Barrage (ESD02)", () => {
  function setup() {
    const state = atPlayTiming();
    const p = me(state);
    const o = opp(state);
    monster(state, p, real("ESD02-005"), 4);
    o.monsterPosition = 4;
    o.rage = 3;
    const superX = inHand(state, p, real("ESD02-009"));
    const invader = inHand(
      state,
      p,
      battleCard({ id: 980040, invadeZones: 2 }),
    );
    return { state, p, o, superX, invader };
  }

  it("Super-X in zone 8, then ESD02-005 invades 2 zones: 3 rage taken in one turn, fires once", () => {
    const { state, p, o, superX, invader } = setup();
    const d = driver(state);
    d.act({
      type: "playBattle",
      player: p.id,
      cardInstanceId: superX.instanceId,
      zone: 8,
    });
    d.answerAll();
    expect(d.hits).toEqual([]);
    d.act({ type: "invade", player: p.id, cardInstanceId: invader.instanceId });
    d.answerAll();
    const rage = d.state.players.find((x) => x.id === o.id)?.rage;
    expect(rage).toBe(0);
    expect(d.names()).toEqual([`Cadmium Barrage (${p.id})`]);
  });

  it("near-miss: Super-X alone reducing 1 rage", () => {
    const { state, p, superX } = setup();
    const d = driver(state);
    d.act({
      type: "playBattle",
      player: p.id,
      cardInstanceId: superX.instanceId,
      zone: 8,
    });
    d.answerAll();
    d.act({ type: "pass", player: p.id });
    expect(d.hits).toEqual([]);
  });
});

describe("not a combo", () => {
  it("near-miss: Operation Wadatsumi after ESD01-005 (it repeats a discard)", () => {
    const state = atPlayTiming();
    const p = me(state);
    const o = opp(state);
    monster(state, p, real("ESD01-001"), 7);
    for (let i = 0; i < 6; i++)
      inHand(state, o, battleCard({ id: 980050 + i }));
    const burst = inHand(state, p, real("ESD01-005"));
    const wadatsumi = inHand(state, p, real("ESD01-015"));
    const d = driver(state);
    d.act({
      type: "playMonster",
      player: p.id,
      cardInstanceId: burst.instanceId,
    });
    d.answerAll();
    activate(d, p, wadatsumi);
    d.answerAll();
    expect(d.hits).toEqual([]);
  });
});
