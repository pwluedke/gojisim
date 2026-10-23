import { type Card, getCardText, getCardTraits } from "@gojisim/cards";
import type { CardInstance, PlayerAreasView } from "@gojisim/engine";
import styles from "./Board.module.css";
import type { BoardModel } from "./model";

/** Every card the bottom player can see, by instance id (opponent hidden cards are never here). */
export function visibleCards(model: BoardModel): Map<string, CardInstance> {
  const out = new Map<string, CardInstance>();
  const add = (cards: readonly CardInstance[] | null | undefined) => {
    for (const card of cards ?? []) out.set(card.instanceId, card);
  };
  for (const player of model.view.players as PlayerAreasView[]) {
    add(player.hand.cards);
    add(player.discard.cards);
    add(player.invadingMonsterZone.cards);
    for (const zone of Object.values(player.zones))
      for (const stack of zone.cards ?? []) add(stack);
    for (const zone of player.strategyZones)
      add((zone.cards ?? []).map((p) => p.card));
  }
  return out;
}

/**
 * The card preview panel (M5b): fixed over the right column. The full image, the text in force
 * with the errata flag, traits, current values (counter power with its modifier, rank,
 * threat), and every change in force on it (M5d). It looks cards up in the bottom player's view, so a hidden card can't be shown.
 */
export function Preview({
  model,
  instanceId,
  card: named,
}: {
  model: BoardModel;
  instanceId?: string | null;
  /** A card named in the battle log (M5d): public, but shown without current values. */
  card?: Card | null;
}) {
  const card = instanceId ? visibleCards(model).get(instanceId) : undefined;
  const data = card ? model.view.cards[card.cardId] : named;
  if (!data) return null;
  const text = getCardText(data);
  const traits = getCardTraits(data);
  const owner = (model.view.players as PlayerAreasView[]).find((p) => {
    const cards = p.invadingMonsterZone.cards ?? [];
    return card && cards[cards.length - 1]?.instanceId === card.instanceId;
  });
  const counterPower = card ? model.counterPower[card.instanceId] : undefined;
  const printed = data.counterOrThreat;
  const modifier =
    counterPower !== undefined && printed !== null ? counterPower - printed : 0;
  return (
    <aside
      className={styles.preview}
      data-testid="card-preview"
      data-card-id={data.id}
    >
      <img
        className={styles.previewImage}
        src={`/cards/${data.id}-full.webp`}
        alt={data.name}
        onError={(e) => {
          e.currentTarget.style.display = "none";
        }}
      />
      <div className={styles.previewName}>
        {data.name} <span className={styles.muted}>[{data.cardNumber}]</span>
      </div>
      <div>
        {data.type}
        {data.colors.length > 0 ? ` · ${data.colors.join("/")}` : ""}
        {data.rank !== null ? ` · rank ${data.rank}` : ""}
      </div>
      {traits.length > 0 && (
        <div className={styles.muted}>{traits.join(", ")}</div>
      )}
      <div className={styles.previewValues} data-testid="preview-values">
        {owner ? (
          <>
            Rank <strong>{model.monsterRank[owner.id] ?? "-"}</strong> · threat{" "}
            <strong>{model.threat[owner.id]}</strong>
          </>
        ) : printed !== null ? (
          <>
            {data.type === "Monster" ? "Threat " : "Counter power "}
            <strong>{printed}</strong>
            {modifier !== 0 && (
              <span
                className={
                  modifier > 0 ? styles.modifierUp : styles.modifierDown
                }
              >
                {" "}
                {modifier > 0 ? "+" : ""}
                {modifier}
              </span>
            )}
          </>
        ) : null}
      </div>
      {card && model.changes[card.instanceId] && (
        <ul className={styles.previewChanges} data-testid="preview-changes">
          {model.changes[card.instanceId]?.map((change) => (
            <li key={`${change.kind}-${change.label}`}>{change.detail}</li>
          ))}
        </ul>
      )}
      {text.hasErrata && (
        <div className={styles.errata} data-testid="preview-errata">
          Errata: the text below is the corrected wording.
        </div>
      )}
      <div className={styles.previewText}>{text.text}</div>
    </aside>
  );
}
