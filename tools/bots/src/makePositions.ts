import { readFileSync, writeFileSync } from "node:fs";
import {
  actionKey,
  botInput,
  decide,
  decklistsOf,
  difficultySettings,
  isDeadAction,
  PRESETS,
  pickWith,
  seededRng,
  stateBoard,
  weightedPick,
} from "@gojisim/bot";
import { parseDeckList } from "@gojisim/cards/deck-lists";
import {
  type Action,
  advanceToDecision,
  applyAction,
  type GameRecord,
  type GameState,
  getLegalActions,
  type PlayerSetup,
  startGame,
} from "@gojisim/engine";
import { officialDeck } from "@gojisim/stress";

/**
 * Makes the committed bot positions (M13a): random weighted games with a starter (P1) against
 * the made-up Destoroyah deck or another starter (P2), cut at the first P2 decision a position's
 * `match` accepts.
 * `pnpm --filter @gojisim/bots exec tsx src/makePositions.ts [name ...]` rewrites them.
 */

const dir = new URL("../positions/", import.meta.url);
const madeUp = parseDeckList(
  readFileSync(new URL("decks/made-up-destoroyah.txt", dir), "utf8"),
).decks[0];
if (!madeUp) throw new Error("no made-up deck");

const deckOf = (
  id: "P1" | "P2",
  deck: {
    monsterDeck: PlayerSetup["monsterDeck"];
    mainDeck: PlayerSetup["mainDeck"];
  },
): PlayerSetup => ({
  id,
  monsterDeck: deck.monsterDeck,
  mainDeck: deck.mainDeck,
});

const P2 = "P2";
const hand = (s: GameState) => s.players.find((p) => p.id === P2)?.hand ?? [];
const opponent = (s: GameState) => s.players.find((p) => p.id !== P2);
const atPlayTiming = (s: GameState) =>
  s.turnPlayer === P2 && !s.pendingChoice && s.step === "7.3.2";

/** P2's activations of `cardNumber` that the pruning check calls dead. */
function deadActivations(s: GameState, cardNumber: string): Action[] {
  return getLegalActions(s, P2).filter(
    (a) =>
      a.type === "activateStrategy" &&
      s.cards[
        hand(s).find((c) => c.instanceId === a.cardInstanceId)?.cardId ?? -1
      ]?.deckCardNumber === cardNumber &&
      isDeadAction(s, a, P2),
  );
}

/**
 * Whether the dead activations are P2's only plays besides passing (as at BFW182 game 1's
 * decision 9), so nothing else can draw the search's visits.
 */
const onlyDeadOrPass = (s: GameState, cardNumber: string) => {
  const dead = new Set(
    deadActivations(s, cardNumber).map((a) => JSON.stringify(a)),
  );
  const others = getLegalActions(s, P2).filter(
    (a) =>
      a.type !== "concede" && a.type !== "pass" && !dead.has(JSON.stringify(a)),
  );
  return dead.size > 0 && others.length === 0;
};

/** P2's picks of `cardNumber` in Flying Form's Evolution search (12.6.2). */
function evolutionOptions(s: GameState, cardNumber: string): Action[] {
  const choice = s.pendingChoice;
  if (
    choice?.player !== P2 ||
    choice.kind !== "target" ||
    choice.rule !== "12.6.2" ||
    !choice.options.some((o) => o.abilityId === "EBP01-054#evolution")
  )
    return [];
  return getLegalActions(s, P2).filter(
    (a) =>
      a.type === "choose" &&
      s.cards[choice.options.find((o) => o.id === a.optionId)?.cardId ?? -1]
        ?.deckCardNumber === cardNumber,
  );
}

interface Spec {
  name: string;
  note: string;
  p1: string;
  /** P2's deck: an official starter's set, else the made-up Destoroyah deck. */
  p2?: string;
  /** #130–#132: the level the tester reported (default Hard), for `missedByHard` and the seats. */
  level?: number;
  match: (s: GameState) => boolean;
  avoid: (s: GameState) => string[];
  /**
   * M13c: keep only a position that today's Hard (or the spec's `level`) gets wrong, so it
   * measures a miss. The check runs after `match`; a position that fails it is played on.
   */
  missedByHard?: boolean;
}

/** Seeds for the `missedByHard` check: Hard at its fixed iteration count, no clock. */
const MISS_SEEDS = ["miss-0", "miss-1", "miss-2"];

/** The level plays one of the `avoid` keys, from P2's own view, in at least 2 of the 3 seeds. */
function hardMisses(
  s: GameState,
  decks: readonly PlayerSetup[],
  avoid: string[],
  level: number = PRESETS.hard,
): boolean {
  const settings = {
    ...difficultySettings(level),
    maxMs: Number.MAX_SAFE_INTEGER,
  };
  let misses = 0;
  for (const seed of MISS_SEEDS) {
    const input = botInput(
      s,
      P2,
      decklistsOf(decks),
      seededRng(seed),
      settings,
    );
    if (avoid.includes(actionKey(s, decide(input).action))) misses++;
  }
  return misses >= 2;
}

