import { type Card, getCardText } from "@gojisim/cards";
import { getAllCards } from "@gojisim/cards/test-decks";

/** Survey categories (M4a task). */
export const CATEGORIES = [
  "keyword",
  "trigger",
  "condition",
  "effect",
  "targeting",
  "cost",
  "scaling",
  "duration",
] as const;
export type Category = (typeof CATEGORIES)[number];

export type ParamValue = string | number | boolean | string[];
export type Params = Record<string, ParamValue>;

/** One recognized piece of an ability. */
export interface Part {
  category: Category;
  /** Pattern id, e.g. "destroy" or "phase begins". */
  pattern: string;
  /** The matched text, lowercased and normalized. */
  text: string;
  params?: Params;
}

/** One ability: a line of card text plus its bullet options and reminder lines. */
export interface Ability {
  text: string;
  parts: Part[];
}

export interface CardSurvey {
  /** Parenthesized rules clarifications on the card (not standard keyword reminders). */
  clarifications: string[];
  id: number;
  deckCardNumber: string;
  name: string;
  type: Card["type"];
  set: string;
  starter: boolean;
  hasErrata: boolean;
  abilities: Ability[];
  /** Clauses and reminder text no pattern recognized, quoted exactly. */
  unclassified: string[];
}

export const STARTER_SETS = ["ESD01", "ESD02"];

/** Every distinct card: one per `deckCardNumber`, its base print (lowest id). */
function distinctCards(): Card[] {
  const byNumber = new Map<string, Card>();
  const base = getAllCards()
    .filter((c) => c.parentId === null)
    .sort((a, b) => a.id - b.id);
  for (const card of base)
    if (!byNumber.has(card.deckCardNumber))
      byNumber.set(card.deckCardNumber, card);
  return [...byNumber.values()].sort((a, b) =>
    a.deckCardNumber.localeCompare(b.deckCardNumber),
  );
}

/** Cards the survey covers: no Rage cards (3.4.2.1, game aids) and no Tokens (reported apart). */
export function inScopeCards(): Card[] {
  return distinctCards().filter((c) => c.type !== "Rage" && c.type !== "Token");
}

/** Token cards, which effects create (9.1). */
export function tokenCards(): Card[] {
  return distinctCards().filter((c) => c.type === "Token");
}

// ---------------------------------------------------------------------------------------------
// Text handling

/** Lowercase, straight quotes, single spaces. */
export function normalize(text: string): string {
  return text
    .replace(/[‘’]/g, "'")
    .replace(/[“”]/g, '"')
    .replace(/\s+/g, " ")
    .trim()
    .toLowerCase();
}

