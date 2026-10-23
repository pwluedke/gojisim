import type { Card } from "@gojisim/cards";
import { useEffect } from "react";
import styles from "./Board.module.css";
import type { SearchResult } from "./searches";

function CardImage({ card }: { card: Card }) {
  return (
    <div
      className={styles.searchCard}
      data-testid="search-card"
      data-card-id={card.id}
    >
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
    </div>
  );
}

/**
 * The search modal (M5e): every deck search by a human seat, found or not, ends here. It shows
 * the card that searched, what it searched for, and the result (the cards found, or "0 found"),
 * with Confirm [Space]. It shows only to the searcher, so the found cards are theirs to see.
 */
export function SearchModal({
  result,
  cards,
  onConfirm,
}: {
  result: SearchResult;
  cards: Record<string, Card>;
  onConfirm: () => void;
}) {
  const source =
    result.sourceCardId === null ? undefined : cards[result.sourceCardId];
  const found = result.found
    .map((id) => cards[id])
    .filter((c): c is Card => !!c);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== " " && e.key !== "Enter") return;
      e.preventDefault();
      onConfirm();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  });

  return (
    <div className={styles.modalBackdrop} data-testid="search-modal">
      <div className={styles.modal}>
        <div className={styles.modalHeading} data-testid="search-heading">
          Deck search: {found.length} found
        </div>
        {source && (
          <div className={styles.searchSource}>
            <CardImage card={source} />
            <div>
              <div className={styles.muted} data-testid="search-source">
                From {source.name} [{source.cardNumber}]
              </div>
              <div data-testid="search-wanted">
                Searched for {result.wanted} ({result.rule})
              </div>
            </div>
          </div>
        )}
        <div className={styles.choiceCards} data-testid="search-result">
          {found.length === 0 ? (
            <div className={styles.searchNone}>0 found</div>
          ) : (
            found.map((card, i) => (
              <CardImage key={`${card.id}-${i}`} card={card} />
            ))
          )}
        </div>
        <div className={styles.modalButtons}>
          <button
            type="button"
            className={styles.button}
            data-testid="search-confirm"
            onClick={onConfirm}
          >
            Confirm [Space]
          </button>
        </div>
      </div>
    </div>
  );
}
