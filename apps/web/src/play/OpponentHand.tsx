import type { Card } from "@gojisim/cards";
import type { PlayerAreasView } from "@gojisim/engine";
import { useLayoutEffect, useRef, useState } from "react";
import styles from "./Board.module.css";
import { CardBack, CardFace } from "./CardFace";

/** Each card after the first shows this share of its width (Monarch: "about a third"). */
export const VISIBLE_SHARE = 1 / 3;

/**
 * Whether `count` overlapping cards of width `cardWidth` fit in `rowWidth`: the first card whole,
 * each next one a third of its width further right. Otherwise the row shows one card with the
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
 * of their mat, top-aligned with it. When the row would reach the mat, it shows one card with the
 * count on it. With "Show opponent's hand" on (`open`), the cards are face up, and hovering the row
 * fans them out at the board's card size, each one opening the preview. A card an effect revealed
 * shows face up in the row whether or not the hand is open (decision 212).
 */
export function OpponentHand({
  player,
  cards,
  open,
}: {
  player: PlayerAreasView;
  cards: Record<number, Card>;
  open: boolean;
}) {
  const count = player.hand.count;
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
      {fits ? (
        <>
          {Array.from({ length: count }, (_, i) => (
            <div key={i} className={styles.handSlot} data-hand-slot>
              {face(i, true)}
            </div>
          ))}
          <span className={styles.srOnly} data-testid="opponent-hand-count">
            {count}
          </span>
        </>
      ) : (
        <div className={styles.handSlot} data-hand-slot>
          {face(0, true)}
          <span className={styles.countBadge} data-testid="opponent-hand-count">
            {count}
          </span>
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
