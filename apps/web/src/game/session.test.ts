import { describe, expect, it } from "vitest";
import { deckOptions } from "./decks";
import { newSession, sessionFromRecord } from "./session";
import type { DeckOption } from "./decks";

const decks = () => {
  const [a, b] = deckOptions([]);
  if (!a || !b) throw new Error("no decks");
  return [a, b] as [DeckOption, DeckOption];
};

describe("confirmSingleTarget seats (M5d)", () => {
  it("/play: only human seats confirm single targets; bots never get the one-option choice", () => {
    const bot = { kind: "bot", difficulty: 55 } as const;
    const human = { kind: "human" } as const;
    const vsBot = newSession(
      1,
      decks(),
      { P1: human, P2: bot },
      {
        confirmTargets: true,
      },
    );
    expect(vsBot.record.confirmSingleTarget).toEqual(["P1"]);
    expect(vsBot.states[0]?.confirmSingleTarget).toEqual(["P1"]);
    const hotseat = newSession(
      1,
      decks(),
      { P1: human, P2: human },
      {
        confirmTargets: true,
      },
    );
    expect(hotseat.states[0]?.confirmSingleTarget).toEqual(["P1", "P2"]);
    const bots = newSession(
      1,
      decks(),
      { P1: bot, P2: bot },
      {
        confirmTargets: true,
      },
    );
    expect(bots.states[0]?.confirmSingleTarget).toBeUndefined();
  });

  it("/debug (no option) never sets it, and a loaded record keeps what it recorded", () => {
    const session = newSession(1, decks(), {
      P1: { kind: "human" },
      P2: { kind: "human" },
    });
    expect(session.record.confirmSingleTarget).toBeUndefined();
    const confirming = newSession(
      1,
      decks(),
      { P1: { kind: "human" }, P2: { kind: "bot", difficulty: 55 } },
      { confirmTargets: true },
    );
    const loaded = sessionFromRecord(JSON.stringify(confirming.record));
    expect(loaded.record.confirmSingleTarget).toEqual(["P1"]);
    expect(loaded.states[0]?.confirmSingleTarget).toEqual(["P1"]);
  });
});
