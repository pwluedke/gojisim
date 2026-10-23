import { readFileSync } from "node:fs";
import { parseDeckList } from "@gojisim/cards/deck-lists";
import {
  advanceToDecision,
  type GameState,
  type PlayerSetup,
  startGame,
} from "@gojisim/engine";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { choiceHeading, choiceSource } from "../game/labels";
import { ChoiceModal } from "./ChoiceModal";

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
      seed: "m5c",
      decks: [
        { id: "P1", ...official("esd01-starter.txt") },
        { id: "P2", ...official("esd02-starter.txt") },
      ],
    }),
  );
}

const names = (id: string) => (id === "P1" ? "You" : "Bot");

describe("choice modal (M5c)", () => {
  // No card in the data has two destroy replacements, so no real game reaches a
  // `replacementOrder` choice (10.9.2.1); this fixture state injects one.
  it("replacementOrder: heading, and each replacement as a large card option", () => {
    const state = game();
    const [a, b] = Object.values(state.cards);
    if (!a || !b) throw new Error("no cards");
    state.turnPlayer = "P2";
    state.pendingChoice = {
      id: 99,
      player: "P1",
      kind: "replacementOrder",
      rule: "10.9.2.1",
      options: [
        { id: `${a.deckCardNumber}#instead`, cardId: a.id, abilityId: null },
        { id: `${b.deckCardNumber}#instead`, cardId: b.id, abilityId: null },
      ],
    };
    const html = renderToStaticMarkup(
      <ChoiceModal
        state={state}
        heading={choiceHeading(state, names)}
        source={choiceSource(state)}
        actions={state.pendingChoice.options.map((o) => ({
          type: "choose" as const,
          player: "P1",
          choiceId: 99,
          optionId: o.id,
        }))}
        manualCards={[]}
        onAction={() => {}}
        labelOf={(action) => action.type}
      />,
    );
    expect(html).toContain('data-kind="replacementOrder"');
    expect(html).toContain(
      "You are choosing which replacement applies during Bot&#x27;s turn",
    );
    expect(html.match(/data-testid="choice-option"/g)).toHaveLength(2);
    expect(html).toContain(`/cards/${a.id}-thumb.webp`);
    expect(html).toContain(`/cards/${b.id}-thumb.webp`);
    expect(html).not.toContain('data-testid="choice-done"');
  });

  it("headings name the seats: You, Bot, or P1 / P2 in hotseat", () => {
    const state = game();
    state.turnPlayer = "P2";
    state.pendingChoice = {
      id: 1,
      player: "P1",
      kind: "nextMonster",
      rule: "5.15.1.2",
      options: [],
    };
    expect(choiceHeading(state, names)).toBe(
      "You are choosing your next monster during Bot's turn",
    );
    expect(choiceHeading(state, (id) => id)).toBe(
      "P1 is choosing their next monster during P2's turn",
    );
    state.turnPlayer = "P1";
    expect(choiceHeading(state, names)).toBe(
      "You are choosing your next monster",
    );
    expect(choiceSource(state)).toBe("The counter (5.15.1.2)");
  });
});
