import type { Card, Combo } from "@gojisim/cards";
import { useEffect, useState } from "react";
import styles from "./Board.module.css";
import type { BoardModel } from "./model";
import { Preview } from "./Preview";

/**
 * The combo callout (M5g, Paul's change: a modal). It opens once the move animations land, with
 * a brief shake (none with Animation speed Off), and stays open until Close or Space. It shows
 * the combo's entry in `docs/combos/combos.md`: the name, who made it, the cards (small images
 * that open the preview on hover), the steps and the result.
 */
export function ComboModal({
  combo,
  who,
  cards,
  model,
  shake,
  onClose,
}: {
  combo: Combo;
  /** "You" or "Bot (Hard)". */
  who: string;
  /** The combo's cards, by its card numbers (undefined for a card not in this game). */
  cards: (Card | undefined)[];
  /** For the preview of a hovered card. */
  model: BoardModel;
  shake: boolean;
  onClose: () => void;
}) {
  const [previewed, setPreviewed] = useState<Card | null>(null);
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== " " && e.key !== "Escape") return;
      e.preventDefault();
      onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  });

  return (
    <div className={styles.modalBackdrop} data-testid="combo-modal">
      <div
        className={`${styles.modal} ${styles.comboModal} ${shake ? styles.comboShake : ""}`}
        role="dialog"
        aria-labelledby="combo-name"
        data-shake={shake ? "true" : undefined}
      >
        <div
          className={styles.comboName}
          id="combo-name"
          data-testid="combo-name"
        >
          {combo.name}
        </div>
        <div className={styles.muted} data-testid="combo-who">
          Combo · {who}
        </div>
        <div className={styles.comboCards} data-testid="combo-cards">
          {combo.cards.map((number, i) => {
            const card = cards[i];
            return (
              <div
                key={`${number}-${i}`}
                className={styles.comboCardItem}
                data-testid="combo-card"
                data-card-number={number}
                onMouseEnter={() => setPreviewed(card ?? null)}
                onMouseLeave={() => setPreviewed(null)}
              >
                <div className={styles.comboCard}>
                  {card && (
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
                  )}
                </div>
                <div className={styles.comboCardName}>
                  {card?.name ?? number} [{number}]
                </div>
              </div>
            );
          })}
        </div>
        <dl className={styles.comboText}>
          <dt>Cards</dt>
          <dd data-testid="combo-text-cards">{combo.text.cards}</dd>
          <dt>Steps</dt>
          <dd data-testid="combo-steps">{combo.text.steps}</dd>
          <dt>Result</dt>
          <dd data-testid="combo-result">{combo.text.result}</dd>
        </dl>
        <div className={styles.modalButtons}>
          <button
            type="button"
            className={styles.button}
            data-testid="combo-close"
            onClick={onClose}
          >
            Close [Space]
          </button>
        </div>
      </div>
      {previewed && <Preview model={model} card={previewed} />}
    </div>
  );
}
