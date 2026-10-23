import { type Card, getCardAbilities } from "@gojisim/cards";
import type {
  CardInstance,
  CardStack,
  PlayerAreasView,
  ZoneNumber,
} from "@gojisim/engine";
import { type ReactNode, useState } from "react";
import styles from "./Board.module.css";
import type { BoardModel } from "./model";

/**
 * The read-only board at `/play` (M5a, docs/ui/board-design.md): a collapsible sidebar, the
 * opponent mirrored on top, the bottom player's side below the center line, zones in spec
 * geometry (4.4.5) with the two zone 8s facing each other. It renders only from a `BoardModel`
 * (the bottom player's view plus public numbers), so hidden cards never reach it.
 */

const STEP_NAMES: Record<string, string> = {
  start: "Start phase",
  main: "Main phase",
  counter: "Counter phase",
  end: "End phase",
};

function CardBack({ testId = "card-back" }: { testId?: string }) {
  return <div className={styles.cardBack} data-testid={testId} />;
}

/** One card face: thumbnail, name, rank, type, and counter power (with its modifier) or threat. */
export function CardFace({
  card,
  data,
  counterPower,
  small = false,
}: {
  card: CardInstance;
  data: Card | undefined;
  /** Counter power with effects (10.8.1); the difference to the printed value shows in color. */
  counterPower?: number | undefined;
  small?: boolean;
}) {
  if (!data) return <CardBack />;
  const printed = data.counterOrThreat;
  const modifier =
    counterPower !== undefined && printed !== null ? counterPower - printed : 0;
  const manual = getCardAbilities(data.deckCardNumber).status === "manual";
  return (
    <div
      className={small ? styles.cardSmall : styles.card}
      data-testid="card"
      data-instance-id={card.instanceId}
      title={`${data.name} [${data.cardNumber}]`}
    >
      <img
        className={styles.thumb}
        src={`/cards/${data.id}-thumb.webp`}
        alt=""
        onError={(e) => {
          e.currentTarget.style.visibility = "hidden";
        }}
      />
      <div className={styles.cardName}>{data.name}</div>
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

function ZoneCell({
  model,
  player,
  zone,
}: {
  model: BoardModel;
  player: PlayerAreasView;
  zone: ZoneNumber;
}) {
  const { view } = model;
  const stacks: CardStack[] = player.zones[zone].cards ?? [];
  const monsterHere = player.monsterPosition === zone;
  const monsterCards = player.invadingMonsterZone.cards ?? [];
  const monster = monsterCards[monsterCards.length - 1];
  const monsterData = monster && view.cards[monster.cardId];
  return (
    <div
      className={`${styles.zone} ${monsterHere ? styles.zoneMonster : ""} ${zone === 8 ? styles.zone8 : ""}`}
      data-testid={`zone-${player.id}-${zone}`}
    >
      <div className={styles.zoneLabel} data-testid="zone-label">
        Z{zone}
      </div>
      {monsterHere && monster && (
        <div className={styles.monster} data-testid={`monster-${player.id}`}>
          <CardFace card={monster} data={monsterData} small />
          {monsterCards.length > 1 && (
            <div className={styles.stackNote}>
              stack of {monsterCards.length}
            </div>
          )}
        </div>
      )}
      {stacks.map((stack) => {
        const top = stack[stack.length - 1];
        if (!top) return null;
        return (
          <div key={top.instanceId}>
            <CardFace
              card={top}
              data={view.cards[top.cardId]}
              counterPower={model.counterPower[top.instanceId]}
              small
            />
            {stack.length > 1 && (
              <div className={styles.stackNote}>{stack.length - 1} under</div>
            )}
          </div>
        );
      })}
    </div>
  );
}

const Empty = () => <div className={styles.zoneEmpty} />;

/**
 * One player's zones. Top side (the opponent): back row Z5 to Z1, front row Z6, Z7, Z8 under
 * Z5, Z4, Z3. Bottom side: near row Z8, Z7, Z6 over Z3, Z4, Z5, far row Z1 to Z5. Same-column
 * zones line up (4.4.5.4) and the zone 8s face each other.
 */
function Zones({
  model,
  player,
  side,
}: {
  model: BoardModel;
  player: PlayerAreasView;
  side: "opp" | "you";
}) {
  const cell = (zone: ZoneNumber) => (
    <ZoneCell key={zone} model={model} player={player} zone={zone} />
  );
  const back = <>{([5, 4, 3, 2, 1] as const).map(cell)}</>;
  const oppFront = (
    <>
      {cell(6)}
      {cell(7)}
      {cell(8)}
      <Empty />
      <Empty />
    </>
  );
  const youNear = (
    <>
      <Empty />
      <Empty />
      {cell(8)}
      {cell(7)}
      {cell(6)}
    </>
  );
  const youFar = <>{([1, 2, 3, 4, 5] as const).map(cell)}</>;
  return side === "opp" ? (
    <div className={styles.zones}>
      <div className={styles.zoneRow} data-testid="row-opp-back">
        {back}
      </div>
      <div className={styles.zoneRow} data-testid="row-opp-front">
        {oppFront}
      </div>
    </div>
  ) : (
    <div className={styles.zones}>
      <div className={styles.zoneRow} data-testid="row-you-near">
        {youNear}
      </div>
      <div className={styles.zoneRow} data-testid="row-you-far">
        {youFar}
      </div>
    </div>
  );
}

function StrategyZones({
  model,
  player,
}: {
  model: BoardModel;
  player: PlayerAreasView;
}) {
  return (
    <div className={styles.strategyColumn}>
      {player.strategyZones.map((zone, i) => (
        <div
          key={i}
          className={styles.strategyZone}
          data-testid={`strategy-${player.id}-${i + 1}`}
        >
          <div className={styles.zoneLabel}>Strategy {i + 1}</div>
          {(zone.cards ?? []).map((p) => (
            <CardFace
              key={p.card.instanceId}
              card={p.card}
              data={model.view.cards[p.card.cardId]}
              small
            />
          ))}
        </div>
      ))}
    </div>
  );
}

function Piles({
  model,
  player,
}: {
  model: BoardModel;
  player: PlayerAreasView;
}) {
  const discard = player.discard.cards ?? [];
  const top = discard[discard.length - 1];
  return (
    <div className={styles.panel} data-testid={`piles-${player.id}`}>
      <div className={styles.panelTitle}>Piles</div>
      <div>
        Deck{" "}
        <strong data-testid={`deck-count-${player.id}`}>
          {player.deck.count}
        </strong>
      </div>
      <div>
        Discard{" "}
        <strong data-testid={`discard-count-${player.id}`}>
          {player.discard.count}
        </strong>
        {top && (
          <span className={styles.muted}>
            {" "}
            · top: {model.view.cards[top.cardId]?.name}
          </span>
        )}
      </div>
      <div>
        Monster deck{" "}
        <strong data-testid={`monster-deck-count-${player.id}`}>
          {player.monsterDeck.count}
        </strong>
      </div>
    </div>
  );
}

function Stats({
  model,
  player,
  opponent,
}: {
  model: BoardModel;
  player: PlayerAreasView;
  opponent: string;
}) {
  const monsterCards = player.invadingMonsterZone.cards ?? [];
  const monster = monsterCards[monsterCards.length - 1];
  const rank = monster ? model.view.cards[monster.cardId]?.rank : null;
  return (
    <div className={styles.panel} data-testid={`stats-${player.id}`}>
      <div className={styles.panelTitle}>Stats · {player.id}</div>
      <div>
        Monster rank <strong>{rank ?? "-"}</strong> · zone{" "}
        <strong>{player.monsterPosition ?? "-"}</strong>
      </div>
      <div>
        Rage <strong data-testid={`rage-${player.id}`}>{player.rage}</strong> ·
        threat{" "}
        <strong data-testid={`threat-${player.id}`}>
          {model.threat[player.id]}
        </strong>
      </div>
      <div>
        Counter power{" "}
        <strong data-testid={`counter-power-${player.id}`}>
          {model.totalCounterPower[player.id]}
        </strong>{" "}
        <span className={styles.muted}>vs threat {model.threat[opponent]}</span>
      </div>
    </div>
  );
}

function Side({
  model,
  player,
  opponent,
  side,
}: {
  model: BoardModel;
  player: PlayerAreasView;
  opponent: string;
  side: "opp" | "you";
}) {
  return (
    <div className={styles.fieldRow} data-testid={`side-${side}`}>
      <StrategyZones model={model} player={player} />
      <Zones model={model} player={player} side={side} />
      <div className={styles.sideColumn}>
        {side === "opp" ? (
          <>
            <Piles model={model} player={player} />
            <Stats model={model} player={player} opponent={opponent} />
          </>
        ) : (
          <>
            <Stats model={model} player={player} opponent={opponent} />
            <Piles model={model} player={player} />
          </>
        )}
      </div>
    </div>
  );
}

export function BoardView({
  model,
  prompt,
}: {
  model: BoardModel;
  /** The prompt panel's content (M5a: a temporary Pass button and choice buttons). */
  prompt: ReactNode;
}) {
  const [collapsed, setCollapsed] = useState(false);
  const { view } = model;
  const you = view.players.find(
    (p) => p.id === model.bottom,
  ) as PlayerAreasView;
  const opp = view.players.find((p) => p.id === model.top) as PlayerAreasView;
  return (
    <div
      className={styles.layout}
      data-testid="board"
      data-bottom={model.bottom}
    >
      <aside
        className={collapsed ? styles.sidebarCollapsed : styles.sidebar}
        data-testid="sidebar"
      >
        <button
          type="button"
          className={styles.collapse}
          data-testid="sidebar-toggle"
          onClick={() => setCollapsed((c) => !c)}
          title={collapsed ? "Expand the sidebar" : "Collapse the sidebar"}
        >
          {collapsed ? "»" : "«"}
        </button>
        {!collapsed && (
          <>
            <section className={styles.panel}>
              <div className={styles.panelTitle}>Battle log</div>
              <div className={styles.muted}>Coming in M5d.</div>
            </section>
            <section className={styles.panel} data-testid="prompt">
              <div className={styles.panelTitle}>Prompt</div>
              {prompt}
            </section>
            <section className={styles.panel} data-testid="phase-tracker">
              <div className={styles.panelTitle}>Phase</div>
              <div>
                Turn <strong data-testid="turn">{view.turn}</strong> ·{" "}
                <strong>{view.turnPlayer}</strong>
                {view.turnPlayer === model.bottom ? " (you)" : ""}
              </div>
              <div>
                {STEP_NAMES[view.phase] ?? view.phase} · step {view.step}
              </div>
              {view.result && (
                <div data-testid="result">
                  Game over: {view.result.winner ?? "draw"} (
                  {view.result.reason})
                </div>
              )}
            </section>
          </>
        )}
      </aside>
      <main className={styles.main}>
        <div className={styles.handBacks} data-testid="opponent-hand">
          <span className={styles.muted}>
            {opp.id} hand (
            <span data-testid="opponent-hand-count">{opp.hand.count}</span>)
          </span>
          {Array.from({ length: opp.hand.count }, (_, i) => {
            const shown = opp.hand.cards?.[i];
            return shown ? (
              <CardFace
                key={i}
                card={shown}
                data={view.cards[shown.cardId]}
                small
              />
            ) : (
              <CardBack key={i} testId="opponent-card-back" />
            );
          })}
        </div>
        <Side model={model} player={opp} opponent={you.id} side="opp" />
        <div className={styles.centerLine} />
        <Side model={model} player={you} opponent={opp.id} side="you" />
        <div className={styles.hand} data-testid="your-hand">
          <div className={styles.muted}>
            Your hand ({you.id},{" "}
            <span data-testid="your-hand-count">{you.hand.count}</span>)
          </div>
          <div className={styles.handCards}>
            {(you.hand.cards ?? []).map((card) => (
              <CardFace
                key={card.instanceId}
                card={card}
                data={view.cards[card.cardId]}
              />
            ))}
          </div>
        </div>
      </main>
    </div>
  );
}
