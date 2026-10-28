import type { Card } from "@gojisim/cards";
import { useEffect, useState } from "react";
import styles from "./Board.module.css";
import type { BoardModel } from "./model";
import { Preview } from "./Preview";
import type { SearchResult } from "./searches";
import { useViewBoard, ViewBoardBanner, ViewBoardButton } from "./ViewBoard";

function CardImage({
  card,
  onHover,
}: {
  card: Card;
  onHover?: (card: Card | null) => void;
}) {
  return (
    <div
      className={styles.searchCard}
      data-testid="search-card"
      data-card-id={card.id}
      onMouseEnter={() => onHover?.(card)}
      onMouseLeave={() => onHover?.(null)}
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
 * Tester fixes 1: "View board" (B), and hovering a card opens the large preview above it.
 */
export function SearchModal({
  result,
  cards,
  onConfirm,
  model,
}: {
  result: SearchResult;
  cards: Record<string, Card>;
  onConfirm: () => void;
  model?: BoardModel | undefined;
}) {
  const view = useViewBoard();
  const [hover, setHover] = useState<Card | null>(null);
  const source =
    result.sourceCardId === null ? undefined : cards[result.sourceCardId];
  const found = result.found
    .map((id) => cards[id])
    .filter((c): c is Card => !!c);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (view.viewing) return;
      if (e.key !== " " && e.key !== "Enter") return;
      e.preventDefault();
      onConfirm();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  });

  return (
    <div
      className={
        view.viewing ? styles.modalBackdropHidden : styles.modalBackdrop
      }
      data-testid="search-modal"
      data-viewing-board={view.viewing ? "true" : undefined}
    >
      {view.viewing && <ViewBoardBanner onReturn={view.toggle} />}
      {hover && model && !view.viewing && (
        <div className={styles.previewOverModal} data-testid="modal-preview">
          <Preview model={model} card={hover} />
        </div>
      )}
      <div
        className={styles.modal}
        style={view.viewing ? { visibility: "hidden" } : undefined}
      >
        <ViewBoardButton onClick={view.toggle} />
        <div className={styles.modalHeading} data-testid="search-heading">
          Deck search: {found.length} found
        </div>
        {source && (
          <div className={styles.searchSource}>
            <CardImage card={source} onHover={setHover} />
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
              <CardImage
                key={`${card.id}-${i}`}
                card={card}
                onHover={setHover}
              />
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
