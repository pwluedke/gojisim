import { getCardText } from "@gojisim/cards";
import { requireChoice } from "./choices";
import { abilitiesOf, type Located, locate } from "./interpreter";
import { advanceMonster, retreatMonster } from "./movement";
import { shuffleInPlace } from "./rng";
import { cardOf, topOf } from "./rules";
import { appendLog, drawCards, getPlayer, moved, setRage } from "./state";
import type {
  CardInstance,
  GameState,
  LogEntry,
  ManualOp,
  PlayerId,
  PlayerState,
} from "./types";
import { ZONE_NUMBERS } from "./types";

/**
 * Manual override (spec "Manual override", format.md change 10): when a card without ability data
 * would have its text apply, the engine opens a window in which both players may move cards,
 * change rage, advance or retreat a monster, draw, shuffle and reveal. Every manual action is
 * logged with the card that caused it, and the log is public.
 */

/** Whether a card is manual (no ability data) and has text that could do something. */
function isManualWithText(state: GameState, card: CardInstance): boolean {
  if (abilitiesOf(state, card).status !== "manual") return false;
  return getCardText(cardOf(state, card)).text.trim() !== "";
}

/**
 * Why `event` would trigger the text of the manual card `source`, or `null`. The engine can't
 * read manual text, so it offers a window at the moments the text most often refers to: the card
 * is played or placed in a strategy zone, the phase its text names begins, or it invades.
 */
export function manualReason(
  state: GameState,
  event: LogEntry,
  source: CardInstance,
  master: PlayerId,
): string | null {
  if (!isManualWithText(state, source)) return null;
  const own = event.payload["instanceId"] === source.instanceId;
  const played =
    (event.type === "place" &&
      (event.payload["from"] === "resolutionArea" ||
        event.payload["played"] === true)) ||
    event.type === "newInvadingMonster";
  if (own && played)
    return String(event.payload["to"]).startsWith("strategy")
      ? "strategy"
      : "played";
  const text = getCardText(cardOf(state, source)).text.toLowerCase();
  if (event.type === "phaseBegins") {
    const phase = String(event.payload["phase"]);
    const yours = state.turnPlayer === master;
    const names =
      text.includes(`beginning of the ${phase} phase`) ||
      text.includes(
        `beginning of ${yours ? "your" : "your opponent's"} ${phase} phase`,
      );
    return names ? `phase ${phase}` : null;
  }
  if (
    event.type === "advance" &&
    event.payload["invasion"] === true &&
    event.player === master &&
    topOf(getPlayer(state, master).invadingMonsterZone)?.instanceId ===
      source.instanceId &&
    (text.includes("[invading]") || text.includes("when this card invades"))
  )
    return "invading";
  return null;
}

/** Queues a manual window for `source` (once per card and reason while it waits). */
export function queueManual(
  state: GameState,
  source: CardInstance,
  master: PlayerId,
  reason: string,
): void {
  if (
    state.manualQueue.some(
      (m) => m.instanceId === source.instanceId && m.reason === reason,
    )
  )
    return;
  state.manualQueue.push({
    instanceId: source.instanceId,
    cardId: source.cardId,
    master,
    reason,
  });
}

/**
 * Opens the next queued manual window as a `manual` choice for the card's master. Called by the
 * check timing once no ability is left in standby. Returns whether a window opened.
 */
export function openManualWindow(state: GameState): boolean {
  const next = state.manualQueue.shift();
  if (!next) return false;
  appendLog(state, "manualWindow", next.master, {
    rule: "manual override",
    cardId: next.cardId,
    reason: next.reason,
  });
  requireChoice(state, next.master, "manual", "manual override", [
    { id: "done", cardId: next.cardId, abilityId: null },
  ]);
  return true;
}

/** Closes the manual window: revealed cards go back to normal (5.10.1.1). */
export function closeManualWindow(state: GameState): void {
  state.revealed = [];
  appendLog(state, "manualDone", null, { rule: "manual override" });
}

const PUBLIC_AREAS = new Set([
  "zones",
  "monster",
  "strategy",
  "discard",
  "under",
]);

/** Takes a located card out of its area (only that card: a stack keeps the rest). */
function take(found: Located): CardInstance {
  const { player, card, area, zone } = found;
  if ((area === "zones" || area === "under") && zone !== undefined) {
    const stack = player.zones[zone].find((s) =>
      s.some((c) => c.instanceId === card.instanceId),
    );
    if (stack) {
      stack.splice(stack.indexOf(card), 1);
      if (stack.length === 0)
        player.zones[zone] = player.zones[zone].filter((s) => s !== stack);
    }
    return card;
  }
  if (area === "monster" || area === "under") {
    const index = player.invadingMonsterZone.findIndex(
      (c) => c.instanceId === card.instanceId,
    );
    if (index >= 0) {
      player.invadingMonsterZone.splice(index, 1);
      return card;
    }
  }
  if (area === "strategy") {
    for (const [i, placements] of player.strategyZones.entries())
      player.strategyZones[i] = placements.filter(
        (p) => p.card.instanceId !== card.instanceId,
      );
    return card;
  }
  const list =
    area === "hand"
      ? player.hand
      : area === "deck"
        ? player.deck
        : area === "discard"
          ? player.discard
          : player.monsterDeck;
  list.splice(
    list.findIndex((c) => c.instanceId === card.instanceId),
    1,
  );
  return card;
}

