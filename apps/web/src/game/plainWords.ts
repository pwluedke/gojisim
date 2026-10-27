import {
  type Ability,
  type Count,
  type Effect,
  getCardAbilities,
  type Selector,
  type ZoneSet,
} from "@gojisim/cards";
import type { GameState } from "@gojisim/engine";
import { abilityText, describeSearch } from "./labels";

/**
 * Plain-words decision prompts (M5h #16): what Yes does, worded from the ability data, e.g.
 * "Discard 1 card from your hand to play 3 Crystals tokens." Anything the describer can't word
 * returns `null`, and the prompt shows the printed text alone (the fallback test lists them).
 */

const plural = (n: string, word: string) =>
  n === "1" || n === "a" ? word : `${word}s`;

function countWord(count: Count | undefined): string | null {
  if (count === undefined) return "1";
  if (count === "all") return "all";
  if (count === "anyNumber") return "any number of";
  if ("upTo" in count) return `up to ${count.upTo}`;
  return typeof count.exact === "number" ? String(count.exact) : null;
}

const NOUNS: Record<string, string> = {
  Battle: "battle card",
  Monster: "monster card",
  Strategy: "strategy card",
};

const RANK: Record<string, (n: number) => string> = {
  "<=": (n) => `rank ${n} or lower`,
  "<": (n) => `rank ${n - 1} or lower`,
  ">=": (n) => `rank ${n} or higher`,
  ">": (n) => `rank ${n + 1} or higher`,
  "=": (n) => `rank ${n}`,
};

const ANCHORS: Record<string, string> = {
  this: "this card",
  yourMonster: "your monster card",
  opponentMonster: "your opponent's monster card",
};

function zonesPhrase(zones: ZoneSet | undefined): string | null {
  if (zones === undefined) return "";
  if (Array.isArray(zones))
    return zones.length === 1
      ? ` in zone ${zones[0]}`
      : ` in zones ${zones[0]}-${zones[zones.length - 1]}`;
  if (typeof zones === "string") return null;
  if (!("relation" in zones) || typeof zones.of !== "string") return null;
  const of = ANCHORS[zones.of];
  if (!of) return null;
  if (zones.relation === "sameColumnAs") return ` in the same column as ${of}`;
  if (zones.relation === "adjacentTo") return ` in zones adjacent to ${of}`;
  return null;
}

const KNOWN = new Set([
  "owner",
  "area",
  "type",
  "name",
  "traits",
  "colors",
  "notColors",
  "rank",
  "zones",
  "this",
  "other",
  "bind",
]);

/**
 * "your opponent's rank 6 or lower battle cards in zones 1-5": the cards a selector picks, as a
 * noun phrase (`n` is the count word, for the plural), or `null` for a selector it can't word.
 */
function cards(sel: Selector, n: string): string | null {
  if (Object.keys(sel).some((k) => !KNOWN.has(k))) return null;
  if (sel.this) return "this card";
  if (sel.area === "bound") return n === "1" ? "it" : "them";
  const owner =
    sel.owner === "you"
      ? "your "
      : sel.owner === "opponent"
        ? "your opponent's "
        : "";
  const quals: string[] = [];
  if (sel.other) quals.push("other");
  if (sel.rank) {
    // A rank read from another card ("equal to or lower than the discarded card's") isn't worded.
    if (typeof sel.rank.value !== "number") return null;
    const rank = RANK[sel.rank.op];
    if (!rank) return null;
    quals.push(rank(sel.rank.value));
  }
  if (sel.colors) quals.push(sel.colors.join(" or ").toLowerCase());
  if (sel.notColors)
    quals.push(sel.notColors.map((c) => `non-${c.toLowerCase()}`).join(" "));
  const noun = plural(n, NOUNS[sel.type ?? ""] ?? "card");
  const after: string[] = [];
  if (sel.name) after.push(`named "${sel.name}"`);
  if (sel.traits)
    after.push(`with ${sel.traits.map((t) => `[${t}]`).join(" and ")}`);
  const zones = zonesPhrase(sel.zones);
  if (zones === null) return null;
  return `${owner}${[...quals, noun].join(" ")}${after.length ? ` ${after.join(" ")}` : ""}${zones}`;
}

const AREA_FROM: Record<string, string> = {
  hand: "your hand",
  deck: "your deck",
  discard: "your discard pile",
};

