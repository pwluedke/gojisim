import type { Action, GameState, LogEntry } from "@gojisim/engine";
import announcedKinds from "./announcedKinds.json";
import { findInstance, optionText } from "./labels";

/**
 * Bot announcements: one plain-English line per bot action, from the action and the log entries
 * it added. Log payloads hold public information only (decision 45), and a hand card is named
 * only once it is played or discarded, so a line never names a hidden card.
 */

/** What an announcement line is about; `ANNOUNCED_KINDS` lists the ones that show. */
export type AnnounceKind =
  | "play"
  | "strategy"
  | "monster"
  | "rage"
  | "invade"
  | "pass"
  | "concede"
  | "evolve"
  | "search"
  | "nextMonster"
  | "destroy"
  | "place"
  | "discard"
  | "move"
  | "addToHand"
  | "zone"
  | "target"
  | "confirm"
  | "option"
  | "order"
  | "choice";

/** The kinds that are announced, as data (`announcedKinds.json`): drop one to leave it out. */
export const ANNOUNCED_KINDS: readonly AnnounceKind[] =
  announcedKinds as AnnounceKind[];

export interface Announcement {
  kind: AnnounceKind;
  text: string;
}

/** How the line names players: the actor ("Bot") and whose a card is ("your", "its"). */
export interface AnnounceNames {
  /** The acting player as a sentence subject: "Bot", or "Bot P1" between two bots. */
  subject: (player: string) => string;
  /** Whose card, seen from the actor: "its" for the actor's own, "your" for the human's. */
  whose: (owner: string, actor: string) => string;
}

/** The pace slider's minimum times (1.5 to 7 s); the sixth step, Confirm, waits for OK. */
export const PACE_MS = [1500, 2500, 3500, 5000, 7000] as const;
/** The Confirm step's index on the slider. */
export const PACE_CONFIRM = PACE_MS.length;
/** The default step (3.5 s). */
export const DEFAULT_PACE = 2;
/** Extra time per character past `LINE_FREE_CHARS`, so longer lines stay longer. */
export const MS_PER_EXTRA_CHAR = 60;
export const LINE_FREE_CHARS = 40;

/** How long a line stays at `pace`, in ms, or `null` for Confirm (until dismissed). */
export function lineMs(text: string, pace: number): number | null {
  if (pace >= PACE_CONFIRM) return null;
  const base = PACE_MS[Math.max(0, pace)] ?? PACE_MS[DEFAULT_PACE];
  return base + MS_PER_EXTRA_CHAR * Math.max(0, text.length - LINE_FREE_CHARS);
}

/** The pace step's label: "3.5 s" or "Confirm". */
export function paceLabel(pace: number): string {
  return pace >= PACE_CONFIRM
    ? "Confirm"
    : `${(PACE_MS[pace] ?? PACE_MS[DEFAULT_PACE]) / 1000} s`;
}

/** A card's name by card id, or "a card". */
function named(state: GameState, cardId: unknown): string {
  return typeof cardId === "number"
    ? (state.cards[cardId]?.name ?? "a card")
    : "a card";
}

/** Where a destroyed card was: "zone 2" or "strategy zone". */
function where(p: Record<string, unknown>): string {
  return p["zone"] !== undefined
    ? `zone ${String(p["zone"])}`
    : "strategy zone";
}