const avoidActivations = (cardNumber: string) => (s: GameState) => [
  ...new Set(
    deadActivations(s, cardNumber).map((a) =>
      actionKey(s, a).split(":").slice(0, 2).join(":"),
    ),
  ),
];

/** P2's options in a pending choice of `kind` for `abilityId`, else none. */
function choiceOptions(s: GameState, kind: string, abilityId: string) {
  const choice = s.pendingChoice;
  if (choice?.player !== P2 || choice.kind !== kind) return null;
  if (!choice.options.some((o) => o.abilityId === abilityId)) return null;
  return choice;
}

/** P2's Battra (Larva) Evolution (ESD02-008) offering only Battra (Larva) copies, or declining. */
function battraCopyOnly(s: GameState): Action[] {
  const choice = choiceOptions(s, "target", "ESD02-008#evolution");
  if (!choice || choice.rule !== "12.6.2") return [];
  const copies = getLegalActions(s, P2).filter(
    (a) =>
      a.type === "choose" &&
      s.cards[choice.options.find((o) => o.id === a.optionId)?.cardId ?? -1]
        ?.deckCardNumber === "ESD02-008",
  );
  const others = choice.options.filter(
    (o) =>
      o.id !== "done" &&
      s.cards[o.cardId ?? -1]?.deckCardNumber !== "ESD02-008",
  );
  // The evolving Larva is in zone 8, as in the tester's game.
  const zone8 = s.players.find((p) => p.id === P2)?.zones[8] ?? [];
  const inZone8 = zone8.some((stack) =>
    stack.some((c) => s.cards[c.cardId]?.deckCardNumber === "ESD02-008"),
  );
  const canDecline = choice.options.some((o) => o.id === "done");
  return others.length === 0 && canDecline && inZone8 ? copies : [];
}

/** P2's plays of Super-X (ESD02-009) into zone 8 while its monster is at 3 and can invade to 4. */
function superXBeforeInvade(s: GameState): Action[] {
  if (!atPlayTiming(s)) return [];
  const me = s.players.find((p) => p.id === P2);
  if (me?.monsterPosition !== 3 || (opponent(s)?.rage ?? 0) < 1) return [];
  const legal = getLegalActions(s, P2);
  if (!legal.some((a) => a.type === "invade")) return [];
  return legal.filter(
    (a) =>
      a.type === "playBattle" &&
      a.zone === 8 &&
      s.cards[
        hand(s).find((c) => c.instanceId === a.cardInstanceId)?.cardId ?? -1
      ]?.deckCardNumber === "ESD02-009",
  );
}

/** P2's moves of Godzilla (2023) (ESD01-012) out of zone 8 when it may stay. */
function godzillaLeavesZone8(s: GameState): Action[] {
  const choice = choiceOptions(s, "zone", "ESD01-012#play-move");
  if (!choice?.options.some((o) => o.id === "done")) return [];
  return getLegalActions(s, P2).filter(
    (a) => a.type === "choose" && a.optionId !== "done",
  );
}

const keysOf = (s: GameState, actions: Action[]) => [
  ...new Set(actions.map((a) => actionKey(s, a))),
];

