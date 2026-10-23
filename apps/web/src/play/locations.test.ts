import { createGame, type GameState } from "@gojisim/engine";
import { getAllCards } from "@gojisim/cards/test-decks";
import { describe, expect, it } from "vitest";
import { targetLocation } from "./locations";

function game(): GameState {
  const cards = getAllCards().filter(
    (c) => c.set === "ESD01" && c.parentId === null,
  );
  const deck = (id: string) => ({
    id,
    monsterDeck: cards.filter((c) => c.type === "Monster").slice(0, 5),
    mainDeck: cards.filter((c) => c.type !== "Monster").slice(0, 10),
  });
  return createGame({ seed: 1, players: [deck("P1"), deck("P2")] });
}

describe("targetLocation (M5d choice labels)", () => {
  it("names each area from the chooser's side, with the board element to light", () => {
    const state = game();
    const [p1, p2] = state.players;
    const at = (id: string | undefined) =>
      targetLocation(state, id ?? "", "P1");
    const card = (n: number) => ({
      instanceId: `c99000${n}`,
      cardId: p1.deck[0]?.cardId ?? 0,
      owner: "P1",
    });
    p2.zones[3] = [[card(1)]];
    p1.strategyZones[1] = [{ card: card(2), placedOnTurn: 1 }];
    p2.discard.push(card(3));
    p2.hand.push(card(4));
    state.revealed = ["c990004"];
    expect(at("c990001")).toEqual({
      label: "Z3 (opponent)",
      testId: "zone-P2-3",
    });
    expect(at("c990002")).toEqual({
      label: "Strategy zone 2",
      testId: "strategy-P1-2",
    });
    expect(at("c990003")?.label).toBe("Discard pile (opponent)");
    expect(at("c990004")).toEqual({
      label: "Revealed from hand (opponent)",
      testId: "opponent-hand",
    });
    expect(at(p1.deck[0]?.instanceId)).toEqual({
      label: "Deck (searched)",
      testId: "deck-P1",
    });
    expect(at(p1.monsterDeck[0]?.instanceId)?.label).toBe(
      "Monster deck (searched)",
    );
    expect(at(p1.invadingMonsterZone[0]?.instanceId)).toEqual({
      label: "Monster",
      testId: "monster-P1",
    });
    expect(at("nope")).toBeNull();
  });
});
