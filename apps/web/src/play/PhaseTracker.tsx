import { type PlayerView, STEPS, stepPhase } from "@gojisim/engine";
import styles from "./Board.module.css";

const PHASES = [
  { phase: "start", name: "Start" },
  { phase: "main", name: "Main" },
  { phase: "counter", name: "Counter" },
  { phase: "end", name: "End" },
] as const;

/**
 * The phase tracker (M5d): Start, Main, Counter and End with their steps (7.2 to 7.5), the step
 * in progress lit (`currentStep`, not `step`, which names the next one), the turn number, and the
 * turn player and opponent by name.
 */
export function PhaseTracker({
  view,
  name,
}: {
  view: PlayerView;
  name: (playerId: string) => string;
}) {
  const current = view.currentStep;
  const phase = stepPhase(current);
  const opponent = view.players.find((p) => p.id !== view.turnPlayer)?.id ?? "";
  return (
    <div>
      <div>
        Turn <strong data-testid="turn">{view.turn}</strong>
      </div>
      <div data-testid="tracker-players">
        Turn player: <strong>{name(view.turnPlayer)}</strong> ({view.turnPlayer}
        ) · Opponent: {name(opponent)} ({opponent})
      </div>
      <div className={styles.tracker}>
        {PHASES.map(({ phase: p, name: label }) => (
          <div
            key={p}
            className={
              p === phase ? styles.trackerPhaseOn : styles.trackerPhase
            }
            data-testid={`tracker-${p}`}
            data-current={p === phase ? "true" : undefined}
          >
            <span className={styles.trackerName}>{label}</span>
            {STEPS.filter((s) => stepPhase(s) === p).map((s) => (
              <span
                key={s}
                className={
                  s === current ? styles.trackerStepOn : styles.trackerStep
                }
                data-testid={`tracker-step-${s}`}
                data-current={s === current ? "true" : undefined}
                title={`Step ${s}`}
              >
                {s.slice(4)}
              </span>
            ))}
          </div>
        ))}
      </div>
      {view.result && (
        <div data-testid="result">
          Game over: {view.result.winner ? name(view.result.winner) : "draw"} (
          {view.result.reason})
        </div>
      )}
    </div>
  );
}
