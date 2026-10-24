import {
  type Combo,
  type ComboCondition,
  type ComboEvent,
  getCombos,
} from "@gojisim/cards";
import { getCounterPower } from "../stats";
import type {
  Action,
  CardInstance,
  GameState,
  LogEntry,
  PlayerId,
} from "../types";

/**
 * Combo detection (M5g): a pure module outside the rules. It reads each applied action and the
 * log entries it produced (the events) and tracks every combo's progress per player, across
 * turns where a combo spans them. A combo fires only when its success condition
 * (`docs/combos/combos.md`, as data in `@gojisim/cards`) is met, once per occurrence. It never
 * changes the game state.
 */

/** A combo that succeeded. */
export interface ComboHit {
  comboId: string;
  name: string;
  player: PlayerId;
  /** The combo's cards, by deck card number. */
  cards: string[];
  turn: number;
  /** The record's action that completed it (0-based). */
  actionIndex: number;
  /** The log length after that action: its callout goes after the action's lines. */
  afterSeq: number;
}

/** The ability being resolved (from `resolveAbility`); it may pause across actions. */
interface Resolving {
  abilityId: string;
  standbyId: string;
  master: PlayerId;
}

/** Progress of one combo for one player. Plain JSON, so it can be stored or copied. */
interface Progress {
  /** sameTurn: the turn counted, its counts by event index, and whether it fired. */
  turn?: number;
  counts?: number[];
  fired?: boolean;
  /** foundThenBurst: searched cards still in hand; the Burst-played card's turn. */
  found?: string[];
  armedTurn?: number | null;
  /** paidCost: standbys whose cost was paid with the rank, their destroy counts, the fired. */
  paid?: Record<string, number>;
  done?: string[];
  /** playedThenEvolved: cards played per standby, and the full sets waiting to evolve. */
  played?: Record<string, { card: string; instanceId: string }[]>;
  waiting?: { instanceIds: string[]; turn: number; evolved: number }[];
  /** evolvedThenDraw: the turn a `from` card was evolved by the ability. */
  evolvedTurn?: number | null;
  /** boardState: card instances already called out. */
  seen?: string[];
}

export interface ComboTracker {
  resolving: Resolving | null;
  progress: Record<string, Record<string, Progress>>;
}

export function newComboTracker(): ComboTracker {
  return { resolving: null, progress: {} };
}

const numberOf = (state: GameState, cardId: unknown): string | undefined =>
  typeof cardId === "number" ? state.cards[cardId]?.deckCardNumber : undefined;

const otherPlayer = (state: GameState, player: PlayerId): PlayerId =>
  (state.players.find((p) => p.id !== player)?.id ?? player) as PlayerId;

/**
 * Feeds one applied action to the tracker: `before` is the state it was applied to, `after` the
 * state at the next decision. Returns the combos it completed (and updates `tracker`).
 */
