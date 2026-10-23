import {
  type CollisionDetection,
  DndContext,
  type DragEndEvent,
  DragOverlay,
  KeyboardSensor,
  PointerSensor,
  pointerWithin,
  rectIntersection,
  useSensor,
  useSensors,
} from "@dnd-kit/core";
import type {
  Action,
  CardStack,
  PlayerAreasView,
  ZoneNumber,
} from "@gojisim/engine";
import { type ReactNode, useEffect, useMemo, useState } from "react";
import styles from "./Board.module.css";
import { CardBack, CardFace } from "./CardFace";
import {
  cardDestinations,
  type DestinationKey,
  type HandAction,
  playableCards,
} from "./destinations";
import { Hand } from "./Hand";
import {
  type Interaction,
  InteractionContext,
  Target,
  useInteraction,
} from "./interaction";
import type { BoardModel } from "./model";
import { Preview } from "./Preview";

/**
 * The read-only board at `/play` (M5a, docs/ui/board-design.md): a collapsible sidebar, the
 * opponent mirrored on top, the bottom player's side below the center line, zones in spec
 * geometry (4.4.5) with the two zone 8s facing each other. It renders only from a `BoardModel`
 * (the bottom player's view plus public numbers), so hidden cards never reach it.
 *
 * M5b: the hand strip, click to highlight and drag and drop (`@dnd-kit/core`) for the five hand
 * actions, and the card preview panel. The UI only offers actions that `getLegalActions` lists.
 */

const STEP_NAMES: Record<string, string> = {
  start: "Start phase",
  main: "Main phase",
  counter: "Counter phase",
  end: "End phase",
};

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
  const own = player.id === model.bottom;
  const monsterView = monster && (
    <>
      <CardFace card={monster} data={monsterData} />
      {monsterCards.length > 1 && (
        <div className={styles.stackNote}>stack of {monsterCards.length}</div>
      )}
    </>
  );
  return (
    <Slot
      own={own}
      dest={`zone:${zone}`}
      className={`${styles.zone} ${monsterHere ? styles.zoneMonster : ""} ${zone === 8 ? styles.zone8 : ""}`}
      testId={`zone-${player.id}-${zone}`}
    >
      <div className={styles.zoneLabel} data-testid="zone-label">
        Z{zone}
      </div>
      {monsterHere &&
        monster &&
        (own ? (
          <Target
            dest="monster"
            className={styles.monster}
            testId={`monster-${player.id}`}
          >
            {monsterView}
          </Target>
        ) : (
          <div className={styles.monster} data-testid={`monster-${player.id}`}>
            {monsterView}
          </div>
        ))}
      {stacks.map((stack) => {
        const top = stack[stack.length - 1];
        if (!top) return null;
        return (
          <div key={top.instanceId}>
            <CardFace
              card={top}
              data={view.cards[top.cardId]}
              counterPower={model.counterPower[top.instanceId]}
            />
            {stack.length > 1 && (
              <div className={styles.stackNote}>{stack.length - 1} under</div>
            )}
          </div>
        );
      })}
    </Slot>
  );
}

