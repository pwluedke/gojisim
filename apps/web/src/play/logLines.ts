import type { Card } from "@gojisim/cards";
import type { Action, ComboHit, GameState, LogEntry } from "@gojisim/engine";
import { difficultyName } from "../game/bots";
import { actionLabel, findInstance } from "../game/labels";
import type { PlayerId, Session } from "../game/session";

/** A piece of a log line: plain text, or a card name that opens the preview. */
export type LogPart = string | { card: Card };

export interface LogLine {
  key: string;
  kind: "turn" | "action" | "event" | "combo";
  /** The session position this line shows when clicked (the state after its action). */
  position: number;
  parts: LogPart[];
  /** Rule number, shown with the "Show rule numbers" setting. */
  rule: string | null;
}

/** The rule each hand action follows (8.2 to 8.6); concession is 1.2.3. */
const ACTION_RULES: Partial<Record<Action["type"], string>> = {
  playBattle: "8.2",
  activateStrategy: "8.3",
  gainRage: "8.4",
  playMonster: "8.5",
  invade: "8.6",
  concede: "1.2.3",
};

/** Splits `text` around the names of `cards` ("Name [number]"), so each name becomes a link. */
function linkify(text: string, cards: Card[]): LogPart[] {
  let parts: LogPart[] = [text];
  for (const card of cards) {
    const name = `${card.name} [${card.cardNumber}]`;
    parts = parts.flatMap((part) => {
      if (typeof part !== "string" || !part.includes(name)) return [part];
      const pieces = part.split(name);
      return pieces.flatMap((piece, i) =>
        i === 0 ? [piece] : [{ card }, piece],
      );
    });
  }
  return parts.filter((part) => part !== "");
}

/**
 * An action in plain words for the log: `actionLabel`, except the choices whose button labels
 * carry ability ids and rule numbers (confirm, standby order, replacement order, manual).
 */
function actionText(state: GameState, action: Action): string {
  const choice = state.pendingChoice;
  if (action.type !== "choose" || !choice) return actionLabel(state, action);
  const named = (cardId: number | null | undefined) => {
    const card =
      cardId === null || cardId === undefined ? undefined : state.cards[cardId];
    return card ? `${card.name} [${card.cardNumber}]` : "a card";
  };
  const option = choice.options.find((o) => o.id === action.optionId);
  switch (choice.kind) {
    case "confirm": {
      const source = named(state.resolution?.standby.sourceCardId);
      return action.optionId === "yes"
        ? `uses ${source}'s ability`
        : `doesn't use ${source}'s ability`;
    }
    case "standbyOrder":
      return `resolves ${named(option?.cardId)}'s ability first`;
    case "replacementOrder":
      return `applies ${named(option?.cardId)}'s replacement first`;
    case "manual":
      return "closes the manual override";
    default:
      return actionLabel(state, action);
  }
}

/** The cards an action names: its hand card, or the card behind a chosen option. */
function actionCards(state: GameState, action: Action): Card[] {
  if (
    action.type === "choose" &&
    state.pendingChoice?.kind === "standbyOrder"
  ) {
    const option = state.pendingChoice.options.find(
      (o) => o.id === action.optionId,
    );
    const card =
      option?.cardId != null ? state.cards[option.cardId] : undefined;
    return card ? [card] : [];
  }
  if ("cardInstanceId" in action) {
    const instance = findInstance(state, action.cardInstanceId);
    const card = instance && state.cards[instance.cardId];
    return card ? [card] : [];
  }
  if (action.type === "choose") {
    const option = state.pendingChoice?.options.find(
      (o) => o.id === action.optionId,
    );
    const card =
      option?.cardId !== null && option?.cardId !== undefined
        ? state.cards[option.cardId]
        : undefined;
    return card ? [card] : [];
  }
  return [];
}

/**
 * An engine event in plain words (M5d), or `null` for events the battle log leaves out. Log
 * payloads hold public information only (decision 45), so a hidden draw is a count.
 */
