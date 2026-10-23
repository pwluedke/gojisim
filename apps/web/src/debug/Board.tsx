import {
  type Card,
  getCardAbilities,
  getCardText,
  getCardTraits,
} from "@gojisim/cards";
import {
  type CardInstance,
  type GameState,
  getThreat,
  type PlayerState,
  type ZoneNumber,
} from "@gojisim/engine";
import { Fragment, useEffect } from "react";

/** Width of the card detail drawer; the page reserves this much space while it is open. */
export const CARD_DETAIL_WIDTH = 400;
import { cardData } from "./labels";

type Select = (card: CardInstance) => void;

const box = { border: "1px solid #888", padding: 4, margin: 2 } as const;

/** One card: thumbnail, name, type, rank and counter power or threat. */
export function CardView({
  state,
  card,
  onSelect,
}: {
  state: GameState;
  card: CardInstance;
  onSelect: Select;
}) {
  const data = cardData(state, card);
  // A hidden card (cardId -1): the viewer sees only its back (M6d).
  if (card.cardId === -1)
    return (
      <div
        data-testid="card-back"
        title="Hidden card"
        style={{
          ...box,
          display: "inline-block",
          width: 96,
          height: 60,
          verticalAlign: "top",
          background:
            "repeating-linear-gradient(45deg, #345, #345 6px, #456 6px, #456 12px)",
          color: "#fff",
          fontSize: 11,
        }}
      >
        Card back
      </div>
    );
  return (
    <button
      type="button"
      onClick={() => onSelect(card)}
      title={data?.cardNumber}
      style={{
        ...box,
        width: 96,
        textAlign: "left",
        fontSize: 11,
        verticalAlign: "top",
        cursor: "pointer",
      }}
    >
      <img
        src={`/cards/${card.cardId}-thumb.webp`}
        alt=""
        width={80}
        onError={(e) => {
          e.currentTarget.style.display = "none";
        }}
      />
      <div>
        <strong>{data?.name ?? card.cardId}</strong>
      </div>
      <div>
        {data?.type}{" "}
        {data?.rank !== null && data?.rank !== undefined ? `R${data.rank}` : ""}
      </div>
      <div>{data?.counterOrThreat ?? ""}</div>
      {card.statuses?.length ? <div>{card.statuses.join(", ")}</div> : null}
    </button>
  );
}

function Pile({
  title,
  state,
  cards,
  onSelect,
  testId,
}: {
  title: string;
  state: GameState;
  cards: CardInstance[];
  onSelect: Select;
  testId?: string;
}) {
  return (
    <div style={box}>
      <div>
        {title} (<span data-testid={testId}>{cards.length}</span>)
      </div>
      {cards.map((card) => (
        <CardView
          key={card.instanceId}
          state={state}
          card={card}
          onSelect={onSelect}
        />
      ))}
    </div>
  );
}

function ZoneCell({
  state,
  player,
  zone,
  onSelect,
}: {
  state: GameState;
  player: PlayerState;
  zone: ZoneNumber;
  onSelect: Select;
}) {
  const hasMonster = player.monsterPosition === zone;
  const top = player.invadingMonsterZone[player.invadingMonsterZone.length - 1];
  const monster = top && cardData(state, top);
  return (
    <td
      data-testid={`zone-${player.id}-${zone}`}
      style={{
        ...box,
        width: 120,
        height: 120,
        verticalAlign: "top",
        background: hasMonster ? "#fde2e2" : undefined,
      }}
    >
      <div>
        <strong>Zone {zone}</strong>
      </div>
      {hasMonster && (
        <div
          data-testid={`monster-${player.id}`}
          style={{ ...box, background: "#fff" }}
        >
          <div>
            <strong>MONSTER</strong> rank {monster?.rank} · rage {player.rage} ·
            threat {getThreat(state, player.id)}
          </div>
          <div style={{ fontSize: 11 }}>stack (bottom → top):</div>
          {player.invadingMonsterZone.map((card) => (
            <CardView
              key={card.instanceId}
              state={state}
              card={card}
              onSelect={onSelect}
            />
          ))}
        </div>
      )}
      {player.zones[zone].map((stack, i) => (
        <div key={i} style={{ fontSize: 11 }}>
          {stack.length > 1 ? `stack of ${stack.length}, top last:` : null}
          {stack.map((card) => (
            <CardView
              key={card.instanceId}
              state={state}
              card={card}
              onSelect={onSelect}
            />
          ))}
        </div>
      ))}
    </td>
  );
}

const empty = <td style={{ width: 120 }} />;

/**
 * A player's 8 zones in the spec geometry (4.4.5). Columns from the owner's left: 1, 2, {3, 8},
 * {4, 7}, {5, 6}; 8, 7, 6 are the front row. The top player is mirrored (4.4.5.5.2) so both zone 8s
 * meet in the middle column.
 */
