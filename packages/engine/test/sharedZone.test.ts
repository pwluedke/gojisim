import type { CardAbilities } from "@gojisim/cards";
import { describe, expect, it, onTestFinished } from "vitest";
import type { GameState, PlayerState, ZoneNumber } from "../src";
import { setTestAbilities } from "../src/testing";
import { invade, self, settle, setup } from "./fixtures/play";
import { inHand, place } from "./fixtures/real";
import { addCard, battleCard, monsterCard } from "./fixtures/state";

/*
 * A battle card your monster can share its zone with (an exception to crush and destroy, 11.3),
 * and the trigger for a monster entering a zone (every step of every move), on made-up cards.
 */

const abilities = (n: string, list: CardAbilities["abilities"]) => {
  setTestAbilities(n, {
    deckCardNumber: n,
    status: "implemented",
    abilities: list,
  });
  onTestFinished(() => setTestAbilities(n, null));
};

/** Your invading monster becomes a fresh rank 1 monster with these traits. */
function monsterWith(state: GameState, me: PlayerState, traits: string[]) {
  me.invadingMonsterZone = [addCard(state, monsterCard(1, { traits }), me.id)];
}

/** A battle card in `zone` hosting your Godzilla monster, which gives you 1 rage when it enters. */
function host(state: GameState, me: PlayerState, zone: ZoneNumber) {
  const card = battleCard({ id: 969001 });
  abilities(card.deckCardNumber, [
    {
      kind: "continuous",
      id: "host",
      modifiers: [
        {
          flag: "hostsMonster",
          target: { owner: "you", area: "zones", this: true },
          traits: ["Godzilla"],
        },
      ],
    },
    {
      kind: "triggered",
      id: "entered",
      trigger: {
        on: "monsterEntered",
        whose: "you",
        into: { relation: "sameNumberAs", of: "this" },
        traits: ["Godzilla"],
      },
      effects: [{ effect: "rage", player: "you", delta: 1 }],
    },
  ]);
  return place(state, me, card, zone);
}

const stillThere = (
  after: GameState,
  me: PlayerState,
  zone: ZoneNumber,
  id: string,
) =>
  self(after, me).zones[zone].some((stack) =>
    stack.some((c) => c.instanceId === id),
  );

const invader = (icon: number) =>
  battleCard({ id: 969010 + icon, invadeZones: icon });

describe("hostsMonster: an exception to crush and destroy (11.3)", () => {
  it("your Godzilla monster moves into the hosting card's zone: the card stays, and it entered once", () => {
    const { state, me } = setup(3);
    monsterWith(state, me, ["Godzilla"]);
    const card = host(state, me, 4);
    const rage = me.rage;
    const after = settle(invade(state, me, inHand(state, me, invader(1))));
    expect(self(after, me).monsterPosition).toBe(4);
    expect(stillThere(after, me, 4, card.instanceId)).toBe(true);
    expect(self(after, me).rage).toBe(rage + 1);
  });

  it("a monster without the trait still crushes it (11.3), and nothing triggers", () => {
    const { state, me } = setup(3);
    monsterWith(state, me, ["Other"]);
    const card = host(state, me, 4);
    const rage = me.rage;
    const after = settle(invade(state, me, inHand(state, me, invader(1))));
    expect(stillThere(after, me, 4, card.instanceId)).toBe(false);
    expect(self(after, me).rage).toBe(rage);
  });

  it("monsterEntered counts every zone moved into: an invasion of 2 passing through it triggers too", () => {
    const { state, me } = setup(3);
    monsterWith(state, me, ["Godzilla"]);
    const card = host(state, me, 4);
    const rage = me.rage;
    const after = settle(invade(state, me, inHand(state, me, invader(2))));
    expect(self(after, me).monsterPosition).toBe(5);
    expect(stillThere(after, me, 4, card.instanceId)).toBe(true);
    expect(self(after, me).rage).toBe(rage + 1);
  });
});