function eventParts(
  state: GameState,
  entry: LogEntry,
  name: (id: string) => string,
): LogPart[] | null {
  const p = entry.payload;
  const who = entry.player ? name(entry.player) : "";
  const whose = who === "You" ? "Your" : `${who}'s`;
  const card = (id: unknown) =>
    typeof id === "number" && state.cards[id]
      ? { card: state.cards[id] as Card }
      : "a card";
  const cards = (ids: unknown): LogPart[] =>
    Array.isArray(ids)
      ? ids.flatMap((id, i) => (i === 0 ? [card(id)] : [", ", card(id)]))
      : [];
  switch (entry.type) {
    case "draw": {
      const count = Number(p["count"] ?? 0);
      if (count === 0) return null;
      return [`${who} draw${who === "You" ? "" : "s"} ${count}`];
    }
    case "advance":
    case "retreat":
      return [`${whose} monster ${entry.type}s to zone ${String(p["to"])}`];
    case "moveBehind":
      return [
        `${whose} monster moves back to zone ${String(p["to"])}${p["asCountered"] ? " (as though countered)" : ""}`,
      ];
    case "counterCheck":
      return p["countered"]
        ? [
            `Counter! ${whose} counter power ${String(p["total"])} meets threat ${String(p["threat"])}`,
          ]
        : [
            `No counter: ${whose} counter power ${String(p["total"])} is below threat ${String(p["threat"])}`,
          ];
    case "counter":
      return [`${whose} monster is countered`];
    case "newInvadingMonster":
      return [`${whose} next monster: `, card(p["cardId"])];
    case "destroy": {
      const where =
        p["zone"] !== undefined ? `zone ${String(p["zone"])}` : "strategy zone";
      return [
        ...cards(p["cardIds"]),
        ` destroyed in ${who === "You" ? "your" : whose} ${where}`,
      ];
    }
    case "rageChanged":
      // A hand card discarded for rage already has its action line (8.4).
      if (String(p["rule"]).startsWith("8.4")) return null;
      return [`${whose} rage ${String(p["from"])} → ${String(p["to"])}`];
    case "discard":
      // Rage and invasion discards already have their action line (8.4, 8.6).
      if (/^8\.[46]/.test(String(p["rule"]))) return null;
      return [`${who} discard${who === "You" ? "" : "s"} `, card(p["cardId"])];
    case "burstDiscard":
      return [
        `${who} discard${who === "You" ? "" : "s"} `,
        card(p["cardId"]),
        " (Burst)",
      ];
    case "evolve":
      return [card(p["from"]), " evolves into ", card(p["to"])];
    case "mill":
      return [
        `${who} send${who === "You" ? "" : "s"} `,
        ...cards(p["cardIds"]),
        " from the deck to the discard pile",
      ];
    case "lookTop":
      return [
        `${who} look${who === "You" ? "" : "s"} at the top ${String(p["count"])} and keep${who === "You" ? "" : "s"} ${String(p["kept"])} on top`,
      ];
    case "placeUnder":
      return p["cardId"] === undefined
        ? [
            `${who} place${who === "You" ? "" : "s"} a card under `,
            card(p["under"]),
          ]
        : [card(p["cardId"]), " goes under ", card(p["under"])];
    case "returnDiscardToDeck":
      return [
        `${whose} discard pile (${String(p["count"])}) goes back into the deck`,
      ];
    case "swap":
      return [...cards(p["cardIds"]), " swap places"];
    case "counterPrevented":
      return p["moves"]
        ? [`${whose} monster can't be countered: it only moves back`]
        : [`${whose} monster can't be countered`];
    case "destroyPrevented":
      return [
        card(p["cardId"]),
        " can't be destroyed by the opponent's effects",
      ];
    case "chooseOption":
      return null;
    case "tokenGone":
      // A token can't leave the zones: it disappears (9.1.4.2).
      return [card(p["cardId"]), " disappears"];
    case "replace":
      return [card(p["cardId"]), " is replaced: it goes elsewhere instead"];
    case "boost":
      return [
        ...cards(p["cardIds"]),
        ` get ${p["stat"] === "counterPower" ? "counter power" : String(p["stat"])} until the end of the turn`,
      ];
    case "delayedAbility":
      // An ability that lasts for the turn (T8, 10.6.5), e.g. Destroy All Monsters.
      return [
        card(p["cardId"]),
        " sets up an ability until the end of the turn",
      ];
    case "search":
      return [
        `${who} search${who === "You" ? "" : "es"} the deck: ${String(p["found"])} found`,
      ];
    case "addToHand":
      return p["cardId"] === undefined
        ? [`${who} add${who === "You" ? "" : "s"} a card to the hand`]
        : [
            `${who} add${who === "You" ? "" : "s"} `,
            card(p["cardId"]),
            " to the hand",
          ];
    case "reveal":
      return [`${who} reveal${who === "You" ? "" : "s"} `, card(p["cardId"])];
    case "place":
      // Plays from the hand have their action line; effect plays (5.11) don't.
      return p["played"] === true
        ? [card(p["cardId"]), ` enters ${String(p["to"])}`]
        : null;
    case "manualWindow":
      return ["Manual override for ", card(p["cardId"])];
    case "gameOver":
      return p["winner"]
        ? [
            `${name(String(p["winner"]))} win${name(String(p["winner"])) === "You" ? "" : "s"} (${String(p["reason"])})`,
          ]
        : [`Draw (${String(p["reason"] ?? "")})`];
    default:
      return null;
  }
}