export function Field({
  state,
  player,
  top,
  onSelect,
}: {
  state: GameState;
  player: PlayerState;
  top: boolean;
  onSelect: Select;
}) {
  const cell = (zone: ZoneNumber) => (
    <ZoneCell
      key={zone}
      state={state}
      player={player}
      zone={zone}
      onSelect={onSelect}
    />
  );
  const back = top ? [5, 4, 3, 2, 1] : [1, 2, 3, 4, 5];
  const front = top
    ? [cell(6), cell(7), cell(8), empty, empty]
    : [empty, empty, cell(8), cell(7), cell(6)];
  const backRow = <tr>{back.map((z) => cell(z as ZoneNumber))}</tr>;
  const frontRow = (
    <tr>
      {front.map((c, i) => (
        <Fragment key={i}>{c}</Fragment>
      ))}
    </tr>
  );
  return (
    <table style={{ borderCollapse: "collapse" }}>
      <tbody>
        {top ? (
          <>
            {backRow}
            {frontRow}
          </>
        ) : (
          <>
            {frontRow}
            {backRow}
          </>
        )}
      </tbody>
    </table>
  );
}

/** Everything one player owns besides the zones. */
export function PlayerAreas({
  state,
  player,
  onSelect,
}: {
  state: GameState;
  player: PlayerState;
  onSelect: Select;
}) {
  return (
    <div
      data-testid={`player-${player.id}`}
      style={{ ...box, display: "flex", flexWrap: "wrap", gap: 4 }}
    >
      <div style={box}>
        <strong>{player.id}</strong>
        {player.id === state.turnPlayer ? " (turn player)" : ""} · rage{" "}
        {player.rage} · deck{" "}
        <span data-testid={`deck-count-${player.id}`}>
          {player.deck.length}
        </span>
      </div>
      {player.strategyZones.map((placements, i) => (
        <div key={i} style={box}>
          <div>Strategy zone {i + 1}</div>
          {placements.map((p) => (
            <div key={p.card.instanceId}>
              <CardView state={state} card={p.card} onSelect={onSelect} />
              <div style={{ fontSize: 11 }}>placed turn {p.placedOnTurn}</div>
            </div>
          ))}
        </div>
      ))}
      <Pile
        title="Hand"
        state={state}
        cards={player.hand}
        onSelect={onSelect}
        testId={`hand-count-${player.id}`}
      />
      <Pile
        title="Monster deck"
        state={state}
        cards={player.monsterDeck}
        onSelect={onSelect}
      />
      <Pile
        title="Discard pile"
        state={state}
        cards={player.discard}
        onSelect={onSelect}
        testId={`discard-count-${player.id}`}
      />
    </div>
  );
}

/** Ability status colors: implemented, partial, manual (format.md). */
const STATUS_COLOR = {
  implemented: "#080",
  partial: "#b60",
  manual: "#b00",
} as const;

/** Full image, text with errata, traits and ability status of the selected card. */
export function CardDetail({
  card,
  onClose,
}: {
  card: Card;
  onClose: () => void;
}) {
  const text = getCardText(card);
  const abilities = getCardAbilities(card.deckCardNumber);
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);
  return (
    <aside
      data-testid="card-detail"
      aria-label="Card detail"
      style={{
        position: "fixed",
        right: 0,
        top: 0,
        bottom: 0,
        width: CARD_DETAIL_WIDTH,
        boxSizing: "border-box",
        padding: 8,
        borderLeft: "2px solid #888",
        overflow: "auto",
        background: "#fff",
        zIndex: 10,
      }}
    >
      <button type="button" data-testid="card-detail-close" onClick={onClose}>
        Close (Esc)
      </button>
      <h3>
        {card.name} [{card.cardNumber}]
      </h3>
      <img
        src={`/cards/${card.id}-full.webp`}
        alt=""
        style={{ maxWidth: "100%" }}
      />
      <p>
        {card.type} · rank {card.rank ?? "-"} ·{" "}
        {card.type === "Monster" ? "threat" : "counter power"}{" "}
        {card.counterOrThreat ?? "-"} · invasion {card.invadeZones ?? "-"} ·
        colors {card.colors.join("/") || "none"}
      </p>
      <p>
        <strong>Traits:</strong> {getCardTraits(card).join(", ") || "none"}
      </p>
      <p data-testid="card-ability-status">
        <strong>Abilities:</strong>{" "}
        <span style={{ color: STATUS_COLOR[abilities.status] }}>
          {abilities.status}
        </span>
        {abilities.status === "manual"
          ? " (not run by the engine yet; resolve by hand)"
          : ` (${abilities.abilities.length} in data)`}
        {abilities.notes ? ` · ${abilities.notes}` : ""}
      </p>
      <p>
        <strong>Text{text.hasErrata ? " (ERRATA)" : ""}:</strong>
      </p>
      <pre style={{ whiteSpace: "pre-wrap" }}>{text.text || "(no text)"}</pre>
      {text.printedText !== undefined && (
        <>
          <p>
            <strong>Printed text:</strong>
          </p>
          <pre style={{ whiteSpace: "pre-wrap" }}>{text.printedText}</pre>
        </>
      )}
    </aside>
  );
}
