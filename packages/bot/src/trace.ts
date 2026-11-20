import type { Action } from "@gojisim/engine";
import { SWITCHES } from "./switches";

/**
 * #478 (R-48, Bot Advisor, phase 1): a decision's trace. The bot's rules report into an optional
 * sink while it decides; they never read it, and nothing here touches the random numbers, so a
 * traced decision is the same as an untraced one (a test plays seeded games both ways).
 *
 * Rule ids are the ones the play guides use: `card rule N` (the guides' "Rules for every deck",
 * numbered as in `cardRules.ts`), `<deck> plan <N>` (each plan's own list; the guides list them as
 * bullets, so their sentences name the bullet), and `play rule N` for the play rules
 * (`rules.ts`), whose numbers would collide with the card rules'.
 */

/** The sink the plans report into while one runs at a traced decision's root (`withTrace`). */
let active: TraceSink | undefined;

/** What a rule did to the moves it names. */
export type RuleEffect =
  /** Left out: the search never picks them while another move remains. */
  | "removed"
  /** The only moves left: every other one is removed. */
  | "forced"
  /** Given a head start in the search (a plan's preference, or a play rule's bonus). */
  | "favored"
  /** Freed from another rule's hold. */
  | "freed"
  /** A plan argues against it: the plan's other moves get a head start in the search. */
  | "against";

export interface RuleNote {
  id: string;
  effect: RuleEffect;
  actions: Action[];
}

/** Where the rules report. Only the decision's root is reported (the first determinization). */
export interface TraceSink {
  rule(id: string, effect: RuleEffect, actions: Iterable<Action>): void;
}

/** A sink that keeps every note that names at least one move, in the order they came. */
export function traceSink(): TraceSink & { notes: RuleNote[] } {
  const notes: RuleNote[] = [];
  return {
    notes,
    rule(id, effect, actions) {
      const list = [...actions];
      if (list.length > 0) notes.push({ id, effect, actions: list });
    },
  };
}

/** Runs `fn` (a plan's verdict) with `sink` active, so its `mark` calls report. */
export function withTrace<T>(sink: TraceSink | undefined, fn: () => T): T {
  const before = active;
  active = sink;
  try {
    return fn();
  } finally {
    active = before;
  }
}

/** A plan's `set.add(action)`, reported under its rule's id while a trace is active. */
export function mark(
  set: Set<Action>,
  action: Action,
  id: string,
  effect: RuleEffect,
): void {
  set.add(action);
  active?.rule(id, effect, [action]);
}

/**
 * One alternative at the root: its visits and its win estimate for the bot, from 0 (a sure loss)
 * to 1 (a sure win): the search's mean value, which is in [-1, 1], moved to [0, 1].
 */
export interface Alternative {
  action: Action;
  visits: number;
  winRate: number | null;
}

/** A decision, explained. */
export interface DecisionTrace {
  pick: Action;
  /** A blunder roll picks without a search (#132): no alternatives then. */
  blundered: boolean;
  /** The most-visited moves, the pick among them, best first (at most 3). */
  alternatives: Alternative[];
  rules: (RuleNote & RuleInfo)[];
}

export interface RuleInfo {
  /** One plain sentence. */
  text: string;
  /** The switch that turns it off, when it has one (`SWITCHES.md`). */
  switch?: string;
}

/** The switch behind each rule id that has one. */
const RULE_SWITCH: Record<string, string> = {
  "card rule 20": "counterAlways",
  "card rule 21": "ownPath",
  "card rule 22": "targetCheck",
  "card rule 22b": "targetAll",
  "card rule 23": "ownCover",
  "card rule 23b": "coverToken",
  "card rule 33": "landingZone8",
  "card rule 34": "landingIntoCounter",
  "card rule 24": "recurDiscard",
  "card rule 25": "ownBehind",
  "card rule 26": "activeInvading",
  "card rule 27": "keepStrategy",
  "card rule 28": "keepLowRank",
  "card rule 29": "tanglerEarly",
  "card rule 30": "modeBest",
  "Tangler plan 1": "tanglerFear",
  "Tangler plan 3": "tanglerDiscard",
  "Tangler plan 5": "tanglerStop",
  "Tangler plan 6a": "tanglerSave",
  "Tangler plan 6b": "tanglerSave",
  "Tangler plan 7a": "tanglerHighRank",
  "Tangler plan 7b": "tanglerZoneFive",
  "Tangler plan 7c": "tanglerGigan",
  "SpaceG plan 1": "spacegInvade",
  "SpaceG plan 2": "spacegRage",
  "SpaceG plan 3": "spacegCover",
  "SpaceG plan 4": "spacegZone",
  "No-plan play 1": "noPlanUse",
  "No-plan play 2": "noPlanInvade",
  "Wrangler plan v2.1": "wranglerV21",
  "Wrangler plan v2.2": "wranglerV22",
  "Wrangler plan v2.3": "wranglerV23",
};

