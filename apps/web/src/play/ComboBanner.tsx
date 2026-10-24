import type { Card } from "@gojisim/cards";
import styles from "./Board.module.css";

/**
 * The combo callout (M5g): the combo's name, who made it, and its cards. It never takes input
 * (pointer events pass through), and the play screen removes it after about 2 s.
 */
export function ComboBanner({
  name,
  who,
  cards,
}: {
  name: string;
  /** "You", "Bot (Hard)", or the player id in hotseat. */
  who: string;
  cards: (Card | undefined)[];
}) {
  return (
    <div
      className={styles.comboBanner}
      data-testid="combo-banner"
      role="status"
    >
      <div className={styles.comboName} data-testid="combo-name">
        {name}
      </div>
      <div className={styles.muted} data-testid="combo-who">
        Combo · {who}
      </div>
      <div className={styles.comboCards}>
        {cards.map((card, i) =>
          card ? (
            <div
              key={`${card.id}-${i}`}
              className={styles.comboCard}
              data-testid="combo-card"
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
          ) : null,
        )}
      </div>
    </div>
  );
}
