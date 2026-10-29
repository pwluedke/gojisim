import type { GameRecord } from "@gojisim/engine";
import { describe, expect, it } from "vitest";
import { feedbackLines } from "../src/feedbackList";

const record = {
  version: 1,
  seed: 1,
  decks: [],
  actions: [
    { type: "pass", player: "P2" },
    { type: "pass", player: "P1" },
  ],
  seats: {
    P1: { kind: "human" },
    P2: { kind: "bot", settings: { difficulty: 90 } },
  },
  botFeedback: [
    {
      actionIndex: 0,
      label: "Bot (Hard): Pass (Turn 1, Main phase)",
      text: "passed early",
      reporter: "Ann",
      at: "2026-10-28T10:00:00.000Z",
    },
  ],
  bugReports: [
    {
      actionIndex: 2,
      text: "the zone stayed lit",
      reporter: "Bo",
      at: "2026-10-28T11:00:00.000Z",
    },
  ],
} as unknown as GameRecord;
const records = [{ file: "2026-10-28/a.json", record }];

describe("pnpm bot-feedback", () => {
  it("lists Bad Bot! reports and Report bug notes, each headed with its kind", () => {
    expect(feedbackLines(records)).toEqual([
      "[Bad Bot!] 2026-10-28/a.json --at 0",
      "  Ann (2026-10-28), bot Hard: Bot (Hard): Pass (Turn 1, Main phase)",
      '  "passed early"',
      "[Report bug] 2026-10-28/a.json --at 2",
      "  Bo (2026-10-28), after 2 of 2 actions",
      '  "the zone stayed lit"',
      "1 Bad Bot! report, 1 Report bug note.",
    ]);
  });

  it("--kind bot or bug lists one kind", () => {
    expect(feedbackLines(records, "bot").at(0)).toMatch(/^\[Bad Bot!\]/);
    expect(feedbackLines(records, "bot").at(-1)).toBe("1 Bad Bot! report.");
    expect(feedbackLines(records, "bug").at(0)).toMatch(/^\[Report bug\]/);
    expect(feedbackLines(records, "bug").at(-1)).toBe("1 Report bug note.");
  });
});
