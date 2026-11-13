import type { Action } from "@gojisim/engine";
import { useCallback, useEffect, useRef, useState } from "react";
import type { Socket } from "socket.io-client";
import {
  ask,
  connectOnline,
  type DeckChoice,
  errorText,
  type SeatMessage,
} from "./client";
import {
  applyMessage,
  type OnlineState,
  withHistoryBoard,
} from "./onlineSession";

/**
 * A head to head game in the browser (M9b): the socket, the latest message for this seat, and
 * the game as `/play`'s session. A refresh or a dropped connection rejoins the same seat (the
 * socket reconnects; each connect sends `rejoin`). Errors from the server show as `error`.
 */
export interface OnlinePlay {
  gameId: string;
  /** Whether the socket is connected now. */
  connected: boolean;
  /** This seat's latest message (`null` until the first one). */
  message: SeatMessage | null;
  game: OnlineState | null;
  error: string | null;
  clearError: () => void;
  /** This player's seat, once they are in the game. */
  seat: "P1" | "P2" | null;
  /** Whether the first rejoin has answered (until then the seat isn't known). */
  checked: boolean;
  join: (deck: DeckChoice) => Promise<boolean>;
  pick: (card: 0 | 1) => void;
  takeAction: (action: Action) => void;
  takeChoices: (optionIds: readonly string[], done: boolean) => void;
  askUndo: () => void;
  answerUndo: (accept: boolean) => void;
  claim: () => void;
  /** M9c: the creator cancels a game nobody has joined. */
  cancel: () => Promise<boolean>;
  /** Asks the server for a past board the browser hasn't got (the history view). */
  ensureBoard: (index: number) => void;
  /** #251: offers or accepts a rematch, with the same deck (`"keep"`) or another. */
  rematch: (deck: DeckChoice | "keep") => void;
  /** #251: declines the other player's rematch offer. */
  declineRematch: () => void;
}

export function useOnline(gameId: string): OnlinePlay {
  const [connected, setConnected] = useState(false);
  const [message, setMessage] = useState<SeatMessage | null>(null);
  const [game, setGame] = useState<OnlineState | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [seat, setSeat] = useState<"P1" | "P2" | null>(null);
  const [checked, setChecked] = useState(false);
  const socketRef = useRef<Socket | null>(null);
  const gameRef = useRef<OnlineState | null>(null);
  gameRef.current = game;
  const asked = useRef(new Set<number>());
  const messageRef = useRef<SeatMessage | null>(null);

  useEffect(() => {
    const socket = connectOnline();
    socketRef.current = socket;
    socket.on("connect", () => {
      setConnected(true);
      // Back into this player's seat, if they have one (a refresh or a reconnect).
      // The server sends the seat's state first, then this answer with every action so far: the
      // game is rebuilt from that state with them (the log and the history view need them).
      void ask(socket, "rejoin", { gameId }).then((answer) => {
        setChecked(true);
        if (!answer.ok) return;
        setSeat(answer["seat"] as "P1" | "P2");
        const actions = answer["actions"] as Action[];
        const last = messageRef.current;
        if (last && last.seq === actions.length)
          setGame((prev) => {
            const next = applyMessage(null, last, actions);
            return next && { ...next, epoch: (prev?.epoch ?? 0) + 1 };
          });
      });
    });
    socket.on("disconnect", () => setConnected(false));
    socket.on("connect_error", (err: Error) => {
      setError(errorText(err.message));
      setChecked(true);
    });
    socket.on("state", (m: SeatMessage) => {
      messageRef.current = m;
      setMessage(m);
      setGame((prev) => applyMessage(prev, m));
    });
    return () => {
      socket.disconnect();
      socketRef.current = null;
    };
  }, [gameId]);

  const send = useCallback(
    async (event: string, payload: object = {}) => {
      const socket = socketRef.current;
      if (!socket) return null;
      const answer = await ask(socket, event, { gameId, ...payload });
      if (!answer.ok) setError(errorText(answer.error));
      return answer;
    },
    [gameId],
  );
  const seq = () => gameRef.current?.session.record.actions.length ?? 0;

  return {
    gameId,
    connected,
    message,
    game,
    error,
    clearError: () => setError(null),
    seat,
    checked,
    join: async (deck) => {
      const answer = await send("join", { deck });
      if (!answer?.ok) return false;
      setSeat(answer["seat"] as "P1" | "P2");
      return true;
    },
    pick: (card) => void send("pick", { card }),
    takeAction: (action) =>
      void (action.type === "concede"
        ? send("concede")
        : send("act", { seq: seq(), action })),
    takeChoices: (optionIds, done) =>
      void send("pick-cards", { seq: seq(), optionIds, done }),
    askUndo: () => void send("undo-ask"),
    answerUndo: (accept) => void send("undo-answer", { accept }),
    claim: () => void send("claim"),
    cancel: async () => (await send("cancel"))?.ok === true,
    rematch: (deck) => void send("rematch", { deck }),
    declineRematch: () => void send("rematch-decline"),
    ensureBoard: (index) => {
      const current = gameRef.current;
      if (!current || current.models[index] || asked.current.has(index)) return;
      asked.current.add(index);
      void send("history", { index }).then((answer) => {
        asked.current.delete(index);
        if (answer?.ok)
          setGame((prev) =>
            prev
              ? withHistoryBoard(prev, index, answer["model"] as never)
              : prev,
          );
      });
    },
  };
}
