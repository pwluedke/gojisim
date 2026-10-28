import type { Card } from "@gojisim/cards";
import type { Action, CardInstance, GameState } from "@gojisim/engine";
import { useEffect, useState } from "react";
import { type ManualCard, ManualPanel } from "../debug/ManualPanel";
import styles from "./Board.module.css";
import { CardChips } from "./CardFace";
import type { BoardModel } from "./model";
import { targetLocation } from "./locations";
import { confirmWords } from "../game/plainWords";
import { abilityText } from "../game/labels";
import { canConfirm, multiPick, toggle } from "../game/multiPick";
import { Preview, visibleCards } from "./Preview";
import { useViewBoard, ViewBoardBanner, ViewBoardButton } from "./ViewBoard";

type Choose = Extract<Action, { type: "choose" }>;

/**
 * The choice modal (M5c, docs/ui/board-design.md "Prompts and choices"): every `pendingChoice`
 * kind for the human who must answer it. The heading names who is choosing, what for and during
 * whose turn; the source line names the card that caused it.
 * - Card options (targets, discard and search picks, next monster, standby and replacement
 *   order) show as large card images; number keys 1 to 9 pick them.
 * - A Done button appears where the choice allows stopping ("up to N", find nothing).
 * - Yes / no choices are two buttons. A manual window shows the manual-action controls.
 * - Zone options light the zones on the mat; this shows only a small banner for them.
 * - Holding the eye button hides the modal, to look at the board behind it.
 * - M5d: each target card shows where it is (`Z3`, `Discard pile`, ...) above its image, and
 *   hovering it rings that place on the mat, above the backdrop.
 * - M5e: ability-order choices (standby and replacement order) show each ability's printed text
 *   above its card.
 * - M5h #19: a card on the field shows the board's numbers (counter power with its modifier, the
 *   change chips, a monster's threat), live 10.8.1 values from `model`. Cards in other areas show
 *   only their printed card.
 * It only ever opens for the viewer's own choice, so private options are theirs to see.
 *
 * Tester fixes 1:
 * - A pick of 2 or more cards (`multiPick`) selects cards with clicks or number keys, numbered in
 *   pick order, and sends them on Confirm (Enter); Esc clears the selection. Done stays for 0.
 * - "View board" (or B) hides the modal until pressed again, B or Esc; a banner stays meanwhile.
 * - Hovering a card opens the large preview above the modal.
 * - A search pick can show the whole searched deck, sorted, with the cards that don't match
 *   dimmed (5.8, 12.6.2).
 * - Undo [U] when a Casual undo is allowed.
 */
