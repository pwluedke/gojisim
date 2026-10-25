import { type Card, getCardAbilities } from "@gojisim/cards";
import type { CardChange, CardInstance } from "@gojisim/engine";
import type { ReactNode } from "react";
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
 *
 * M5d: every change in force on the card (`cardChanges`: Burst, stat modifiers, statuses, how it
 * was played) is a chip in one badge area; hovering the badge lists them in full.
 */
export function CardFace({
  card,
  data,
  counterPower,
  threat,
  stack = 1,
  small = false,
  changes = [],
  extra = null,
  rotate = false,
  landscape = false,
  noPreview = false,
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
  /** Changes in force on the card (M5d), from `BoardModel.changes`. */
  changes?: readonly CardChange[] | undefined;
  /** More overlays (M5d): the strategy card's turn mark. */
  extra?: ReactNode;
  /**
   * Turn a landscape strategy card 90° clockwise to fill the portrait slot (M5e): in the hand and
   * on top of the discard pile. Strategy zones, modals and the preview keep it horizontal.
   */
  rotate?: boolean;
  /** A strategy card in its landscape strategy zone slot (M5f): drawn landscape, whole. */
  landscape?: boolean;
  /** No preview on hover (M5h: the discard pile's top card; clicking the pile shows it all). */
  noPreview?: boolean;
}) {
  const { preview } = useInteraction();
  if (!data) return <CardBack small={small} />;
  const printed = data.counterOrThreat;
  const modifier =
    counterPower !== undefined && printed !== null ? counterPower - printed : 0;
  const manual = getCardAbilities(data.deckCardNumber).status === "manual";
  const rotated = rotate && data.type === "Strategy";
  return (
    <div
      className={`${small ? styles.cardSmall : landscape ? styles.cardLandscape : styles.card}${rotated ? ` ${styles.rotated}` : ""}`}
      data-testid="card"
      data-rotated={rotated ? "true" : undefined}
      data-owner={card.owner}
      data-instance-id={card.instanceId}
      data-card-id={data.id}
      title={`${data.name} [${data.cardNumber}]`}
      onMouseEnter={noPreview ? undefined : () => preview(card.instanceId)}
      onMouseLeave={noPreview ? undefined : () => preview(null)}
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
      {changes.length > 0 && (
        <div className={styles.changes} data-testid="change-badge">
          {changes.map((change) => (
            <span
              key={`${change.kind}-${change.label}`}
              className={styles.changeChip}
              data-testid="change-chip"
              data-kind={change.kind}
            >
              {change.label}
            </span>
          ))}
          <div className={styles.changeList} data-testid="change-list">
            {changes.map((change) => (
              <div key={`${change.kind}-${change.label}`}>{change.detail}</div>
            ))}
          </div>
        </div>
      )}
      {extra}
      {threat !== undefined && (
        <span className={styles.chip} data-testid="threat-chip">
          Threat {threat}
        </span>
      )}
    </div>
  );
}
