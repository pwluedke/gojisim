import { useDraggable } from "@dnd-kit/core";
import type { Card } from "@gojisim/cards";
import type { Action, GameState } from "@gojisim/engine";
import { useEffect } from "react";
import { choiceAbilityText } from "../game/labels";
import styles from "./Board.module.css";

/** The dragged tray card's id, apart from the hand's instance ids (#357). */
export const TRAY_ID = "zone-tray-card";

type Choose = Extract<Action, { type: "choose" }>;

/** A zone option's zone number ("P1:7" is 7). */
const zoneOf = (optionId: string) => Number(optionId.split(":")[1]);

/**
 * #357 (Paul's option B): a zone choice is answered on the mat like a hand play. The card being
 * placed sits in this tray beside your mat: drag it onto a lit zone, or click a lit zone, or press
 * the zone's number (Ian: "1 always means 1"). It replaces the panel of zone buttons.
 */
export function ZoneTray({
  state,
  heading,
  source,
  actions,
  placing,
  onAction,
  onUndo,
}: {
  state: GameState;
  heading: string;
  source: string | null;
  actions: readonly Action[];
  /** The card being placed (`pendingChoice.placing`), when the engine names one. */
  placing: Card | undefined;
  onAction: (action: Action) => void;
  onUndo?: (() => void) | undefined;
}) {
  const choose = actions.filter((a): a is Choose => a.type === "choose");
  const done = choose.find((a) => a.optionId === "done");
  const zones = choose.filter((a) => a !== done);
  const { attributes, listeners, setNodeRef, isDragging } = useDraggable({
    id: TRAY_ID,
    disabled: !placing,
  });

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement | null;
      if (target?.closest("input, select, textarea")) return;
      if (e.ctrlKey || e.metaKey || e.altKey) return;
      const n = Number(e.key);
      if (!Number.isInteger(n) || n < 1 || n > 8) return;
      // A key is that zone's number, never a place in the list; a zone that isn't lit (or is lit
      // on both sides) does nothing.
      const matches = zones.filter((a) => zoneOf(a.optionId) === n);
      if (matches.length !== 1) return;
      e.preventDefault();
      onAction(matches[0] as Choose);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  });

  if (state.pendingChoice?.kind !== "zone") return null;
  const name = placing ? placing.name : "the card";
  return (
    <div className={styles.zoneTray} data-testid="zone-tray">
      <div className={styles.zoneTrayText} data-testid="choice-heading">
        {heading}
      </div>
      {placing && (
        <div
          ref={setNodeRef}
          className={`${styles.zoneTrayCard} ${isDragging ? styles.zoneTrayDragging : ""}`}
          data-testid="zone-tray-card"
          data-card-id={placing.id}
          title={`${placing.name}: drag it onto a lit zone`}
          {...attributes}
          {...listeners}
        >
          <img
            src={`/cards/${placing.id}-thumb.webp`}
            alt={placing.name}
            draggable={false}
          />
        </div>
      )}
      <div className={styles.muted} data-testid="zone-keys-hint">
        Place {name}: drag it onto a lit zone, click one, or press its zone
        number (7 is zone 7).
      </div>
      {source && (
        <div className={styles.muted} data-testid="choice-source">
          From {source}
        </div>
      )}
      {/* #376: the asking ability's text. */}
      {choiceAbilityText(state) && (
        <div className={styles.abilityText} data-testid="choice-asking-text">
          {choiceAbilityText(state)}
        </div>
      )}
      {(done || onUndo) && (
        <div className={styles.zoneTrayButtons}>
          {done && (
            <button
              type="button"
              className={styles.button}
              data-testid="choice-done"
              onClick={() => onAction(done)}
            >
              Done
            </button>
          )}
          {onUndo && (
            <button
              type="button"
              className={styles.choiceButton}
              data-testid="choice-undo"
              onClick={onUndo}
            >
              Undo [U]
            </button>
          )}
        </div>
      )}
    </div>
  );
}
