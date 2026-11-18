import type { CardAbilities } from "@gojisim/cards";
import { describe, expect, it, onTestFinished } from "vitest";
import {
  advance,
  type GameState,
  type PlayerState,
  type ZoneNumber,
} from "../src";
import { setTestAbilities } from "../src/testing";
import { activate, invade, self, settle, setup } from "./fixtures/play";
import { inHand, place } from "./fixtures/real";
import {
  addCard,
  at,
  battleCard,
  monsterCard,
  newGame,
  strategyCard,
  turnPlayer,
} from "./fixtures/state";

/*
 * A battle card that repels its master's end phase advance into its zone (7.5.2): a retreat
 * instead (5.13.2) and a token in the zone left; and the zone "1 lower" on your own field. On
 * made-up cards.
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

/** A battle card in `zone` that repels your Minilla monster's end phase advance, leaving Crystals. */
function repeller(state: GameState, me: PlayerState, zone: ZoneNumber) {
  const card = battleCard({ id: 970001 });
  abilities(card.deckCardNumber, [
    {
      kind: "continuous",
      id: "repel",
      modifiers: [
        {
          flag: "repelsEndPhaseAdvance",
          target: { owner: "you", area: "zones", this: true },
          traits: ["Minilla"],
          token: "Crystals",
        },
      ],
    },
  ]);
  return place(state, me, card, zone);
}

const has = (
  state: GameState,
  me: PlayerState,
  zone: ZoneNumber,
  name: string,
) =>
  self(state, me).zones[zone].some((stack) =>
    stack.some((c) => state.cards[c.cardId]?.name === name),
  );
const holds = (
  state: GameState,
  me: PlayerState,
  zone: ZoneNumber,
  id: string,
) =>
  self(state, me).zones[zone].some((stack) =>
    stack.some((c) => c.instanceId === id),
  );

describe("repelsEndPhaseAdvance (7.5.2)", () => {
  const endPhase = (traits: string[]) => {
    const state = at(newGame(), "7.5.2");
    const me = turnPlayer(state);
    me.monsterPosition = 4;
    monsterWith(state, me, traits);
    const card = repeller(state, me, 5);
    return { state, me, card, after: advance(state) };
  };

  it("Paul's example: Minilla in 4, the card in 5: at the end phase it goes to 3, and Crystals is played in 4", () => {
    const { me, card, after } = endPhase(["Minilla"]);
    expect(self(after, me).monsterPosition).toBe(3);
    expect(has(after, me, 4, "Crystals")).toBe(true);
    expect(holds(after, me, 5, card.instanceId)).toBe(true);
  });

  it("a monster without the trait advances as usual (and crushes it, 11.3)", () => {
    const { me, card, after } = endPhase(["Other"]);
    expect(self(after, me).monsterPosition).toBe(5);
    expect(holds(after, me, 5, card.instanceId)).toBe(false);
  });

  it("only the end phase advance: invading into its zone crushes it as usual (11.3)", () => {
    const { state, me } = setup(4);
    monsterWith(state, me, ["Minilla"]);
    const card = repeller(state, me, 5);
    const after = settle(
      invade(state, me, inHand(state, me, battleCard({ invadeZones: 1 }))),
    );
    expect(self(after, me).monsterPosition).toBe(5);
    expect(holds(after, me, 5, card.instanceId)).toBe(false);
  });
});

describe("shieldsFromRepel (7.5.2)", () => {
  it("Paul's example: the monster shares a shielding card's zone (5), the repeller is in 6: its end phase advance happens and crushes the repeller (11.3)", () => {
    const state = at(newGame(), "7.5.2");
    const me = turnPlayer(state);
    me.monsterPosition = 5;
    monsterWith(state, me, ["Minilla"]);
    const shield = battleCard({ id: 970003 });
    abilities(shield.deckCardNumber, [
      {
        kind: "continuous",
        id: "shield",
        modifiers: [
          {
            flag: "shieldsFromRepel",
            target: { owner: "you", area: "zones", this: true },
            traits: ["Minilla"],
          },
        ],
      },
    ]);
    // Placed directly in the monster's zone (sharing a zone is another flag's job).
    place(state, me, shield, 5);
    const card = repeller(state, me, 6);
    const after = advance(state);
    expect(self(after, me).monsterPosition).toBe(6);
    expect(holds(after, me, 6, card.instanceId)).toBe(false);
  });
});

describe("oneLowerThan: the zone numbered 1 lower on your field", () => {
  const run = (monsterAt: ZoneNumber) => {
    const { state, me } = setup(monsterAt);
    const card = strategyCard({ id: 970002, rank: 1 });
    abilities(card.deckCardNumber, [
      {
        kind: "triggered",
        id: "lower-token",
        trigger: { on: "placedInStrategyZone" },
        effects: [
          {
            effect: "createToken",
            name: "Crystals",
            zones: { relation: "oneLowerThan", of: "yourMonster" },
          },
        ],
      },
    ]);
    const after = settle(activate(state, me, inHand(state, me, card)));
    return ([1, 2, 3, 4, 5, 6, 7, 8] as ZoneNumber[]).filter((z) =>
      has(after, me, z, "Crystals"),
    );
  };

  it("monster in 5: the token goes to zone 4 (not 4.4.5.1's behind)", () => {
    expect(run(5)).toEqual([4]);
  });

  it("monster in 1: there's no zone 1 lower, so no token", () => {
    expect(run(1)).toEqual([]);
  });
});
