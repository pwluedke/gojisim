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

/** What a rule did to the moves it names. */
export type RuleEffect =
  /** Left out: the search never picks them while another move remains. */
  | "removed"
  /** The only moves left: every other one is removed. */
  | "forced"
  /** Given a head start in the search (a plan's preference, or a play rule's bonus). */
  | "favored"
  /** Freed from another rule's hold. */
  | "freed";

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
};

/** Sentences for the rules without a switch (the others use their switch's `what`). */
const RULE_TEXT: Record<string, string> = {
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
  const text = sw?.what ?? RULE_TEXT[id] ?? id;
  return { text, ...(name ? { switch: name } : {}) };
}