/** One effect as a verb phrase ("destroy 1 of your opponent's battle cards"), or `null`. */
export function describeEffect(effect: Effect): string | null {
  const them = (p: string) => (p === "opponent" ? "your opponent " : "");
  switch (effect.effect) {
    case "destroy": {
      const n = countWord(effect.target.count);
      if (n === null || effect.target.order) return null;
      const what = cards(effect.target.select, n);
      if (what === null) return null;
      if (effect.target.select.this) return "destroy this card";
      return `destroy ${n === "all" || n.startsWith("up") || /^\d/.test(n) ? `${n} of ` : ""}${what}`;
    }
    case "discard": {
      if (effect.count === "hand")
        return effect.player === "opponent"
          ? "your opponent discards their entire hand"
          : "discard your entire hand";
      const n = countWord(effect.count);
      if (n === null) return null;
      const what = effect.filter
        ? cards({ ...effect.filter, owner: "any" }, n)
        : plural(n, "card");
      if (what === null) return null;
      return effect.player === "opponent"
        ? `your opponent discards ${n} ${what.replace(/^\d+ /, "")} from their hand`
        : `discard ${n} ${what} from your hand`;
    }
    case "discardDownTo":
      return effect.player === "opponent"
        ? `your opponent discards down to ${effect.size} cards`
        : `discard down to ${effect.size} cards`;
    case "rage": {
      const whose = effect.player === "opponent" ? "your opponent's" : "your";
      // "for each strategy card discarded this way": a count of the cards an earlier effect bound.
      const delta = effect.delta;
      if (
        typeof delta === "object" &&
        "per" in delta &&
        delta.per.area === "bound" &&
        delta.times !== 0 &&
        !delta.every &&
        Object.keys(delta.per).every((k) =>
          ["owner", "area", "bind", "type"].includes(k),
        )
      )
        return `${delta.times > 0 ? "increase" : "reduce"} ${whose} rage by ${Math.abs(delta.times)} for each ${NOUNS[delta.per.type ?? ""] ?? "card"} among them`;
      if (typeof delta !== "number") return null;
      return `${delta > 0 ? "increase" : "reduce"} ${whose} rage by ${Math.abs(delta)}`;
    }
    case "setRage":
      return `set ${effect.player === "opponent" ? "your opponent's" : "your"} rage to ${effect.value}`;
    case "draw":
      return typeof effect.count === "number"
        ? `${them(effect.player)}draw${effect.player === "opponent" ? "s" : ""} ${effect.count} ${plural(String(effect.count), "card")}`
        : null;
    case "search": {
      if (effect.player !== "you") return null;
      const search = `search your deck for ${describeSearch(effect.filter, effect.count)}`;
      if (effect.effects.length === 0) return search;
      const then = describeEffects(effect.effects);
      return then === null ? null : `${search}, then ${then}`;
    }
    case "shuffle":
      return effect.player === "you" ? "shuffle your deck" : null;
    case "play": {
      const n = countWord(effect.count);
      if (n === null || effect.onTop) return null;
      const what = cards(effect.filter, n);
      if (what === null) return null;
      const from = AREA_FROM[effect.from];
      return effect.filter.this || effect.from === "bound"
        ? `play ${what}`
        : from
          ? `play ${n} ${what.replace(/^your /, "")} from ${from}`
          : null;
    }
    case "addToHand": {
      const n = countWord(effect.count ?? "all");
      if (n === null) return null;
      const what = cards(effect.target, n === "all" ? "1" : n);
      if (what === null) return null;
      if (effect.target.area === "bound") return "add it to your hand";
      if (effect.target.this) return "return this card to your hand";
      return effect.target.area === "discard"
        ? `return ${n === "all" ? "" : `${n} `}${what.replace(/^your /, "")} from your discard pile to your hand`
        : null;
    }
    case "createToken": {
      const n = effect.count === "each" ? null : String(effect.count ?? 1);
      return n === null
        ? null
        : `play ${n} "${effect.name}" ${plural(n, "token")}`;
    }
    case "putOnDeck":
      return effect.target.this
        ? `put this card on the ${effect.where} of your deck`
        : null;
    case "evolve":
      return effect.target.this ? "evolve this card" : null;
    case "advance":
    case "retreat": {
      if (effect.toZone !== undefined || effect.filter) return null;
      const by = effect.by ?? 1;
      if (typeof by !== "number") return null;
      const whose =
        effect.player === "opponent"
          ? "your opponent's monster card"
          : "your monster card";
      return `${effect.effect} ${whose} by ${by} ${plural(String(by), "zone")}`;
    }
    case "mill":
      return effect.player === "you"
        ? `send the top ${effect.count === 1 ? "card" : `${effect.count} cards`} of your deck to your discard pile`
        : null;
    case "swap":
      return effect.owner === "you" ? "swap 2 of your battle cards" : null;
    case "counter":
      return effect.player === "opponent"
        ? "counter your opponent's monster card"
        : "counter your monster card";
    case "activate":
      return effect.from === "deck"
        ? "put a strategy card from your deck into play and activate it"
        : null;
    default:
      return null;
  }
}

