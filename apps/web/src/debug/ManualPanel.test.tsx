import {
  advanceToDecision,
  applyAction,
  type GameState,
  startGame,
} from "@gojisim/engine";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { buildTestDeck, getAllCards } from "@gojisim/cards/test-decks";
import { ManualPanel } from "./ManualPanel";

/**
 * A game where P1 has just played ESC01-003 Godzilla (2016) 4th Form, a manual card until
 * M12f: a manual window is open.
 */
function withWindow(): GameState {
  const decks = (["ESD01", "ESD02"] as const).map((set, i) => ({
    id: `P${i + 1}`,
    ...buildTestDeck(set, `manual-${i}`),
  }));
  const state = startGame({ seed: 7, decks: [decks[0]!, decks[1]!] });
  const manual = getAllCards().find((c) => c.cardNumber === "ESC01-003")!;
  const me = state.players.find((p) => p.id === state.turnPlayer)!;
  const opp = state.players.find((p) => p.id !== state.turnPlayer)!;
  state.cards = { ...state.cards, [manual.id]: manual };
  const instance = {
    instanceId: `c${state.nextInstanceId++}`,
    cardId: manual.id,
    owner: me.id,
  };
  me.hand.push(instance);
  opp.monsterPosition = 8;
  return advanceToDecision(
    applyAction(state, {
      type: "playBattle",
      player: me.id,
      cardInstanceId: instance.instanceId,
      zone: 2,
    }),
  );
}

describe("manual override panel (format.md change 10)", () => {
  it("shows the card that opened the window, its text and the manual actions", () => {
    const state = withWindow();
    expect(state.pendingChoice?.kind).toBe("manual");
    const html = renderToStaticMarkup(
      <ManualPanel state={state} onAction={() => {}} />,
    );
    expect(html).toContain("Manual override");
    expect(html).toContain("Godzilla (2016) 4th Form");
    expect(html).toContain("your monster card invaded this turn");
    expect(html).toContain("rage +1");
    expect(html).toContain("move");
  });

  it("renders nothing without a manual window", () => {
    const state = withWindow();
    const closed = { ...state, pendingChoice: null };
    expect(
      renderToStaticMarkup(<ManualPanel state={closed} onAction={() => {}} />),
    ).toBe("");
  });
});
