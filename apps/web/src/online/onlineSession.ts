import type {
  Action,
  BoardModel,
  GameRecord,
  GameState,
} from "@gojisim/engine";
import type { Session } from "../game/session";
import type { SeatMessage } from "./client";
import { stateFromView } from "./shadow";

/*
 * A head to head game as `/play`'s `Session` (M9b), built from the server's messages: one
 * display state per action count (from the seat's view), the actions as this seat may know them,
 * and the server's board model for each. The record holds no decks and no seed: the browser
 * never replays a head to head game; the server keeps the real one.
 */

export interface OnlineState {
  session: Session;
  /**
   * Counts the times the game started fresh in the browser (the first message, a rejoin, a gap):
   * `/play` resets its sounds, animations and callouts for each, as for a loaded record.
   */
  epoch: number;
  /** The server's board for each action count; `null` where the browser hasn't got it yet. */
  models: (BoardModel | null)[];
}

const other = (seat: "P1" | "P2") => (seat === "P1" ? "P2" : "P1");

function recordOf(m: SeatMessage, actions: Action[]): GameRecord {
  const opponent = other(m.you);
  return {
    version: 1,
    seed: 0,
    decks: [
      { id: "P1", monsterDeck: [], mainDeck: [] },
      { id: "P2", monsterDeck: [], mainDeck: [] },
    ],
    actions,
    gameId: m.gameId,
    h2h: true,
    mode: m.mode,
    seats: {
      P1: { kind: "human", playerName: m.names.P1 ?? "" },
      P2: { kind: "human", playerName: m.names.P2 ?? "" },
    },
    // The opponent's deck is a Mystery deck until the game is over (Q42).
    deckNames: {
      [m.you]: m.yourDeckName ?? "Mystery Deck",
      ...(m.opponent?.deckName ? { [opponent]: m.opponent.deckName } : {}),
    },
    ...(m.outcome ? { outcome: m.outcome } : {}),
    ...(m.h2hEnd ? { h2hEnd: m.h2hEnd } : {}),
  };
}

function sessionOf(
  m: SeatMessage,
  actions: Action[],
  states: GameState[],
): Session {
  return {
    record: recordOf(m, actions),
    states,
    position: states.length - 1,
    seats: {
      [m.you]: { kind: "human" },
      [other(m.you)]: { kind: "online" },
    } as Session["seats"],
    botSeed: "",
    labels: [],
  };
}

/**
 * The game after a server message. `actions` is the full action list a join or rejoin answered
 * with (it starts a fresh game in the browser); otherwise the message's steps extend the game,
 * an undo (fewer actions) shortens it, and anything that doesn't line up starts it fresh from the
 * message's board, with the earlier boards fetched when the history view needs them.
 */
export function applyMessage(
  prev: OnlineState | null,
  m: SeatMessage,
  actions?: Action[],
): OnlineState | null {
  if (!m.model) return prev;
  const latest = stateFromView(m.model.view);
  const fresh = (list: Action[]): OnlineState => {
    const states = Array.from({ length: m.seq + 1 }, () => latest);
    const models: (BoardModel | null)[] = Array.from(
      { length: m.seq + 1 },
      () => null,
    );
    models[m.seq] = m.model;
    return {
      session: sessionOf(m, list, states),
      models,
      epoch: (prev?.epoch ?? 0) + 1,
    };
  };
  if (actions) return fresh(actions.slice(0, m.seq));
  if (!prev) return fresh(placeholders(m));
  const had = prev.session.record.actions.length;
  if (m.seq < had) {
    // An undo: back to the earlier count, with the server's board for it.
    const list = prev.session.record.actions.slice(0, m.seq);
    const states = prev.session.states.slice(0, m.seq + 1);
    states[m.seq] = latest;
    const models = prev.models.slice(0, m.seq + 1);
    models[m.seq] = m.model;
    return { session: sessionOf(m, list, states), models, epoch: prev.epoch };
  }
  const steps = m.steps.filter((s) => s.seq > had);
  if (
    m.seq === had + steps.length &&
    steps.every((s, i) => s.seq === had + i + 1)
  ) {
    const list = [
      ...prev.session.record.actions,
      ...steps.map((s) => s.action),
    ];
    const states = [
      ...prev.session.states,
      ...steps.map((s) => stateFromView(s.model.view)),
    ];
    const models = [...prev.models, ...steps.map((s) => s.model)];
    // The same count again (presence, an undo request): the latest board, in case it changed.
    states[m.seq] = latest;
    models[m.seq] = m.model;
    return { session: sessionOf(m, list, states), models, epoch: prev.epoch };
  }
  return fresh(placeholders(m));
}

/** Actions the browser lacks (a gap it can't fill): passes, never shown or replayed. */
function placeholders(m: SeatMessage): Action[] {
  return Array.from({ length: m.seq }, () => ({ type: "pass", player: m.you }));
}

/** A past board from the server (`history`) for the history view. */
export function withHistoryBoard(
  prev: OnlineState,
  index: number,
  model: BoardModel,
): OnlineState {
  if (index < 0 || index >= prev.session.states.length) return prev;
  const states = [...prev.session.states];
  states[index] = stateFromView(model.view);
  const models = [...prev.models];
  models[index] = model;
  return { ...prev, session: { ...prev.session, states }, models };
}
