import type { Action } from "@gojisim/engine";
import { describe, expect, it } from "vitest";
import { cardDestinations, destinationOf, playableCards } from "./destinations";

const P = "P1";
const battle: Action = {
  type: "playBattle",
  player: P,
  cardInstanceId: "c1",
  zone: 8,
};
const strategy: Action = {
  type: "activateStrategy",
  player: P,
  cardInstanceId: "c2",
  strategyZone: 2,
};
const monster: Action = {
  type: "playMonster",
  player: P,
  cardInstanceId: "c3",
};
const rage: Action = { type: "gainRage", player: P, cardInstanceId: "c3" };
const invade: Action = { type: "invade", player: P, cardInstanceId: "c1" };

describe("action to destination mapping (M5b)", () => {
  it("playBattle goes to its zone (8.2)", () => {
    expect(destinationOf(battle)).toBe("zone:8");
  });
  it("activateStrategy goes to its strategy zone (8.3)", () => {
    expect(destinationOf(strategy)).toBe("strategy:2");
  });
  it("playMonster goes to the player's invading monster (8.5)", () => {
    expect(destinationOf(monster)).toBe("monster");
  });
  it("gainRage goes to the Stats panel, rage (8.4)", () => {
    expect(destinationOf(rage)).toBe("rage");
  });
  it("invade goes to the discard pile (8.6)", () => {
    expect(destinationOf(invade)).toBe("discard");
  });
  it("pass, choose, concede and manual move no hand card", () => {
    const others: Action[] = [
      { type: "pass", player: P },
      { type: "choose", player: P, choiceId: 1, optionId: "a" },
      { type: "concede", player: P },
      { type: "manual", player: P, op: { kind: "rage", player: P, delta: 1 } },
    ];
    for (const action of others) expect(destinationOf(action)).toBeNull();
    expect(playableCards(others).size).toBe(0);
  });

  it("lit hand cards: every card with a hand action", () => {
    const actions: Action[] = [
      battle,
      strategy,
      monster,
      rage,
      invade,
      { type: "pass", player: P },
    ];
    expect([...playableCards(actions)].sort()).toEqual(["c1", "c2", "c3"]);
  });

  it("a card's destinations: one key per destination, actions grouped in legal-action order", () => {
    const zone3: Action = { ...battle, zone: 3 } as Action;
    const actions: Action[] = [battle, zone3, invade, monster, rage];
    const c1 = cardDestinations(actions, "c1");
    expect([...c1.keys()]).toEqual(["zone:8", "zone:3", "discard"]);
    expect(c1.get("discard")).toEqual([invade]);
    expect([...cardDestinations(actions, "c3").keys()]).toEqual([
      "monster",
      "rage",
    ]);
    expect(cardDestinations(actions, "c9").size).toBe(0);
    // Two actions at one destination stay together (the board shows a menu for them).
    const twice = cardDestinations([battle, { ...battle }], "c1");
    expect(twice.get("zone:8")).toHaveLength(2);
  });
});
