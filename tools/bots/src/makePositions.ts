import { readFileSync, writeFileSync } from "node:fs";
import {
  actionKey,
  isDeadAction,
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
 * the made-up Destoroyah deck (P2), cut at the first P2 decision a position's `match` accepts.
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
  match: (s: GameState) => boolean;
  avoid: (s: GameState) => string[];
}

const avoidActivations = (cardNumber: string) => (s: GameState) => [
  ...new Set(
    deadActivations(s, cardNumber).map((a) =>
      actionKey(s, a).split(":").slice(0, 2).join(":"),
    ),
  ),
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
    note: "Destoroyah Flying Form's (EBP01-054) Evolution search with Destoroyah Perfect Form (ESD02-013, 13,000 counter power) and another Flying Form both in the deck: take Perfect Form, not the copy (BFW182 game 1, decision 44; Monarch's #64 review).",
    p1: "ESD01",
    match: (s) =>
      evolutionOptions(s, "EBP01-054").length > 0 &&
      evolutionOptions(s, "ESD02-013").length > 0,
    avoid: (s) => [
      ...new Set(evolutionOptions(s, "EBP01-054").map((a) => actionKey(s, a))),
    ],
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
      decks: [deckOf("P1", officialDeck(spec.p1)), deckOf("P2", madeUp)],
      actions: [],
    };
    const pick = pickWith(seededRng(`${spec.name}-${g}-policy`));
    let state = advanceToDecision(startGame(record));
    for (let i = 0; i < 3000 && !state.result; i++) {
      if (spec.match(state)) {
        const position = {
          note: spec.note,
          made: `tools/bots/src/makePositions.ts, game ${g}: random weighted play, ${spec.p1} starter (P1) vs the made-up Destoroyah deck (P2)`,
          avoid: spec.avoid(state),
          record: {
            ...record,
            seats: {
              P1: { kind: "bot", bot: "ismcts", settings: { difficulty: 90 } },
              P2: { kind: "bot", bot: "ismcts", settings: { difficulty: 90 } },
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
