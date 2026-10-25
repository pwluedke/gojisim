/**
 * Writes the M5c choice fixtures: game records that stop at a pending choice for P1 (a human
 * seat), found by playing seeded games with the weighted policy. Each record replays exactly in
 * `/play` ("Load a game record"). Run: `pnpm --filter @gojisim/web e2e:fixtures`. The
 * single-target fixture records `confirmSingleTarget` for P1, so its replay asks the same choices;
 * the M5e fixtures record `confirmSingleOption` for P1, as new `/play` games do. Fixtures with
 * `matchPlay` stop at P1's main phase play timing instead of a choice.
 */
import { readFileSync, writeFileSync } from "node:fs";
import type { Card } from "@gojisim/cards";
import { parseDeckList } from "@gojisim/cards/deck-lists";
import { buildTestDeck } from "@gojisim/cards/test-decks";
import { stateBoard, weightedPick } from "@gojisim/bot";
import {
  type Action,
  advanceToDecision,
  type ComboHit,
  detectCombos,
  newComboTracker,
  applyAction,
  getLegalActions,
  type GameRecord,
  type GameState,
  type PendingChoice,
  startGame,
} from "@gojisim/engine";

const data = (path: string) =>
  readFileSync(
    new URL(`../../../../packages/cards/data/${path}`, import.meta.url),
    "utf8",
  );
const cards = JSON.parse(data("cards.json")) as Card[];
const byId = (id: number) => cards.find((c) => c.id === id) as Card;
const starter = (file: string) => {
  const deck = parseDeckList(data(`decks/${file}`)).decks[0];
  if (!deck) throw new Error(file);
  return deck;
};
const esd01 = starter("esd01-starter.txt");
const esd02 = starter("esd02-starter.txt");

type Deck = { monsterDeck: Card[]; mainDeck: Card[] };
/** P1's monster deck holds two rank II monsters, so a counter asks for the next one (5.15.1.2). */
const twoRankII: Deck = {
  monsterDeck: [byId(3), byId(5), byId(676), byId(7), byId(8)],
  mainDeck: esd01.mainDeck,
};
/** P1's deck holds no rank III Godzilla (2023) with Burst, so ESD01-002's search finds nothing. */
const noBurstIII: Deck = {
  monsterDeck: esd01.monsterDeck,
  mainDeck: esd01.mainDeck.map((c) =>
    c.deckCardNumber === "ESD01-006" ? byId(7) : c,
  ),
};
/** P1 plays ESC01-003, which has no ability data until M12f: it opens a manual window. */
const withManual: Deck = {
  monsterDeck: esd01.monsterDeck,
  mainDeck: esd01.mainDeck.map((c) =>
    c.deckCardNumber === "ESD01-013" ? byId(901) : c,
  ),
};

function rng(seed: number) {
  let s = seed >>> 0;
  return () => (s = (s * 1664525 + 1013904223) >>> 0) / 2 ** 32;
}

interface Fixture {
  name: string;
  note: string;
  decks: (game: number) => [Deck, Deck];
  match: (choice: PendingChoice, state: GameState) => boolean;
  /** P1 confirms every target pick, as human seats did in `/play` in M5d. */
  confirmSingleTarget?: boolean;
  /** P1 confirms every single-option choice, as human seats do in `/play` (M5e). */
  confirmSingleOption?: boolean;
  /** Stop at P1's play timing (no choice open) when this holds, instead of at a choice. */
  matchPlay?: (state: GameState) => boolean;
  /**
   * Stop before a P1 action whose step (to the next decision) this matches; the record keeps
   * that action as `next`, for the spec to take through the UI (M5f).
   */
  matchNext?: (
    before: GameState,
    action: Action,
    after: GameState,
    combos: ComboHit[],
  ) => boolean;
  /** Whose next action `matchNext` looks at (default P1). */
  actor?: "P1" | "P2";
  /**
   * With `actor: "P2"`: only where the bot has a single legal action, so the loaded record's bot
   * must take it (its search is otherwise not repeatable).
   */
  forced?: boolean;
  /** P1 only passes (first option in choices), so its hand grows (M5h `hand-ten`). */
  p1Passes?: boolean;
}

