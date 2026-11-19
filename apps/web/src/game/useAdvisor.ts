import { botInput, decklistsOf } from "@gojisim/bot";
import type { GameState } from "@gojisim/engine";
import { useEffect, useRef, useState } from "react";
import type { BotRequest, BotResponse } from "./bots";
import { privateBotSet } from "./privateSet";
import type { PlayerId, Session } from "./session";

/** #478: the level the advisor plays at (the bot's best). */
export const ADVISOR_LEVEL = 100;

/** #478: the bot's plan for the player's whole turn, made at its first decision. */
export interface TurnPlan {
  turn: number;
  player: PlayerId;
  steps: string[];
}

/** The bot's advice at one of the player's decisions. */
export interface Advice {
  /** The decision: the state after this many actions. */
  actionIndex: number;
  player: PlayerId;
  turn: number;
  trace: NonNullable<Extract<BotResponse, { action: unknown }>["trace"]>;
  /** The search's planned line from this decision through the turn, as the log words it. */
  plan: string[];
}

/**
 * #478 (Bot Advisor, phase 2a): at each of the player's own decisions in a Kaiju Classroom game,
 * the bot plays the decision in the player's seat (in its own worker, so the game's bot never
 * waits for it) with only what the player knows: their hand, both boards, the public zones and
 * their deck's contents, never its order (`botInput` for that seat). Nothing is played for the
 * player; the advice is only shown.
 */
export function useAdvisor(
  session: Session | null,
  state: GameState | null,
  /** A Classroom game at its live end, the player to decide (not the bot, not a sandbox). */
  enabled: boolean,
): { advice: Advice | null; thinking: boolean; turnPlan: TurnPlan | null } {
  const workerRef = useRef<Worker | null>(null);
  const latest = useRef<{ id: number; actionIndex: number } | null>(null);
  const nextId = useRef(1);
  const [advice, setAdvice] = useState<Advice | null>(null);
  const [thinking, setThinking] = useState(false);
  const [turnPlan, setTurnPlan] = useState<TurnPlan | null>(null);

  useEffect(() => {
    if (!enabled) return;
    const worker = new Worker(new URL("./botWorker.ts", import.meta.url), {
      type: "module",
    });
    workerRef.current = worker;
    return () => {
      worker.terminate();
      workerRef.current = null;
      latest.current = null;
      setThinking(false);
    };
  }, [enabled]);

  const actionIndex = session?.record.actions.length ?? -1;
  useEffect(() => {
    const worker = workerRef.current;
    if (!enabled || !session || !state || !worker || state.result) return;
    if (advice?.actionIndex === actionIndex) return;
    const player = (state.pendingChoice?.player ??
      state.turnPlayer) as PlayerId;
    if (session.seats[player].kind !== "human") return;
    const id = nextId.current++;
    latest.current = { id, actionIndex };
    const turn = state.turn;
    worker.onmessage = (event: MessageEvent<BotResponse>) => {
      const reply = event.data;
      if (latest.current?.id !== reply.id) return;
      setThinking(false);
      if ("action" in reply && reply.trace) {
        const next = {
          actionIndex,
          player,
          turn,
          trace: reply.trace,
          plan: reply.plan ?? [],
        };
        setAdvice(next);
        // The turn's plan is the one made at its first advised decision (it can change).
        setTurnPlan((p) =>
          p && p.turn === turn && p.player === player
            ? p
            : { turn, player, steps: next.plan },
        );
      }
    };
    const { rng: _rng, ...input } = botInput(
      state,
      player,
      decklistsOf(session.record.decks),
      () => 0,
      { difficulty: ADVISOR_LEVEL },
      session.record.deckLegality?.[0]?.asOf,
    );
    const request: BotRequest = {
      id,
      input,
      seed: `${session.botSeed}-advice-${actionIndex}`,
      difficulty: ADVISOR_LEVEL,
      trace: true,
      ...(privateBotSet() ? { privateSet: privateBotSet()! } : {}),
    };
    setThinking(true);
    worker.postMessage(request);
  }, [enabled, session, state, actionIndex, advice?.actionIndex]);

  // Advice for an earlier decision isn't shown once the game has moved on.
  const current = advice?.actionIndex === actionIndex ? advice : null;
  const plan =
    enabled && turnPlan && state && turnPlan.turn === state.turn
      ? turnPlan
      : null;
  return {
    advice: enabled ? current : null,
    thinking: enabled && thinking,
    turnPlan: plan,
  };
}
