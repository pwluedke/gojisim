import {
  type Action,
  type GameRecord,
  getLegalActions,
  replayAll,
} from "@gojisim/engine";
import { buildTestDeck } from "@gojisim/cards/test-decks";
import { describe, expect, it } from "vitest";
import { downloadCommand, downloadRecords } from "../src/feedbackCmd";
import { feedbackLines } from "../src/feedbackList";
import { buildSummary } from "../src/feedbackSummary";

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

describe("pnpm feedback", () => {
  const full = game(40);
  const bots = full.actions
    .map((a, i) => (a.player === "P2" ? i : -1))
    .filter((i) => i >= 0);
  const entry = (n: number, kind?: "bad" | "good") => ({
    ...(kind ? { kind } : {}),
    actionIndex: bots[n] as number,
    label: `Bot (Hard): stored ${n} (Turn 1, Main phase)`,
    text: `note ${n}`,
    reporter: "Ann",
    at: `2026-10-28T10:0${n}:00.000Z`,
  });
  const reported: GameRecord = {
    ...full,
    // An entry without `kind` reads as Bad Bot! (older records).
    botFeedback: [entry(0), entry(1, "good")],
    bugReports: [
      {
        actionIndex: 12,
        text: "a card vanished",
        reporter: "Bo",
        at: "2026-10-28T11:00:00.000Z",
      },
    ],
  };
  const options = {
    reviewed: new Set<string>(),
    all: false,
    explain: () => ["→    40   0.120  pass"],
    date: "2026-10-28",
  };
  /** A finished game: the bot (P2) concedes, so the human wins. */
  const won = (id: string, extra: Partial<GameRecord> = {}): GameRecord => ({
    ...game(6),
    gameId: id,
    ...extra,
    actions: [...game(6).actions, { type: "concede", player: "P2" }],
  });

  it("dedupes to the latest file per game and lists all three kinds, with the bot's search and the log tail", () => {
    const files = [
      {
        file: "2026-10-28/a-1.json",
        record: {
          ...reported,
          actions: full.actions.slice(0, 20),
          bugReports: [],
        },
      },
      { file: "2026-10-28/a-2.json", record: reported },
    ];
    const { markdown, listed } = buildSummary(files, options);
    expect(markdown).toContain("- Games: 1 (0 finished)");
    expect(markdown).toContain(
      "- New reports: 1 Bad Bot!, 1 Good Bot!, 1 Report bug (0 already reviewed)",
    );
    expect(markdown).toContain("### [Bad Bot!] Ann, Turn");
    expect(markdown).toContain("### [Good Bot!] Ann, Turn");
    expect(markdown).toContain("### [Report bug] Bo, Turn");
    expect(markdown).toContain(
      "- Stored label: Bot (Hard): stored 0 (Turn 1, Main phase)",
    );
    expect(markdown).toMatch(/- Move: Bot \(Hard\): \S/);
    expect(markdown).toContain("→    40   0.120  pass");
    expect(markdown).toContain("Last battle log lines:");
    expect(markdown).toMatch(/Turn \d+: (Player|Bot \(Hard\))/);
    // From the latest file only: each report once.
    expect(listed).toHaveLength(3);
    expect(markdown).toContain("2026-10-28/a-2.json");
    expect(markdown).not.toContain("2026-10-28/a-1.json");
  });

  it("reviewed.json leaves out reports already reviewed; --all lists them again", () => {
    const files = [{ file: "a.json", record: reported }];
    const first = buildSummary(files, options);
    const reviewed = new Set(first.listed.slice(0, 2));
    const again = buildSummary(files, { ...options, reviewed });
    expect(again.listed).toEqual(first.listed.slice(2));
    expect(again.markdown).toContain("(2 already reviewed)");
    expect(
      buildSummary(files, { ...options, reviewed, all: true }).listed,
    ).toEqual(first.listed);
  });

  it("the human's win rate by bot level leaves out games with Show opponent's hand", () => {
    const id = (n: number) => `0f8e6f3c-2b1d-4c5e-9a7b-1d2e3f4a5b6${n}`;
    const files = [
      { file: "w1.json", record: won(id(1)) },
      { file: "w2.json", record: won(id(2)) },
      { file: "w3.json", record: won(id(3), { showOpponentHand: true }) },
      { file: "open.json", record: { ...game(6), gameId: id(4) } },
    ];
    const { markdown } = buildSummary(files, options);
    expect(markdown).toContain("- Games: 4 (3 finished)");
    expect(markdown).toContain("| Hard | 2 | 2 | 0 | 0 | 100% |");
  });

  it("warns when the records folder is close to the cap", () => {
    const files = [{ file: "a.json", record: reported }];
    const near = buildSummary(files, {
      ...options,
      bytes: { used: 900, cap: 1000 },
    });
    expect(near.markdown).toContain(
      "**Warning:** the records folder is 90% full",
    );
    const fine = buildSummary(files, {
      ...options,
      bytes: { used: 100, cap: 1000 },
    });
    expect(fine.markdown).not.toContain("Warning");
  });

  it("the download runs the railway ssh tar command; a failure says what to run by hand", () => {
    const commands: string[] = [];
    const ok = downloadRecords("records", (command) => {
      commands.push(command);
      return { status: 0, stderr: "" };
    });
    expect(ok).toBeNull();
    expect(commands).toEqual([downloadCommand("records")]);
    expect(commands[0]).toContain(
      'railway ssh -i ~/.ssh/railway_ed25519 -- "tar czf - -C /data/records ."',
    );
    const failed = downloadRecords("records", () => ({
      status: 1,
      stderr: "Project not linked",
    }));
    expect(failed).toContain(
      "Couldn't download the records from Railway: Project not linked.",
    );
    expect(failed).toContain(downloadCommand("records"));
    expect(failed).toContain("pnpm feedback --no-download");
  });
});