export function detectCombos(
  tracker: ComboTracker,
  before: GameState,
  action: Action,
  after: GameState,
  actionIndex: number,
  combos: readonly Combo[] = getCombos(),
): ComboHit[] {
  const hits: ComboHit[] = [];
  const entries = after.log.slice(before.log.length);
  let turn = before.turn;
  let turnPlayer = before.turnPlayer;
  const progressOf = (combo: Combo, player: PlayerId): Progress => {
    const byPlayer = (tracker.progress[combo.id] ??= {});
    return (byPlayer[player] ??= {});
  };
  const fire = (combo: Combo, player: PlayerId) =>
    hits.push({
      comboId: combo.id,
      name: combo.name,
      player,
      cards: combo.cards,
      turn,
      actionIndex,
      afterSeq: after.log.length,
    });
  /** The master of an ability named in an entry: the one resolving it, else the entry's player. */
  const masterOf = (abilityId: unknown, entry: LogEntry): PlayerId | null => {
    const r = tracker.resolving;
    if (r && r.abilityId === abilityId) return r.master;
    return entry.player;
  };

  // A searched card leaves the hand: unless this action Burst-plays it, it no longer counts.
  const inHand = (player: PlayerId) =>
    new Set(
      (after.players.find((p) => p.id === player)?.hand ?? []).map(
        (c: CardInstance) => c.instanceId,
      ),
    );

  for (const entry of entries) {
    if (entry.type === "beginTurn") {
      turn = Number(entry.payload["turn"] ?? turn);
      if (entry.player) turnPlayer = entry.player;
    }
    if (entry.type === "resolveAbility" && entry.player)
      tracker.resolving = {
        abilityId: String(entry.payload["abilityId"]),
        standbyId: String(entry.payload["standbyId"]),
        master: entry.player,
      };
    for (const combo of combos) step(combo, combo.success, entry);
  }
  for (const combo of combos) afterAction(combo, combo.success);
  return hits;

  function step(combo: Combo, condition: ComboCondition, entry: LogEntry) {
    const p = entry.payload;
    switch (condition.kind) {
      case "sameTurn": {
        const amount = (event: ComboEvent): [PlayerId, number] | null => {
          if (event.event === "destroy" && entry.type === "destroy") {
            if (p["cause"] !== event.by) return null;
            const master = masterOf(event.by, entry);
            const cards = (p["cardIds"] as unknown[] | undefined)?.length ?? 0;
            return master ? [master, cards] : null;
          }
          if (event.event === "play" && entry.type === "place") {
            if (p["abilityId"] !== event.by || p["played"] !== true)
              return null;
            const card = after.cards[p["cardId"] as number];
            return card?.type === event.type && entry.player
              ? [entry.player, 1]
              : null;
          }
          if (event.event === "rageTaken" && entry.type === "rageChanged") {
            if (p["abilityId"] !== event.by || !entry.player) return null;
            const taken = Number(p["from"]) - Number(p["to"]);
            return taken > 0 ? [otherPlayer(after, entry.player), taken] : null;
          }
          return null;
        };
        condition.events.forEach((event, i) => {
          const got = amount(event);
          if (!got) return;
          const [player, n] = got;
          const progress = progressOf(combo, player);
          if (progress.turn !== turn) {
            progress.turn = turn;
            progress.counts = condition.events.map(() => 0);
            progress.fired = false;
          }
          const counts = progress.counts as number[];
          counts[i] = (counts[i] ?? 0) + n;
          const met = condition.events.every(
            (e, j) => (counts[j] ?? 0) >= e.min,
          );
          const total = counts.reduce((a, b) => a + b, 0);
          if (met && total >= (condition.total ?? 0) && !progress.fired) {
            progress.fired = true;
            fire(combo, player);
          }
        });
        return;
      }
      case "foundThenBurst": {
        if (
          entry.type === "addToHand" &&
          p["abilityId"] === condition.foundBy &&
          numberOf(after, p["cardId"]) === condition.card &&
          entry.player
        ) {
          // The log never links a hand card to its instance (4.1.4: the opponent mustn't follow
          // it), so the card is found in the state: the copy that came to the hand in this step
          // (instance ids are issued in order).
          const progress = progressOf(combo, entry.player);
          const tracked = new Set(progress.found ?? []);
          const fresh = (
            after.players.find((x) => x.id === entry.player)?.hand ?? []
          ).find(
            (c) =>
              c.cardId === p["cardId"] &&
              Number(c.instanceId.slice(1)) >= before.nextInstanceId &&
              !tracked.has(c.instanceId),
          );
          if (fresh) progress.found = [...tracked, fresh.instanceId];
        }
        if (
          entry.type === "place" &&
          p["burst"] === true &&
          entry.player &&
          action.type === "playMonster" &&
          action.player === entry.player &&
          numberOf(after, p["cardId"]) === condition.card
        ) {
          const progress = progressOf(combo, entry.player);
          if (progress.found?.includes(action.cardInstanceId)) {
            progress.found = progress.found.filter(
              (id) => id !== action.cardInstanceId,
            );
            progress.armedTurn = turn;
          }
        }
        if (entry.type === "destroy" && p["cause"] === condition.enter) {
          const master = masterOf(condition.enter, entry);
          const progress = master ? progressOf(combo, master) : null;
          if (master && progress?.armedTurn === turn) {
            const cards = (p["cardIds"] as unknown[] | undefined)?.length ?? 0;
            if (cards >= condition.destroys) {
              progress.armedTurn = null;
              fire(combo, master);
            }
          }
        }
        return;
      }
      case "paidCost": {
        const r = tracker.resolving;
        if (
          entry.type === "discard" &&
          p["abilityId"] === condition.ability &&
          r?.abilityId === condition.ability
        ) {
          const rank = after.cards[p["cardId"] as number]?.rank ?? null;
          const { op, value } = condition.paidRank;
          if (rank !== null && (op === "=" ? rank === value : rank >= value)) {
            const progress = progressOf(combo, r.master);
            progress.paid = { ...progress.paid, [r.standbyId]: 0 };
          }
        }
        if (
          entry.type === "destroy" &&
          p["cause"] === condition.ability &&
          r?.abilityId === condition.ability
        ) {
          const progress = progressOf(combo, r.master);
          const sofar = progress.paid?.[r.standbyId];
          if (sofar === undefined || progress.done?.includes(r.standbyId))
            return;
          const now =
            sofar + ((p["cardIds"] as unknown[] | undefined)?.length ?? 0);
          progress.paid = { ...progress.paid, [r.standbyId]: now };
          if (now >= condition.destroys) {
            progress.done = [...(progress.done ?? []), r.standbyId];
            fire(combo, r.master);
          }
        }
        return;
      }
      case "playedThenEvolved": {
        const r = tracker.resolving;
        if (
          entry.type === "place" &&
          p["abilityId"] === condition.playedBy &&
          p["from"] === "discard" &&
          p["played"] === true &&
          r?.abilityId === condition.playedBy &&
          entry.player
        ) {
          const progress = progressOf(combo, entry.player);
          const sofar = [
            ...(progress.played?.[r.standbyId] ?? []),
            {
              card: numberOf(after, p["cardId"]) ?? "",
              instanceId: String(p["instanceId"]),
            },
          ];
          progress.played = { ...progress.played, [r.standbyId]: sofar };
          // Every listed card, each a different played card.
          const left = [...sofar];
          const all = condition.cards.every((card) => {
            const i = left.findIndex((s) => s.card === card);
            if (i < 0) return false;
            left.splice(i, 1);
            return true;
          });
          if (all) {
            progress.waiting = [
              ...(progress.waiting ?? []),
              { instanceIds: sofar.map((s) => s.instanceId), turn, evolved: 0 },
            ];
            const { [r.standbyId]: _done, ...rest } = progress.played;
            progress.played = rest;
          }
        }
        if (entry.type === "evolve" && entry.player) {
          const progress = progressOf(combo, entry.player);
          for (const wait of progress.waiting ?? []) {
            if (!wait.instanceIds.includes(String(p["fromInstanceId"])))
              continue;
            wait.evolved += 1;
            if (wait.evolved === condition.evolves) fire(combo, entry.player);
          }
          progress.waiting = (progress.waiting ?? []).filter(
            (w) => w.evolved < condition.evolves,
          );
        }
        // The window closes at the end of the master's next main phase (the counter phase
        // begins), counted from the turn the cards were played.
        if (
          entry.type === "phaseBegins" &&
          p["phase"] === "counter" &&
          turnPlayer
        ) {
          const progress = progressOf(combo, turnPlayer);
          progress.waiting = (progress.waiting ?? []).filter(
            (w) => w.turn >= turn,
          );
        }
        return;
      }
      case "evolvedThenDraw": {
        if (
          entry.type === "evolve" &&
          p["abilityId"] === condition.evolvedBy &&
          numberOf(after, p["from"]) === condition.from &&
          entry.player
        )
          progressOf(combo, entry.player).evolvedTurn = turn;
        if (
          entry.type === "draw" &&
          p["abilityId"] === condition.then &&
          entry.player
        ) {
          const progress = progressOf(combo, entry.player);
          if (progress.evolvedTurn === turn) {
            progress.evolvedTurn = null;
            fire(combo, entry.player);
          }
        }
        return;
      }
      case "boardState":
        return;
    }
  }

  /** Checks after the whole action: board states, and searched cards that left the hand. */
  function afterAction(combo: Combo, condition: ComboCondition) {
    if (condition.kind === "foundThenBurst") {
      for (const player of after.players) {
        const progress = tracker.progress[combo.id]?.[player.id];
        if (!progress?.found?.length) continue;
        const hand = inHand(player.id);
        progress.found = progress.found.filter((id) => hand.has(id));
      }
    }
    if (condition.kind !== "boardState") return;
    for (const player of after.players) {
      const tops = Object.values(player.zones).flatMap((stacks) =>
        stacks.flatMap((stack) => {
          const top = stack[stack.length - 1];
          return top ? [top] : [];
        }),
      );
      const numbers = new Set(tops.map((c) => numberOf(after, c.cardId)));
      if (!condition.with.every((n) => numbers.has(n))) continue;
      for (const stack of player.zones[condition.zone as 1]) {
        const top = stack[stack.length - 1];
        if (!top || numberOf(after, top.cardId) !== condition.card) continue;
        const printed = after.cards[top.cardId]?.counterOrThreat ?? 0;
        if (getCounterPower(after, top) - printed < condition.counterPowerBonus)
          continue;
        const progress = progressOf(combo, player.id as PlayerId);
        if (progress.seen?.includes(top.instanceId)) continue;
        progress.seen = [...(progress.seen ?? []), top.instanceId];
        fire(combo, player.id as PlayerId);
      }
    }
  }
}

/** Every combo in a record: `states[i]` is the state after `i` of its `actions`. */
export function combosInGame(
  states: readonly GameState[],
  actions: readonly Action[],
  combos: readonly Combo[] = getCombos(),
): ComboHit[] {
  const tracker = newComboTracker();
  const hits: ComboHit[] = [];
  actions.forEach((action, i) => {
    const before = states[i];
    const after = states[i + 1];
    if (before && after)
      hits.push(...detectCombos(tracker, before, action, after, i, combos));
  });
  return hits;
}