const SPECS: Spec[] = [
  {
    name: "scale-attack-at-4-rage",
    note: "Scale Attack (EBP01-061) in hand with the opponent at 4 rage: it needs 5 or more, so activating it does nothing (BFW182 game 1).",
    p1: "ESD01",
    match: (s) =>
      atPlayTiming(s) &&
      opponent(s)?.rage === 4 &&
      onlyDeadOrPass(s, "EBP01-061"),
    avoid: avoidActivations("EBP01-061"),
  },
  {
    name: "scale-attack-at-2-rage",
    note: "Scale Attack (EBP01-061) in hand with the opponent at 2 rage: activating it does nothing.",
    p1: "ESD02",
    match: (s) =>
      atPlayTiming(s) &&
      (opponent(s)?.rage ?? 0) >= 1 &&
      (opponent(s)?.rage ?? 0) <= 3 &&
      onlyDeadOrPass(s, "EBP01-061"),
    avoid: avoidActivations("EBP01-061"),
  },
  {
    name: "destoroyah-bonus-counter-made",
    note: "Godzilla vs. Destoroyah (EBP01-062, +10,000 total counter power) when the counter is already made without it (BFW182 game 1).",
    p1: "ESD01",
    match: (s) => atPlayTiming(s) && onlyDeadOrPass(s, "EBP01-062"),
    avoid: avoidActivations("EBP01-062"),
  },
  {
    name: "flying-form-evolves-to-perfect-form",
    note: "Destoroyah Flying Form's (EBP01-054) Evolution search with a Destoroyah Perfect Form (ESD02-013 or EBP01-060) and another Flying Form both in the deck: take Perfect Form, not the copy (BFW182 game 1, decision 44; Monarch's #64 review). Kept only where today's Hard takes the copy (M13c, #75).",
    p1: "ESD01",
    // Either Perfect Form: in the tester game the copy beat EBP01-060.
    match: (s) =>
      evolutionOptions(s, "EBP01-054").length > 0 &&
      (evolutionOptions(s, "ESD02-013").length > 0 ||
        evolutionOptions(s, "EBP01-060").length > 0),
    missedByHard: true,
    avoid: (s) => [
      ...new Set(evolutionOptions(s, "EBP01-054").map((a) => actionKey(s, a))),
    ],
  },
  {
    name: "battra-larva-evolves-to-copy",
    note: "Battra (Larva)'s (ESD02-008) Evolution from zone 8 with only Battra (Larva) copies to take: decline rather than replace it with the same card (Tuscancow, #130; the tester named it Mothra Larva over Imago). Kept only where today's Medium takes the copy.",
    p1: "ESD01",
    p2: "ESD02",
    level: PRESETS.medium,
    match: (s) => battraCopyOnly(s).length > 0,
    missedByHard: true,
    avoid: (s) => keysOf(s, battraCopyOnly(s)),
  },
  {
    name: "super-x-after-invade",
    note: "Super-X (ESD02-009) in hand with its monster at 3 and an invade open: invade to 4 first, so Super-X's [enter] takes the opponent's rage (Awakening 4; Cadmium Barrage ordering, combos.md #7; Tuscancow, #131). Kept only where today's Medium plays Super-X first.",
    p1: "ESD01",
    p2: "ESD02",
    level: PRESETS.medium,
    match: (s) => superXBeforeInvade(s).length > 0,
    missedByHard: true,
    avoid: (s) => keysOf(s, superXBeforeInvade(s)),
  },
  {
    name: "godzilla-2023-stays-in-zone-8",
    note: "Godzilla (2023)'s (ESD01-012) optional move with it in zone 8: stay (#132, an Easy tester game). Kept only where today's Easy moves it.",
    p1: "ESD02",
    p2: "ESD01",
    level: PRESETS.easy,
    match: (s) => godzillaLeavesZone8(s).length > 0,
    missedByHard: true,
    avoid: (s) => keysOf(s, godzillaLeavesZone8(s)),
  },
];

const only = process.argv.slice(2);
for (const spec of SPECS.filter(
  (s) => only.length === 0 || only.includes(s.name),
)) {
  let written = false;
  for (let g = 0; g < 3000 && !written; g++) {
    const record: GameRecord = {
      version: 1,
      seed: `${spec.name}-${g}`,
      decks: [
        deckOf("P1", officialDeck(spec.p1)),
        deckOf("P2", spec.p2 ? officialDeck(spec.p2) : madeUp),
      ],
      actions: [],
    };
    const pick = pickWith(seededRng(`${spec.name}-${g}-policy`));
    let state = advanceToDecision(startGame(record));
    for (let i = 0; i < 3000 && !state.result; i++) {
      if (
        spec.match(state) &&
        (!spec.missedByHard ||
          hardMisses(state, record.decks, spec.avoid(state), spec.level))
      ) {
        const position = {
          note: spec.note,
          made: `tools/bots/src/makePositions.ts, game ${g}: random weighted play, ${spec.p1} starter (P1) vs ${spec.p2 ? `the ${spec.p2} starter` : "the made-up Destoroyah deck"} (P2)`,
          avoid: spec.avoid(state),
          record: {
            ...record,
            seats: {
              P1: {
                kind: "bot",
                bot: "ismcts",
                settings: { difficulty: spec.level ?? 90 },
              },
              P2: {
                kind: "bot",
                bot: "ismcts",
                settings: { difficulty: spec.level ?? 90 },
              },
            },
          },
        };
        writeFileSync(
          new URL(`${spec.name}.json`, dir),
          `${JSON.stringify(position)}\n`,
        );
        console.log(
          `${spec.name}: game ${g}, ${record.actions.length} actions, avoid ${position.avoid.join(", ")}`,
        );
        written = true;
        break;
      }
      const who = state.pendingChoice?.player ?? state.turnPlayer;
      const legal = getLegalActions(state, who).filter(
        (a) => a.type !== "concede",
      );
      const action = weightedPick(stateBoard(state), legal, pick);
      record.actions.push(action);
      state = advanceToDecision(applyAction(state, action));
    }
  }
  if (!written) console.log(`${spec.name}: not found`);
}
