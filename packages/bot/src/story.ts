import {
  type Action,
  advanceToDecision,
  applyAction,
  counterPowerOf,
  END_PHASE_HAND_SIZE,
  type GameState,
  getThreat,
  type PlayerId,
} from "@gojisim/engine";
import { isTanglerDeck } from "./tanglerPlan";
import { isFestDeck } from "./festPlan";
import { isMonsterXDeck } from "./mxPlan";
import { boostedZones } from "./rules";
import {
  DECK_GOALS,
  DECK_STANCES,
  RULE_PHRASES,
  TYPE_GOALS,
} from "./rulePhrases";
import { isSpaceGDeck } from "./spacegPlan";
import type { DecisionTrace } from "./trace";
import type { Decklist } from "./types";
import { isWranglerDeck } from "./wranglerPlan";

/**
 * #478 phase 2b (Nov 19): the Advisor's "Why" as a short story, built from the game and the rules'
 * plain phrases, with no AI: the deck's goal, the board, what the turn does and why, what it
 * doesn't do and why, and what the turn sets up. Every number comes from the engine; card names
 * only, no rule ids or card numbers.
 */
export interface StoryInput {
  /** The advised position (a determinization: only public facts and your own hand are read). */
  start: GameState;
  me: PlayerId;
  /** Your moves this turn, the pick first, each with the state it's made from (`plannedLine`). */
  line: readonly { action: Action; state: GameState }[];
  trace: DecisionTrace;
  own: Decklist | undefined;
  /** The legal moves at the advised position. */
  legal: readonly Action[];
}

/** Monster cards in a main deck at or above which a deck with no plan reads as an invasion deck. */
const INVASION_DECK_MONSTERS = 20;

const number = (n: number) => n.toLocaleString("en-US");

/** A list's monster deck holds every one of these. */
const monstersOf = (own: Decklist | undefined, numbers: string[]) => {
  const have = new Set(own?.monsterDeck.map((c) => c.deckCardNumber));
  return numbers.every((n) => have.has(n));
};

/**
 * The deck the story speaks for: a plan's deck, or a deck with a play guide but no plan (#478,
 * Nov 20 review), or `undefined`.
 */
export function deckOf(
  state: GameState,
  me: PlayerId,
  own: Decklist | undefined,
): string | undefined {
  const player = state.players.find((p) => p.id === me);
  if (isWranglerDeck(own)) return "Wrangler";
  if (isTanglerDeck(own)) return "Tangler";
  if (player && isMonsterXDeck(state, player)) return "Monster X";
  if (isSpaceGDeck(own)) return "SpaceG";
  if (isFestDeck(own)) return "Red Fest";
  if (monstersOf(own, ["EBP01-039", "EBP04-013"])) return "Bungler";
  if (own?.monsterDeck.some((c) => c.name.startsWith("Biollante")))
    return "Biollante Stundraw";
  if (
    own?.monsterDeck.some((c) => c.name.startsWith("King Ghidorah")) &&
    own.mainDeck.some((c) => c.name === "Mecha-King Ghidorah")
  )
    return "King Ghidorah";
  if (monstersOf(own, ["ESD01-001", "ESD01-002", "ESD01-003", "ESD01-004"]))
    return "Minus One starter";
  if (monstersOf(own, ["ESD02-001", "ESD02-002", "ESD02-003", "ESD02-004"]))
    return "Heisei starter";
  return undefined;
}

/** The deck's goal: its own sentence, or one by deck type for any other deck. */
export function deckGoal(
  state: GameState,
  me: PlayerId,
  own: Decklist | undefined,
): string {
  const deck = deckOf(state, me, own);
  if (deck && DECK_GOALS[deck]) return DECK_GOALS[deck];
  const monsters =
    own?.mainDeck.filter((c) => c.type === "Monster").length ?? 0;
  return monsters >= INVASION_DECK_MONSTERS
    ? TYPE_GOALS.invasion
    : TYPE_GOALS.counter;
}

/** A card's name, from an instance id anywhere it can be seen. */
function nameOf(state: GameState, instanceId: string): string {
  for (const p of state.players)
    for (const c of [
      ...p.hand,
      ...p.invadingMonsterZone,
      ...Object.values(p.zones).flat(2),
    ])
      if (c.instanceId === instanceId)
        return state.cards[c.cardId]?.name ?? "a card";
  return "a card";
}

/** One move of the turn in plain words, with a placement reason when its zone turns on its effect. */
function describe(state: GameState, action: Action): string | null {
  switch (action.type) {
    case "playBattle": {
      const name = nameOf(state, action.cardInstanceId);
      const player = state.players.find((p) => p.id === action.player);
      const card =
        state.cards[
          player?.hand.find((h) => h.instanceId === action.cardInstanceId)
            ?.cardId ?? -1
        ];
      const forEffect = boostedZones(card).includes(action.zone);
      return `plays ${name} into zone ${action.zone}${forEffect ? " for its effect there" : ""}`;
    }
    case "playMonster":
      return `stacks ${nameOf(state, action.cardInstanceId)} on its monster`;
    case "gainRage":
      return `discards ${nameOf(state, action.cardInstanceId)} for rage`;
    case "activateStrategy":
      return `uses ${nameOf(state, action.cardInstanceId)}`;
    case "invade":
      return `invades, paying with ${nameOf(state, action.cardInstanceId)}`;
    case "invadeFromDeck":
      return "invades from the deck";
    default:
      return null;
  }
}

