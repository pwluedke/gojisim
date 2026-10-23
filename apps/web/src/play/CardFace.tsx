import { type Card, getCardAbilities } from "@gojisim/cards";
import type { CardInstance } from "@gojisim/engine";
import styles from "./Board.module.css";
import { useInteraction } from "./interaction";

export function CardBack({ testId = "card-back" }: { testId?: string }) {
  // No hover handler: a hidden card never opens the preview.
  return <div className={styles.cardBack} data-testid={testId} />;
}

/**
 * One card face: thumbnail, name, type, rank, and counter power (with its modifier) or threat.
 * Its size comes from its container (a zone, a strategy zone or a hand column). Hovering it opens
 * the preview panel.
 */
export function CardFace({
  card,
  data,
  counterPower,
  fill = false,
}: {
  card: CardInstance;
  data: Card | undefined;
  /** Counter power with effects (10.8.1); the difference to the printed value shows in color. */
  counterPower?: number | undefined;
  /** Hand cards: fill the hand column instead of the zone width. */
  fill?: boolean;
}) {
  const { preview } = useInteraction();
  if (!data) return <CardBack />;
  const printed = data.counterOrThreat;
  const modifier =
    counterPower !== undefined && printed !== null ? counterPower - printed : 0;
  const manual = getCardAbilities(data.deckCardNumber).status === "manual";
  return (
    <div
      className={fill ? styles.cardFill : styles.card}
      data-testid="card"
      data-instance-id={card.instanceId}
      data-card-id={data.id}
      title={`${data.name} [${data.cardNumber}]`}
      onMouseEnter={() => preview(card.instanceId)}
      onMouseLeave={() => preview(null)}
    >
      <img
        className={styles.thumb}
        src={`/cards/${data.id}-thumb.webp`}
        alt=""
        draggable={false}
        onError={(e) => {
          e.currentTarget.style.visibility = "hidden";
        }}
      />
      <div className={styles.cardName} data-testid="card-name">
        {data.name}
      </div>
      <div className={styles.cardMeta}>
        {data.type}
        {data.rank !== null ? ` · R${data.rank}` : ""}
        {manual ? <span className={styles.manualBadge}> manual</span> : null}
      </div>
      {printed !== null && (
        <div className={styles.cardValue}>
          {printed}
          {modifier !== 0 && (
            <span
              className={modifier > 0 ? styles.modifierUp : styles.modifierDown}
              data-testid="counter-power-modifier"
            >
              {" "}
              {modifier > 0 ? "+" : ""}
              {modifier}
            </span>
          )}
        </div>
      )}
    </div>
  );
}
