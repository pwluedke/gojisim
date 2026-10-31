import { useDraggable } from "@dnd-kit/core";
import type { CardInstance, PlayerAreasView } from "@gojisim/engine";
import { type CSSProperties, useRef, useState } from "react";
import styles from "./Board.module.css";
import { CardFace } from "./CardFace";
import { useInteraction } from "./interaction";
import { type BoardModel, mechaCheckText } from "./model";
import { TipBubble } from "./Tooltip";

/** Each hand card shows this share of its width before the next card covers it. */
export const HAND_STEP = 0.75;

function HandCard({
  card,
  model,
  playable,
  lit,
  selected,
  locked,
  onSelect,
}: {
  card: CardInstance;
  model: BoardModel;
  playable: boolean;
  lit: boolean;
  selected: boolean;
  locked: boolean;
  onSelect: () => void;
}) {
  const { attributes, listeners, setNodeRef, isDragging } = useDraggable({
    id: card.instanceId,
    disabled: !playable || locked,
  });
  const usable = playable && !locked;
  const { preview } = useInteraction();
  // #138 Mecha-Check: the app's tooltip over the raised card while it's hovered or focused.
  const needed = model.mechaCheck[card.instanceId];
  const lift = useRef<HTMLDivElement>(null);
  const [tipAt, setTipAt] = useState<DOMRect | null>(null);
  const showTip = () => {
    if (needed !== undefined)
      setTipAt(lift.current?.getBoundingClientRect() ?? null);
  };
  const state = selected
    ? styles.selected
    : usable && lit
      ? styles.playable
      : usable
        ? styles.unlit
        : styles.dimmed;
  return (
    <div
      ref={setNodeRef}
      className={`${styles.handCard} ${state} ${isDragging ? styles.dragging : ""}`}
      data-testid="hand-card"
      data-playable={usable ? "true" : "false"}
      data-hand-lit={usable && lit ? "true" : "false"}
      data-selected={selected ? "true" : undefined}
      onClick={
        usable
          ? (e) => {
              // A pointer click doesn't leave keyboard focus behind: a focused card would stay
              // raised (:focus-visible) after Esc ends the selection.
              if (e.detail > 0) e.currentTarget.blur();
              onSelect();
            }
          : undefined
      }
      {...attributes}
      {...listeners}
      onFocus={showTip}
      onBlur={() => setTipAt(null)}
    >
      {/* The lifted card: the outer box stays in the row as the card's hit area (Hand). */}
      <div
        className={styles.handLift}
        data-testid="hand-lift"
        ref={lift}
        // The lift is animated: place the tip again once the card is all the way up.
        onTransitionEnd={() => {
          if (tipAt) showTip();
        }}
      >
        <CardFace card={card} data={model.view.cards[card.cardId]} rotate />
      </div>
      {tipAt && needed !== undefined && (
        <TipBubble box={tipAt} tip={mechaCheckText(needed)} />
      )}
      {/* The card's visible strip in the row: always this card's, even under a raised neighbor. */}
      <div
        className={styles.handStrip}
        onMouseEnter={() => {
          preview(card.instanceId);
          // After the CSS lift starts, so the tip sits by the raised card.
          requestAnimationFrame(showTip);
        }}
        onMouseLeave={() => {
          preview(null);
          setTipAt(null);
        }}
      />
    </div>
  );
}

/**
 * Your hand at the window's bottom edge (Paul): full cards at the board's card size, with only
 * their top 40 % above the edge. Cards overlap like a held hand: each column is three quarters of a
 * card wide, so each card covers a quarter of the one to its left; the columns shrink when the
 * row is full, so a large hand overlaps more and the row never scrolls. Hovering, focusing or
 * selecting a card raises it whole (CSS). Each card has an outer box that never moves (its place
 * in the row, so nothing shifts), the card that lifts, and a strip over its visible part of the row
 * that stays on top, so a raised card never takes a neighbor's strip. Above the row, a hovered
 * card's lifted image keeps it hovered; a selected card's lets clicks through to the zones under
 * it, and clicking its strip still cancels the selection. A card is lit when it can be played to a zone (`isLit`); a card that
 * can only invade or gain rage is unlit but still selectable; a card with no action is dimmed. While a bot decides (or the game is over)
 * the hand is locked.
 */
export function Hand({
  model,
  player,
  playable,
  lit,
  selected,
  locked,
  onSelect,
}: {
  model: BoardModel;
  player: PlayerAreasView;
  playable: ReadonlySet<string>;
  lit: ReadonlySet<string>;
  selected: string | null;
  locked: boolean;
  onSelect: (instanceId: string) => void;
}) {
  const cards = player.hand.cards ?? [];
  const columns =
    cards.length <= 1
      ? "var(--card-w)"
      : `repeat(${cards.length - 1}, minmax(0, calc(var(--card-w) * ${HAND_STEP}))) var(--card-w)`;
  return (
    <div
      className={styles.hand}
      data-testid="your-hand"
      data-locked={locked ? "true" : "false"}
    >
      {/* "Your Hand (6)": no seat id (M5h). */}
      <div className={styles.handLabel} data-testid="hand-label">
        Your Hand (
        <span data-testid="your-hand-count">{player.hand.count}</span>)
        {locked ? " · waiting" : ""}
      </div>
      <div
        className={styles.handCards}
        data-testid="hand-strip"
        style={{ gridTemplateColumns: columns } as CSSProperties}
      >
        {cards.map((card) => (
          <HandCard
            key={card.instanceId}
            card={card}
            model={model}
            playable={playable.has(card.instanceId)}
            lit={lit.has(card.instanceId)}
            selected={selected === card.instanceId}
            locked={locked}
            onSelect={() => onSelect(card.instanceId)}
          />
        ))}
      </div>
    </div>
  );
}
