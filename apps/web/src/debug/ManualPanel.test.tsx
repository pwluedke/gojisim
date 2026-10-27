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
 * A game where P1 has just played FC01-003 Jet Jaguar (Fest), a manual card until M12g: a
 * manual window is open.
 */
function withWindow(): GameState {
  const decks = (["ESD01", "ESD02"] as const).map((set, i) => ({
    id: `P${i + 1}`,
    ...buildTestDeck(set, `manual-${i}`),
  }));
  const state = startGame({ seed: 7, decks: [decks[0]!, decks[1]!] });
  const manual = getAllCards().find((c) => c.cardNumber === "FC01-003")!;
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
    expect(html).toContain("ジェットジャガー（ゴジカ・フェス）");
    expect(html).toContain("search your deck for one battle card with [mech]");
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