/** Hand action types P1 can take at a play timing. */
const handActionTypes = (state: GameState) =>
  new Set(
    getLegalActions(state, "P1")
      .filter((a) =>
        [
          "playBattle",
          "activateStrategy",
          "gainRage",
          "playMonster",
          "invade",
        ].includes(a.type),
      )
      .map((a) => a.type),
  );

/** Zone top cards (instance ids) on the field. */
const zoneTops = (state: GameState) =>
  state.players.flatMap((p) =>
    Object.values(p.zones).flatMap((stacks) =>
      stacks.map((stack) => stack[stack.length - 1]?.instanceId),
    ),
  );

const official = (): [Deck, Deck] => [esd01, esd02];
const randomDecks = (g: number): [Deck, Deck] =>
  g % 2
    ? [esd01, esd02]
    : [buildTestDeck("ESD01", g), buildTestDeck("ESD02", g)];
const source = (state: GameState) =>
  state.resolution
    ? state.cards[state.resolution.standby.sourceCardId]?.deckCardNumber
    : undefined;

/** Actions a spec can take through the UI: hand actions and choices. */
const HAND_OR_CHOICE: Action["type"][] = [
  "playBattle",
  "activateStrategy",
  "gainRage",
  "playMonster",
  "invade",
  "choose",
];