/** Splits card text into abilities: bullet lines and standalone reminder lines join the line above. */
export function splitAbilities(text: string): string[] {
  const abilities: string[] = [];
  for (const raw of text.split("\n")) {
    const line = raw.trim();
    if (line === "") continue;
    const joins = /^[●(]/.test(line) && abilities.length > 0;
    if (joins) abilities[abilities.length - 1] += `\n${line}`;
    else abilities.push(line);
  }
  return abilities;
}

/** Parenthesized text (reminders and clarifications), and the text with it removed. */
function splitParentheses(text: string): { body: string; notes: string[] } {
  const notes: string[] = [];
  let body = "";
  let depth = 0;
  let current = "";
  let bracket = 0;
  let quoted = false;
  for (const ch of text) {
    if (ch === "[") bracket++;
    if (ch === "]" && bracket > 0) bracket--;
    if (/["\u201c\u201d]/.test(ch) && depth === 0) quoted = !quoted;
    if ((bracket > 0 || quoted) && depth === 0) {
      body += ch;
      continue;
    }
    if (ch === "(") {
      if (depth === 0) current = "";
      else current += ch;
      depth++;
    } else if (ch === ")" && depth > 0) {
      depth--;
      if (depth === 0) notes.push(current.trim());
      else current += ch;
    } else if (depth > 0) current += ch;
    else body += ch;
  }
  if (depth > 0) notes.push(current.trim());
  return { body, notes };
}

/** Clauses: sentences, semicolon parts and bullet options. */
function clauses(body: string): string[] {
  return (
    body
      // Keep "[Godzilla vs. Destoroyah]" in one sentence: hide its dots from the split.
      .replace(/\[[^\]]*\]/g, (m) => m.replace(/\./g, "\u2024"))
      .split(/\n|(?<=\.)\s+|;|(?<=:)\s*(?=●)/)
      .map((c) =>
        c
          .replace(/\u2024/g, ".")
          .replace(/^[●\s]+/, "")
          .trim(),
      )
      .filter((c) => /[a-z]/i.test(c))
  );
}

// ---------------------------------------------------------------------------------------------
// Parameters

const NUMBER = String.raw`\d[\d,]*`;
const ROMAN: Record<string, number> = { i: 1, ii: 2, iii: 3, iv: 4 };

function num(text: string | undefined): number | undefined {
  if (text === undefined) return undefined;
  const roman = ROMAN[text];
  if (roman !== undefined) return roman;
  if (text === "a" || text === "one") return 1;
  const n = Number(text.replace(/,/g, ""));
  return Number.isNaN(n) ? undefined : n;
}

/** Bracketed words that are keywords or icons, not traits or names. */
const KEYWORD_TOKENS =
  /^(enter|invading|revenge|resonance|base|your-turn|opponents?-turn|rage|destroy|burst(-\d)?|evolution(-\d)?|awakening-\d|invade-\d)$/;

function set(params: Params, key: string, value: ParamValue | undefined) {
  if (value !== undefined && value !== "") params[key] = value;
}

/** Card filters and targets found in a noun phrase. */
export function filters(phrase: string): Params {
  const p: Params = {};
  if (/\b(each player'?s?|both players|any monster card)\b/.test(phrase))
    p["player"] = "each";
  else if (
    /\b(your opponent'?s?|the opponent'?s|opponent'?s|their)\b/.test(phrase)
  )
    p["player"] = "opponent";
  else if (/\byour\b/.test(phrase)) p["player"] = "you";

  // The first count word, skipping numbers that are ranks, zones or amounts.
  const count =
    /(?<!rank |zones? |zones? \d-|\+|-)\b(all|any number of|up to (\d+)|(\d+)|a|one)\b(?![,\d])(?! or (?:more|fewer|lower|higher|less))/.exec(
      phrase,
    );
  if (count) {
    const [, word, upTo, n] = count;
    if (word === "all") p["count"] = "all";
    else if (word === "any number of") p["count"] = "any number";
    else if (upTo !== undefined) p["count"] = `up to ${upTo}`;
    else set(p, "count", num(n ?? word));
  }
  const type = /\b(battle|strategy|monster) (?:cards?|token)\b/.exec(phrase);
  set(p, "cardType", type?.[1]);
  if (/\bthis card\b/.test(phrase) && !type) p["target"] = "this card";

  const rankMax = new RegExp(
    String.raw`rank (\d+|i{1,3}|iv) or (?:lower|less)`,
  ).exec(phrase);
  set(p, "rankMax", num(rankMax?.[1]));
  const rankMin = /rank (\d+|i{1,3}|iv) or (?:higher|more)/.exec(phrase);
  set(p, "rankMin", num(rankMin?.[1]));
  if (/rank equal to or lower than/.test(phrase)) p["rankMax"] = "relative";
  const rankExact = /\brank (\d+|i{1,3}|iv)\b(?! or)/.exec(phrase);
  if (!rankMax && !rankMin) set(p, "rank", num(rankExact?.[1]));

  const cp = new RegExp(`(${NUMBER}) or (?:lower|less) counter power`).exec(
    phrase,
  );
  set(p, "counterPowerMax", num(cp?.[1]));
  const threat = new RegExp(`(${NUMBER}) or (?:lower|less) threat level`).exec(
    phrase,
  );
  set(p, "threatMax", num(threat?.[1]));

  const traits = [...phrase.matchAll(/\[([^\]]+)\]/g)]
    .map((m) => m[1] ?? "")
    .filter((t) => !KEYWORD_TOKENS.test(t) && !/named \[/.test(phrase));
  if (traits.length > 0) p["traits"] = traits;
  const keywordFilters = [
    ...phrase.matchAll(/with \[(evolution|burst|base|invade-\d)\]/g),
  ].map((m) => m[1] ?? "");
  if (keywordFilters.length > 0) p["hasKeyword"] = keywordFilters;
  const name = /named "?\[?([^"\]]+?)["\]]|card named "([^"]+)"|"([^"]+)"/.exec(
    phrase,
  );
  set(p, "name", name?.[1] ?? name?.[2] ?? name?.[3]);
  const colors = [...phrase.matchAll(/\b(non-)?(red|blue|green|white)\b/g)].map(
    (m) => `${m[1] ?? ""}${m[2] ?? ""}`,
  );
  if (colors.length > 0) p["colors"] = colors;
  if (/\bother\b/.test(phrase)) p["other"] = true;

  const range = /zones? (\d) ?[-–] ?(\d)/.exec(phrase);
  const single = /\bzone (\d)\b/.exec(phrase);
  const column = /same column as ([a-z' ]+?)(?:,|$| and| if| to )/.exec(phrase);
  const adjacent = /adjacent to ([a-z' ]+?)(?:,|$| and| if| to )/.exec(phrase);
  if (range) p["zones"] = `${range[1]}-${range[2]}`;
  else if (single) p["zones"] = single[1] ?? "";
  if (/\bthat zone and zones adjacent\b/.test(phrase))
    p["zones"] = "chosen zone and adjacent";
  else if (column) p["zones"] = `same column as ${column[1]}`;
  else if (adjacent) p["zones"] = `adjacent to ${adjacent[1]}`;

  const from =
    /from (?:your |their )?(discard pile|deck|hand|monster deck|strategy zone|among them)/.exec(
      phrase,
    );
  set(p, "from", from?.[1]);
  return p;
}

// ---------------------------------------------------------------------------------------------
// Patterns

interface Pattern {
  category: Category;
  id: string;
  re: RegExp;
  params?: (m: RegExpExecArray, clause: string) => Params;
  /** Return false to skip a match (for lookbehind-style exclusions). */
  accept?: (m: RegExpExecArray, clause: string) => boolean;
}

const before = (m: RegExpExecArray, clause: string, n = 30) =>
  clause.slice(Math.max(0, m.index - n), m.index);

/** Who a "gains +N" applies to: the noun phrase just before the match. */
function subject(m: RegExpExecArray, clause: string): Params {
  const phrase = (
    clause
      .slice(0, m.index)
      .split(/,|\.|;/)
      .pop() ?? ""
  ).trim();
  const p = filters(phrase);
  if (/^(this card|this)\b/.test(phrase) || phrase === "")
    return { appliesTo: "this card" };
  return { appliesTo: phrase, ...p };
}

const TRIGGERS: Pattern[] = [
  {
    category: "trigger",
    id: "played (a card is played)",
    re: /when(?:ever)? (?:you play an? (monster|battle) card|your monster card is played|your opponent plays a battle card from their deck)/g,
    params: (m) => ({ cardType: m[1] ?? "monster" }),
  },
  {
    category: "trigger",
    id: "invades",
    re: /when(?:ever)? (your monster card|your opponent's monster card|any monster card|this card) invades(?: into)?(?: zones? (\d-\d))?( this turn)?(?: with \[invade-\d\])?/g,
    params: (m) => ({
      who: m[1] ?? "",
      ...(m[2] ? { zones: m[2] } : {}),
      ...(m[3] ? { lasts: "this turn" } : {}),
    }),
  },
  {
    category: "trigger",
    id: "advances",
    re: /when(?:ever)? this card (?:advances(?: into the same column as your opponent's monster card| during the end phase)?|reaches zone (\d))/g,
    params: (m) => (m[1] ? { zone: Number(m[1]) } : {}),
  },
  {
    category: "trigger",
    id: "countered / counters",
    re: /when you successfully counter your opponent's monster card|when this card is countered/g,
  },
  {
    category: "trigger",
    id: "destroyed",
    re: /when(?:ever)? (?:this card (?:would be|is) \[destroy\](?: by an opponent's effect)?|(?:an opponent's|one of your) [^,]*?battle cards?[^,]*? is \[destroy\])/g,
  },
  {
    category: "trigger",
    id: "discarded / sent to discard pile",
    re: /when(?:ever)? (?:this card is discarded[^,]*|you discard this card from your hand for your monster card's invasion|you discard a battle card from your hand|your opponent's effect causes you to discard[^,]*|your card is sent from a strategy zone to the discard pile|this card is sent from the strategy zone to your discard pile|your strategy cards would be discarded from the strategy zone)/g,
  },
  {
    category: "trigger",
    id: "rage changes",
    re: /when(?:ever)? (?:(this card's|your monster card's|your opponent's) \[rage\] is (increased|reduced)|you would set this card's \[rage\] to 0[^,]*)/g,
    params: (m) => ({
      whose: m[1] ?? "this card's",
      change: m[2] ?? "set to 0",
    }),
  },
  {
    category: "trigger",
    id: "phase begins",
    re: /at the (?:beginning|start) of (your |the |that turn's |your next )?(start|main|counter|end) phase/g,
    params: (m) => ({
      phase: m[2] ?? "",
      turn: (m[1] ?? "").trim() === "the" ? "either" : "yours",
    }),
  },
  {
    category: "trigger",
    id: "leaves its zone or moves",
    re: /if either this card or that token leave their zone or move/g,
  },
  {
    category: "trigger",
    id: "game starts",
    re: /at the start of the game/g,
  },
  {
    category: "trigger",
    id: "opponent returns a card from discard",
    re: /whenever your opponent returns a card from their discard pile/g,
  },
  {
    category: "trigger",
    id: "card placed under (Nth card)",
    re: /when you place the (\d+)(?:st|nd|rd|th) card/g,
    params: (m) => ({ nth: Number(m[1]) }),
  },
];

const CONDITIONS: Pattern[] = [
  {
    category: "condition",
    id: "rage threshold",
    re: /(?:this card|your monster card|your opponent|they) ha(?:s|ve) (\d+) or (more|fewer) \[rage\]|your opponent's \[rage\] is 0/g,
    params: (m) =>
      m[1]
        ? { rage: `${m[2] === "more" ? ">=" : "<="} ${m[1]}` }
        : { rage: "= 0" },
  },
  {
    category: "condition",
    id: "this card's zone",
    re: /(?:if|and) this(?: card)? is in (zone (\d)|zones (\d-\d)|a zone adjacent to your monster card|the same column as (?:your |the )?opponent'?s [a-z ]*?monster card|a zone with the same number as [a-z' ]+)/g,
    params: (m) => ({ zone: m[1] ?? "" }),
  },
  {
    category: "condition",
    id: "monster card's zone",
    re: /(your opponent's|the opponent's|your|their) monster card (?:is in|occupies) (zones? \d(?:-\d)?|1 of these zones)/g,
    params: (m) => ({ whose: m[1] ?? "", zone: m[2] ?? "" }),
  },
  {
    category: "condition",
    id: "zone comparison (this card vs opponent's monster)",
    re: /the number of the zone this card (?:is in|occupies) is (?:equal to or greater than|greater than or equal to)/g,
  },
  {
    category: "condition",
    id: "monster card's rank",
    re: /monster card is rank (i{1,3}|iv) or (higher|lower)/g,
    params: (m) => ({ rank: `${m[2] === "higher" ? ">=" : "<="} ${m[1]}` }),
  },
  {
    category: "condition",
    id: "cards in zones (count, trait or name)",
    re: /(?:you have|there (?:are|is)|if|your opponent has|your opponent's zones have) (?:(\d+) or (?:more|fewer)|a|an|any|at least 1|no|"[^"]+") ?[^.;,]*?(?:in (?:your|their|your opponent's) zones|is in your zones|in the same column as this card)|the number of other [^.;,]*? in your zones is (\d+) or more|your opponent has (\d+) or more unoccupied zones/g,
  },
  {
    category: "condition",
    id: "cards in discard pile (count)",
    re: /(?:have|has|is) (?:(\d+) or more|a|an) [^.;,]*?in your discard pile|for every (\d+) [^.;,]*? in your discard pile/g,
  },
  {
    category: "condition",
    id: "cards under a card",
    re: /there (?:are|is) (?:(\d+) or more|no|an?) [^.;,]*?under (?:this|your monster) card|if there are (\d+) or more,/g,
  },
  {
    category: "condition",
    id: "cards in play (strategy zone)",
    re: /(?:have|has) (?:a|an|any|no|(\d+) or (?:more|fewer)|at least \d) [^.;,]*?in play/g,
  },
  {
    category: "condition",
    id: "how this card was played",
    re: /if this card was played (from your hand|through evolution)/g,
    params: (m) => ({ how: m[1] ?? "" }),
  },
  {
    category: "condition",
    id: "event this turn",
    re: /(?:this card|your monster card) invaded this turn|an opponent's battle card was \[destroy\] this turn|you discarded a [^.;,]*? for this card's invade action/g,
  },
  {
    category: "condition",
    id: "revealed or sent card is X",
    re: /if you added [^,]*|if (?:it|the revealed card) is (?:not )?(?:a |an )?[a-z ]*?(?:card|blue)\b|if (?:it is not blue)|if a (?:card with \[invade-2\]|\[godzilla\] card|battle card) (?:is|was) (?:revealed|sent|discarded)[^.;,]*|if they differ in at least 1 trait/g,
  },
  {
    category: "condition",
    id: "if you do (paid an optional action)",
    re: /if (?:you|they) do(?: so)?\b|if they discard at least 1 card/g,
  },
  {
    category: "condition",
    id: "colors among cards",
    re: /(\d+) or more (?:different )?colors|at least 1 red battle card and at least 1 blue battle card/g,
  },
  {
    category: "condition",
    id: "branch on a number",
    re: /perform the following action based on how many [^:]*/g,
  },
  {
    category: "condition",
    id: "otherwise / if not",
    re: /\botherwise\b|if you do not\b|if it is not\b/g,
  },
  {
    category: "condition",
    id: "while (state lasts)",
    re: /\bwhile (?!this card is in the strategy zone)[^,]+/g,
  },
  {
    category: "condition",
    id: "playing this card (from hand / on top of)",
    re: /when playing this card from your hand|if you would play this card on top of [^,]+/g,
  },
];

const EFFECTS: Pattern[] = [
  {
    category: "effect",
    id: "draw",
    re: /\bdraws? (\d+) cards?/g,
    accept: (m, c) => !/cannot $/.test(before(m, c)),
    params: (m) => ({ count: Number(m[1]) }),
  },
  {
    category: "effect",
    id: "discard down to N",
    re: /(your opponent may |your opponent |each player |they )?discards? cards until (?:they|you) have (\d+) cards? remaining/g,
    params: (m) => ({
      player: (m[1] ?? "").includes("each") ? "each" : "opponent",
      ...((m[1] ?? "").includes("may") ? { optional: true } : {}),
      handSize: Number(m[2]),
    }),
  },
  {
    category: "effect",
    id: "discard whole hand",
    re: /discards? (?:your entire hand|your hand|all (?:of )?the cards in your hand|all cards in your hand|their entire hand)/g,
    params: (m) => ({ player: m[0].includes("their") ? "opponent" : "you" }),
  },
  {
    category: "effect",
    id: "discard N from hand",
    re: /\bdiscards? (?:up to )?(\d+|a|one) (?!card from the top)([^.;:]*?\bcards?\b(?:[^.;:]*?from (?:your|their) hand)?(?: with both [^.;:,]*)?)/g,
    params: (m) => ({ ...filters(m[2] ?? ""), count: num(m[1]) ?? 1 }),
  },
  {
    category: "effect",
    id: "mill (top of deck to discard pile)",
    re: /(?:send|discard)s? the top (?:(\d+) )?cards? of (?:your|the) deck(?: (?:to|into) your discard pile)?|and send (?:them|it) (?:to|into) (?:your|the) discard pile/g,
    params: (m) => (m[1] ? { count: Number(m[1]) } : {}),
  },
  {
    category: "effect",
    id: "send the rest to discard pile",
    re: /send the rest (?:to|into) (?:your |the )?discard pile|send them to the discard pile|discarding the remaining cards/g,
  },
  {
    category: "effect",
    id: "reveal top of deck",
    re: /reveal (?:from )?the top (?:(\d+) cards|card)?(?: of your deck)?(?: a number of cards equal to [^.;,]*)?/g,
    params: (m) => ({
      count: m[1] ? Number(m[1]) : m[0].includes("equal") ? "variable" : 1,
    }),
  },
  {
    category: "effect",
    id: "look at top of deck",
    re: /look at the top (?:(\d+) )?cards? of your deck/g,
    params: (m) => ({ count: m[1] ? Number(m[1]) : 1 }),
  },
  {
    category: "effect",
    id: "reorder top of deck",
    re: /put any number(?: of them)? on top of your deck in any order|place it back on top of your deck/g,
  },
  {
    category: "effect",
    id: "search deck",
    re: /search (?:your|the) deck for ([^.;]*)/g,
    params: (m) => filters(m[1] ?? ""),
  },
  {
    category: "effect",
    id: "add to hand (from revealed/searched)",
    re: /\badd ([^.;]*?)to your hand/g,
    params: (m) => filters(m[1] ?? ""),
  },
  {
    category: "effect",
    id: "return from discard pile to hand",
    re: /return ([^.;]*?)from (?:your|their) discard pile (?:to|from) (?:your|their) hand/g,
    params: (m) => filters(m[1] ?? ""),
  },
  {
    category: "effect",
    id: "return discard pile to deck",
    re: /return all cards in (your|your opponent's) discard pile to (?:your|their) deck/g,
    params: (m) => ({ player: m[1] === "your" ? "you" : "opponent" }),
  },
  {
    category: "effect",
    id: "put card on top/bottom of deck",
    re: /put (?:up to \d+ )?[^.;]*? from your discard pile on top of your deck|(?:put|place) (?:this card|it) on the bottom of your deck/g,
    params: (m) => ({ where: m[0].includes("bottom") ? "bottom" : "top" }),
  },
  {
    category: "effect",
    id: "shuffle deck",
    re: /\bshuffle\b/g,
  },
  {
    category: "effect",
    id: "play a card (from an area)",
    re: /\b(?:play|plays) (?!this (?:card )?(?:from your hand )?(?:with|by|as|from rank))(?!battle cards with)(?!the next)(it|them|that (?:battle )?card|the chosen card|this card|(?:up to |as many )?(?:\d+|all|a|as many)\b[^.;]*?(?:cards?|"[^"]+")(?![^.;]*tokens?)[^.;]*)/g,
    accept: (m, c) => !/(cannot|can) $/.test(before(m, c)),
    params: (m, clause) => {
      const p = filters(m[1] ?? "");
      const earlier = clause.slice(0, m.index);
      if (!p["from"] && /search/.test(earlier)) p["from"] = "deck (searched)";
      else if (!p["from"] && /reveal|look at/.test(earlier))
        p["from"] = "revealed cards";
      return p;
    },
  },
  {
    category: "effect",
    id: "reveal a chosen card",
    re: /\breveal (?:it|them)\b/g,
  },
  {
    category: "effect",
    id: "create token",
    re: /(?:play|create)s? (?:(\d+) )?"([^"]+)" tokens?([^.;]*)/g,
    params: (m) => ({
      name: m[2] ?? "",
      count: m[1]
        ? Number(m[1])
        : (m[3] ?? "").includes("all zones") || (m[3] ?? "").includes("each of")
          ? "all"
          : 1,
      ...filters(m[3] ?? ""),
    }),
  },
  {
    category: "effect",
    id: "evolve",
    re: /\bevolve (?!s)([^.;]*)/g,
    params: (m) => filters(m[1] ?? ""),
  },
  {
    category: "effect",
    id: "advance monster",
    re: /advance (your opponent's|the opponent's|your|this card)(?: monster card| monster)? (?:by (\d+) zones?|to zone (\d))|(this card|it) advances (?:(\d+)(?: additional)? zones?|to zone (\d))/g,
    params: (m) => {
      const who = m[1] ?? m[4] ?? "";
      return {
        player: /opponent/.test(who) ? "opponent" : "you",
        ...(m[2] || m[5] ? { by: Number(m[2] ?? m[5]) } : {}),
        ...(m[3] || m[6] ? { toZone: Number(m[3] ?? m[6]) } : {}),
        ...(m[0].includes("additional") ? { extra: true } : {}),
      };
    },
  },
  {
    category: "effect",
    id: "retreat monster",
    re: /retreats?[^.;]*?(?:by (\d+) zones?|to zone (\d))|move[^.;]*?backward by (\d+) zones?/g,
    params: (m) => ({
      ...filters(m[0]),
      ...(m[1] || m[3] ? { by: Number(m[1] ?? m[3]) } : {}),
      ...(m[2] ? { toZone: Number(m[2]) } : {}),
    }),
  },
  {
    category: "effect",
    id: "move monster as though countered",
    re: /moves? (?:your opponent's monster card )?as though it were countered/g,
  },
  {
    category: "effect",
    id: "counter a monster",
    re: /\bcounter (your opponent's monster card|this card)/g,
    params: (m) => ({ target: m[1] ?? "" }),
  },
  {
    category: "effect",
    id: "cannot be countered",
    re: /cannot be countered(?: by (\d[\d,]*) or lower counter power)?/g,
    params: (m) => (m[1] ? { counterPowerMax: num(m[1]) ?? 0 } : {}),
  },
  {
    category: "effect",
    id: "rage +N",
    re: /increase ([^.;]*?)\[rage\] by (\d+)/g,
    params: (m) => ({ ...filters(m[1] ?? ""), amount: Number(m[2]) }),
  },
  {
    category: "effect",
    id: "rage -N",
    re: /reduce ([^.;]*?)\[rage\] by (\d+)/g,
    params: (m) => ({ ...filters(m[1] ?? ""), amount: Number(m[2]) }),
  },
  {
    category: "effect",
    id: "set rage",
    re: /set ([^.;]*?)\[rage\] to (\d+)/g,
    params: (m) => ({ ...filters(m[1] ?? ""), value: Number(m[2]) }),
  },
  {
    category: "effect",
    id: "counter power +N (battle card)",
    re: /gains? (?:an additional )?\+(\d[\d,]*) counter power|gets -(\d[\d,]*) counter power|double the counter power|counter power x is equal to/g,
    params: (m, clause) => ({
      ...subject(m, clause),
      amount: m[1]
        ? (num(m[1]) ?? 0)
        : m[2]
          ? -(num(m[2]) ?? 0)
          : m[0].includes("double")
            ? "double"
            : "computed",
    }),
  },
  {
    category: "effect",
    id: "total counter power +N",
    re: /(?:increase your total counter power by|your total (?:counter )?power is increased by) \+?(\d[\d,]*)/g,
    params: (m) => ({ amount: num(m[1]) ?? 0 }),
  },
  {
    category: "effect",
    id: "threat +N",
    re: /gains? \+(\d[\d,]*) threat level|threat level x is equal to/g,
    params: (m, clause) => ({
      ...subject(m, clause),
      amount: m[1] ? (num(m[1]) ?? 0) : "computed",
    }),
  },
  {
    category: "effect",
    id: "cannot engage",
    re: /cannot engage/g,
  },
  {
    category: "effect",
    id: "cannot be destroyed",
    re: /cannot be \[destroy\](?: by (?:your )?opponent's effects)?|(?:are|is) immune to [^.;]*\[destroy\][^.;]*/g,
  },
  {
    category: "effect",
    id: "replacement (instead)",
    re: /[^.;,]*\binstead\b/g,
  },
  {
    category: "effect",
    id: "move a battle card",
    re: /move (?:1 of your (?:other )?battle cards|1 (?:other )?battle card|this card|1 of your opponent's battle cards)[^.;]*?to (?:an? )?(?:unoccupied|adjacent|zone adjacent)[^.;]*/g,
    params: (m) => filters(m[0]),
  },
  {
    category: "effect",
    id: "swap two battle cards",
    re: /swap (?:their )?positions/g,
  },
  {
    category: "effect",
    id: "move monster vertically",
    re: /\bvertically\b/g,
  },
  {
    category: "effect",
    id: "place a card under a card",
    re: /(?:place|put)s? ([^.;]*?) under (this card|one of your [^.;,]*|a card named [^.;,]*)/g,
    params: (m) => filters(m[1] ?? ""),
  },
  {
    category: "effect",
    id: "rank +/-N (cards in zones or hand)",
    re: /reduce the rank of all battle cards in your opponent's zones by (\d+)|gain ([+-]\d+) rank/g,
    params: (m) => ({ amount: m[1] ? -Number(m[1]) : Number(m[2]) }),
  },
  {
    category: "effect",
    id: "play with reduced rank",
    re: /with (?:its|their) rank reduced by (\d+)|reduce its rank by (\d+)/g,
    params: (m) => ({ by: Number(m[1] ?? m[2]) }),
  },
  {
    category: "effect",
    id: "play restriction or alternative play",
    re: /this card can only be played in zone (\d)|this card cannot be played if[^.;]*|this card can be played by placing it on top[^.;]*|you may play this card from your hand by placing[^.;]*/g,
  },
  {
    category: "effect",
    id: "cannot advance / invade",
    re: /cannot (?:advance nor )?invade|cannot advance/g,
  },
  {
    category: "effect",
    id: "cannot play cards",
    re: /cannot play (strategy|battle) cards/g,
    params: (m) => ({ cardType: m[1] ?? "" }),
  },
  {
    category: "effect",
    id: "cannot draw",
    re: /cannot draw cards/g,
  },
  {
    category: "effect",
    id: "cannot discard for invasion",
    re: /cannot discard cards with [^.;]* for invade actions/g,
  },
  {
    category: "effect",
    id: "cannot be moved by effects",
    re: /cannot be moved by your opponent's effects/g,
  },
  {
    category: "effect",
    id: "rage cannot be reduced",
    re: /\[rage\] cannot be reduced/g,
  },
  {
    category: "effect",
    id: "deck construction",
    re: /^(?:red|blue|green|white)(?:\/(?:red|blue|green|white))+$|may (?:have|put) any number of this card in your deck|cards in your deck must (?:have|be) [^.;]*|your deck must contain [^.;]*|battle cards must be [^.;]*/g,
  },
  {
    category: "effect",
    id: "extra strategy zone",
    re: /you have (\d+) strategy card zones/g,
    params: (m) => ({ zones: Number(m[1]) }),
  },
  {
    category: "effect",
    id: "win / lose the game",
    re: /you (win|lose) the game/g,
    params: (m) => ({ result: m[1] ?? "" }),
  },
  {
    category: "effect",
    id: "put strategy card into play and activate",
    re: /play and activate|activate it\b|place [^.;]*? into your strategy zone|put it into play/g,
  },
  {
    category: "effect",
    id: "trigger [enter] abilities again",
    re: /trigger all \[enter\] abilities/g,
  },
  {
    category: "effect",
    id: "count as a monster card",
    re: /when counting monster cards in your discard pile, treat this card as a monster card|treat this card as a monster card/g,
  },
  {
    category: "effect",
    id: "stays in strategy zone",
    re: /this card is not sent to the discard pile/g,
  },
  {
    category: "effect",
    id: "starts in a zone",
    re: /it will be played in zone (\d)/g,
    params: (m) => ({ zone: Number(m[1]) }),
  },
];

const TARGETING: Pattern[] = [
  {
    category: "targeting",
    id: "choose one mode",
    re: /choose one(?: of the following)?/g,
  },
  {
    category: "targeting",
    id: "choose N (cards or zones)",
    re: /\b(?:choose|select) (?:up to )?(\d+)/g,
    params: (m) => ({ count: Number(m[1]) }),
  },
  { category: "targeting", id: "up to N", re: /\bup to (\d+)\b/g },
  {
    category: "targeting",
    id: "you may (optional)",
    re: /\byou may\b|\byou can\b/g,
  },
  {
    category: "targeting",
    id: "opponent may / opponent chooses",
    re: /your opponent may|they may|your opponent discards|your opponent chooses/g,
  },
  { category: "targeting", id: "any number", re: /\bany number of\b/g },
  {
    category: "targeting",
    id: "as many as possible",
    re: /as many as possible|play as many/g,
  },
  {
    category: "targeting",
    id: "all (no choice)",
    re: /\ball (?:of )?(?:your|battle|cards|rank|strategy|\[)/g,
  },
  {
    category: "targeting",
    id: "N of your opponent's cards (exact count)",
    re: /\b(\d+) (?:of )?(?:your )?opponent'?s?'? (?:rank|battle|strategy)/g,
  },
  {
    category: "targeting",
    id: "each player",
    re: /\beach player\b|\bboth players\b/g,
  },
  { category: "targeting", id: "one by one", re: /\bone by one\b/g },
  {
    category: "targeting",
    id: "lowest / leftmost / rightmost",
    re: /lowest ranked|lowest number|rightmost|leftmost/g,
  },
];

const COSTS: Pattern[] = [
  {
    category: "cost",
    id: "cost: A: B",
    re: /^[^:"]+(?=: )/g,
    accept: (m) => !/choose|following|●/.test(m[0]),
  },
  {
    category: "cost",
    id: "you may A to B",
    re: /you may ([^.;]*?) to (?=reduce|increase|search|set|advance|play)/g,
  },
  {
    category: "cost",
    id: "you may A. If you do, B",
    re: /you may [^.;]*?(?:\. |, )if you do/g,
  },
];

const SCALING: Pattern[] = [
  {
    category: "scaling",
    id: "for each / for every",
    re: /\bfor (?:each|every)(?: \d+)? [^.;,]*/g,
  },
  {
    category: "scaling",
    id: "equal to / multiplied by",
    re: /equal to (?:the )?(?:rank|number)[^.;,]*|multiplied by [^.;,]*|times the number of [^.;,]*|that many\b|up to the number of [^.;,]*/g,
  },
];

const DURATIONS: Pattern[] = [
  {
    category: "duration",
    id: "until end of turn",
    re: /for the rest of the turn|until (?:the )?end of (?:the )?turn|(?<!invaded |\] |through invasion |was \[destroy\] )this turn\b/g,
  },
  {
    category: "duration",
    id: "rest of the game",
    re: /for the rest of the game/g,
  },
  {
    category: "duration",
    id: "while in strategy zone",
    re: /while this card is in the strategy zone/g,
  },
  {
    category: "duration",
    id: "during a phase",
    re: /during (?:your |the )?(start|main|counter|end) phase/g,
  },
];

const ALL: Pattern[] = [
  ...TRIGGERS,
  ...CONDITIONS,
  ...EFFECTS,
  ...TARGETING,
  ...COSTS,
  ...SCALING,
  ...DURATIONS,
];

/** Patterns whose matched span is hidden from later patterns (a trigger's verb is not an effect). */
const MASKING = new Set<Category>(["trigger"]);

/** Parentheses that only restate a keyword or an example; they never count as unclassified. */
const REMINDERS: RegExp[] = [
  /^you can play this card from rank/,
  /^active if/,
  /^activates when destroyed/,
  /^at the beginning of your main phase, you may (?:search|play)/,
  /^cards with base are not sent/,
  /^tokens (?:are|cannot)/,
  /^their counter power is not included/,
  /^do not play the next monster card/,
  /^(?:for )?example/,
  /^if (?:your monster card is in zone|both conditions)/,
  /^battle cards in your hand can be played/,
  /^after be(?:ing|ying) played/,
  /^white also counts/,
  /^you (?:can|may) (?:use|mix)/,
  /^red, blue, green/,
  /^does not destroy cards already there/,
  /^also triggers when/,
  /^they return to their original rank/,
  /^regardless of/,
  /^it still moves when countered/,
  /^refer to those battle card/,
  /^your battle cards in zones .* will not be/,
  /^move it from zone/,
  /^this play does not increase/,
  /^it remains 3/,
  /^it will not retreat/,
  /^if you invaded 2 zones/,
  /^you must play as many as possible/,
  /^you may play this card from rank/,
  /^you may target this card/,
  /^maximum of/,
  /^from your perspective/,
];

// ---------------------------------------------------------------------------------------------
// Keywords

function keywordParts(ability: string): Part[] {
  const parts: Part[] = [];
  const prefix = /^(?:\s*\[[^\]]+\])+/.exec(ability)?.[0] ?? "";
  const tokens = [...prefix.matchAll(/\[([^\]]+)\]/g)].map((m) => m[1] ?? "");
  for (let i = 0; i < tokens.length; i++) {
    const t = tokens[i] ?? "";
    const n = /-(\d)$/.exec(t)?.[1];
    const p = (pattern: string, params?: Params): Part =>
      params
        ? { category: "keyword", pattern, text: `[${t}]`, params }
        : { category: "keyword", pattern, text: `[${t}]` };
    if (t === "enter") parts.push(p("Enter (12.2)"));
    else if (t === "invading") parts.push(p("When invading (12.3)"));
    else if (t.startsWith("awakening")) {
      parts.push(p("Awakening N (12.4)", { zone: Number(n) }));
      parts.push({
        category: "condition",
        pattern: "awakening: own monster in zone N or beyond",
        text: `[${t}]`,
        params: { zone: Number(n) },
      });
    } else if (t.startsWith("burst")) {
      parts.push(p("Burst N (12.5)", n ? { rank: Number(n) } : {}));
      parts.push({
        category: "duration",
        pattern: "until your next end phase (Burst)",
        text: `[${t}]`,
      });
    } else if (t.startsWith("evolution")) {
      const trait = tokens[i + 1];
      parts.push(
        p("Evolution N + trait (12.6)", {
          ...(n ? { rank: Number(n) } : {}),
          ...(trait ? { trait } : {}),
        }),
      );
      parts.push({
        category: "trigger",
        pattern: "phase begins",
        text: `[${t}]`,
        params: { phase: "main", turn: "yours", via: "Evolution" },
      });
      if (trait) i++;
    } else if (t === "revenge") {
      parts.push(p("Revenge (12.7)"));
      parts.push({
        category: "trigger",
        pattern: "destroyed",
        text: `[${t}]`,
        params: { via: "Revenge" },
      });
    } else if (t === "resonance") parts.push(p("Resonance (12.8)"));
    else if (t === "base") parts.push(p("Base (12.9)"));
    else if (t === "your-turn") {
      parts.push(p("[Your Turn] (not in CR 12)"));
      parts.push({
        category: "condition",
        pattern: "whose turn",
        text: `[${t}]`,
        params: { turn: "yours" },
      });
    } else if (t === "opponent-turn" || t === "opponents-turn") {
      parts.push(p("[Opponent's Turn] (not in CR 12)", { spelling: t }));
      parts.push({
        category: "condition",
        pattern: "whose turn",
        text: `[${t}]`,
        params: { turn: "opponent's" },
      });
    } else if (t === "destroy") {
      // "[enter][destroy] ...": the destroy icon starts the effect, handled with the body.
      break;
    } else parts.push(p(`other bracketed keyword: [${t}]`));
  }
  return parts;
}

/** Bracketed icons and references inside the text (not leading keyword abilities). */
function referenceParts(body: string): Part[] {
  const parts: Part[] = [];
  for (const m of body.matchAll(/\[([^\]]+)\]/g)) {
    const t = m[1] ?? "";
    if (t === "rage" || t === "destroy") continue;
    let pattern: string;
    if (/^(evolution|burst|base|enter)$/.test(t))
      pattern = `reference to keyword: [${t}]`;
    else if (/^invade-\d$/.test(t))
      pattern = "reference to invasion icon: [invade-N]";
    else if (/^(awakening-\d|evolution-\d|burst-\d)$/.test(t)) continue;
    else if (/[\s().]/.test(t)) pattern = "card name in brackets";
    else pattern = "trait icon";
    parts.push({ category: "keyword", pattern, text: `[${t}]` });
  }
  return parts;
}

// ---------------------------------------------------------------------------------------------
// Destroy

/** "[destroy]" as an instruction (not "cannot be [destroy]", "is [destroy]", "would be [destroy]"). */
function destroyParts(clause: string): Part[] {
  const parts: Part[] = [];
  for (const m of clause.matchAll(/\[destroy\]/g)) {
    const prev = clause.slice(Math.max(0, m.index - 40), m.index);
    if (
      /(cannot be|is|was|would be|be|not|any of your opponent's) $/.test(prev)
    )
      continue;
    const rest =
      clause
        .slice(m.index + m[0].length)
        .split(
          /[.;]| if your opponent's monster card occupies| and (?:play|retreat)\b|, then\b| for each\b/,
        )[0] ?? "";
    const params = filters(rest.trim());
    if (/^\s*this card/.test(rest)) params["target"] = "this card";
    if (/one by one/.test(rest)) params["oneByOne"] = true;
    const multiple = [...rest.matchAll(/\b(\d+) (red|blue|green|white)\b/g)];
    if (multiple.length > 1)
      params["perColor"] = multiple.map((x) => x[2] ?? "");
    if (/total ranks add up to (\d+)/.test(rest))
      params["totalRankMax"] = Number(
        /total ranks add up to (\d+)/.exec(rest)?.[1],
      );
    if (/strategy/.test(rest.split(/\bin\b/)[0] ?? ""))
      params["cardType"] = "strategy";
    parts.push({
      category: "effect",
      pattern: "destroy",
      text: `[destroy]${rest}`.trim(),
      params,
    });
  }
  return parts;
}

// ---------------------------------------------------------------------------------------------
// Classification

function matchAll(pattern: Pattern, clause: string): Part[] {
  const parts: Part[] = [];
  pattern.re.lastIndex = 0;
  for (const m of clause.matchAll(pattern.re)) {
    if (pattern.accept && !pattern.accept(m as RegExpExecArray, clause))
      continue;
    const params = pattern.params?.(m as RegExpExecArray, clause);
    const part: Part = {
      category: pattern.category,
      pattern: pattern.id,
      text: m[0].trim(),
    };
    if (params && Object.keys(params).length > 0) part.params = params;
    parts.push(part);
  }
  return parts;
}

function mask(clause: string, parts: Part[]): string {
  let out = clause;
  for (const part of parts)
    out = out.replace(part.text, " ".repeat(part.text.length));
  return out;
}

/** A clause counts as classified when it has an effect, or is a choice that sets up the next one. */
const doesSomething = (part: Part) =>
  part.category === "effect" || /^(choose|branch)/.test(part.pattern);

export interface Classified {
  ability: Ability;
  unclassified: string[];
  /** Parenthesized text beyond the standard keyword reminders (rules clarifications). */
  clarifications: string[];
}

/** The standard reminder text of keywords and icons, left out of the clarification list. */
const KEYWORD_REMINDERS =
  /^(you can play this card from rank|active if|activates when destroyed|at the beginning of your main phase, you may (?:search|play)|cards with base are not sent|tokens (?:are|cannot)|their counter power is not included|do not play the next monster card|you can (?:use|mix)|you may mix|red, blue, green)/;

export function classifyAbility(raw: string): Classified {
  const text = raw.trim();
  const { body, notes } = splitParentheses(raw.replace(/\r/g, ""));
  const parts: Part[] = keywordParts(normalize(body));
  const unclassified: string[] = [];
  const clarifications = notes.filter(
    (n) => n !== "" && !KEYWORD_REMINDERS.test(normalize(n)),
  );

  const bodyText = normalize(body).replace(
    /^(?:\s*\[(?!destroy\])[^\]]+\])+\s*/,
    "",
  );
  parts.push(...referenceParts(bodyText));
  const allClauses = clauses(
    body.replace(/^(?:\s*\[(?!destroy\])[^\]]+\])+\s*/, ""),
  );
  const keywordOnly = bodyText.trim() === "";

  for (const rawClause of allClauses) {
    const clause = normalize(rawClause);
    const triggers = TRIGGERS.flatMap((p) => matchAll(p, clause));
    const masked = mask(
      clause,
      triggers.filter((t) => MASKING.has(t.category)),
    );
    const found = [
      ...triggers,
      ...destroyParts(masked),
      ...ALL.filter((p) => p.category !== "trigger").flatMap((p) =>
        matchAll(p, masked),
      ),
    ];
    // "When A, B instead" is a replacement effect (10.2.1.3.1), not a trigger.
    if (/\binstead\b/.test(clause))
      for (const t of triggers) t.params = { ...t.params, replacement: true };
    parts.push(...found);
    if (!found.some(doesSomething))
      unclassified.push(rawClause.replace(/^[●\s]+/, "").trim());
  }
  for (const note of notes) {
    const n = normalize(note);
    if (n === "" || REMINDERS.some((r) => r.test(n))) continue;
    const found = [
      ...TRIGGERS.flatMap((p) => matchAll(p, n)),
      ...destroyParts(n),
      ...ALL.filter((p) => p.category !== "trigger").flatMap((p) =>
        matchAll(p, n),
      ),
    ];
    parts.push(...found);
    if (!found.some(doesSomething)) unclassified.push(`(${note})`);
  }

  // A continuous ability: it does something, with no trigger and no keyword trigger.
  const hasTrigger = parts.some(
    (p) =>
      p.category === "trigger" ||
      p.pattern === "Enter (12.2)" ||
      p.pattern === "When invading (12.3)",
  );
  const continuous = parts.some((p) =>
    /counter power|threat|cannot|immune|rank \+\/-|play with reduced rank|replacement|deck construction|play restriction|count as|stays in|starts in/.test(
      p.pattern,
    ),
  );
  if (!hasTrigger && continuous && !keywordOnly)
    parts.push({
      category: "duration",
      pattern: "while active (continuous ability)",
      text: "",
    });

  return { ability: { text, parts }, unclassified, clarifications };
}

export function surveyCard(card: Card): CardSurvey {
  const { text, hasErrata } = getCardText(card);
  const abilities: Ability[] = [];
  const unclassified: string[] = [];
  const clarifications: string[] = [];
  for (const line of splitAbilities(text)) {
    const result = classifyAbility(line);
    abilities.push(result.ability);
    unclassified.push(...result.unclassified);
    clarifications.push(...result.clarifications);
  }
  if (card.type === "Strategy" && abilities.length > 0) {
    // 10.1.1.1.2: strategy text is "when this card is placed in the strategy zone, (text)".
    const first = abilities[0];
    first?.parts.unshift({
      category: "trigger",
      pattern: "strategy card placed (10.1.1.1.2)",
      text: "(implicit: the text of every strategy card)",
    });
  }
  return {
    id: card.id,
    deckCardNumber: card.deckCardNumber,
    name: card.name,
    type: card.type,
    set: card.set,
    starter: STARTER_SETS.includes(card.set),
    hasErrata,
    abilities,
    unclassified,
    clarifications,
  };
}