/** A destination on the bottom side; the same box, inert, on the top side. */
function Slot({
  own,
  dest,
  className,
  testId,
  children,
}: {
  own: boolean;
  dest: DestinationKey;
  className: string | undefined;
  testId: string;
  children: ReactNode;
}) {
  return own ? (
    <Target dest={dest} className={className} testId={testId}>
      {children}
    </Target>
  ) : (
    <div className={className} data-testid={testId}>
      {children}
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
        <Slot
          key={i}
          own={player.id === model.bottom}
          dest={`strategy:${i + 1}`}
          className={styles.strategyZone}
          testId={`strategy-${player.id}-${i + 1}`}
        >
          <div className={styles.zoneLabel}>Strategy {i + 1}</div>
          {(zone.cards ?? []).map((p) => (
            <CardFace
              key={p.card.instanceId}
              card={p.card}
              data={model.view.cards[p.card.cardId]}
            />
          ))}
        </Slot>
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
  const { preview } = useInteraction();
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
      <Slot
        own={player.id === model.bottom}
        dest="discard"
        className={styles.discard}
        testId={`discard-${player.id}`}
      >
        Discard{" "}
        <strong data-testid={`discard-count-${player.id}`}>
          {player.discard.count}
        </strong>
        {top && (
          <span
            className={styles.muted}
            data-testid="discard-top"
            onMouseEnter={() => preview(top.instanceId)}
            onMouseLeave={() => preview(null)}
          >
            {" "}
            · top: {model.view.cards[top.cardId]?.name}
          </span>
        )}
      </Slot>
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
  const rank = model.monsterRank[player.id];
  return (
    <Slot
      own={player.id === model.bottom}
      dest="rage"
      className={styles.panel}
      testId={`stats-${player.id}`}
    >
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
    </Slot>
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

/**
 * Collisions for a drop: the target under the pointer (keyboard drags fall back to overlap), and
 * the monster before the zone it sits in.
 */
const collisions: CollisionDetection = (args) => {
  const hits = pointerWithin(args);
  const found = hits.length > 0 ? hits : rectIntersection(args);
  return [...found].sort(
    (a, b) => Number(b.id === "monster") - Number(a.id === "monster"),
  );
};

export function BoardView({
  model,
  prompt,
  actions = [],
  locked = true,
  onAction = () => {},
  labelOf = (action) => action.type,
}: {
  model: BoardModel;
  /** The prompt panel's content (M5a: a temporary Pass button and choice buttons). */
  prompt: ReactNode;
  /** The bottom player's legal actions (M5b); empty while they can't act. */
  actions?: readonly Action[];
  /** True while the bottom player can't act (a bot decides, or the game is over). */
  locked?: boolean;
  onAction?: (action: Action) => void;
  /** Words for an action in the destination menu. */
  labelOf?: (action: Action) => string;
}) {
  const [collapsed, setCollapsed] = useState(false);
  const [selected, setSelected] = useState<string | null>(null);
  const [dragging, setDragging] = useState<string | null>(null);
  const [menu, setMenu] = useState<HandAction[] | null>(null);
  const [previewed, setPreviewed] = useState<string | null>(null);
  const { view } = model;
  const you = view.players.find(
    (p) => p.id === model.bottom,
  ) as PlayerAreasView;
  const opp = view.players.find((p) => p.id === model.top) as PlayerAreasView;

  const playable = useMemo(
    () => (locked ? new Set<string>() : playableCards(actions)),
    [actions, locked],
  );
  // A selection only lasts while its card still has actions (instance ids change on every move).
  const active =
    dragging ?? (selected && playable.has(selected) ? selected : null);
  const destinations = useMemo(
    () =>
      active
        ? cardDestinations(actions, active)
        : new Map<DestinationKey, HandAction[]>(),
    [actions, active],
  );

  const cancel = () => {
    setSelected(null);
    setMenu(null);
  };
  const take = (action: Action) => {
    cancel();
    onAction(action);
  };
  const chooseDestination = (key: DestinationKey) => {
    const options = destinations.get(key);
    if (!options?.length) return;
    if (options.length === 1) take(options[0] as Action);
    else setMenu(options);
  };

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== "Escape") return;
      setSelected(null);
      setMenu(null);
      setPreviewed(null);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  const sensors = useSensors(
    // A small move starts a drag, so a click still selects.
    useSensor(PointerSensor, { activationConstraint: { distance: 6 } }),
    useSensor(KeyboardSensor),
  );
  const onDragEnd = (event: DragEndEvent) => {
    const key = event.over?.id as DestinationKey | undefined;
    const options = key
      ? cardDestinations(actions, String(event.active.id)).get(key)
      : undefined;
    setDragging(null);
    if (!options?.length) return; // Dropped anywhere else: the card goes back to the hand.
    setSelected(String(event.active.id));
    if (options.length === 1) take(options[0] as Action);
    else setMenu(options);
  };

  const interaction: Interaction = {
    lit: new Set(destinations.keys()),
    chooseDestination,
    preview: (id) => {
      if (!dragging) setPreviewed(id);
    },
  };
  const draggedCard = dragging
    ? (you.hand.cards ?? []).find((c) => c.instanceId === dragging)
    : undefined;

  return (
    <InteractionContext.Provider value={interaction}>
      <DndContext
        sensors={sensors}
        collisionDetection={collisions}
        onDragStart={(e) => {
          setDragging(String(e.active.id));
          setPreviewed(null);
          setMenu(null);
        }}
        onDragEnd={onDragEnd}
        onDragCancel={() => setDragging(null)}
      >
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
                  <div key={i} className={styles.revealed}>
                    <CardFace card={shown} data={view.cards[shown.cardId]} />
                  </div>
                ) : (
                  <CardBack key={i} testId="opponent-card-back" />
                );
              })}
            </div>
            <Side model={model} player={opp} opponent={you.id} side="opp" />
            <div className={styles.centerLine} />
            <Side model={model} player={you} opponent={opp.id} side="you" />
            <Hand
              model={model}
              player={you}
              playable={playable}
              selected={active}
              locked={locked}
              onSelect={(id) => {
                setMenu(null);
                setSelected((s) => (s === id ? null : id));
              }}
            />
            {menu && (
              <div className={styles.menu} data-testid="action-menu">
                <div className={styles.panelTitle}>Which one?</div>
                {menu.map((action, i) => (
                  <button
                    key={i}
                    type="button"
                    className={styles.choiceButton}
                    data-testid="action-menu-item"
                    onClick={() => take(action)}
                  >
                    {labelOf(action)}
                  </button>
                ))}
                <button
                  type="button"
                  className={styles.button}
                  onClick={cancel}
                >
                  Cancel
                </button>
              </div>
            )}
          </main>
          {previewed && <Preview model={model} instanceId={previewed} />}
        </div>
        <DragOverlay dropAnimation={null}>
          {draggedCard ? (
            <div className={`${styles.handCard} ${styles.dragOverlay}`}>
              <CardFace
                card={draggedCard}
                data={view.cards[draggedCard.cardId]}
                fill
              />
            </div>
          ) : null}
        </DragOverlay>
      </DndContext>
    </InteractionContext.Provider>
  );
}
