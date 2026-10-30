import { readFileSync } from "node:fs";
import type { Card } from "@gojisim/cards";
import { getAllCards } from "@gojisim/cards/test-decks";
import type { GameState } from "@gojisim/engine";
import { describe, expect, it } from "vitest";
import { type AnnounceNames, announce } from "../game/announce";
import { sessionFromRecord, withAction } from "../game/session";
import { buildLog, type LogLine } from "./logLines";

const fixture = (name: string) =>
  sessionFromRecord(
    readFileSync(
      new URL(`../../e2e/fixtures/${name}.json`, import.meta.url),
      "utf8",
    ),
  );
const names = (id: string) => (id === "P1" ? "You" : "Bot");
const announceNames: AnnounceNames = {
  subject: () => "Bot",
  whose: (owner, actor) => (owner === actor ? "its" : "your"),
};
const text = (line: LogLine) =>
  line.parts.map((p) => (typeof p === "string" ? p : p.card.name)).join("");

describe("battle log lines (M5d)", () => {
  const session = fixture("search");
  const lines = buildLog(session, "P1", names);

  it("groups lines under turn markers, starting with turn 1", () => {
    const turns = lines.filter((l) => l.kind === "turn");
    expect(text(turns[0] as LogLine)).toMatch(/^Turn 1: (You|Bot)$/);
    const last = session.states[session.states.length - 1];
    expect(turns).toHaveLength(last?.turn ?? 0);
  });

  it("every line remembers a session position, in order", () => {
    let previous = 0;
    for (const line of lines) {
      expect(line.position).toBeGreaterThanOrEqual(previous);
      expect(line.position).toBeLessThan(session.states.length);
      previous = line.position;
    }
  });

  it("the opponent's hidden draws are counts, and its private choices name no card", () => {
    const draws = lines.filter((l) => /^Bot draws \d+$/.test(text(l)));
    expect(draws.length).toBeGreaterThan(0);
    for (const line of draws)
      expect(line.parts.every((p) => typeof p === "string")).toBe(true);
    const secret = lines.filter((l) => text(l).includes("private choice"));
    for (const line of secret) {
      expect(text(line)).toBe("Bot (Medium): makes a private choice");
      expect(line.parts.every((p) => typeof p === "string")).toBe(true);
    }
  });

  it("card names in action lines are links", () => {
    const linked = lines.filter(
      (l) => l.kind === "action" && l.parts.some((p) => typeof p !== "string"),
    );
    expect(linked.length).toBeGreaterThan(0);
  });

  it("each action line carries its rule number for the setting (8.2 to 8.6, or the choice's rule)", () => {
    const plays = lines.filter((l) => /: Play .* → zone/.test(text(l)));
    expect(plays.length).toBeGreaterThan(0);
    for (const line of plays) expect(line.rule).toBe("8.2");
  });
});

describe("combo log lines (M5g)", () => {
  it("a combo's line follows the action that completed it, naming the seat (a bot by level)", () => {
    const session = fixture("search");
    const hit = (player: string, actionIndex: number) => ({
      comboId: "tokyo-wall",
      name: "Tokyo Wall",
      player: player as "P1" | "P2",
      cards: ["ESD01-010", "ESD01-014", "ESD01-012"],
      turn: 1,
      actionIndex,
      afterSeq: 0,
    });
    const lines = buildLog(session, "P1", names, [hit("P1", 3), hit("P2", 5)]);
    const combos = lines.filter((l) => l.kind === "combo");
    expect(combos.map(text)).toEqual([
      "Combo: Tokyo Wall (You)",
      "Combo: Tokyo Wall (Bot (Medium))",
    ]);
    // Right after the lines of action 3 (position 4), before action 4's line.
    const i = lines.findIndex((l) => l.kind === "combo");
    expect(lines[i]?.position).toBe(4);
    expect(lines[i + 1]?.position ?? 99).toBeGreaterThanOrEqual(5);
  });
});

describe("an optional move's Done (M7a fix)", () => {
  it('reads "Don\'t move the card", not "Choose done\'s zone undefined"', () => {
    // In this record P1 declines ESD01-012's optional move (5.2.1) with Done.
    const session = fixture("combo-you");
    const lines = buildLog(session, "P1", names).map(text);
    expect(lines).toContain("You: Don't move the card");
    expect(lines.filter((l) => /undefined|done's zone/.test(l))).toEqual([]);
  });
});

describe("effect plays (M12c-1)", () => {
  it('a monster played by an effect "becomes the invading monster"; "on top of" names the card under it', () => {
    const session = fixture("search");
    const last = session.states[session.states.length - 1] as GameState;
    const [a, b] = Object.values(last.cards) as Card[];
    const entry = (payload: Record<string, unknown>) => ({
      seq: last.log.length + 1,
      type: "place",
      player: "P1",
      payload: { rule: "5.11.1", played: true, ...payload },
    });
    last.log.push(entry({ cardId: a?.id, to: "invadingMonsterZone" }));
    last.log.push(entry({ cardId: a?.id, to: "zone 2", onTopOf: b?.id }));
    const lines = buildLog(session, "P1", names).map(text);
    expect(lines).toContain(`${a?.name} becomes the invading monster`);
    expect(lines).toContain(`${a?.name} enters zone 2 on top of ${b?.name}`);
  });
});

describe("an optional replacement asked during a step (#104)", () => {
  // Paul's game: Godzilla (2016) Frozen's replacement asked for Despair at 7.2.3 (E21).
  const fixture = JSON.parse(
    readFileSync(
      new URL(
        "../../../../packages/engine/test/fixtures/records/frozen-104.json",
        import.meta.url,
      ),
      "utf8",
    ),
  ) as { decks: { id: string; monsterDeck: number[]; mainDeck: number[] }[] };
  const byId = new Map(getAllCards().map((c) => [c.id, c]));
  const session = sessionFromRecord(
    JSON.stringify({
      ...fixture,
      version: 1,
      seats: {
        P1: { kind: "human" },
        P2: { kind: "bot", bot: "ismcts", settings: { difficulty: 55 } },
      },
      decks: fixture.decks.map((d) => ({
        id: d.id,
        monsterDeck: d.monsterDeck.map((id) => byId.get(id)),
        mainDeck: d.mainDeck.map((id) => byId.get(id)),
      })),
    }),
  );
  const before = session.states[session.position] as GameState;
  const answer = (optionId: string) => {
    const choice = before.pendingChoice;
    if (!choice) throw new Error("no choice");
    const action = {
      type: "choose" as const,
      player: choice.player,
      choiceId: choice.id,
      optionId,
    };
    const next = withAction(session, action);
    const line = buildLog(next, "P1", names)
      .filter((l) => l.kind === "action")
      .at(-1) as LogLine;
    const after = next.states[next.position] as GameState;
    return {
      log: text(line),
      announced: announce(before, after, action, announceNames).text,
    };
  };

  it("the log and the announcement name the replacement and the card, as the modal does", () => {
    expect(answer("yes")).toEqual({
      log: "You: applies Godzilla (2016) Frozen's replacement to Despair",
      announced: "Bot applies Godzilla (2016) Frozen's replacement to Despair",
    });
    expect(answer("no")).toEqual({
      log: "You: doesn't apply Godzilla (2016) Frozen's replacement to Despair",
      announced:
        "Bot doesn't apply Godzilla (2016) Frozen's replacement to Despair",
    });
  });
});
