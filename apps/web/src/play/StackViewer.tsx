import type { CardInstance, PlayerView } from "@gojisim/engine";
import { useEffect } from "react";
import styles from "./Board.module.css";

/** A public stack on the board (M5h #9): a discard pile, the invading monster, or a zone. */
export type StackKey =
  | { player: string; area: "discard" }
  | { player: string; area: "monster" }
  | { player: string; area: "zone"; zone: number };

/** The cards a stack holds, top card first; hidden areas never reach here. */
export function stackCards(view: PlayerView, key: StackKey): CardInstance[][] {
  const player = view.players.find((p) => p.id === key.player);
  if (!player) return [];
  if (key.area === "discard")
    return [[...(player.discard.cards ?? [])].reverse()];
  if (key.area === "monster")
    return [[...(player.invadingMonsterZone.cards ?? [])].reverse()];
  const zone = player.zones[key.zone as keyof typeof player.zones];
  return (zone.cards ?? []).map((stack) => [...stack].reverse());
}

/**
 * The public stack viewer (M5h #9): a read-only modal laid out like the card selectors, for
 * either discard pile, a monster stack (its top card and the cards under it) or a zone's battle
 * card stacks (evolutions, cards placed under). Decks and the monster deck are never shown.
 * Esc, Space or a click outside closes it.
 */
export function StackViewer({
  view,
  stack,
  heading,
  onClose,
}: {
  view: PlayerView;
  stack: StackKey;
  heading: string;
  onClose: () => void;
}) {
  const groups = stackCards(view, stack);
  useEffect(() => {
    // Before the board's own shortcuts (Space is Pass there).
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== "Escape" && e.key !== " ") return;
      e.preventDefault();
      e.stopImmediatePropagation();
      onClose();
    };
    window.addEventListener("keydown", onKey, { capture: true });
    return () =>
      window.removeEventListener("keydown", onKey, { capture: true });
  });
  return (
    <div
      className={styles.modalBackdrop}
      data-testid="stack-viewer"
      data-area={stack.area}
      onClick={onClose}
    >
      <div className={styles.modal} onClick={(e) => e.stopPropagation()}>
        <div className={styles.modalHeading} data-testid="stack-heading">
          {heading}
        </div>
        {groups.every((g) => g.length === 0) && (
          <div className={styles.muted}>No cards.</div>
        )}
        {groups.map((cards, g) => (
          <div key={g} className={styles.choiceCards}>
            {cards.map((card, i) => {
              const data = view.cards[card.cardId];
              return (
                <div key={card.instanceId} className={styles.choiceOption}>
                  {stack.area !== "discard" && (
                    <div
                      className={styles.choiceLocation}
                      data-testid="stack-position"
                    >
                      {i === 0 ? "Top" : "Under"}
                    </div>
                  )}
                  <div
                    className={styles.choiceCard}
                    data-testid="stack-card"
                    data-card-id={card.cardId}
                  >
                    <div className={styles.cardFallback}>{data?.name}</div>
                    <img
                      className={styles.cardImage}
                      src={`/cards/${card.cardId}-thumb.webp`}
                      alt={data?.name ?? ""}
                      draggable={false}
                      onError={(e) => {
                        e.currentTarget.style.visibility = "hidden";
                      }}
                    />
                  </div>
                </div>
              );
            })}
          </div>
        ))}
        <div className={styles.modalButtons}>
          <button
            type="button"
            className={styles.button}
            data-testid="stack-close"
            onClick={onClose}
          >
            Close [Esc]
          </button>
        </div>
      </div>
    </div>
  );
}
