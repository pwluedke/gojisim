import { type Card, getCardAbilities } from "@gojisim/cards";
import type { CardInstance } from "@gojisim/engine";
import styles from "./Board.module.css";
import { useInteraction } from "./interaction";

export function CardBack({
  testId = "card-back",
  small = false,
}: {
  testId?: string;
  /** The opponent's hand: half the card size. */
  small?: boolean;
}) {
  // No hover handler: a hidden card never opens the preview.
  return (
    <div
      className={small ? styles.cardBackSmall : styles.cardBack}
      data-testid={testId}
    />
  );
}

/**
 * One card: the full printed card image (the 300 px thumb) at the board's one card size
 * (`--card-w` by `--card-h`, M5b fix). Nothing is written under or over it except overlay chips:
 * counter power (printed value plus the colored modifier, PR #24 pattern) for a battle card on the
 * mat, threat for the invading monster, "×N" for a stack, and a manual badge. Hovering it opens
 * the preview panel, where the card is read large.
 */
export function CardFace({
  card,
  data,
  counterPower,
  threat,
  stack = 1,
  small = false,
}: {
  card: CardInstance;
  data: Card | undefined;
  /** Counter power with effects (10.8.1): shows the counter power chip. */
  counterPower?: number | undefined;
  /** The invading monster's threat: shows the threat chip. */
  threat?: number | undefined;
  /** Cards in the stack this card tops: shows "×N" above 1. */
  stack?: number;
  /** A revealed card in the opponent's hand: half size, like the card backs there. */
  small?: boolean;
}) {
  const { preview } = useInteraction();
  if (!data) return <CardBack small={small} />;
  const printed = data.counterOrThreat;
  const modifier =
    counterPower !== undefined && printed !== null ? counterPower - printed : 0;
  const manual = getCardAbilities(data.deckCardNumber).status === "manual";
  return (
    <div
      className={small ? styles.cardSmall : styles.card}
      data-testid="card"
      data-instance-id={card.instanceId}
      data-card-id={data.id}
      title={`${data.name} [${data.cardNumber}]`}
      onMouseEnter={() => preview(card.instanceId)}
      onMouseLeave={() => preview(null)}
    >
      {/* Shown only when the image is missing (as on CI, where `pnpm images` hasn't run). */}
      <div className={styles.cardFallback}>{data.name}</div>
      <img
        className={styles.cardImage}
        src={`/cards/${data.id}-thumb.webp`}
        alt={data.name}
        draggable={false}
        onError={(e) => {
          e.currentTarget.style.visibility = "hidden";
        }}
      />
      {manual && (
        <span className={styles.manualBadge} title="Ability not coded yet">
          M
        </span>
      )}
      {stack > 1 && (
        <span className={styles.stackBadge} data-testid="stack-badge">
          ×{stack}
        </span>
      )}
      {counterPower !== undefined && printed !== null && (
        <span className={styles.chip} data-testid="counter-power-chip">
          {printed}
          {modifier !== 0 && (
            <span
              className={modifier > 0 ? styles.chipUp : styles.chipDown}
              data-testid="counter-power-modifier"
            >
              {" "}
              {modifier > 0 ? "+" : ""}
              {modifier}
            </span>
          )}
        </span>
      )}
      {threat !== undefined && (
        <span className={styles.chip} data-testid="threat-chip">
          Threat {threat}
        </span>
      )}
    </div>
  );
}
