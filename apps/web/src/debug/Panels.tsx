import { type Action, type GameState, getLegalActions } from "@gojisim/engine";
import { useEffect, useRef } from "react";
import { actionLabel } from "./labels";

const box = { border: "1px solid #888", padding: 6, margin: 4 } as const;

export function StatusBar({ state }: { state: GameState }) {
  const choice = state.pendingChoice;
  const item = (label: string, value: string, testId: string) => (
    <span style={{ marginRight: 16 }}>
      {label}: <strong data-testid={testId}>{value}</strong>
    </span>
  );
  return (
    <div data-testid="status" style={{ ...box, background: "#eef" }}>
      {item("Turn", String(state.turn), "status-turn")}
      {item("Turn player", state.turnPlayer, "status-turn-player")}
      {item("Phase", state.phase, "status-phase")}
      {item("Step", state.step, "status-step")}
      {item(
        "Invasion used",
        String(state.turnFlags.invasionUsed),
        "status-invasion",
      )}
      {item(
        "Monster played",
        String(state.turnFlags.monsterPlayed),
        "status-monster",
      )}
      {item(
        "Pending choice",
        choice
          ? `${choice.player} ${choice.kind} (${choice.rule}, ${choice.options.length} options)`
          : "none",
        "status-choice",
      )}
      {item(
        "Result",
        state.result
          ? `${state.result.winner ?? "draw"} (${state.result.reason}, ${state.result.rule})`
          : "in progress",
        "status-result",
      )}
    </div>
  );
}

/** Buttons for every legal action of the player who has the decision, plus concede for both. */
export function ActionPanel({
  state,
  onAction,
}: {
  state: GameState;
  onAction: (action: Action) => void;
}) {
  const decider = state.pendingChoice?.player ?? state.turnPlayer;
  const actions = getLegalActions(state, decider).filter(
    (a) => a.type !== "concede",
  );
  return (
    <div data-testid="actions" style={box}>
      <div>
        <strong>Actions for {decider}</strong>{" "}
        {state.result ? "(game over)" : ""}
      </div>
      {actions.map((action, i) => (
        <button
          key={i}
          type="button"
          data-testid="action"
          onClick={() => onAction(action)}
          style={{ display: "block", margin: 2 }}
        >
          {actionLabel(state, action)}
        </button>
      ))}
      <div style={{ marginTop: 8 }}>
        {state.players.map((p) => (
          <button
            key={p.id}
            type="button"
            data-testid={`concede-${p.id}`}
            disabled={state.result !== null}
            onClick={() => {
              if (window.confirm(`${p.id} concedes the game?`))
                onAction({ type: "concede", player: p.id });
            }}
            style={{ marginRight: 8 }}
          >
            {p.id}: concede
          </button>
        ))}
      </div>
    </div>
  );
}

/** The action log, newest at the bottom, each entry with its rule number. */
export function LogPanel({ state }: { state: GameState }) {
  const end = useRef<HTMLDivElement>(null);
  useEffect(() => {
    // Braces matter: scrollIntoView may return a Promise, and an effect must not return one.
    end.current?.scrollIntoView({ block: "nearest" });
  }, [state.log.length]);
  return (
    <div
      data-testid="log"
      style={{
        ...box,
        height: 260,
        overflow: "auto",
        fontFamily: "monospace",
        fontSize: 12,
      }}
    >
      {state.log.map((entry) => {
        const { rule, ...rest } = entry.payload;
        return (
          <div key={entry.seq}>
            #{entry.seq} [{String(rule ?? "-")}] {entry.type}{" "}
            {entry.player ?? ""}{" "}
            {Object.keys(rest).length ? JSON.stringify(rest) : ""}
          </div>
        );
      })}
      <div ref={end} />
    </div>
  );
}
