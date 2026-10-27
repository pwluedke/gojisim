import type { Card } from "@gojisim/cards";
import type { PlayerAreasView } from "@gojisim/engine";
import { useLayoutEffect, useRef, useState } from "react";
import styles from "./Board.module.css";
import { CardBack, CardFace } from "./CardFace";

/**
 * Each card after the first shows this share of its width: "about a third" in #54, a sixth since
 * the bottom-edge hand made the mats wider (Monarch, Oct 26, 2026), so 5 still fit at 1440×900.
 */
export const VISIBLE_SHARE = 1 / 6;

/**
 * Whether `count` overlapping cards of width `cardWidth` fit in `rowWidth`: the first card whole,
 * each next one a sixth of its width further right. Otherwise the row shows one card with the
 * count on it.
 */
export function handRowFits(
  count: number,
  rowWidth: number,
  cardWidth: number,
): boolean {
  if (count <= 0) return true;
  return cardWidth * (1 + (count - 1) * VISIBLE_SHARE) <= rowWidth + 0.5;
}

/**
 * The opponent's hand (bot hand row): half-size card backs overlapping in a row, in the space left
 * of their mat (and the board's left padding), top-aligned with it. When the row would reach the mat, it shows one card with the
 * count on it. Either way the rightmost card carries the hand size as a count badge, like the deck's
 * (Paul), and an empty hand shows an empty slot with 0. With "Show opponent's hand" on (`open`), the cards are face up, and hovering the row
 * fans them out at the board's card size, each one opening the preview. A card an effect revealed
 * shows face up in the row whether or not the hand is open (decision 212).
 */
export function OpponentHand({
  player,
  cards,
  open,
  badgeCount,
}: {
  player: PlayerAreasView;
  cards: Record<number, Card>;
  open: boolean;
  /** The hand size from before the step while its cards fly, so the badge changes once they land. */
  badgeCount?: number | undefined;
}) {
  const count = player.hand.count;
  const badge = (
    <span className={styles.countBadge} data-testid="opponent-hand-count">
      {badgeCount ?? count}
    </span>
  );
  const row = useRef<HTMLDivElement>(null);
  const [fits, setFits] = useState(true);
  const [fanned, setFanned] = useState(false);
  useLayoutEffect(() => {
    const el = row.current;
    if (!el) return;
    const measure = () => {
      const first = el.querySelector<HTMLElement>("[data-hand-slot]");
      const width = first?.offsetWidth ?? 0;
      setFits(width === 0 || handRowFits(count, el.clientWidth, width));
    };
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(el);
    return () => observer.disconnect();
  }, [count]);

  const face = (i: number, small: boolean) => {
    const shown = player.hand.cards?.[i];
    return shown ? (
      <CardFace card={shown} data={cards[shown.cardId]} small={small} />
    ) : (
      <CardBack testId="opponent-card-back" small={small} />
    );
  };
  const fannable = open && count > 0;
  return (
    <div
      ref={row}
      className={styles.opponentHand}
      data-testid="opponent-hand"
      data-mode={fits ? "row" : "count"}
      aria-label={`${player.id} hand: ${count} card${count === 1 ? "" : "s"}`}
      onMouseEnter={() => fannable && setFanned(true)}
      onMouseLeave={() => setFanned(false)}
    >
      {count === 0 ? (
        // No cards: an empty slot with the count, like an empty pile.
        <div
          className={`${styles.handSlot} ${styles.handSlotEmpty}`}
          data-testid="opponent-hand-empty"
        >
          {badge}
        </div>
      ) : fits ? (
        // The count badge rides on the rightmost card, like a pile's count.
        Array.from({ length: count }, (_, i) => (
          <div key={i} className={styles.handSlot} data-hand-slot>
            {face(i, true)}
            {i === count - 1 && badge}
          </div>
        ))
      ) : (
        <div className={styles.handSlot} data-hand-slot>
          {face(0, true)}
          {badge}
        </div>
      )}
      {fannable && fanned && (
        <div className={styles.handFan} data-testid="opponent-hand-fan">
          {Array.from({ length: count }, (_, i) => (
            <div key={i} className={styles.handFanCard}>
              {face(i, false)}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