/** Effects in order, joined: "draw 1 card, then discard 1 card from your hand". */
function describeEffects(effects: readonly Effect[]): string | null {
  const parts = effects.map(describeEffect);
  if (parts.some((p) => p === null) || parts.length === 0) return null;
  return parts.join(", then ");
}

const sentence = (text: string) =>
  `${text.charAt(0).toUpperCase()}${text.slice(1)}.`;

/** What Yes does for an ability: its cost "to" its effects. */
export function describeAbility(ability: Ability): string | null {
  if (ability.kind === "keyword") {
    const keyword = ability.keyword;
    if (keyword.name === "evolution")
      return sentence(
        `evolve this card: search your deck for a rank ${keyword.rank} or lower [${keyword.trait}] battle card and play it on top of this card`,
      );
    if (keyword.name === "revenge") {
      const effects = describeEffects(keyword.effects);
      return effects === null ? null : sentence(effects);
    }
    return null;
  }
  if (ability.kind === "replacement") {
    const instead = describeEffects(ability.instead);
    return instead === null ? null : sentence(`instead, ${instead}`);
  }
  if (ability.kind !== "triggered") return null;
  const effects = describeEffects(ability.effects);
  if (effects === null) return null;
  if (!ability.cost) return sentence(effects);
  const cost = describeEffects(ability.cost.effects);
  return cost === null ? null : sentence(`${cost} to ${effects}`);
}

/** The ability an ability id names (`<deck card number>#<id>`), keyword abilities included. */
export function abilityById(abilityId: string): Ability | undefined {
  const [number = "", id = ""] = abilityId.split("#");
  const { abilities } = getCardAbilities(number);
  return (
    abilities.find((a) => "id" in a && a.id === id) ??
    abilities.find((a) => a.kind === "keyword" && a.keyword.name === id)
  );
}

/** The yes/no prompt's lines (M5h #16): what Yes does, the printed text, the invading step. */
export interface ConfirmWords {
  /** `null` when the data can't be worded: the printed text shows alone. */
  sentence: string | null;
  text: string;
  /** "Invading step 1 of 2" for an [invading] prompt (one prompt per step, Q4). */
  step: string | null;
}

export function confirmWords(state: GameState): ConfirmWords | null {
  const choice = state.pendingChoice;
  if (choice?.kind !== "confirm") return null;
  const abilityId = choice.options[0]?.abilityId ?? "";
  const text = abilityId ? abilityText(state, abilityId) : "";
  const ability = abilityById(abilityId);
  let words: string | null = null;
  if (choice.rule === "5.7.2") {
    // "You may discard down to N" (E11): the opponent decides.
    const effect = state.resolution
      ? abilityById(state.resolution.standby.abilityId)
      : undefined;
    const effects = effect?.kind === "triggered" ? effect.effects : [];
    const down = effects.find((e) => e.effect === "discardDownTo");
    words =
      down?.effect === "discardDownTo"
        ? sentence(`discard down to ${down.size} cards`)
        : null;
  } else if (ability) words = describeAbility(ability);
  return { sentence: words, text, step: invadingStep(state) };
}

/** "Invading step k of N" when the prompt's ability triggered on an invasion advance (12.3). */
function invadingStep(state: GameState): string | null {
  const standby = state.resolution?.standby;
  const event = standby?.event;
  if (
    !standby ||
    event?.type !== "advance" ||
    event.payload["invasion"] !== true
  )
    return null;
  const log = state.log;
  let start = -1;
  for (let i = log.length - 1; i >= 0; i--) {
    const entry = log[i];
    if (
      entry &&
      entry.seq <= event.seq &&
      entry.type === "invade" &&
      entry.player === event.player
    ) {
      start = i;
      break;
    }
  }
  if (start < 0) return null;
  const total = Number(log[start]?.payload["icon"] ?? 0);
  const step = log
    .slice(start)
    .filter(
      (e) =>
        e.seq <= event.seq &&
        e.type === "advance" &&
        e.payload["invasion"] === true &&
        e.player === event.player,
    ).length;
  return total > 0 ? `Invading step ${step} of ${total}` : null;
}
