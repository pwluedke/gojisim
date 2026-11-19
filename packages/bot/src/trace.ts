import type { Action } from "@gojisim/engine";
import { SWITCHES } from "./switches";

/**
 * #478 (R-48, Bot Advisor, phase 1): a decision's trace. The bot's rules report into an optional
 * sink while it decides; they never read it, and nothing here touches the random numbers, so a
 * traced decision is the same as an untraced one (a test plays seeded games both ways).
 *
 * Rule ids are the ones the play guides use: `card rule N` (the guides' "Rules for every deck",
 * numbered as in `cardRules.ts`), `<deck> plan <N>` (each plan's own list; the guides list them as
 * bullets, so their sentences name the bullet), and `play rule N` for Paul's play rules
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
    "A line of Slick's Red Fest plan (`festPlan`), as in the Red Fest guide.",
  ],
  ["Wrangler plan v1", "A line of the first Wrangler plan (`wranglerV2` off)."],
  [
    "Wrangler plan",
    "A line of the Wrangler plan (v2), as in the Wrangler guide.",
  ],
  [
    "Monster X plan",
    "Paul's Monster X plan (`mxPlan`): the moves its line wants get a head start.",
  ],
  [
    "Constructed Future plan",
    "Paul's Constructed Future rules (`cfPlan`, `cfTarget`): it's played only for a target.",
  ],
  [
    "Final Wars ruling",
    "Paul's Final Wars ruling: its picks go for the highest total counter power.",
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
    "Stack a same-rank monster card when a card wants a stack size it doesn't have yet.",
  "play rule 2":
    "Hold one monster card per rank that can still be played on top for its ability: it isn't paid for rage, an invasion or a discard cost while another card can pay.",
  "play rule 3":
    "Discard every other monster card for rage: no pass while one can go.",
  "play rule 4":
    "A counter-only strategy is held until the counter is made, then preferred; while the turn's invasion is legal, it waits for it.",
  "play rule 5":
    "A same-column battle card goes in the opponent's monster's column.",
  "play rule 6":
    "A zone-boosted battle card goes in its zone, never away from an open zone 8 the opponent can reach next turn.",
  "play rule #195":
    "When the opponent's card offers to counter its own monster for a discard, pay with the cheapest card (one with no play now) rather than decline.",
  "card rule 1":
    "A monster card that loses with no card in your strategy zones is played only when you'll have a strategy card in play.",
  "card rule 2":
    "In your zone 8 (or 6 or 7) with their zone 8 blocked, when a play this turn can clear it for a winning invasion, clear it first: no invading into the blocker, no passing.",
  "card rule 3":
    "A card that works in the opponent's monster's column goes in that column when it can, else in zone 1 or 2.",
  "card rule 4":
    "A card that plays itself back from the discard pile comes back whenever there's an empty zone, and a destroy leaves their recurring cards for last.",
  "card rule 5":
    "A counter-only strategy is played only when it's needed: not while the counter is made without it, and not when even with it the counter isn't made.",
  "card rule 6":
    "A slow counter deck doesn't invade unless the invasion wins the game now.",
  "card rule 7":
    "With your zone 8 open and their monster in reach, a play that puts a battle card in your zone 8 is taken; a way to make the counter outranks it.",
  "card rule 8":
    "A battle card whose ability works only in some zones is played in one of them when it can be.",
  "card rule 9":
    "With their monster in reach of your zone 8 and the counter not made, the plays that start a way to make it this turn are freed from Paul's holds.",
  "card rule 10":
    "A play that advances the opponent's monster is made only when you can still make the counter this turn or have your zone 8 blocked.",
  "card rule 12":
    "An Evolution doesn't pick a card no stronger than the one it stacks on while a stronger one is there.",
  "card rule 13":
    "A battle card whose [enter] needs Awakening waits while an invasion this turn can take your monster there: invade first.",
  "card rule 14":
    "No rage discards on turns 1-2 unless the rage is on a way to the counter or a zone 8 block.",
  "card rule 15":
    "A monster card whose ability fires on reaching a zone isn't stacked on a turn your monster can't reach that zone.",
  "card rule 16":
    "At a choose one, a mode that changes nothing isn't picked while another mode does something.",
  "card rule 17":
    "A [revenge] card goes where it gets destroyed (ahead of your own monster, never zone 8), and isn't paid for an invasion while another card can pay.",
  "card rule 18":
    "At a choose one, a mode that makes the opponent discard beats one that only mills your own deck.",
  "card rule 19":
    "A strategy whose only abilities are statuses on a monster isn't activated while each is already in force.",
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
