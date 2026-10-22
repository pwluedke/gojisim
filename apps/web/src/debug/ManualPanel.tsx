import { getCardText } from "@gojisim/cards";
import type {
  Action,
  CardInstance,
  GameState,
  ManualDestination,
  ManualOp,
} from "@gojisim/engine";
import { useState } from "react";

const box = { border: "2px solid #b60", padding: 6, margin: 4 } as const;

/** Every card instance in the game, labelled with where it is. */
function allCards(state: GameState): { card: CardInstance; label: string }[] {
  const list: { card: CardInstance; label: string }[] = [];
  const add = (card: CardInstance, where: string) =>
    list.push({
      card,
      label: `${card.owner} ${where}: ${state.cards[card.cardId]?.name ?? card.cardId}`,
    });
  for (const p of state.players) {
    p.hand.forEach((c) => add(c, "hand"));
    for (const [zone, stacks] of Object.entries(p.zones))
      stacks.forEach((s) => s.forEach((c) => add(c, `zone ${zone}`)));
    p.invadingMonsterZone.forEach((c) => add(c, "monster"));
    p.strategyZones.forEach((z, i) =>
      z.forEach((pl) => add(pl.card, `strategy ${i + 1}`)),
    );
    p.discard.forEach((c) => add(c, "discard"));
    p.deck.forEach((c, i) => add(c, `deck #${i + 1}`));
    p.monsterDeck.forEach((c) => add(c, "monster deck"));
  }
  return list;
}

const DESTINATIONS: { label: string; to: ManualDestination }[] = [
  { label: "hand", to: { area: "hand" } },
  { label: "deck top", to: { area: "deckTop" } },
  { label: "deck bottom", to: { area: "deckBottom" } },
  { label: "discard pile", to: { area: "discard" } },
  { label: "invading monster (top)", to: { area: "monster" } },
  { label: "monster deck", to: { area: "monsterDeck" } },
  ...([1, 2, 3, 4, 5, 6, 7, 8] as const).map((zone) => ({
    label: `zone ${zone}`,
    to: { area: "zone" as const, zone },
  })),
  { label: "strategy zone 1", to: { area: "strategy", strategyZone: 1 } },
  { label: "strategy zone 2", to: { area: "strategy", strategyZone: 2 } },
];

/**
 * Manual override (spec "Manual override", format.md change 10): shown while a manual card's
 * window is open. Either player can act; every action is logged. "Done" is in the action panel.
 */
export function ManualPanel({
  state,
  onAction,
}: {
  state: GameState;
  onAction: (action: Action) => void;
}) {
  const choice = state.pendingChoice;
  const [actor, setActor] = useState<string>(choice?.player ?? "");
  const cards = allCards(state);
  const [cardIndex, setCardIndex] = useState(0);
  const [destination, setDestination] = useState(0);
  if (choice?.kind !== "manual") return null;
  const causeId = choice.options[0]?.cardId;
  const cause =
    causeId === null || causeId === undefined
      ? undefined
      : state.cards[causeId];
  const reason = [...state.log].reverse().find((e) => e.type === "manualWindow")
    ?.payload["reason"];
  const act = (op: ManualOp) =>
    onAction({ type: "manual", player: actor || choice.player, op });
  const selected = cards[cardIndex]?.card;
  return (
    <div data-testid="manual-panel" style={box}>
      <div>
        <strong>Manual override</strong>: {cause?.name ?? "?"} [
        {cause?.cardNumber ?? "?"}] ({String(reason ?? "")}). Resolve its text
        by hand, then choose Done.
      </div>
      {cause && (
        <pre style={{ whiteSpace: "pre-wrap", fontSize: 11 }}>
          {getCardText(cause).text}
        </pre>
      )}
      <label>
        Acting player{" "}
        <select
          data-testid="manual-actor"
          value={actor || choice.player}
          onChange={(e) => setActor(e.target.value)}
        >
          {state.players.map((p) => (
            <option key={p.id} value={p.id}>
              {p.id}
            </option>
          ))}
        </select>
      </label>
      {state.players.map((p) => (
        <div key={p.id} style={{ marginTop: 4 }}>
          {p.id}:{" "}
          <button
            type="button"
            onClick={() => act({ kind: "rage", player: p.id, delta: -1 })}
          >
            rage −1
          </button>
          <button
            type="button"
            data-testid={`manual-rage-up-${p.id}`}
            onClick={() => act({ kind: "rage", player: p.id, delta: 1 })}
          >
            rage +1
          </button>
          <button
            type="button"
            onClick={() => act({ kind: "advance", player: p.id })}
          >
            advance
          </button>
          <button
            type="button"
            onClick={() => act({ kind: "retreat", player: p.id })}
          >
            retreat
          </button>
          <button
            type="button"
            onClick={() => act({ kind: "draw", player: p.id, count: 1 })}
          >
            draw 1
          </button>
          <button
            type="button"
            onClick={() => act({ kind: "shuffle", player: p.id })}
          >
            shuffle deck
          </button>
        </div>
      ))}
      <div style={{ marginTop: 4 }}>
        <select
          data-testid="manual-card"
          value={cardIndex}
          onChange={(e) => setCardIndex(Number(e.target.value))}
        >
          {cards.map((c, i) => (
            <option key={c.card.instanceId} value={i}>
              {c.label}
            </option>
          ))}
        </select>{" "}
        →{" "}
        <select
          data-testid="manual-destination"
          value={destination}
          onChange={(e) => setDestination(Number(e.target.value))}
        >
          {DESTINATIONS.map((d, i) => (
            <option key={d.label} value={i}>
              {d.label}
            </option>
          ))}
        </select>{" "}
        <button
          type="button"
          data-testid="manual-move"
          disabled={!selected}
          onClick={() =>
            selected &&
            act({
              kind: "move",
              instanceId: selected.instanceId,
              to: (DESTINATIONS[destination] as (typeof DESTINATIONS)[number])
                .to,
            })
          }
        >
          move
        </button>{" "}
        <button
          type="button"
          disabled={!selected}
          onClick={() =>
            selected && act({ kind: "reveal", instanceId: selected.instanceId })
          }
        >
          reveal
        </button>
      </div>
    </div>
  );
}