/** "a, b and c". */
function list(items: string[]): string {
  if (items.length <= 1) return items[0] ?? "";
  return `${items.slice(0, -1).join(", ")} and ${items.at(-1)}`;
}

/** The phrase a rule gives for a move it pushed (`chose`) or one it held back (`leftOut`). */
function phrase(id: string, kind: "chose" | "leftOut"): string | undefined {
  return RULE_PHRASES[id]?.[kind];
}

/** The rules that pushed the pick: forced, favored or freed it. */
function rulesForPick(trace: DecisionTrace) {
  const pick = JSON.stringify(trace.pick);
  return trace.rules.filter(
    (r) =>
      ["forced", "favored", "freed"].includes(r.effect) &&
      r.actions.some((a) => JSON.stringify(a) === pick),
  );
}

/** The no-rule line (#478, Nov 19): the search picked the move on its own. */
export function noRuleLine(trace: DecisionTrace): string {
  const best = trace.alternatives[0]?.winRate;
  const odds =
    best === null || best === undefined
      ? ""
      : ` (${Math.round(best * 100)}% to win)`;
  return `No rule explains this move; the search picked it${odds}. If you disagree, your reason can become a rule.`;
}

/** The Why as a short story (about 5 sentences). */
export function adviceStory(input: StoryInput): string {
  const { start, me, line, trace, own, legal } = input;
  const sentences: string[] = [deckGoal(start, me, own)];
  const player = start.players.find((p) => p.id === me);
  const opponent = start.players.find((p) => p.id !== me);
  if (!player || !opponent) return sentences.join(" ");

  // The board: their monster, its zone and threat; your counter power.
  const theirs = opponent.invadingMonsterZone.at(-1);
  const theirName = theirs
    ? (start.cards[theirs.cardId]?.name ?? "their monster")
    : "their monster";
  const at = opponent.monsterPosition;
  if (at !== null)
    sentences.push(
      `Their ${theirName} is in zone ${at} with ${number(getThreat(start, opponent.id))} threat, and you have ${number(counterPowerOf(start, player))} counter power.`,
    );

  // What the turn does and why.
  const steps = line
    .map(({ action, state }) => describe(state, action))
    .filter((s): s is string => s !== null);
  const reasons = rulesForPick(trace)
    .map((r) => phrase(r.id, "chose"))
    .filter((s): s is string => !!s);
  let end: GameState | null = null;
  const last = line.at(-1);
  if (last)
    try {
      end = advanceToDecision(applyAction(last.state, last.action));
    } catch {
      end = null;
    }
  if (steps.length > 0) {
    let sentence = `It ${list(steps)}`;
    if (reasons.length > 0) sentence += `, because ${reasons[0]}`;
    sentences.push(`${sentence}.`);
  }
  // The counter is judged before the pass ends the turn (the next state is their turn).
  const settled = last?.action.type === "pass" ? last.state : end;
  if (settled) {
    const meEnd = settled.players.find((p) => p.id === me);
    const oppEnd = settled.players.find((p) => p.id !== me);
    if (meEnd && oppEnd && oppEnd.invadingMonsterZone.length > 0) {
      const power = counterPowerOf(settled, meEnd);
      const threat = getThreat(settled, oppEnd.id);
      const battles = line.filter((s) => s.action.type === "playBattle").length;
      sentences.push(
        power >= threat
          ? `That makes ${number(power)} counter power, enough to counter ${theirName} (threat ${number(threat)}).`
          : `That makes ${number(power)} counter power, not enough to counter ${theirName} (threat ${number(threat)})${battles > 0 ? `, but it puts ${battles === 1 ? "a battle card" : `${battles} battle cards`} on the board` : ""}.`,
      );
    }
  }

  // What it doesn't do and why: an invasion it could make but doesn't.
  const invasions = legal.filter(
    (a) => a.type === "invade" || a.type === "invadeFromDeck",
  );
  const invades = line.some(
    (s) => s.action.type === "invade" || s.action.type === "invadeFromDeck",
  );
  if (invasions.length > 0 && !invades) {
    const held = trace.rules.find(
      (r) =>
        (r.effect === "removed" || r.effect === "against") &&
        r.actions.some(
          (a) => a.type === "invade" || a.type === "invadeFromDeck",
        ),
    );
    const why = held ? phrase(held.id, "leftOut") : undefined;
    // With no rule holding it back, the plan's general stance, marked as such (Nov 20 review).
    const stance = DECK_STANCES[deckOf(start, me, own) ?? ""];
    sentences.push(
      why
        ? `It doesn't invade because ${why}.`
        : `It doesn't invade: the search scored its other moves higher.${stance ? ` In general, ${stance}.` : ""}`,
    );
  }

  // What the turn sets up: the end phase's draw.
  if (last?.action.type === "pass") {
    const before =
      last.state.players.find((p) => p.id === me)?.hand.length ?? 0;
    const draws = Math.max(0, END_PHASE_HAND_SIZE - before);
    if (draws > 0)
      sentences.push(
        `It ends the turn with ${before === 1 ? "1 card" : `${before} cards`} in hand, so it draws ${draws} at the end of the turn.`,
      );
  }

  if (rulesForPick(trace).length === 0) sentences.push(noRuleLine(trace));
  return sentences.join(" ");
}
