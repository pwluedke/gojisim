import { botInput, decklistsOf } from "@gojisim/bot";
import type { Action, GameState } from "@gojisim/engine";
import { useEffect, useRef, useState } from "react";
import { type BotRequest, type BotResponse, botLabel } from "./bots";
import {
  PLAYER_IDS,
  type PlayerId,
  type Session,
  sessionFromRecord,
  withAction,
} from "./session";

export interface Thinking {
  player: PlayerId;
  started: number;
  difficulty: number;
}

export interface GameSessionOptions {
  /** Whether bot labels must hide private choices (hidden cards are hidden from the viewer). */
  privateLabels?: () => boolean;
  /** Called whenever a new session starts (a new game or an import). */
  onStart?: (session: Session) => void;
  /**
   * Which new games start with bots playing: `"humanVsBot"` (default, `/debug`: two bots wait
   * for Play) or `"always"` (`/play`, which has no Play button before a game starts).
   */
  autoPlay?: "humanVsBot" | "always";
}

/**
 * Game session logic shared by `/debug` and `/play` (M5a): the record and its states, stepping
 * through them, seats, and bot seats thinking in a Web Worker with a delay, Play / Pause / Step,
 * plus import and export. The worker gets each bot's `BotInput` only, never the real state.
 */
export function useGameSession(options: GameSessionOptions = {}) {
  const [session, setSession] = useState<Session | null>(null);
  const [playing, setPlaying] = useState(false);
  const [stepping, setStepping] = useState(false);
  const [delay, setDelay] = useState(600);
  const [thinking, setThinking] = useState<Thinking | null>(null);
  const [now, setNow] = useState(0);
  const [botMs, setBotMs] = useState<number[]>([]);
  const [botError, setBotError] = useState<string | null>(null);
  const workerRef = useRef<Worker | null>(null);
  const jobRef = useRef<{ id: number; posted: boolean; key: number } | null>(
    null,
  );
  const nextJobId = useRef(1);
  const optionsRef = useRef(options);
  optionsRef.current = options;
  // Pause also drops a decision already in flight, so no new bot action lands after it.
  const runningRef = useRef(false);
  runningRef.current = playing || stepping;

  const state = session
    ? (session.states[session.position] as GameState)
    : null;
  const seats = session?.seats;
  const botSeats = seats
    ? PLAYER_IDS.filter((id) => seats[id].kind === "bot")
    : [];
  const humanSeats = seats
    ? PLAYER_IDS.filter((id) => seats[id].kind === "human")
    : [];
  const decider = state
    ? ((state.pendingChoice?.player ?? state.turnPlayer) as PlayerId)
    : null;
  const botToMove =
    !!state && !!seats && decider !== null && seats[decider]?.kind === "bot";

  const startSession = (next: Session, autoPlay: boolean) => {
    jobRef.current = null;
    setThinking(null);
    setBotMs([]);
    setBotError(null);
    setSession(next);
    const bots = PLAYER_IDS.filter(
      (id) => next.seats[id].kind === "bot",
    ).length;
    // Human vs bot: the bot plays at once. Bot vs bot: press Play, unless the screen says always.
    const always = optionsRef.current.autoPlay === "always";
    setPlaying(autoPlay && (bots === 1 || (always && bots === 2)));
    setStepping(false);
    optionsRef.current.onStart?.(next);
  };

  // The worker answers one decision at a time; a stale answer (the game moved on) is dropped.
  useEffect(() => {
    const worker = new Worker(new URL("./botWorker.ts", import.meta.url), {
      type: "module",
    });
    worker.onmessage = (event: MessageEvent<BotResponse>) => {
      const reply = event.data;
      const job = jobRef.current;
      if (!job || job.id !== reply.id) return;
      jobRef.current = null;
      setThinking(null);
      if (!runningRef.current) return;
      if ("error" in reply) {
        setBotError(reply.error);
        setPlaying(false);
        return;
      }
      setBotMs((ms) => [...ms, reply.ms]);
      setStepping(false);
      setSession((prev) => {
        if (
          !prev ||
          prev.position !== job.key ||
          prev.record.actions.length !== job.key
        )
          return prev;
        const current = prev.states[prev.position] as GameState;
        const who = current.pendingChoice?.player ?? current.turnPlayer;
        const seat = prev.seats[who as PlayerId];
        if (seat?.kind !== "bot") return prev;
        try {
          return withAction(
            prev,
            reply.action,
            botLabel(
              current,
              reply.action,
              seat.difficulty,
              optionsRef.current.privateLabels?.() ?? true,
            ),
          );
        } catch (err) {
          setBotError(String(err));
          setPlaying(false);
          return prev;
        }
      });
    };
    workerRef.current = worker;
    return () => worker.terminate();
  }, []);

  // When a bot seat must decide (at the end of the record, while playing or stepping), ask the
  // worker after the delay. The worker gets the bot's input only, never the real state.
  useEffect(() => {
    if (!session || !state || !botToMove || state.result) return;
    if (session.position !== session.record.actions.length) return;
    if (!playing && !stepping) return;
    if (jobRef.current) return;
    const who = decider as PlayerId;
    const seat = session.seats[who];
    if (seat.kind !== "bot") return;
    const key = session.record.actions.length;
    const job = { id: nextJobId.current++, posted: false, key };
    jobRef.current = job;
    const timer = setTimeout(() => {
      const { rng: _rng, ...input } = botInput(
        state,
        who,
        decklistsOf(session.record.decks),
        () => 0,
        { difficulty: seat.difficulty },
      );
      job.posted = true;
      setThinking({
        player: who,
        started: performance.now(),
        difficulty: seat.difficulty,
      });
      const request: BotRequest = {
        id: job.id,
        input,
        seed: `${session.botSeed}-${key}`,
        difficulty: seat.difficulty,
      };
      workerRef.current?.postMessage(request);
    }, delay);
    return () => {
      clearTimeout(timer);
      if (jobRef.current === job && !job.posted) jobRef.current = null;
    };
  }, [session, state, botToMove, decider, playing, stepping, delay]);

  // The thinking indicator's clock.
  useEffect(() => {
    if (!thinking) return;
    const timer = setInterval(() => setNow(performance.now()), 100);
    return () => clearInterval(timer);
  }, [thinking]);

  /** A human action at the viewer's position (asks before dropping later actions). */
  const takeAction = (action: Action) => {
    if (!session || !state) return;
    const later = session.record.actions.length - session.position;
    if (
      later > 0 &&
      !window.confirm(
        `Taking an action here drops the ${later} later action(s). Continue?`,
      )
    )
      return;
    try {
      setSession(withAction(session, action));
    } catch (err) {
      window.alert(String(err));
    }
  };

  /**
   * Loads an exported game record. It opens paused: replays never re-run a bot; press Play to
   * continue. Returns an error message, or `null`.
   */
  const importRecord = async (file: File): Promise<string | null> => {
    try {
      startSession(sessionFromRecord(await file.text()), false);
      return null;
    } catch (err) {
      return String(err);
    }
  };

  return {
    session,
    setSession,
    state,
    decider,
    botToMove,
    botSeats,
    humanSeats,
    startSession,
    takeAction,
    importRecord,
    playing,
    setPlaying,
    stepping,
    setStepping,
    delay,
    setDelay,
    thinking,
    now,
    botMs,
    botError,
  };
}