/** The line for an action's main public result, from the log entries it added, if any. */
function resultLine(
  after: GameState,
  entries: readonly LogEntry[],
  actor: string,
  names: AnnounceNames,
): Announcement | null {
  const who = names.subject(actor);
  const first = (type: string) => entries.find((e) => e.type === type);
  const evolve = first("evolve");
  if (evolve)
    return {
      kind: "evolve",
      text: `${who} evolves ${named(after, evolve.payload["from"])} into ${named(after, evolve.payload["to"])}`,
    };
  const search = first("search");
  if (search) {
    const found = Number(search.payload["found"] ?? 0);
    // A taken card is named only if the log names it (revealed, 5.10).
    const shown = entries
      .filter(
        (e) => e.type === "addToHand" && e.payload["cardId"] !== undefined,
      )
      .map((e) => named(after, e.payload["cardId"]));
    const own = names.whose(search.player ?? actor, actor);
    return {
      kind: "search",
      text:
        found === 0
          ? `${who} searches ${own} deck and finds nothing`
          : shown.length === found
            ? `${who} searches ${own} deck and takes ${shown.join(" and ")}`
            : `${who} searches ${own} deck and takes ${found} card${found === 1 ? "" : "s"}`,
    };
  }
  const monster = first("newInvadingMonster");
  if (monster)
    return {
      kind: "nextMonster",
      text: `${who}'s next monster: ${named(after, monster.payload["cardId"])}`,
    };
  const destroys = entries.filter((e) => e.type === "destroy");
  const [destroy] = destroys;
  if (destroy) {
    const ids = destroy.payload["cardIds"];
    const top = Array.isArray(ids) ? ids.at(-1) : undefined;
    const more = destroys.length - 1;
    return {
      kind: "destroy",
      text: `${who} destroys ${names.whose(destroy.player ?? actor, actor)} ${named(after, top)} in ${where(destroy.payload)}${more > 0 ? ` and ${more} more` : ""}`,
    };
  }
  const place = entries.find(
    (e) => e.type === "place" && e.payload["played"] === true,
  );
  if (place)
    return {
      kind: "place",
      text: `${who} plays ${named(after, place.payload["cardId"])} to ${String(place.payload["to"]).replace("invadingMonsterZone", "the monster zone")}`,
    };
  const discards = entries.filter((e) => e.type === "discard");
  if (discards.length)
    return {
      kind: "discard",
      text: `${who} discards ${discards.map((e) => named(after, e.payload["cardId"])).join(", ")}`,
    };
  const move = first("moveBattle");
  if (move)
    return {
      kind: "move",
      text: `${who} moves ${names.whose(move.player ?? actor, actor)} ${named(after, move.payload["cardId"])} to zone ${String(move.payload["to"])}`,
    };
  const added = entries.find(
    (e) => e.type === "addToHand" && e.payload["cardId"] !== undefined,
  );
  if (added)
    return {
      kind: "addToHand",
      text: `${who} adds ${named(after, added.payload["cardId"])} to ${names.whose(added.player ?? actor, actor)} hand`,
    };
  return null;
}

/** A choice's own line, when its result has none (public choices only). */
function choiceLine(
  before: GameState,
  action: Extract<Action, { type: "choose" }>,
  names: AnnounceNames,
): Announcement {
  const choice = before.pendingChoice;
  const actor = action.player;
  const who = names.subject(actor);
  const option = choice?.options.find((o) => o.id === action.optionId);
  const source = named(before, before.resolution?.standby.sourceCardId);
  switch (choice?.kind) {
    case "zone": {
      if (action.optionId === "done")
        return { kind: "zone", text: `${who} leaves the card where it is` };
      const [owner, zone] = action.optionId.split(":");
      return {
        kind: "zone",
        text: `${who} picks ${names.whose(owner ?? actor, actor)} zone ${zone}`,
      };
    }
    case "target": {
      if (action.optionId === "done")
        return { kind: "target", text: `${who} stops choosing` };
      const instance = findInstance(before, action.optionId);
      return {
        kind: "target",
        text: `${who} targets ${names.whose(instance?.owner ?? actor, actor)} ${named(before, option?.cardId)}`,
      };
    }
    case "confirm":
      return {
        kind: "confirm",
        text:
          action.optionId === "yes"
            ? `${who} uses ${source}'s ability`
            : `${who} doesn't use ${source}'s ability`,
      };
    case "option":
      return {
        kind: "option",
        text: `${who} chooses: ${optionText(before, Number(action.optionId))}`,
      };
    case "standbyOrder":
      return {
        kind: "order",
        text: `${who} resolves ${named(before, option?.cardId)}'s ability first`,
      };
    case "replacementOrder":
      return {
        kind: "order",
        text: `${who} applies ${named(before, option?.cardId)}'s replacement first`,
      };
    default:
      return { kind: "choice", text: `${who} makes a choice` };
  }
}

