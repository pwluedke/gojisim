import { readFileSync, writeFileSync } from "node:fs";
import {
  actionKey,
  applyRules,
  boostedZones,
  botInput,
  columnCard,
  counterOnly,
  decide,
  decklistsOf,
  difficultySettings,
  heldCards,
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
  counterPowerOf,
  type GameState,
  getLegalActions,
  getThreat,
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
const readDeck = (file: string) => {
  const deck = parseDeckList(
    readFileSync(new URL(`decks/${file}`, dir), "utf8"),
  ).decks[0];
  if (!deck) throw new Error(`no deck in ${file}`);
  return deck;
};
const madeUp = readDeck("made-up-destoroyah.txt");

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
  /** #175: P2's deck from a made-up deck file in `positions/decks/` instead. */
  p2File?: string;
  /** #130–#132: the level the tester reported (default Hard), for `missedByHard` and the seats. */
  level?: number;
  match: (s: GameState) => boolean;
  avoid?: (s: GameState) => string[];
  /** #175: keys one of which the bot should play (instead of `avoid`). */
  prefer?: (s: GameState) => string[];
  /**
   * M13c: keep only a position that today's Hard (or the spec's `level`) gets wrong, so it
   * measures a miss. The check runs after `match`; a position that fails it is played on.
   */
  missedByHard?: boolean;
}

/** Seeds for the `missedByHard` check: Hard at its fixed iteration count, no clock. */
const MISS_SEEDS = ["miss-0", "miss-1", "miss-2"];

/**
 * The level plays one of the `avoid` keys (or none of the `prefer` keys), from P2's own view, in
 * at least 2 of the 3 seeds. #175: with Paul's rules off, as the level played before them.
 */
