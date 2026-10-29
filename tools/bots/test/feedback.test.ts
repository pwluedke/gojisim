import {
  type Action,
  type GameRecord,
  getLegalActions,
  replayAll,
} from "@gojisim/engine";
import { buildTestDeck } from "@gojisim/cards/test-decks";
import { describe, expect, it } from "vitest";
import { feedbackLines } from "../src/feedbackList";

/** A real game (ESD01 vs ESD02, P2 a Hard bot) played `n` actions with the first legal action. */
function game(n: number): GameRecord {
  const deck = (set: string, id: "P1" | "P2") => {
    const { monsterDeck, mainDeck } = buildTestDeck(set, `feedback-${id}`);
    return { id, monsterDeck, mainDeck };
  };
  const record: GameRecord = {
    version: 1,
    seed: 7,
    decks: [deck("ESD01", "P1"), deck("ESD02", "P2")],
    actions: [],
    seats: {
      P1: { kind: "human" },
      P2: { kind: "bot", bot: "ismcts", settings: { difficulty: 90 } },
    },
    botSeed: "7-bots",
    gameId: "0f8e6f3c-2b1d-4c5e-9a7b-1d2e3f4a5b6c",
  } as GameRecord;
  for (let i = 0; i < n; i++) {
    const state = replayAll(record).at(-1);
    if (!state || state.result) break;
    const who = state.pendingChoice?.player ?? state.turnPlayer;
    const action = getLegalActions(state, who).find(
      (a) => a.type !== "concede",
    ) as Action;
    record.actions.push(action);
  }
  return record;
}

describe("pnpm bot-feedback", () => {
  const full = game(40);
  // Bad Bot! reports on four of P2's actions, then Report bug once.
  const botIndexes = full.actions
    .map((a, i) => (a.player === "P2" ? i : -1))
    .filter((i) => i >= 0)
    .slice(0, 4);
  const report = (n: number) => ({
    actionIndex: botIndexes[n] as number,
    label: `Bot (Hard): stored label ${n} (Turn 1, Main phase)`,
    text: `report ${n}`,
    reporter: "Ann",
    at: `2026-10-28T10:0${n}:00.000Z`,
  });
  /** The game as uploaded after `reports` Bad Bot! reports (each upload the whole record). */
  const snapshot = (reports: number, bug = false): GameRecord => ({
    ...full,
    actions: full.actions.slice(0, (botIndexes[reports - 1] ?? 0) + 1),
    botFeedback: Array.from({ length: reports }, (_, n) => report(n)),
    ...(bug
      ? {
          bugReports: [
            {
              actionIndex: 3,
              text: "the zone stayed lit",
              reporter: "Bo",
              at: "2026-10-28T11:00:00.000Z",
            },
          ],
        }
      : {}),
  });

  it("five snapshots of one game list its 4 reports once each, with plain wording and the stored label", () => {
    const records = [1, 2, 3, 4].map((n) => ({
      file: `2026-10-28/upload-${n}.json`,
      record: snapshot(n),
    }));
    // The game end: the same reports again, the whole game.
    records.push({
      file: "2026-10-28/end.json",
      record: { ...snapshot(4), actions: full.actions },
    });
    const lines = feedbackLines(records, "bot");
    expect(lines.filter((l) => l.startsWith("[Bad Bot!]"))).toHaveLength(4);
    // From the latest file (the one with the most actions).
    expect(lines[0]).toBe(
      `[Bad Bot!] 2026-10-28/end.json --at ${botIndexes[0]}`,
    );
    expect(lines[1]).toMatch(
      /^ {2}Ann \(2026-10-28\): Bot \(Hard\): \S.* \(Turn 1, Main phase\)$/,
    );
    expect(lines[1]).not.toContain("stored label");
    expect(lines[2]).toBe(
      "    label: Bot (Hard): stored label 0 (Turn 1, Main phase)",
    );
    expect(lines.at(-1)).toBe("4 Bad Bot! reports in 1 game.");
  });

  it("lists Bad Bot! reports and Report bug notes, each headed with its kind; --kind lists one", () => {
    const records = [{ file: "a.json", record: snapshot(1, true) }];
    const both = feedbackLines(records);
    expect(both.filter((l) => l.startsWith("["))).toEqual([
      `[Bad Bot!] a.json --at ${botIndexes[0]}`,
      "[Report bug] a.json --at 3",
    ]);
    expect(both).toContain(
      `  Bo (2026-10-28), after 3 of ${(botIndexes[0] as number) + 1} actions`,
    );
    expect(both.at(-1)).toBe("1 Bad Bot! report, 1 Report bug note in 1 game.");
    expect(feedbackLines(records, "bot").at(-1)).toBe(
      "1 Bad Bot! report in 1 game.",
    );
    expect(
      feedbackLines(records, "bug").filter((l) => l.startsWith("[")),
    ).toEqual(["[Report bug] a.json --at 3"]);
  });

  it("records without a gameId are told apart by seed and bot seed", () => {
    const { gameId: _gameId, ...old } = snapshot(1);
    const records = [
      { file: "a.json", record: old as GameRecord },
      { file: "b.json", record: { ...old, seed: 8 } as GameRecord },
    ];
    expect(feedbackLines(records, "bot").at(-1)).toBe(
      "2 Bad Bot! reports in 2 games.",
    );
  });
});
