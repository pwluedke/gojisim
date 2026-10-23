import { useDraggable } from "@dnd-kit/core";
import type { CardInstance, PlayerAreasView } from "@gojisim/engine";
import type { CSSProperties } from "react";
import styles from "./Board.module.css";
import { CardFace } from "./CardFace";
import type { BoardModel } from "./model";

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
      onClick={usable ? onSelect : undefined}
      {...attributes}
      {...listeners}
    >
      <CardFace card={card} data={model.view.cards[card.cardId]} rotate />
    </div>
  );
}

/**
 * The tucked hand strip (M5b): the full width of the board, full cards at the board's one card
 * size. A large hand overlaps: columns may shrink below the card width, so each card runs under
 * the next one with its left edge showing (the last card is right-aligned over its neighbor), and
 * the strip never scrolls. A card is lit when it can be played to a zone (`isLit`); a card that
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
  const columns = `repeat(${Math.max(1, cards.length)}, minmax(0, var(--card-w)))`;
  return (
    <div
      className={styles.hand}
      data-testid="your-hand"
      data-locked={locked ? "true" : "false"}
    >
      <div className={styles.muted}>
        Your hand ({player.id},{" "}
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