/**
 * The announcement for `action`, taken in `before` and leading to `after`. Hand actions name the
 * card they play or discard; a choice reads as its main public result (an evolve, a search, a
 * next monster, a destroy, a play, a discard, a move), else as the choice itself, and a private
 * choice with no public result reads "makes a choice".
 */
export function announce(
  before: GameState,
  after: GameState,
  action: Action,
  names: AnnounceNames,
): Announcement {
  const actor = action.player;
  const who = names.subject(actor);
  const entries = after.log.slice(before.log.length);
  const card = (instanceId: string) => {
    const instance = findInstance(before, instanceId);
    return instance ? named(before, instance.cardId) : "a card";
  };
  switch (action.type) {
    case "playBattle": {
      const host = action.onTop
        ? before.players
            .find((p) => p.id === actor)
            ?.zones[action.zone].at(-1)
            ?.at(-1)
        : undefined;
      const cost = action.costCardInstanceId
        ? `, discarding ${card(action.costCardInstanceId)}`
        : "";
      return {
        kind: "play",
        text: host
          ? `${who} plays ${card(action.cardInstanceId)} on top of ${named(before, host.cardId)} in zone ${action.zone}`
          : `${who} plays ${card(action.cardInstanceId)} to zone ${action.zone}${cost}`,
      };
    }
    case "activateStrategy":
      return {
        kind: "strategy",
        text: `${who} activates ${card(action.cardInstanceId)}`,
      };
    case "playMonster":
      return {
        kind: "monster",
        text: `${who} plays ${names.whose(actor, actor)} monster: ${card(action.cardInstanceId)}`,
      };
    case "gainRage": {
      const rage = entries.find((e) => e.type === "rageChanged");
      return {
        kind: "rage",
        text: `${who} gains rage with ${card(action.cardInstanceId)}${rage ? ` (rage ${String(rage.payload["to"])})` : ""}`,
      };
    }
    case "invade": {
      const instance = findInstance(before, action.cardInstanceId);
      const icon = instance
        ? (before.cards[instance.cardId]?.invadeZones ?? 0)
        : 0;
      return {
        kind: "invade",
        text: `${who} invades with ${card(action.cardInstanceId)} for ${icon}`,
      };
    }
    case "invadeFromDeck": {
      // E21 (EBP03-004): the deck's top card is public once it is sent (8.6.1.1).
      const sent = entries.find(
        (e) => e.type === "discard" || e.type === "mill",
      );
      const ids = sent?.payload["cardIds"];
      const cardId = Array.isArray(ids) ? ids[0] : sent?.payload["cardId"];
      const icon =
        typeof cardId === "number"
          ? (before.cards[cardId]?.invadeZones ?? 0)
          : 0;
      return {
        kind: "invade",
        text: sent
          ? `${who} invades with the top card of ${names.whose(actor, actor)} deck, ${named(before, cardId)}, for ${icon}`
          : `${who} invades with the top card of ${names.whose(actor, actor)} deck`,
      };
    }
    case "pass":
      return { kind: "pass", text: `${who} passes` };
    case "concede":
      return { kind: "concede", text: `${who} concedes` };
    case "manual":
      return { kind: "choice", text: `${who} makes a choice` };
    case "choose": {
      const result = resultLine(after, entries, actor, names);
      if (result) return result;
      if (before.pendingChoice?.private)
        return { kind: "choice", text: `${who} makes a choice` };
      return choiceLine(before, action, names);
    }
  }
}
