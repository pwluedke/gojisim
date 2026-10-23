import type { Action, GameState } from "@gojisim/engine";
import { useEffect, useState } from "react";
import { type ManualCard, ManualPanel } from "../debug/ManualPanel";
import styles from "./Board.module.css";
import { targetLocation } from "./locations";

type Choose = Extract<Action, { type: "choose" }>;

/**
 * The choice modal (M5c, docs/ui/board-design.md "Prompts and choices"): every `pendingChoice`
 * kind for the human who must answer it. The heading names who is choosing, what for and during
 * whose turn; the source line names the card that caused it.
 * - Card options (targets, discard and search picks, next monster, standby and replacement
 *   order) show as large card images; number keys 1 to 9 pick them.
 * - A Done button appears where the choice allows stopping ("up to N", find nothing).
 * - Yes / no choices are two buttons. A manual window shows the manual-action controls.
 * - Zone options light the zones on the mat; this shows only a small banner for them.
 * - Holding the eye button hides the modal, to look at the board behind it.
 * - M5d: each target card shows where it is (`Z3`, `Discard pile`, ...) above its image, and
 *   hovering it rings that place on the mat, above the backdrop.
 * It only ever opens for the viewer's own choice, so private options are theirs to see.
 */
export function ChoiceModal({
  state,
  heading,
  source,
  actions,
  manualCards,
  onAction,
  labelOf,
}: {
  state: GameState;
  heading: string;
  source: string | null;
  /** The chooser's `choose` actions, in `getLegalActions` order. */
  actions: readonly Action[];
  manualCards: ManualCard[];
  onAction: (action: Action) => void;
  labelOf: (action: Action) => string;
}) {
  const [hidden, setHidden] = useState(false);
  // The mat cell of the hovered target, ringed over the backdrop.
  const [ring, setRing] = useState<{ testId: string; rect: DOMRect } | null>(
    null,
  );
  const choice = state.pendingChoice;
  const choose = actions.filter((a): a is Choose => a.type === "choose");
  const done = choose.find((a) => a.optionId === "done");
  const numbered = choose.filter((a) => a !== done);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement | null;
      if (target?.closest("input, select, textarea")) return;
      const n = Number(e.key);
      if (!Number.isInteger(n) || n < 1 || n > 9) return;
      const action = numbered[n - 1];
      if (!action) return;
      e.preventDefault();
      onAction(action);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  });

  if (!choice) return null;
  const kind = choice.kind;
  const optionCard = (action: Choose) => {
    const cardId = choice.options.find((o) => o.id === action.optionId)?.cardId;
    return cardId === null || cardId === undefined
      ? undefined
      : state.cards[cardId];
  };
  const doneLabel =
    choice.rule === "5.8.1" || choice.rule === "12.6.2"
      ? "Find nothing"
      : "Done";
  const doneButton = done && (
    <button
      type="button"
      className={styles.button}
      data-testid="choice-done"
      onClick={() => onAction(done)}
    >
      {doneLabel}
    </button>
  );
  const top = (
    <>
      <div className={styles.modalHeading} data-testid="choice-heading">
        {heading}
      </div>
      {source && (
        <div className={styles.muted} data-testid="choice-source">
          From {source}
        </div>
      )}
    </>
  );

  // Zone options are lit on the mat; the banner keeps the board clear.
  if (kind === "zone")
    return (
      <div
        className={styles.choiceBanner}
        data-testid="choice-banner"
        data-kind={kind}
      >
        {top}
        <div className={styles.muted}>
          Click a lit zone, or press its number.
        </div>
        <div className={styles.bannerOptions}>
          {numbered.map((action, i) => (
            <button
              key={action.optionId}
              type="button"
              className={styles.choiceButton}
              data-testid="choice-option"
              data-option={action.optionId}
              onClick={() => onAction(action)}
            >
              <span className={styles.keyBadge}>{i + 1}</span>{" "}
              {action.optionId.replace(":", " zone ")}
            </button>
          ))}
          {doneButton}
        </div>
      </div>
    );

  let body;
  if (kind === "confirm") {
    const yes = choose.find((a) => a.optionId === "yes");
    const no = choose.find((a) => a.optionId === "no");
    body = (
      <div className={styles.modalButtons}>
        {yes && (
          <button
            type="button"
            className={styles.button}
            data-testid="choice-yes"
            onClick={() => onAction(yes)}
          >
            <span className={styles.keyBadge}>1</span> Yes
          </button>
        )}
        {no && (
          <button
            type="button"
            className={styles.choiceButton}
            data-testid="choice-no"
            onClick={() => onAction(no)}
          >
            <span className={styles.keyBadge}>2</span> No
          </button>
        )}
      </div>
    );
  } else if (kind === "manual") {
    body = (
      <>
        <ManualPanel
          state={state}
          onAction={onAction}
          cards={manualCards}
          compact
        />
        <div className={styles.modalButtons}>{doneButton}</div>
      </>
    );
  } else {
    body = (
      <>
        <div className={styles.choiceCards}>
          {numbered.map((action, i) => {
            const card = optionCard(action);
            const option = choice.options.find((o) => o.id === action.optionId);
            const location =
              kind === "target" || kind === "nextMonster"
                ? targetLocation(state, action.optionId, choice.player)
                : null;
            const showRing = () => {
              const cell =
                location &&
                document.querySelector(`[data-testid="${location.testId}"]`);
              setRing(
                cell
                  ? {
                      testId: location.testId,
                      rect: cell.getBoundingClientRect(),
                    }
                  : null,
              );
            };
            return (
              <div key={action.optionId} className={styles.choiceOption}>
                {location && (
                  <div
                    className={styles.choiceLocation}
                    data-testid="choice-location"
                  >
                    {location.label}
                  </div>
                )}
                <button
                  type="button"
                  className={styles.choiceCard}
                  data-testid="choice-option"
                  data-option={action.optionId}
                  data-card-id={card?.id}
                  title={labelOf(action)}
                  onClick={() => onAction(action)}
                  onMouseEnter={showRing}
                  onMouseLeave={() => setRing(null)}
                >
                  <span className={styles.keyBadge}>{i + 1}</span>
                  {card ? (
                    <>
                      <div className={styles.cardFallback}>{card.name}</div>
                      <img
                        className={styles.cardImage}
                        src={`/cards/${card.id}-thumb.webp`}
                        alt={card.name}
                        draggable={false}
                        onError={(e) => {
                          e.currentTarget.style.visibility = "hidden";
                        }}
                      />
                    </>
                  ) : (
                    <div className={styles.cardFallback}>{labelOf(action)}</div>
                  )}
                  {kind === "standbyOrder" && option?.abilityId && (
                    <span className={styles.chip}>
                      {option.abilityId.split("#")[1]}
                    </span>
                  )}
                </button>
              </div>
            );
          })}
        </div>
        <div className={styles.modalButtons}>{doneButton}</div>
      </>
    );
  }

  return (
    <div
      className={hidden ? styles.modalBackdropHidden : styles.modalBackdrop}
      data-testid="choice-modal"
      data-kind={kind}
      data-hidden={hidden ? "true" : undefined}
    >
      {ring && !hidden && (
        <div
          className={styles.targetRing}
          data-testid="target-ring"
          data-for={ring.testId}
          style={{
            left: ring.rect.left,
            top: ring.rect.top,
            width: ring.rect.width,
            height: ring.rect.height,
          }}
        />
      )}
      <div
        className={styles.modal}
        style={hidden ? { visibility: "hidden" } : undefined}
      >
        {top}
        {body}
      </div>
      <button
        type="button"
        className={styles.eye}
        data-testid="choice-eye"
        title="Hold to look at the board"
        onPointerDown={() => setHidden(true)}
        onPointerUp={() => setHidden(false)}
        onPointerLeave={() => setHidden(false)}
        onPointerCancel={() => setHidden(false)}
      >
        👁
      </button>
    </div>
  );
}
