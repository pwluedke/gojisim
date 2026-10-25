import { type PlayerView, STEPS, stepPhase } from "@gojisim/engine";
import styles from "./Board.module.css";
import { Tooltip } from "./Tooltip";

const PHASES = [
  { phase: "start", name: "Start" },
  { phase: "main", name: "Main" },
  { phase: "counter", name: "Counter" },
  { phase: "end", name: "End" },
] as const;

/** Each step's name for its hover (M5h #3), from the Comprehensive Rules (7.2 to 7.5). */
export const STEP_TITLES: Record<(typeof STEPS)[number], string> = {
  "7.2.1": "Beginning of the start phase",
  "7.2.2": "Draw cards equal to the opponent's monster's rank",
  "7.2.3": "Strategy cards placed before this turn go to the discard pile",
  "7.2.4": "Rage is set to 0",
  "7.2.5": "Check timing; the start phase ends",
  "7.3.1": "Beginning of the main phase",
  "7.3.2": "Play timing: main phase actions",
  "7.4.1": "Beginning of the counter phase",
  "7.4.2": "Add up your counter power",
  "7.4.3": "Counter the opponent's monster if the total reaches its threat",
  "7.4.4": "Check timing; the counter phase ends",
  "7.5.1": "Beginning of the end phase",
  "7.5.2": "Your monster advances (zone 7 or less)",
  "7.5.3": "Check timing",
  "7.5.4": "Draw up to 5 cards",
  "7.5.5": "Check timing",
  "7.5.6": '"Until end of turn" effects end',
  "7.5.7": "The turn ends",
};

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
    <div className={styles.trackerBody}>
      <div>
        Turn <strong data-testid="turn">{view.turn}</strong>
        <span data-testid="tracker-players">
          {" "}
          · Turn player: <strong>{name(view.turnPlayer)}</strong> (
          {view.turnPlayer}) · Opponent: {name(opponent)} ({opponent})
        </span>
        {view.result && (
          <span data-testid="result">
            {" "}
            · Game over:{" "}
            {view.result.winner ? name(view.result.winner) : "draw"} (
            {view.result.reason})
          </span>
        )}
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
              <Tooltip
                key={s}
                tip={`${STEP_TITLES[s]} (${s})`}
                testId={`tracker-tip-${s}`}
              >
                <span
                  className={
                    s === current ? styles.trackerStepOn : styles.trackerStep
                  }
                  data-testid={`tracker-step-${s}`}
                  data-current={s === current ? "true" : undefined}
                >
                  {s.slice(4)}
                </span>
              </Tooltip>
            ))}
          </div>
        ))}
      </div>
    </div>
  );
}
