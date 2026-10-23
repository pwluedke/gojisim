import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { sessionFromRecord } from "../game/session";
import { buildLog, type LogLine } from "./logLines";

const fixture = (name: string) =>
  sessionFromRecord(
    readFileSync(
      new URL(`../../e2e/fixtures/${name}.json`, import.meta.url),
      "utf8",
    ),
  );
const names = (id: string) => (id === "P1" ? "You" : "Bot");
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
