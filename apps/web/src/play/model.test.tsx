import { readFileSync } from "node:fs";
import { parseDeckList } from "@gojisim/cards/deck-lists";
import { getAllCards } from "@gojisim/cards/test-decks";
import {
  advanceToDecision,
  type GameState,
  type PlayerSetup,
  startGame,
} from "@gojisim/engine";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { BoardView } from "./BoardView";
import { boardModel, bottomPlayer } from "./model";

function official(file: string): Omit<PlayerSetup, "id"> {
  const url = new URL(
    `../../../../packages/cards/data/decks/${file}`,
    import.meta.url,
  );
  const deck = parseDeckList(readFileSync(url, "utf8")).decks[0];
  if (!deck) throw new Error(file);
  return { monsterDeck: deck.monsterDeck, mainDeck: deck.mainDeck };
}

function game(): GameState {
  return advanceToDecision(
    startGame({
      seed: "m5a",
      decks: [
        { id: "P1", ...official("esd01-starter.txt") },
        { id: "P2", ...official("esd02-starter.txt") },
      ],
    }),
  );
}

describe("/play board model (M5a)", () => {
  it("never contains the opponent's hand card ids: not in the model, not in the rendered board", () => {
    const state = game();
    for (const bottom of ["P1", "P2"] as const) {
      const opponent = state.players.find((p) => p.id !== bottom);
      const own = state.players.find((p) => p.id === bottom);
      const model = boardModel(state, bottom);
      const html = renderToStaticMarkup(
        <BoardView model={model} prompt={null} />,
      );
      const json = JSON.stringify(model);
      for (const card of opponent?.hand ?? []) {
        expect(json).not.toContain(`"${card.instanceId}"`);
        expect(html).not.toContain(`"${card.instanceId}"`);
      }
      // Its own hand is there (so the check above is meaningful).
      for (const card of own?.hand ?? [])
        expect(html).toContain(`data-instance-id="${card.instanceId}"`);
      // The opponent's deck and monster deck never appear either.
      for (const card of [
        ...(opponent?.deck ?? []),
        ...(opponent?.monsterDeck ?? []),
      ])
        expect(json).not.toContain(`"${card.instanceId}"`);
    }
  });

  it("bottom player: the human against a bot, the decider in hotseat, P1 with two bots", () => {
    const state = game();
    expect(
      bottomPlayer(state, {
        P1: { kind: "bot", difficulty: 55 },
        P2: { kind: "human" },
      }),
    ).toBe("P2");
    expect(
      bottomPlayer(state, { P1: { kind: "human" }, P2: { kind: "human" } }),
    ).toBe(state.pendingChoice?.player ?? state.turnPlayer);
    expect(
      bottomPlayer(state, {
        P1: { kind: "bot", difficulty: 1 },
        P2: { kind: "bot", difficulty: 1 },
      }),
    ).toBe("P1");
  });

  it("battle cards show printed counter power plus a colored modifier (PR #24 pattern)", () => {
    const state = game();
    const p1 = state.players[0];
    const city = getAllCards().find(
      (c) => c.cardNumber === "ESD01-010" && c.parentId === null,
    );
    if (!city) throw new Error("City of Tokyo");
    state.cards = { ...state.cards, [city.id]: city };
    p1.monsterPosition = 7;
    p1.zones[1] = [[{ instanceId: "c990001", cardId: city.id, owner: "P1" }]];
    p1.zones[8] = [[{ instanceId: "c990002", cardId: city.id, owner: "P1" }]];
    const html = renderToStaticMarkup(
      <BoardView model={boardModel(state, "P1")} prompt={null} />,
    )
      .replace(/<!-- -->/g, "")
      .replace(/<[^>]+>/g, "|");
    // The zone 8 City of Tokyo: printed 0, then +5000 from the one in zone 1 (Awakening 6).
    expect(html).toContain("|0| +5000|");
  });
});