const FIXTURES: Fixture[] = [
  {
    name: "target",
    note: "P1 targets a card for an ability (10.5.3)",
    decks: randomDecks,
    match: (c) => c.kind === "target" && c.rule === "10.5.3",
  },
  {
    name: "search",
    note: 'P1 searches their deck "up to 1", with find nothing as Done (5.8.1 or 12.6.2)',
    decks: randomDecks,
    match: (c) =>
      c.kind === "target" && (c.rule === "5.8.1" || c.rule === "12.6.2"),
  },
  {
    name: "discard-bot-turn",
    note: "P1 (human) discards during P2's (bot) turn, for ESD01-005 or ESD01-015 (5.7.2)",
    decks: (g) => (g % 2 ? [esd02, esd01] : [esd01, esd01]),
    match: (c, s) =>
      c.kind === "target" &&
      c.rule.startsWith("5.7") &&
      s.turnPlayer === "P2" &&
      ["ESD01-005", "ESD01-015"].includes(source(s) ?? ""),
  },
  {
    name: "zone",
    note: "P1 chooses a zone (5.11.1, 10.5.2.2 or 5.2.1)",
    decks: official,
    match: (c) => c.kind === "zone",
  },
  {
    name: "confirm",
    note: "P1 decides whether to use an optional ability: ESD02 Evolution (10.5.4)",
    decks: () => [esd02, esd01],
    match: (c) => c.kind === "confirm",
  },
  {
    name: "standby-order",
    note: "P1 picks which standby ability resolves first (10.4.3.2)",
    decks: randomDecks,
    match: (c) => c.kind === "standbyOrder",
  },
  {
    name: "next-monster",
    note: "P1 picks the next monster after a counter, from two rank II monsters (5.15.1.2)",
    decks: () => [twoRankII, esd02],
    match: (c) => c.kind === "nextMonster",
  },
  {
    name: "single-target",
    note: "P1 confirms a destroy with a single legal target (10.5.3.1, confirmSingleTarget)",
    decks: randomDecks,
    confirmSingleTarget: true,
    match: (c, s) =>
      c.kind === "target" &&
      c.rule === "10.5.3" &&
      c.options.length === 1 &&
      s.players.some((p) =>
        Object.values(p.zones).some((stacks) =>
          stacks.some((stack) =>
            stack.some((card) => card.instanceId === c.options[0]?.id),
          ),
        ),
      ),
  },
  {
    name: "single-next-monster",
    note: "P1 confirms their only next monster after a counter (5.15.1.2, confirmSingleOption)",
    decks: official,
    confirmSingleOption: true,
    match: (c) => c.kind === "nextMonster" && c.options.length === 1,
  },
  {
    name: "search-none",
    note: "P1 can invade with ESD01-002, whose search will find nothing (5.8.1.2)",
    decks: () => [noBurstIII, esd02],
    confirmSingleOption: true,
    match: () => false,
    matchPlay: (s) => {
      const p1 = s.players.find((p) => p.id === "P1");
      const top = p1?.invadingMonsterZone.at(-1);
      return (
        !!p1 &&
        !!top &&
        s.cards[top.cardId]?.deckCardNumber === "ESD01-002" &&
        (p1.monsterPosition ?? 9) <= 4 &&
        !s.turnFlags.invasionUsed &&
        getLegalActions(s, "P1").some((a) => a.type === "invade")
      );
    },
  },
  {
    name: "multi-destroy",
    note: "P1's next action (`next`) destroys 2 or more zone cards at once (M5f animation)",
    decks: randomDecks,
    confirmSingleOption: true,
    match: () => false,
    matchNext: (before, action, after) => {
      if (action.player !== "P1" || action.type === "concede") return false;
      if (!["playBattle", "playMonster", "choose"].includes(action.type))
        return false;
      const destroyed = after.log
        .slice(before.log.length)
        .filter((e) => e.type === "destroy" && e.payload["zone"] !== undefined);
      const gone = zoneTops(before).filter(
        (id) => !zoneTops(after).includes(id),
      );
      return destroyed.length >= 2 && gone.length >= 2 && !after.result;
    },
  },
  {
    name: "combo-you",
    note: "P1's next action (`next`) completes a combo (M5g callout)",
    decks: official,
    confirmSingleOption: true,
    match: () => false,
    matchNext: (_b, action, _a, combos) =>
      HAND_OR_CHOICE.includes(action.type) &&
      combos.some((c) => c.player === "P1"),
  },
  {
    name: "combo-bot-waits",
    note: "P1's next action (`next`) completes a combo and hands the decision to the bot (M5g modal)",
    decks: official,
    confirmSingleOption: true,
    match: () => false,
    matchNext: (_b, action, after, combos) =>
      [...HAND_OR_CHOICE, "pass"].includes(action.type) &&
      combos.some((c) => c.player === "P1") &&
      (after.pendingChoice?.player ?? after.turnPlayer) === "P2" &&
      !after.result,
  },
  {
    name: "combo-bot",
    note: "The bot's only legal action (`next`) completes its combo (M5g callout, M5h: no hotseat)",
    decks: (g) => (g % 2 ? [esd01, esd02] : [esd02, esd01]),
    confirmSingleOption: true,
    actor: "P2",
    forced: true,
    match: () => false,
    matchNext: (_b, _action, _a, combos) =>
      combos.some((c) => c.player === "P2"),
  },
  {
    name: "hand-five",
    note: "P1's play timing with all five hand actions (8.2 to 8.6) against the Medium bot",
    decks: official,
    confirmSingleOption: true,
    match: () => false,
    matchPlay: (state) => handActionTypes(state).size === 5,
  },
  {
    name: "hand-ten",
    note: "P1, only passing, holds 10 cards at its play timing against the Medium bot",
    decks: official,
    confirmSingleOption: true,
    p1Passes: true,
    match: () => false,
    matchPlay: (state) =>
      state.players.find((p) => p.id === "P1")?.hand.length === 10,
  },
  {
    name: "deck-bottom",
    note: "P1's next action (`next`) destroys an ESD01-011/012 that goes to the deck bottom instead (M5g layer fix)",
    decks: (g) => (g % 2 ? [esd02, esd01] : [esd01, esd01]),
    confirmSingleOption: true,
    match: () => false,
    matchNext: (before, action, after) =>
      HAND_OR_CHOICE.includes(action.type) &&
      after.log
        .slice(before.log.length)
        .some(
          (e) => e.type === "putOnDeck" && e.payload["where"] === "bottom",
        ) &&
      !after.result,
  },
  {
    name: "confirm-invading",
    note: "P1 decides on an [invading] ability's optional cost (M5h #16: the prompt names the invading step)",
    decks: () => [esd02, esd01],
    confirmSingleOption: true,
    match: (c, state) =>
      c.kind === "confirm" &&
      state.resolution?.standby.event.type === "advance" &&
      state.resolution.standby.event.payload["invasion"] === true,
  },
  {
    name: "manual",
    note: "P1 resolves ESC01-003 by hand: a manual override window",
    decks: () => [withManual, esd02],
    match: (c) => c.kind === "manual",
  },
];