function hardMisses(
  s: GameState,
  decks: readonly PlayerSetup[],
  keys: { avoid?: string[]; prefer?: string[] },
  level: number = PRESETS.hard,
): boolean {
  const settings = {
    ...difficultySettings(level),
    maxMs: Number.MAX_SAFE_INTEGER,
    rules: 0,
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
    const key = actionKey(s, decide(input).action);
    if (keys.avoid ? keys.avoid.includes(key) : !keys.prefer?.includes(key))
      misses++;
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

/** #175: P2's root actions, with Paul's rules' verdict on them. */
function rulesAt(s: GameState) {
  const legal = getLegalActions(s, P2).filter((a) => a.type !== "concede");
  const key = (a: Action) => actionKey(s, a);
  return { legal, key, verdict: applyRules(s, legal, P2, key) };
}
const me2 = (s: GameState) => s.players.find((p) => p.id === P2);
const cardIn = (s: GameState, a: Action) =>
  s.cards[
    hand(s).find(
      (c) => c.instanceId === (a as { cardInstanceId?: string }).cardInstanceId,
    )?.cardId ?? -1
  ];
/** Rule 2: rage discards of a held card (held one per rank). */
function heldRage(s: GameState): Action[] {
  const me = me2(s);
  if (!me || !atPlayTiming(s)) return [];
  const held = heldCards(s, me);
  return rulesAt(s).legal.filter(
    (a) => a.type === "gainRage" && held.has(a.cardInstanceId),
  );
}
/** Rule 3: pass with a monster card that isn't held still able to go to rage. */
function passWithRage(s: GameState): Action[] {
  if (!atPlayTiming(s)) return [];
  const { legal, key, verdict } = rulesAt(s);
  return legal.filter((a) => a.type === "pass" && verdict.dead.has(key(a)));
}
/** Rule 2 in a King Ghidorah deck: two same-rank copies in hand, so one goes to rage. */
function extraCopy(s: GameState): boolean {
  const me = me2(s);
  if (!me) return false;
  const ranks = me.hand
    .map((c) => s.cards[c.cardId])
    .filter((d) => d?.type === "Monster" && d.name.includes("Ghidorah"))
    .map((d) => d?.rank);
  return ranks.some((r, i) => ranks.indexOf(r) !== i);
}
/** Rule 4: counter-only activations the rules leave out (the counter isn't made). */
function counterOnlyDead(s: GameState): Action[] {
  if (!atPlayTiming(s)) return [];
  const { legal, key, verdict } = rulesAt(s);
  return legal.filter(
    (a) =>
      a.type === "activateStrategy" &&
      counterOnly(cardIn(s, a)) &&
      verdict.dead.has(key(a)),
  );
}
/** Rule 4: two counter-only cards that make the counter together, where one alone wouldn't. */
function counterOnlyPair(s: GameState): Action[] {
  if (!atPlayTiming(s)) return [];
  const { legal, key, verdict } = rulesAt(s);
  const gods = legal.filter(
    (a) => a.type === "activateStrategy" && counterOnly(cardIn(s, a)),
  );
  const copies = hand(s).filter((c) => counterOnly(s.cards[c.cardId])).length;
  if (
    copies < 2 ||
    gods.length === 0 ||
    gods.some((a) => verdict.dead.has(key(a)))
  )
    return [];
  // GoD and pass are the only plays, so nothing better can draw the search (as `onlyDeadOrPass`).
  if (
    legal.some((a) => a.type !== "pass" && !gods.some((g) => key(g) === key(a)))
  )
    return [];
  // No invasion that wins now: a win beats any counter.
  if (
    legal.some(
      (a) =>
        a.type === "invade" &&
        advanceToDecision(applyAction(s, a)).result?.winner === P2,
    )
  )
    return [];
  // One alone doesn't make it: the rules allow it only because of the second copy.
  const one = advanceToDecision(applyAction(s, gods[0] as Action));
  const meOne = one.players.find((p) => p.id === P2);
  const oppOne = one.players.find((p) => p.id !== P2);
  if (!meOne || !oppOne || one.result) return [];
  return counterPowerOf(one, meOne) < getThreat(one, oppOne.id) ? gods : [];
}
/** Rule 5: same-column plays the rules leave out. */
function offColumn(s: GameState): Action[] {
  if (!atPlayTiming(s)) return [];
  const { legal, key, verdict } = rulesAt(s);
  return legal.filter(
    (a) =>
      a.type === "playBattle" &&
      columnCard(cardIn(s, a)) &&
      verdict.dead.has(key(a)),
  );
}
/** Rule 6: plays of a zone-boosted card outside its zones while a boosted play has the prior. */
function offZone(s: GameState): Action[] {
  if (!atPlayTiming(s)) return [];
  const { legal, key, verdict } = rulesAt(s);
  const boosted = legal.filter(
    (a) => a.type === "playBattle" && verdict.bonus.has(key(a)),
  );
  if (boosted.length === 0) return [];
  return legal.filter(
    (a) =>
      a.type === "playBattle" &&
      boostedZones(cardIn(s, a)).length > 0 &&
      !boostedZones(cardIn(s, a)).includes(a.zone),
  );
}
/** Rule 1: a stacking play with the prior because a card wants a bigger stack. */
function stackPlays(s: GameState): Action[] {
  if (!atPlayTiming(s)) return [];
  const { legal, key, verdict } = rulesAt(s);
  const me = me2(s);
  if (!me) return [];
  const held = heldCards(s, me);
  return legal.filter(
    (a) =>
      a.type === "playMonster" &&
      verdict.bonus.has(key(a)) &&
      !held.has(a.cardInstanceId),
  );
}
const SPACEG = "made-up-spaceg.txt";
const KING_GHIDORAH = "made-up-king-ghidorah.txt";
/** Rule positions are kept only where today's Hard (rules off) breaks the rule. */
const RULE_SPECS: Spec[] = [
  {
    name: "rule1-stack-for-stack-size",
    note: "#175 rule 1 (8.5.1): a same-rank monster card goes on top when a card wants a bigger stack (Mecha-King Ghidorah EBP02-051 at 5, King Ghidorah (1991) EBP02-049 at 3). Made-up King Ghidorah deck; kept only where Hard without the rules doesn't stack.",
    p1: "ESD01",
    p2File: KING_GHIDORAH,
    match: (s) => stackPlays(s).length > 0,
    missedByHard: true,
    prefer: (s) => keysOf(s, stackPlays(s)),
  },
  {
    name: "rule2-hold-spacegodzilla",
    note: "#175 rule 2: a main-deck SpaceGodzilla that can still be played on top is held, not discarded for rage (one per rank). Made-up SpaceGodzilla deck; kept only where Hard without the rules discards it.",
    p1: "ESD01",
    p2File: SPACEG,
    match: (s) => heldRage(s).length > 0,
    missedByHard: true,
    avoid: (s) => keysOf(s, heldRage(s)),
  },
  {
    name: "rule2-king-ghidorah-extra-copy-to-rage",
    note: "#175 rule 2 (Monarch): hold at most one copy per rank; with two same-rank King Ghidorah cards in hand the extra one goes to rage (8.4.1), so no pass. Made-up King Ghidorah deck (a tester's ghidorat list can't be committed); kept only where Hard without the rules passes.",
    p1: "ESD02",
    p2File: KING_GHIDORAH,
    match: (s) => extraCopy(s) && passWithRage(s).length > 0,
    missedByHard: true,
    avoid: (s) => keysOf(s, passWithRage(s)),
  },
  {
    name: "rule3-monster-cards-to-rage",
    note: "#175 rule 3 (8.4.1): every monster card that isn't held goes to rage each turn, so no pass while one can (King Ghidorah cards turn on Mecha-King Ghidorah EBP02-068 and GAM EBP01-073). Made-up SpaceGodzilla deck; kept only where Hard without the rules passes.",
    p1: "ESD01",
    p2File: SPACEG,
    match: (s) => passWithRage(s).length > 0,
    missedByHard: true,
    avoid: (s) => keysOf(s, passWithRage(s)),
  },
  {
    name: "rule4-counter-only-strategy-without-counter",
    note: "#175 rule 4 (7.4.3): God of Destruction's Counterattack (EBP02-072) only on a turn the counter is made; here it isn't, so hold it. Made-up SpaceGodzilla deck; kept only where Hard without the rules plays it.",
    p1: "ESD01",
    p2File: SPACEG,
    match: (s) => counterOnlyDead(s).length > 0,
    missedByHard: true,
    avoid: (s) => [
      ...new Set(
        counterOnlyDead(s).map((a) =>
          actionKey(s, a).split(":").slice(0, 2).join(":"),
        ),
      ),
    ],
  },
  {
    name: "rule4-double-counter-only",
    note: "#175 rule 4 (Monarch): two God of Destruction's Counterattack (EBP02-072) make the counter together where one wouldn't, and they and pass are the only plays: play them. Made-up SpaceGodzilla deck; kept only where Hard without the rules doesn't.",
    p1: "ESD01",
    p2File: SPACEG,
    match: (s) => counterOnlyPair(s).length > 0,
    missedByHard: true,
    prefer: (s) => keysOf(s, counterOnlyPair(s)),
  },
  {
    name: "rule5-same-column",
    note: '#175 rule 5: Mecha-King Ghidorah (EBP02-068, "same column as the opponent\'s monster") goes in that column. Made-up King Ghidorah deck; kept only where Hard without the rules plays it elsewhere.',
    p1: "ESD01",
    p2File: KING_GHIDORAH,
    match: (s) => offColumn(s).length > 0,
    missedByHard: true,
    avoid: (s) => keysOf(s, offColumn(s)),
  },
  {
    name: "rule6-zone-boosted",
    note: "#175 rule 6: Godzilla (1972) (EBP02-061, +3000 in zone 8) goes in zone 8. Made-up SpaceGodzilla deck; kept only where Hard without the rules plays it elsewhere.",
    p1: "ESD01",
    p2File: SPACEG,
    match: (s) => offZone(s).length > 0,
    missedByHard: true,
    avoid: (s) => keysOf(s, offZone(s)),
  },
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
  ...RULE_SPECS,
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
        deckOf(
          "P2",
          spec.p2File
            ? readDeck(spec.p2File)
            : spec.p2
              ? officialDeck(spec.p2)
              : madeUp,
        ),
      ],
      actions: [],
    };
    const pick = pickWith(seededRng(`${spec.name}-${g}-policy`));
    let state = advanceToDecision(startGame(record));
    for (let i = 0; i < 3000 && !state.result; i++) {
      const keys = spec.prefer
        ? { prefer: spec.prefer(state) }
        : { avoid: spec.avoid?.(state) ?? [] };
      if (
        spec.match(state) &&
        (!spec.missedByHard ||
          hardMisses(state, record.decks, keys, spec.level))
      ) {
        const position = {
          note: spec.note,
          made: `tools/bots/src/makePositions.ts, game ${g}: random weighted play, ${spec.p1} starter (P1) vs ${spec.p2File ? `the ${spec.p2File} deck` : spec.p2 ? `the ${spec.p2} starter` : "the made-up Destoroyah deck"} (P2)`,
          ...keys,
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
          `${spec.name}: game ${g}, ${record.actions.length} actions, ${JSON.stringify(keys)}`,
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