/**
 * The battle log (M5d): plain-language lines grouped under turn markers. Each action reads as
 * its `actionLabel` (or the M6d bot label), and another player's private choice reads "makes a
 * private choice". Engine events follow the action that caused them. Every line remembers the
 * session position after its action, for the read-only history view.
 */
export function buildLog(
  session: Session,
  viewer: string,
  name: (id: string) => string,
  combos: readonly ComboHit[] = [],
): LogLine[] {
  const lines: LogLine[] = [];
  /** A seat as log lines name it: "Bot (Medium)" for a bot, else `name` ("You", "P2"). */
  const seatName = (player: string) => {
    const seat = session.seats[player as PlayerId];
    return seat?.kind === "bot"
      ? `Bot (${difficultyName(seat.difficulty)})`
      : name(player);
  };
  const events = (position: number, from: number) => {
    const state = session.states[position] as GameState;
    for (const entry of state.log.slice(from)) {
      if (entry.type === "beginTurn") {
        lines.push({
          key: `t${entry.seq}`,
          kind: "turn",
          position,
          parts: [
            `Turn ${String(entry.payload["turn"])}: ${name(entry.player ?? "")}`,
          ],
          rule: null,
        });
        continue;
      }
      const parts = eventParts(state, entry, name);
      if (parts)
        lines.push({
          key: `e${entry.seq}`,
          kind: "event",
          position,
          parts,
          rule: entry.payload["rule"] ? String(entry.payload["rule"]) : null,
        });
    }
  };
  events(0, 0);
  session.record.actions.forEach((action, i) => {
    const before = session.states[i] as GameState;
    const after = session.states[i + 1];
    if (!after) return;
    const actor = action.player;
    const seat = session.seats[actor as PlayerId];
    const hidden = actor !== viewer;
    const secret =
      hidden && action.type === "choose" && !!before.pendingChoice?.private;
    // Bots read "Bot (Medium): ..." as in the M6d label; a hidden choice only says that it chose.
    const who =
      seat?.kind === "bot"
        ? `Bot (${difficultyName(seat.difficulty)})`
        : name(actor);
    const text = secret
      ? `${who}: makes a private choice`
      : `${who}: ${actionText(before, action)}`;
    const source = before.resolution
      ? before.cards[before.resolution.standby.sourceCardId]
      : undefined;
    const cards = secret
      ? []
      : [...actionCards(before, action), ...(source ? [source] : [])];
    lines.push({
      key: `a${i}`,
      kind: "action",
      position: i + 1,
      parts: linkify(text, cards),
      rule:
        action.type === "choose"
          ? (before.pendingChoice?.rule ?? null)
          : (ACTION_RULES[action.type] ?? null),
    });
    events(i + 1, before.log.length);
    // M5g: a combo this action completed, after the action's own lines.
    for (const hit of combos)
      if (hit.actionIndex === i)
        lines.push({
          key: `c${i}-${hit.comboId}-${hit.player}`,
          kind: "combo",
          position: i + 1,
          parts: [`Combo: ${hit.name} (${seatName(hit.player)})`],
          rule: null,
        });
  });
  return lines;
}
