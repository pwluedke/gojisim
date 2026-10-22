import { describe, expect, it } from "vitest";
import {
  advanceMonster,
  advanceMonsterTo,
  retreatMonster,
  retreatMonsterTo,
  type ZoneNumber,
} from "../src";
import { addCard, battleCard, newGame, turnPlayer } from "./fixtures/state";

function placed(zone: ZoneNumber) {
  const state = newGame();
  const player = turnPlayer(state);
  player.monsterPosition = zone;
  return { state, player };
}

const notInvasion = { invasion: false, rule: "test" };

describe("advance and retreat (5.13)", () => {
  it("5.13.1 advance moves to the zone numbered 1 higher", () => {
    const { state, player } = placed(4);
    expect(advanceMonster(state, player, notInvasion)).toBe(true);
    expect(player.monsterPosition).toBe(5);
  });

  it("5.13.1.1.1 outside an invasion a monster in zone 8 does not advance, even with zone 8 empty", () => {
    const { state, player } = placed(8);
    expect(advanceMonster(state, player, notInvasion)).toBe(false);
    expect(player.monsterPosition).toBe(8);
    expect(state.result).toBeNull();
  });

  it("5.13.2 retreat moves to the zone numbered 1 lower", () => {
    const { state, player } = placed(4);
    expect(retreatMonster(state, player, "test")).toBe(true);
    expect(player.monsterPosition).toBe(3);
  });

  it("5.13.2.1 retreat in zone 1 does nothing and does not count as a retreat", () => {
    const { state, player } = placed(1);
    expect(retreatMonster(state, player, "test")).toBe(false);
    expect(player.monsterPosition).toBe(1);
  });

  it("5.13.1.2.1 advance to a zone the monster is already beyond (or in) does nothing", () => {
    for (const target of [3, 5] as const) {
      const { state, player } = placed(5);
      expect(advanceMonsterTo(state, player, target, notInvasion)).toBe(0);
      expect(player.monsterPosition).toBe(5);
    }
  });

  it("5.13.1.2.2 advance to a higher zone goes step by step, each step one advance", () => {
    const { state, player } = placed(2);
    expect(advanceMonsterTo(state, player, 6, notInvasion)).toBe(4);
    expect(player.monsterPosition).toBe(6);
    expect(
      state.log.filter((e) => e.type === "advance").map((e) => e.payload["to"]),
    ).toEqual([3, 4, 5, 6]);
  });

  it("5.13.2.2.1 retreat to a zone the monster is already before (or in) does nothing", () => {
    for (const target of [5, 7] as const) {
      const { state, player } = placed(5);
      expect(retreatMonsterTo(state, player, target, "test")).toBe(0);
      expect(player.monsterPosition).toBe(5);
    }
  });

  it("5.13.2.2.2 retreat to a lower zone goes step by step, each step one retreat", () => {
    const { state, player } = placed(7);
    expect(retreatMonsterTo(state, player, 4, "test")).toBe(3);
    expect(player.monsterPosition).toBe(4);
  });

  it("5.13.3 a monster that ends where it started has not advanced", () => {
    const { state, player } = placed(8);
    expect(advanceMonsterTo(state, player, 8, notInvasion)).toBe(0);
    expect(advanceMonster(state, player, notInvasion)).toBe(false);
  });

  it("11.3 retreating into a zone with the player's own battle card destroys it", () => {
    const { state, player } = placed(5);
    const card = addCard(state, battleCard(), player.id);
    player.zones[4].push([card]);
    retreatMonster(state, player, "test");
    expect(player.zones[4]).toEqual([]);
    expect(player.discard.map((c) => c.cardId)).toEqual([card.cardId]);
  });

  it("1.2.1 nothing moves once the game has a result", () => {
    const { state, player } = placed(4);
    state.result = { winner: player.id, reason: "concession", rule: "1.2.3" };
    expect(advanceMonster(state, player, notInvasion)).toBe(false);
    expect(retreatMonster(state, player, "test")).toBe(false);
    expect(player.monsterPosition).toBe(4);
  });
});