export function ChoiceModal({
  state,
  heading,
  source,
  actions,
  manualCards,
  onAction,
  labelOf,
  model,
  onConfirmPicks,
  onUndo,
}: {
  state: GameState;
  heading: string;
  source: string | null;
  /** The chooser's `choose` actions, in `getLegalActions` order. */
  actions: readonly Action[];
  manualCards: ManualCard[];
  onAction: (action: Action) => void;
  labelOf: (action: Action) => string;
  /** The live board's numbers (M5h #19); without it, cards show no chips. */
  model?: BoardModel | undefined;
  /** A confirmed multi-card pick: the cards in order, then Done when `done`. */
  onConfirmPicks?: (optionIds: string[], done: boolean) => void;
  /** Casual undo, when it's allowed now. */
  onUndo?: (() => void) | undefined;
}) {
  const [hidden, setHidden] = useState(false);
  const view = useViewBoard();
  // Tester fixes 1: a multi-card pick's selection, in pick order.
  const [selected, setSelected] = useState<string[]>([]);
  const [showDeck, setShowDeck] = useState(false);
  // The card hovered in the modal, shown in the preview above it.
  const [hoverCard, setHoverCard] = useState<{
    instanceId: string;
    card: Card;
  } | null>(null);
  // The mat cell of the hovered target, ringed over the backdrop.
  const [ring, setRing] = useState<{ testId: string; rect: DOMRect } | null>(
    null,
  );
  const choice = state.pendingChoice;
  const choose = actions.filter((a): a is Choose => a.type === "choose");
  const done = choose.find((a) => a.optionId === "done");
  const numbered = choose.filter((a) => a !== done);
  const multi = multiPick(state);
  const confirmable = !!multi && canConfirm(multi, selected.length);
  const confirmPicks = () => {
    if (!multi || !confirmable) return;
    onConfirmPicks?.(selected, !!done && selected.length < multi.max);
  };
  const pickOption = (action: Choose) => {
    if (multi) setSelected((now) => toggle(now, action.optionId, multi.max));
    else onAction(action);
  };

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement | null;
      if (target?.closest("input, select, textarea")) return;
      if (view.viewing) return;
      if (multi && e.key === "Enter") {
        e.preventDefault();
        confirmPicks();
        return;
      }
      // Esc clears a selection before anything else closes.
      if (multi && e.key === "Escape" && selected.length > 0) {
        e.preventDefault();
        setSelected([]);
        return;
      }
      const n = Number(e.key);
      if (!Number.isInteger(n) || n < 1 || n > 9) return;
      const action = numbered[n - 1];
      if (!action) return;
      e.preventDefault();
      pickOption(action);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  });

  if (!choice) return null;
  const kind = choice.kind;
  const optionCard = (action: Choose) => {
    const cardId = choice.options.find((o) => o.id === action.optionId)?.cardId;
    return cardId === null || cardId === undefined
      ? undefined
      : state.cards[cardId];
  };
  // M5h #19: the board's numbers for a card option. The model has them only for field cards (zone
  // stack tops, the invading monster, strategy cards), so other areas show the printed card alone.
  const boardNumbers = (instanceId: string) => {
    if (!model) return {};
    const monsterOf = state.players.find(
      (p) => p.invadingMonsterZone.at(-1)?.instanceId === instanceId,
    );
    return {
      counterPower: model.counterPower[instanceId],
      threat: monsterOf ? model.threat[monsterOf.id] : undefined,
      changes: model.changes[instanceId],
    };
  };
  const doneLabel =
    choice.rule === "5.8.1" || choice.rule === "12.6.2"
      ? "Find nothing"
      : "Done";
  const doneButton = done && (
    <button
      type="button"
      className={styles.button}
      data-testid="choice-done"
      // With cards selected, Confirm picks them; Done is for picking none.
      disabled={selected.length > 0}
      onClick={() => onAction(done)}
    >
      {doneLabel}
    </button>
  );
  const confirmButton = multi && (
    <button
      type="button"
      className={styles.button}
      data-testid="choice-confirm"
      disabled={!confirmable}
      onClick={confirmPicks}
    >
      Confirm ({selected.length}) [Enter]
    </button>
  );
  const undoButton = onUndo && (
    <button
      type="button"
      className={styles.choiceButton}
      data-testid="choice-undo"
      onClick={onUndo}
    >
      Undo [U]
    </button>
  );
  const top = (
    <>
      {kind !== "zone" && <ViewBoardButton onClick={view.toggle} />}
      <div className={styles.modalHeading} data-testid="choice-heading">
        {heading}
      </div>
      {source && (
        <div className={styles.muted} data-testid="choice-source">
          From {source}
        </div>
      )}
      {multi && (
        <div className={styles.muted} data-testid="choice-multi-hint">
          {multi.min === multi.max
            ? `Select ${multi.max} cards, then Confirm.`
            : `Select up to ${multi.max} cards, then Confirm (or ${doneLabel} for none).`}{" "}
          Click a selected card to deselect it.
        </div>
      )}
    </>
  );

  // Zone options are lit on the mat; the banner keeps the board clear.
  if (kind === "zone")
    return (
      <div
        className={styles.choiceBanner}
        data-testid="choice-banner"
        data-kind={kind}
      >
        {top}
        <div className={styles.muted}>
          Click a lit zone, or press its number.
        </div>
        <div className={styles.bannerOptions}>
          {numbered.map((action, i) => (
            <button
              key={action.optionId}
              type="button"
              className={styles.choiceButton}
              data-testid="choice-option"
              data-option={action.optionId}
              onClick={() => onAction(action)}
            >
              <span className={styles.keyBadge}>{i + 1}</span>{" "}
              {action.optionId.replace(":", " zone ")}
            </button>
          ))}
          {doneButton}
        </div>
      </div>
    );

  let body;
  if (kind === "confirm") {
    const yes = choose.find((a) => a.optionId === "yes");
    const no = choose.find((a) => a.optionId === "no");
    // M5h #16: what Yes does in plain words, then the printed text (or the text alone).
    const words = confirmWords(state);
    body = (
      <>
        {words && (
          <div className={styles.confirmWords} data-testid="confirm-words">
            {words.step && (
              <div className={styles.muted} data-testid="confirm-step">
                {words.step}
              </div>
            )}
            {words.sentence && (
              <div data-testid="confirm-sentence">
                <strong>Yes:</strong> {words.sentence}
              </div>
            )}
            {words.text && (
              <div
                className={`${styles.abilityText} ${styles.confirmText}`}
                data-testid="confirm-text"
              >
                {words.text}
              </div>
            )}
          </div>
        )}
        <div className={styles.modalButtons}>
          {yes && (
            <button
              type="button"
              className={styles.button}
              data-testid="choice-yes"
              onClick={() => onAction(yes)}
            >
              <span className={styles.keyBadge}>1</span> Yes
            </button>
          )}
          {no && (
            <button
              type="button"
              className={styles.choiceButton}
              data-testid="choice-no"
              onClick={() => onAction(no)}
            >
              <span className={styles.keyBadge}>2</span> No
            </button>
          )}
          {undoButton}
        </div>
      </>
    );
  } else if (kind === "manual") {
    body = (
      <>
        <ManualPanel
          state={state}
          onAction={onAction}
          cards={manualCards}
          compact
        />
        <div className={styles.modalButtons}>
          {doneButton}
          {undoButton}
        </div>
      </>
    );
  } else {
    const locationOf = (action: Extract<Action, { type: "choose" }>) =>
      kind === "target" || kind === "nextMonster"
        ? targetLocation(state, action.optionId, choice.player)
        : null;
    // M5h #14: when every option comes from the same place ("Deck (searched)"), the label
    // would only repeat, so it's left out; a single option keeps it.
    const labels = numbered.map((a) => locationOf(a)?.label ?? null);
    const samePlace =
      labels.length > 1 && labels.every((l) => l !== null && l === labels[0]);
    // M5h #14: search picks show the cards without number badges (the keys still work, see ?).
    const search = choice.rule === "5.8.1" || choice.rule === "12.6.2";
    // Tester fixes 1: the searched deck, whole, sorted so it never shows the deck's order
    // (decision 165). Only the searcher sees this modal (decision 252).
    const optionIds = new Set(numbered.map((a) => a.optionId));
    const searched = search
      ? state.players
          .map((p) =>
            [p.deck, p.monsterDeck].find((pile) =>
              pile.some((c) => optionIds.has(c.instanceId)),
            ),
          )
          .find((pile) => pile !== undefined)
      : undefined;
    const byCard = (a: CardInstance, b: CardInstance) => {
      const x = state.cards[a.cardId];
      const y = state.cards[b.cardId];
      return (
        (x?.cardNumber ?? "").localeCompare(y?.cardNumber ?? "") ||
        a.cardId - b.cardId
      );
    };
    const unmatched =
      showDeck && searched
        ? [...searched].filter((c) => !optionIds.has(c.instanceId)).sort(byCard)
        : [];
    const shownOptions =
      showDeck && searched
        ? [...numbered].sort((a, b) => {
            const x = searched.find((c) => c.instanceId === a.optionId);
            const y = searched.find((c) => c.instanceId === b.optionId);
            return x && y ? byCard(x, y) : 0;
          })
        : numbered;
    const hoverProps = (instanceId: string, card: Card | undefined) => ({
      onMouseEnter: () => card && setHoverCard({ instanceId, card }),
      onMouseLeave: () => setHoverCard(null),
    });
    body = (
      <>
        {searched && (
          <label className={styles.muted}>
            <input
              type="checkbox"
              data-testid="search-show-deck"
              checked={showDeck}
              onChange={(e) => setShowDeck(e.target.checked)}
            />{" "}
            Show whole deck ({searched.length} cards, sorted; cards that don't
            match are dimmed)
          </label>
        )}
        <div className={styles.choiceCards}>
          {shownOptions.map((action) => {
            const i = numbered.indexOf(action);
            const card = optionCard(action);
            const option = choice.options.find((o) => o.id === action.optionId);
            const location = locationOf(action);
            const showRing = () => {
              const cell =
                location &&
                document.querySelector(`[data-testid="${location.testId}"]`);
              setRing(
                cell
                  ? {
                      testId: location.testId,
                      rect: cell.getBoundingClientRect(),
                    }
                  : null,
              );
            };
            const ordering =
              kind === "standbyOrder" || kind === "replacementOrder";
            const order = selected.indexOf(action.optionId) + 1;
            return (
              <div key={action.optionId} className={styles.choiceOption}>
                {ordering && option?.abilityId && (
                  <div
                    className={styles.abilityText}
                    data-testid="choice-ability-text"
                  >
                    {abilityText(state, option.abilityId)}
                  </div>
                )}
                {location && !samePlace && (
                  <div
                    className={styles.choiceLocation}
                    data-testid="choice-location"
                  >
                    {location.label}
                  </div>
                )}
                <button
                  type="button"
                  className={
                    order > 0
                      ? `${styles.choiceCard} ${styles.choiceCardSelected}`
                      : styles.choiceCard
                  }
                  data-testid="choice-option"
                  data-option={action.optionId}
                  data-card-id={card?.id}
                  data-selected-order={order > 0 ? order : undefined}
                  aria-pressed={multi ? order > 0 : undefined}
                  title={labelOf(action)}
                  onClick={() => pickOption(action)}
                  onMouseEnter={() => {
                    showRing();
                    if (card)
                      setHoverCard({ instanceId: action.optionId, card });
                  }}
                  onMouseLeave={() => {
                    setRing(null);
                    setHoverCard(null);
                  }}
                >
                  {!search && <span className={styles.keyBadge}>{i + 1}</span>}
                  {order > 0 && (
                    <span
                      className={styles.selectOrder}
                      data-testid="choice-select-order"
                    >
                      {order}
                    </span>
                  )}
                  {card ? (
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
                      <CardChips
                        data={card}
                        {...boardNumbers(action.optionId)}
                      />
                    </>
                  ) : (
                    <div className={styles.cardFallback}>{labelOf(action)}</div>
                  )}
                  {kind === "standbyOrder" && option?.abilityId && (
                    <span className={styles.chip}>
                      {option.abilityId.split("#")[1]}
                    </span>
                  )}
                </button>
              </div>
            );
          })}
          {unmatched.map((c) => {
            const card = state.cards[c.cardId];
            return (
              <div key={c.instanceId} className={styles.choiceOption}>
                <button
                  type="button"
                  className={`${styles.choiceCard} ${styles.choiceCardDimmed}`}
                  data-testid="search-deck-card"
                  data-card-id={card?.id}
                  data-card-number={card?.cardNumber}
                  aria-disabled="true"
                  title={`${card?.name ?? "Card"}: doesn't match the search`}
                  {...hoverProps(c.instanceId, card)}
                >
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
                </button>
              </div>
            );
          })}
        </div>
        <div className={styles.modalButtons}>
          {confirmButton}
          {doneButton}
          {undoButton}
        </div>
      </>
    );
  }

  const away = hidden || view.viewing;
  // The hovered card: with its current values when the board shows it, else as printed.
  const hoverShown =
    hoverCard && model && !away
      ? visibleCards(model).has(hoverCard.instanceId)
        ? { instanceId: hoverCard.instanceId }
        : { card: hoverCard.card }
      : null;
  return (
    <div
      className={away ? styles.modalBackdropHidden : styles.modalBackdrop}
      data-testid="choice-modal"
      data-kind={kind}
      data-hidden={away ? "true" : undefined}
      data-viewing-board={view.viewing ? "true" : undefined}
    >
      {view.viewing && <ViewBoardBanner onReturn={view.toggle} />}
      {hoverShown && model && (
        <div className={styles.previewOverModal} data-testid="modal-preview">
          <Preview model={model} {...hoverShown} />
        </div>
      )}
      {ring && !away && (
        <div
          className={styles.targetRing}
          data-testid="target-ring"
          data-for={ring.testId}
          style={{
            left: ring.rect.left,
            top: ring.rect.top,
            width: ring.rect.width,
            height: ring.rect.height,
          }}
        />
      )}
      <div
        className={styles.modal}
        style={away ? { visibility: "hidden" } : undefined}
      >
        {top}
        {body}
      </div>
      <button
        type="button"
        className={styles.eye}
        data-testid="choice-eye"
        title="Hold to look at the board"
        onPointerDown={() => setHidden(true)}
        onPointerUp={() => setHidden(false)}
        onPointerLeave={() => setHidden(false)}
        onPointerCancel={() => setHidden(false)}
      >
        👁
      </button>
    </div>
  );
}
