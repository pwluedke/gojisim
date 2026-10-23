import { useDroppable } from "@dnd-kit/core";
import { createContext, type ReactNode, useContext } from "react";
import styles from "./Board.module.css";
import type { DestinationKey } from "./destinations";

/** What the board's parts need from the hand interaction (M5b). */
export interface Interaction {
  /** Destinations of the selected or dragged card. */
  lit: ReadonlySet<DestinationKey>;
  /** Takes the action for a lit destination (or opens the menu when it has several). */
  chooseDestination: (key: DestinationKey) => void;
  /** Shows a card in the preview panel, or closes it. */
  preview: (instanceId: string | null) => void;
}

export const InteractionContext = createContext<Interaction>({
  lit: new Set(),
  chooseDestination: () => {},
  preview: () => {},
});

export const useInteraction = () => useContext(InteractionContext);

/**
 * A place a hand card can go: lit while it is a destination of the selected or dragged card, then
 * a click or a drop on it takes the action. Unlit, it does nothing.
 */
export function Target({
  dest,
  className,
  testId,
  children,
}: {
  dest: DestinationKey;
  className?: string | undefined;
  testId?: string | undefined;
  children: ReactNode;
}) {
  const { lit, chooseDestination } = useInteraction();
  const isLit = lit.has(dest);
  const { setNodeRef, isOver } = useDroppable({ id: dest, disabled: !isLit });
  return (
    <div
      ref={setNodeRef}
      className={`${className ?? ""} ${isLit ? styles.lit : ""} ${isLit && isOver ? styles.over : ""}`}
      data-testid={testId}
      data-target={dest}
      data-lit={isLit ? "true" : undefined}
      onClick={
        isLit
          ? (e) => {
              // A monster sits inside a zone: only the innermost lit target takes the click.
              e.stopPropagation();
              chooseDestination(dest);
            }
          : undefined
      }
    >
      {children}
    </div>
  );
}