/** A plan's own sentence for ids without a switch of their own, by id prefix. */
const PLAN_TEXT: [prefix: string, text: string][] = [
  [
    "Red Fest plan",
    "A rule of the Red Fest plan (`festPlan`), as written in the Red Fest play guide.",
  ],
  [
    "Wrangler plan v1",
    "A rule of the first Wrangler plan (used when `wranglerV2` is off).",
  ],
  [
    "Wrangler plan",
    "A rule of the Wrangler plan (version 2), as written in the Wrangler play guide.",
  ],
  [
    "Monster X plan",
    "The Monster X plan (`mxPlan`): the moves its rules want get a head start in the search.",
  ],
  [
    "Constructed Future plan",
    "The Constructed Future rules (`cfPlan`, `cfTarget`): Constructed Future is played only when it has a target to bring back.",
  ],
  [
    "Final Wars ruling",
    "The Final Wars ruling: Godzilla Final Wars puts the revealed cards where they give the highest total counter power.",
  ],
];

/** Reports straight into the active sink (for a plan whose moves aren't added one by one). */
export function report(
  id: string,
  effect: RuleEffect,
  actions: Iterable<Action>,
): void {
  active?.rule(id, effect, actions);
}

/** Sentences for the rules without a switch (the others use their switch's `what`). */
const RULE_TEXT: Record<string, string> = {
  "play rule 1":
    "Play a same-rank monster card on top of your monster when one of your cards wants a bigger stack than it has now (8.5.1).",
  "play rule 2":
    "Keep in your hand one monster card of each rank that can still be played on top of your monster for its ability: don't discard it for rage, pay for an invasion with it, or pay a discard cost with it while another card can pay.",
  "play rule 3":
    "Discard for rage every monster card that play rule 2 doesn't keep, and don't end the turn while a monster card in your hand can still be discarded for rage.",
  "play rule 4":
    "Hold a strategy card that only adds counter power until it gives you enough counter power to counter the opponent's monster, then prefer playing it. While this turn's invasion can still be made, wait for the invasion first.",
  "play rule 5":
    "Play a battle card that works in the same column as the opponent's monster into that monster's column.",
  "play rule 6":
    "Play a battle card that gets a boost in a certain zone into that zone, but never away from an empty zone 8 of yours that the opponent's monster can reach next turn.",
  "play rule #195":
    "When the opponent's card offers to counter its own monster in exchange for a discard, pay with your cheapest card (one you can't play now) instead of declining.",
  "card rule 1":
    "Play a monster card that loses the game when your strategy zones are empty only when you will have a strategy card in play.",
  "card rule 2":
    "When your monster is in zone 8 (or in zone 6 or 7), the opponent's zone 8 is blocked, and a play this turn can clear the blocker so that an invasion wins, clear it first: don't invade into the blocker and don't end the turn.",
  "card rule 3":
    "Play a card that works in the column of the opponent's monster into that column when you can, otherwise into zone 1 or 2.",
  "card rule 4":
    "A card that plays itself back from the discard pile always comes back when there is an empty zone, and when you destroy the opponent's cards, leave their cards that come back like that for last.",
  "card rule 5":
    "Play a strategy card that only adds counter power only when it's needed: not while you already have enough counter power to counter the opponent's monster without it, and not when you still don't have enough even with it.",
  "card rule 6":
    "A slow counter deck (one with few monster cards in its main deck) doesn't invade unless the invasion wins the game now.",
  "card rule 7":
    "When your zone 8 is empty and the opponent's monster can reach it, take a play that puts a battle card in your zone 8 to block their invasion; a play that gives you enough counter power to counter the opponent's monster this turn comes before it.",
  "card rule 8":
    "Play a battle card whose ability works only in some zones into one of those zones when you can.",
  "card rule 9":
    "When the opponent's monster can reach your zone 8 and you don't yet have enough counter power to counter the opponent's monster, the plays that start a way to get it this turn are freed from play rule 2, which keeps monster cards in hand.",
  "card rule 10":
    "Make a play that moves the opponent's monster forward only when you can still counter it this turn or your zone 8 is blocked.",
  "card rule 12":
    "An Evolution doesn't pick a card that is no stronger than the card it stacks on while a stronger one is there.",
  "card rule 13":
    "A battle card whose [enter] ability needs Awakening waits while an invasion this turn can take your monster to the zone it needs: invade first, then play it.",
  "card rule 14":
    "Don't discard for rage on turns 1 and 2 unless that rage is part of a way to counter the opponent's monster or to block your zone 8.",
  "card rule 15":
    "Don't play a monster card on top of your monster when its ability fires on reaching a zone that your monster can't reach this turn.",
  "card rule 16":
    "When a card says to choose one, don't pick a mode that changes nothing while another mode does something.",
  "card rule 17":
    "Play a [revenge] card where it will get destroyed (ahead of your own monster, but never in zone 8), and don't pay for an invasion with it while another card can pay.",
  "card rule 18":
    "When a card says to choose one, a mode that makes the opponent discard beats one that only mills your own deck (sends its top cards to the discard pile).",
  "card rule 19":
    "Don't activate a strategy card whose only abilities are statuses on a monster while each of those statuses is already in force.",
};

/** A rule's sentence and switch. */
export function ruleInfo(id: string): RuleInfo {
  const name = RULE_SWITCH[id];
  const sw = name ? SWITCHES.find((s) => s.name === name) : undefined;
  const text =
    sw?.what ??
    RULE_TEXT[id] ??
    PLAN_TEXT.find(([prefix]) => id.startsWith(prefix))?.[1] ??
    id;
  return { text, ...(name ? { switch: name } : {}) };
}
