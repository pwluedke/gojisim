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
 * A game where P1 has just played EBP04-037 Minilla (2004), a manual card until M12d: a manual
 * window is open.
 */
function withWindow(): GameState {
  const decks = (["ESD01", "ESD02"] as const).map((set, i) => ({
    id: `P${i + 1}`,
    ...buildTestDeck(set, `manual-${i}`),
  }));
  const state = startGame({ seed: 7, decks: [decks[0]!, decks[1]!] });
  const minilla = getAllCards().find((c) => c.cardNumber === "EBP04-037")!;
  const me = state.players.find((p) => p.id === state.turnPlayer)!;
  const opp = state.players.find((p) => p.id !== state.turnPlayer)!;
  state.cards = { ...state.cards, [minilla.id]: minilla };
  const instance = {
    instanceId: `c${state.nextInstanceId++}`,
    cardId: minilla.id,
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
    expect(html).toContain("Minilla (2004)");
    expect(html).toContain("If you have a rank 1 strategy card in play");
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