/** Why a manual operation is not allowed, or `null` if it is. */
export function manualProblem(
  state: GameState,
  player: PlayerId,
  op: ManualOp,
): string | null {
  if (state.result !== null) return "game over";
  if (state.pendingChoice?.kind !== "manual") return "no manual window is open";
  if (!state.players.some((p) => p.id === player))
    return `unknown player ${player}`;
  const known = (id: PlayerId) => state.players.some((p) => p.id === id);
  switch (op.kind) {
    case "move": {
      if (!locate(state, op.instanceId)) return `no card ${op.instanceId}`;
      const to = op.to;
      if (to.area === "zone" && !ZONE_NUMBERS.includes(to.zone))
        return "bad zone";
      if (
        to.area === "strategy" &&
        "strategyZone" in to &&
        to.strategyZone !== 1 &&
        to.strategyZone !== 2
      )
        return "bad strategy zone";
      return null;
    }
    case "reveal":
      return locate(state, op.instanceId) ? null : `no card ${op.instanceId}`;
    case "rage":
      return known(op.player) && Number.isInteger(op.delta) && op.delta !== 0
        ? null
        : "bad rage change";
    case "draw":
      return known(op.player) &&
        Number.isInteger(op.count) &&
        op.count >= 1 &&
        op.count <= 10
        ? null
        : "bad draw";
    default:
      return known(op.player) ? null : `unknown player ${op.player}`;
  }
}

/** Performs a manual operation and logs it, with the card that opened the window. */
export function performManual(
  state: GameState,
  by: PlayerId,
  op: ManualOp,
): void {
  const cause = state.pendingChoice?.options[0]?.cardId ?? null;
  const log = (payload: Record<string, unknown>) =>
    appendLog(state, "manual", by, {
      rule: "manual override",
      cause,
      kind: op.kind,
      ...payload,
    });
  switch (op.kind) {
    case "move": {
      const found = locate(state, op.instanceId) as Located;
      const owner = getPlayer(state, found.card.owner);
      const card = take(found);
      const toZone = op.to.area === "zone";
      // Zone to zone keeps the card's identity (4.1.4); any other move makes a new object.
      const arrived =
        toZone && found.area === "zones" ? card : moved(state, card);
      const to = op.to;
      if (to.area === "hand") owner.hand.push(arrived);
      else if (to.area === "deckTop") owner.deck.unshift(arrived);
      else if (to.area === "deckBottom") owner.deck.push(arrived);
      else if (to.area === "discard") owner.discard.push(arrived);
      else if (to.area === "monsterDeck") owner.monsterDeck.push(arrived);
      else if (to.area === "monster") owner.invadingMonsterZone.push(arrived);
      else if (to.area === "zone") owner.zones[to.zone].push([arrived]);
      else if ("strategyZone" in to)
        owner.strategyZones[to.strategyZone - 1]?.push({
          card: arrived,
          placedOnTurn: state.turn,
        });
      const toPublic = ![
        "hand",
        "deckTop",
        "deckBottom",
        "monsterDeck",
      ].includes(to.area);
      const seen =
        PUBLIC_AREAS.has(found.area) ||
        toPublic ||
        state.revealed.includes(found.card.instanceId);
      log({
        player: owner.id,
        from: found.area,
        to,
        ...(seen ? { cardId: arrived.cardId } : {}),
      });
      return;
    }
    case "reveal": {
      const found = locate(state, op.instanceId) as Located;
      if (!state.revealed.includes(found.card.instanceId))
        state.revealed.push(found.card.instanceId);
      log({
        player: found.player.id,
        from: found.area,
        cardId: found.card.cardId,
      });
      return;
    }
    case "rage": {
      const player = getPlayer(state, op.player);
      log({ player: op.player, delta: op.delta });
      setRage(state, player, player.rage + op.delta, "3.4.1", { manual: true });
      return;
    }
    case "advance":
    case "retreat": {
      const player: PlayerState = getPlayer(state, op.player);
      log({ player: op.player });
      if (op.kind === "advance")
        advanceMonster(state, player, {
          invasion: false,
          rule: "manual override",
        });
      else retreatMonster(state, player, "manual override");
      return;
    }
    case "draw": {
      const player = getPlayer(state, op.player);
      log({ player: op.player, count: drawCards(state, player, op.count) });
      return;
    }
    case "shuffle": {
      shuffleInPlace(state, getPlayer(state, op.player).deck);
      log({ player: op.player });
      return;
    }
  }
}
