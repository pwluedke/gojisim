import { describe, expect, it } from "vitest";
import {
  type Action,
  getLegalActions,
  getPlayerView,
  type GameState,
} from "@gojisim/engine";
import {
  ANNOUNCED_KINDS,
  type AnnounceKind,
  type AnnounceNames,
  announce,
  lineMs,
  PACE_CONFIRM,
  paceLabel,
} from "./announce";
import { type DeckOption, deckOptions } from "./decks";
import { newSession, withAction } from "./session";

const names: AnnounceNames = {
  subject: () => "Bot",
  whose: (owner, actor) => (owner === actor ? "its" : "your"),
};

interface Step {
  before: GameState;
  after: GameState;
  action: Action;
}

/** P2's steps over a few seeded games of the two starters, random legal actions on both sides. */
function botSteps(): Step[] {
  const [a, b] = deckOptions([]) as [DeckOption, DeckOption];
  const steps: Step[] = [];
  for (let seed = 1; seed <= 40; seed++) {
    let session = newSession(seed, [a, b], {
      P1: { kind: "human" },
      P2: { kind: "bot", difficulty: 30 },
    });
    let rng = seed * 7919;
    for (let n = 0; n < 600; n++) {
      const state = session.states[session.position] as GameState;
      if (state.result) break;
      const who = state.pendingChoice?.player ?? state.turnPlayer;
      const legal = getLegalActions(state, who).filter(
        (x) => x.type !== "concede",
      );
      // Pass rarely, so games get to evolutions, searches and destroys.
      const plays = legal.filter((x) => x.type !== "pass");
      rng = (rng * 1103515245 + 12345) % 2147483648;
      const pool = plays.length && rng % 5 !== 0 ? plays : legal;
      const action = pool[rng % pool.length] as Action;
      // Monster plays and next-monster picks are rare at random: try one on the side as well.
      const rare =
        who === "P2"
          ? legal.find(
              (x) =>
                x !== action &&
                (x.type === "playMonster" ||
                  (x.type === "choose" &&
                    state.pendingChoice?.kind === "nextMonster")),
            )
          : undefined;
      if (rare) {
        const side = withAction(session, rare);
        steps.push({
          before: state,
          after: side.states[side.position] as GameState,
          action: rare,
        });
      }
      session = withAction(session, action);
      if (who === "P2")
        steps.push({
          before: state,
          after: session.states[session.position] as GameState,
          action,
        });
    }
  }
  return steps;
}

const steps = botSteps();
const lines = steps.map((s) => ({
  ...s,
  line: announce(s.before, s.after, s.action, names),
}));

describe("bot announcements", () => {
  it("words each kind of bot action in plain English", () => {
    const byKind = new Map<AnnounceKind, string>();
    for (const { line } of lines)
      if (!byKind.has(line.kind)) byKind.set(line.kind, line.text);
    const patterns: Partial<Record<AnnounceKind, RegExp>> = {
      play: /^Bot plays .+ to zone \d$/,
      strategy: /^Bot activates .+$/,
      monster: /^Bot plays its monster: .+$/,
      rage: /^Bot gains rage with .+ \(rage \d+\)$/,
      invade: /^Bot invades with .+ for [12]$/,
      pass: /^Bot passes$/,
      evolve: /^Bot evolves .+ into .+$/,
      search: /^Bot searches its deck and (takes .+|finds nothing)$/,
      discard: /^Bot discards .+$/,
    };
    for (const [kind, pattern] of Object.entries(patterns)) {
      expect(byKind.get(kind as AnnounceKind) ?? `missing ${kind}`).toMatch(
        pattern,
      );
    }
  });

  it("a next-monster pick (5.15.1.2) reads as the new monster", () => {
    // The starters never give a choice here (one candidate is placed at once), so the step is
    // built: any bot state, plus the entry the pick logs.
    const { before } = steps[0] as Step;
    const monster = Object.values(before.cards).find(
      (c) => c.type === "Monster",
    );
    const after: GameState = {
      ...before,
      log: [
        ...before.log,
        {
          seq: before.log.length,
          type: "newInvadingMonster",
          player: "P2",
          payload: { rule: "5.15.1.2", cardId: monster?.id },
        },
      ],
    };
    const line = announce(
      { ...before, pendingChoice: null },
      after,
      { type: "choose", player: "P2", choiceId: 1, optionId: "c1" } as Action,
      names,
    );
    expect(line).toEqual({
      kind: "nextMonster",
      text: `Bot's next monster: ${monster?.name}`,
    });
  });

  it("never names a card the human can't see: every name is in the human's view after the action", () => {
    expect(lines.length).toBeGreaterThan(200);
    for (const { before, after, line } of lines) {
      // The view lists only cards the viewer can see (decision 40).
      const visible = new Set(
        [getPlayerView(before, "P1"), getPlayerView(after, "P1")].flatMap((v) =>
          Object.values(v.cards).map((c) => c.name),
        ),
      );
      const all = new Set(Object.values(after.cards).map((c) => c.name));
      for (const name of all)
        if (line.text.includes(name) && !visible.has(name))
          throw new Error(`"${line.text}" names hidden ${name}`);
    }
  });

  it("a private choice with no public result reads 'Bot makes a choice'", () => {
    const quiet = lines.filter(
      ({ before, after, action }) =>
        action.type === "choose" &&
        before.pendingChoice?.private &&
        !after.log
          .slice(before.log.length)
          .some((e) =>
            [
              "evolve",
              "search",
              "newInvadingMonster",
              "destroy",
              "place",
              "discard",
              "moveBattle",
              "addToHand",
            ].includes(e.type),
          ),
    );
    expect(quiet.length).toBeGreaterThan(0);
    for (const { line } of quiet) expect(line.text).toBe("Bot makes a choice");
  });

  it("a line stays its pace's minimum plus 60 ms per character past 40; Confirm waits", () => {
    const short = "Bot passes";
    const long = "x".repeat(50);
    expect(lineMs(short, 0)).toBe(1500);
    expect(lineMs(short, 2)).toBe(3500);
    expect(lineMs(short, 4)).toBe(7000);
    expect(lineMs("x".repeat(40), 1)).toBe(2500);
    expect(lineMs(long, 1)).toBe(2500 + 60 * 10);
    expect(lineMs(long, PACE_CONFIRM)).toBeNull();
    expect([0, 1, 2, 3, 4, 5].map(paceLabel)).toEqual([
      "1.5 s",
      "2.5 s",
      "3.5 s",
      "5 s",
      "7 s",
      "Confirm",
    ]);
  });

  it("ANNOUNCED_KINDS is data and lists every kind the wording makes", () => {
    for (const { line } of lines) expect(ANNOUNCED_KINDS).toContain(line.kind);
  });
});
