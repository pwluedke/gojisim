import { buildTestDeck, getAllCards } from "@gojisim/cards/test-decks";
import { advanceToDecision, type GameState, startGame } from "@gojisim/engine";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { CardView } from "./Board";

const real = (number: string) =>
  getAllCards().find((c) => c.cardNumber === number && c.parentId === null)!;

/** P1 with City of Tokyo in zones 1 and 8, its monster in zone 7 (Awakening 6 is on). */
function cities(): {
  state: GameState;
  zone1: ReturnType<typeof add>;
  zone8: ReturnType<typeof add>;
} {
  const decks = (["ESD01", "ESD02"] as const).map((set, i) => ({
    id: `P${i + 1}`,
    ...buildTestDeck(set, `board-${i}`),
  }));
  const state = advanceToDecision(
    startGame({ seed: 5, decks: [decks[0]!, decks[1]!] }),
  );
  const p1 = state.players[0];
  p1.monsterPosition = 7;
  p1.rage = 0;
  const zone1 = add(state, "P1");
  const zone8 = add(state, "P1");
  p1.zones[1] = [[zone1]];
  p1.zones[8] = [[zone8]];
  return { state, zone1, zone8 };
}

let next = 990000;
function add(state: GameState, owner: string) {
  const card = real("ESD01-010");
  state.cards = { ...state.cards, [card.id]: card };
  return { instanceId: `c${next++}`, cardId: card.id, owner };
}

describe("debug board: counter power bonus in blue", () => {
  it("shows the printed value, and +5000 on the City of Tokyo in zone 8 (from the one in zone 1)", () => {
    const { state, zone1, zone8 } = cities();
    const html = (card: typeof zone1) =>
      renderToStaticMarkup(
        <CardView state={state} card={card} onSelect={() => {}} />,
      );
    expect(html(zone8)).toContain('data-testid="counter-power-bonus"');
    // The printed counter power (0) stays, followed by the bonus.
    const text = (card: typeof zone1) =>
      html(card)
        .replace(/<!-- -->/g, "")
        .replace(/<[^>]+>/g, "|");
    expect(text(zone8)).toContain("|0| +5000|");
    // No bonus on the zone 1 card: "other" excludes the source (Q6), and it isn't in zone 8.
    expect(html(zone1)).not.toContain("counter-power-bonus");
  });
});
