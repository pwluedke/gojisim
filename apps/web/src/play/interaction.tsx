import { useDroppable } from "@dnd-kit/core";
import type { Card } from "@gojisim/cards";
import type { Action } from "@gojisim/engine";
import {
  createContext,
  type CSSProperties,
  type ReactNode,
  useContext,
} from "react";
import styles from "./Board.module.css";
import type { DestinationKey } from "./destinations";
import type { StackKey } from "./StackViewer";

/** What the board's parts need from the hand interaction (M5b). */
export interface Interaction {
  /** Destinations of the selected or dragged card. */
  lit: ReadonlySet<DestinationKey>;
  /** Takes the action for a lit destination (or opens the menu when it has several). */
  chooseDestination: (key: DestinationKey) => void;
  /** Shows a card in the preview panel, or closes it. */
  preview: (instanceId: string | null) => void;
  /** Shows a card named in the battle log (M5d) in the preview panel, or closes it. */
  previewCard: (card: Card | null) => void;
  /** Zones lit for a zone choice (M5c), by `<player>:<zone>`, with the action each one takes. */
  zoneChoice: ReadonlyMap<string, Action>;
  /** Where the bot's last move landed (M5c), as `<player>|<destination>`, shown briefly. */
  highlight: ReadonlySet<string>;
  /** Sends an action (a zone choice). */
  act: (action: Action) => void;
  /** Each player's monster glow color name now (M5h #2), or none while Turn glow is off. */
  monsterGlow?: Readonly<Record<string, string | null>>;
  /** Opens the public stack viewer (M5h #9). */
  viewStack?: (stack: StackKey) => void;
}

export const InteractionContext = createContext<Interaction>({
  lit: new Set(),
  chooseDestination: () => {},
  preview: () => {},
  previewCard: () => {},
  zoneChoice: new Map(),
  highlight: new Set(),
  act: () => {},
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
  highlight = false,
  glow,
  style,
  onView,
  children,
}: {
  dest: DestinationKey;
  className?: string | undefined;
  testId?: string | undefined;
  highlight?: boolean;
  /** The monster glow's color name (M5h #2), shown as `data-monster-glow`. */
  glow?: string | null;
  style?: CSSProperties | undefined;
  /** A click while nothing is lit opens the stack viewer (M5h #9). */
  onView?: (() => void) | undefined;
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
      data-highlight={highlight ? "true" : undefined}
      data-monster-glow={glow ?? undefined}
      style={style}
      onClick={
        isLit
          ? (e) => {
              // A monster sits inside a zone: only the innermost lit target takes the click.
              e.stopPropagation();
              chooseDestination(dest);
            }
          : onView && lit.size === 0
            ? (e) => {
                e.stopPropagation();
                onView();
              }
            : undefined
      }
    >
      {children}
    </div>
  );
}