// `pnpm e2e:fixtures name ...` writes only the named fixtures, so existing ones stay as they are.
const only = process.argv.slice(2);
for (const fixture of FIXTURES.filter(
  (f) => only.length === 0 || only.includes(f.name),
)) {
  let found: GameRecord | null = null;
  let next: Action | null = null;
  for (let g = 0; g < 2000 && !found; g++) {
    const [a, b] = fixture.decks(g);
    const record: GameRecord = {
      version: 1,
      seed: g,
      decks: [
        { id: "P1", monsterDeck: a.monsterDeck, mainDeck: a.mainDeck },
        { id: "P2", monsterDeck: b.monsterDeck, mainDeck: b.mainDeck },
      ],
      actions: [],
      seats: {
        P1: { kind: "human" },
        P2: { kind: "bot", bot: "ismcts", settings: { difficulty: 55 } },
      },
      botSeed: `${g}-bots`,
      ...(fixture.confirmSingleTarget ? { confirmSingleTarget: ["P1"] } : {}),
      ...(fixture.confirmSingleOption ? { confirmSingleOption: ["P1"] } : {}),
    };
    let state = startGame(record);
    const pick = rng(g);
    const tracker = newComboTracker();
    for (let i = 0; i < 4000 && !state.result; i++) {
      const choice = state.pendingChoice;
      if (choice?.player === "P1" && fixture.match(choice, state)) {
        found = record;
        break;
      }
      if (
        !choice &&
        state.turnPlayer === "P1" &&
        state.step === "7.3.2" &&
        fixture.matchPlay?.(state)
      ) {
        found = record;
        break;
      }
      const who = choice?.player ?? state.turnPlayer;
      const legal = getLegalActions(state, who).filter(
        (x) => x.type !== "concede",
      );
      const passes =
        fixture.p1Passes && who === "P1"
          ? (legal.find((a) => a.type === "pass") ?? legal[0])
          : undefined;
      const action =
        passes ??
        weightedPick(stateBoard(state), legal, (n) => Math.floor(pick() * n));
      const after = advanceToDecision(applyAction(state, action));
      const combos = detectCombos(
        tracker,
        state,
        action,
        after,
        record.actions.length,
      );
      if (
        who === (fixture.actor ?? "P1") &&
        (!fixture.forced || legal.length === 1) &&
        fixture.matchNext?.(state, action, after, combos)
      ) {
        found = record;
        next = action;
        break;
      }
      record.actions.push(action);
      state = after;
    }
  }
  if (!found) {
    console.log(`${fixture.name}: not found`);
    continue;
  }
  const path = new URL(`./${fixture.name}.json`, import.meta.url);
  writeFileSync(
    path,
    `${JSON.stringify({ note: fixture.note, ...found, ...(next ? { next } : {}) })}\n`,
  );
  console.log(
    `${fixture.name}: seed ${found.seed}, ${found.actions.length} actions`,
  );
}
