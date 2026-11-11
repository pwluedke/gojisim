import type { Action, BoardModel, GameRecord } from "@gojisim/engine";
import { io, type Socket } from "socket.io-client";

/*
 * The head to head connection (M9b): Socket.io to the same site (`/socket.io`), signed in by the
 * session cookie. The message shapes mirror `apps/server/src/h2h/room.ts` (`SeatMessage`, `Step`).
 */

export type Seat = "P1" | "P2";
export type Phase = "waiting" | "picking" | "playing" | "over";

export interface Step {
  seq: number;
  action: Action;
  model: BoardModel;
}

export interface SeatMessage {
  gameId: string;
  phase: Phase;
  you: Seat;
  mode: "casual" | "tournament";
  picker: Seat | null;
  opponent: {
    name: string;
    connected: boolean;
    goneMs: number;
    deckName: string | null;
  } | null;
  seq: number;
  model: BoardModel | null;
  legal: Action[];
  undo: { asked: Seat | null; canAsk: boolean };
  canClaim: boolean;
  claimAfterMs: number;
  outcome: GameRecord["outcome"] | null;
  h2hEnd: GameRecord["h2hEnd"] | null;
  names: Record<Seat, string | null>;
  yourDeckName: string | null;
  steps: Step[];
}

/** What a player brings: one of their account's decks, or a starter. */
export type DeckChoice =
  | { source: "mine"; id: string }
  | { source: "official"; set: "ESD01" | "ESD02" };

export type Answer =
  { ok: true; [key: string]: unknown } | { ok: false; error: string };

export function connectOnline(): Socket {
  return io({ path: "/socket.io", transports: ["websocket"] });
}

export async function ask(
  socket: Socket,
  event: string,
  payload: object = {},
): Promise<Answer> {
  try {
    return (await socket.timeout(15_000).emitWithAck(event, payload)) as Answer;
  } catch {
    return { ok: false, error: "no-answer" };
  }
}

/** The plain words for a server's refusal. */
export function errorText(error: string): string {
  const words: Record<string, string> = {
    "not-signed-in": "Sign in with Discord to play online.",
    "no-such-game": "That game doesn't exist, or it has ended.",
    full: "Someone else already joined this game.",
    "no-such-deck": "That deck isn't saved to your account.",
    "bad-deck": "That deck can't be read.",
    "illegal-deck": "A Tournament game needs a legal deck.",
    "rate-limited": "Too many tries in a minute. Wait a moment.",
    stale: "The game moved on; your board is up to date now.",
    illegal: "That move isn't allowed now.",
    "no-answer": "The server didn't answer. Check your connection.",
  };
  return words[error] ?? `Something went wrong (${error}).`;
}

/** The invite link for a game. */
export const inviteLink = (gameId: string) =>
  `${window.location.origin}/online/${gameId}`;
