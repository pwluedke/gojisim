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
import type { Card } from "@gojisim/cards";
import type {
  Action,
  CardStack,
  PlayerAreasView,
  ZoneNumber,
} from "@gojisim/engine";
import { type ReactNode, useEffect, useMemo, useRef, useState } from "react";
import { type Box, FlightLayer, useMoveAnimations } from "./animation";
import styles from "./Board.module.css";
import { CardBack, CardFace } from "./CardFace";
import {
  cardDestinations,
  type DestinationKey,
  type HandAction,
  isLit,
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
import { PhaseTracker } from "./PhaseTracker";
import { GLOW_COLORS, glowCycle, useGlow } from "./glow";
import { Preview } from "./Preview";
import type { AnimationSpeed } from "./settings";

/** A custom mat image (M5f) as the board draws it: an object URL plus its scale and position. */
export interface MatView {
  url: string;
  scale: number;
  x: number;
  y: number;
}

/**
 * The board at `/play` (M5a, docs/ui/board-design.md): the opponent's mat rotated on top, the
 * bottom player's mat below the center line, laid out like the official playmat with the two
 * zone 8s facing each other. It renders only from a `BoardModel`
 * (the bottom player's view plus public numbers), so hidden cards never reach it.
 *
 * M5b: the hand strip, click to highlight and drag and drop (`@dnd-kit/core`) for the five hand
 * actions, and the card preview panel. The UI only offers actions that `getLegalActions` lists.
 *
 * M5c: zones offered by a zone choice light up on either mat, and the bot's last move is
 * highlighted briefly where it landed.
 *
 * M5d layout (Paul's play-testing): prompt, phase tracker and settings in the left column, the
 * board in the middle, and the battle log in the right column, which the card preview covers
 * while a card is previewed.
 *
 * M5f: card moves animate (`useMoveAnimations`), the turn player's mat glows in their monster's
 * colors, a custom mat image can sit behind the zones, and strategy zones are landscape slots.
 */

export const STEP_NAMES: Record<string, string> = {
  start: "Start phase",
  main: "Main phase",
  counter: "Counter phase",
  end: "End phase",
};

/** Cards in one mat cell: the first at the cell's place, later ones offset so each shows. */
function Layer({ index, children }: { index: number; children: ReactNode }) {
  return (
    <div
      className={styles.layer}
      style={{ translate: `${index * 6}px ${index * 6}px` }}
    >
      {children}
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
  const own = player.id === model.bottom;
  const monsterLit = useInteraction().highlight.has(`${player.id}|monster`);
  const monsterView = monster && (
    <CardFace
      card={monster}
      data={view.cards[monster.cardId]}
      threat={model.threat[player.id]}
      stack={monsterCards.length}
      changes={model.changes[monster.instanceId]}
    />
  );
  return (
    <Slot
      playerId={player.id}
      own={own}
      dest={`zone:${zone}`}
      className={`${styles.cell} ${monsterHere ? styles.zoneMonster : ""}`}
      testId={`zone-${player.id}-${zone}`}
    >
      <div className={styles.cellLabel} data-testid="zone-label">
        Z{zone}
      </div>
      {stacks.map((stack, i) => {
        const top = stack[stack.length - 1];
        if (!top) return null;
        return (
          <Layer key={top.instanceId} index={i}>
            <CardFace
              card={top}
              data={view.cards[top.cardId]}
              counterPower={model.counterPower[top.instanceId]}
              stack={stack.length}
              changes={model.changes[top.instanceId]}
            />
          </Layer>
        );
      })}
      {monsterHere && monster && (
        <Layer index={stacks.length}>
          {own ? (
            <Target
              dest="monster"
              className={`${styles.monster} ${monsterLit ? styles.highlight : ""}`}
              testId={`monster-${player.id}`}
              highlight={monsterLit}
            >
              {monsterView}
            </Target>
          ) : (
            <div
              className={`${styles.monster} ${monsterLit ? styles.highlight : ""}`}
              data-testid={`monster-${player.id}`}
              data-highlight={monsterLit ? "true" : undefined}
            >
              {monsterView}
            </div>
          )}
        </Layer>
      )}
    </Slot>
  );
}

/**
 * A mat area: a destination for hand cards on the bottom side (inert on the top side), a lit
 * zone while a zone choice offers it (either side, M5c), and briefly highlighted where the bot's
 * last move landed (M5c).
 */
function Slot({
  own,
  playerId,
  dest,
  className,
  testId,
  children,
}: {
  own: boolean;
  playerId: string;
  dest: DestinationKey;
  className: string | undefined;
  testId: string;
  children: ReactNode;
}) {
  const { zoneChoice, highlight, act } = useInteraction();
  const lit = highlight.has(`${playerId}|${dest}`);
  const classes = `${className ?? ""} ${lit ? styles.highlight : ""}`;
  const zoneKey = dest.startsWith("zone:")
    ? `${playerId}:${dest.slice(5)}`
    : null;
  const choice = zoneKey ? zoneChoice.get(zoneKey) : undefined;
  if (choice)
    return (
      <div
        className={`${classes} ${styles.lit}`}
        data-testid={testId}
        data-zone-choice={zoneKey}
        data-highlight={lit ? "true" : undefined}
        onClick={() => act(choice)}
      >
        {children}
      </div>
    );
  return own ? (
    <Target dest={dest} className={classes} testId={testId} highlight={lit}>
      {children}
    </Target>
  ) : (
    <div
      className={classes}
      data-testid={testId}
      data-highlight={lit ? "true" : undefined}
    >
      {children}
    </div>
  );
}

/** One area of a player's mat. */
type MatArea =
  | { kind: "zone"; zone: ZoneNumber }
  | { kind: "strategy"; index: 1 | 2 }
  | { kind: "rage" }
  | { kind: "deck" }
  | { kind: "discard" }
  | { kind: "monsterDeck" };

/**
 * The official playmat (Paul's request, Oct 23, 2026): 7 columns by 3 rows per side, in the
 * owner's own coordinates, row 0 nearest the center line. Cells not listed are empty.
 */
const MAT: readonly {
  area: MatArea;
  col: number;
  row: number;
  cols?: number;
  rows?: number;
}[] = [
  { area: { kind: "strategy", index: 1 }, col: 0, row: 0 },
  { area: { kind: "rage" }, col: 1, row: 0, cols: 2, rows: 2 },
  { area: { kind: "zone", zone: 8 }, col: 3, row: 0 },
  { area: { kind: "strategy", index: 2 }, col: 0, row: 1 },
  { area: { kind: "zone", zone: 7 }, col: 4, row: 1 },
  { area: { kind: "zone", zone: 6 }, col: 5, row: 1 },
  { area: { kind: "deck" }, col: 6, row: 1 },
  { area: { kind: "monsterDeck" }, col: 0, row: 2 },
  ...([1, 2, 3, 4, 5] as const).map((zone) => ({
    area: { kind: "zone", zone } as const,
    col: zone,
    row: 2,
  })),
  { area: { kind: "discard" }, col: 6, row: 2 },
];

function StrategyZone({
  model,
  player,
  index,
}: {
  model: BoardModel;
  player: PlayerAreasView;
  index: 1 | 2;
}) {
  const zone = player.strategyZones[index - 1];
  return (
    <Slot
      playerId={player.id}
      own={player.id === model.bottom}
      dest={`strategy:${index}`}
      className={styles.cell}
      testId={`strategy-${player.id}-${index}`}
    >
      <div className={styles.cellLabel}>Strategy {index}</div>
      {(zone?.cards ?? []).map((p, i) => (
        <Layer key={p.card.instanceId} index={i}>
          <CardFace
            card={p.card}
            data={model.view.cards[p.card.cardId]}
            changes={model.changes[p.card.instanceId]}
            landscape
            extra={
              <span
                className={styles.turnMark}
                data-testid="strategy-mark"
                data-this-turn={
                  p.placedOnTurn === model.view.turn ? "true" : "false"
                }
                title={`Placed on turn ${p.placedOnTurn}; it leaves at its owner's next start phase (7.2.3)`}
              >
                {p.placedOnTurn === model.view.turn
                  ? "New"
                  : `T${p.placedOnTurn}`}
              </span>
            }
          />
        </Layer>
      ))}
    </Slot>
  );
}

/** The Rage zone: rage, the monster's threat, and total counter power vs the opponent's threat. */
function RageZone({
  model,
  player,
  opponent,
}: {
  model: BoardModel;
  player: PlayerAreasView;
  opponent: string;
}) {
  return (
    <Slot
      playerId={player.id}
      own={player.id === model.bottom}
      dest="rage"
      className={styles.rageZone}
      testId={`rage-zone-${player.id}`}
    >
      <div className={styles.zoneLabel}>Rage zone</div>
      <div className={styles.rageCount}>
        <strong data-testid={`rage-${player.id}`}>{player.rage}</strong>
        <span className={styles.muted}> rage</span>
      </div>
      <div>
        Threat{" "}
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

function Pile({
  label,
  count,
  testId,
  cellTestId,
}: {
  label: string;
  count: number;
  testId: string;
  /** The cell itself, so a searched-deck target can be lit (M5d). */
  cellTestId: string;
}) {
  return (
    <div className={styles.cell} data-testid={cellTestId}>
      <div className={styles.cellLabel}>{label}</div>
      {count > 0 && (
        <Layer index={0}>
          <CardBack testId="pile-back" />
        </Layer>
      )}
      <span className={styles.countBadge} data-testid={testId}>
        {count}
      </span>
    </div>
  );
}

function Discard({
  model,
  player,
}: {
  model: BoardModel;
  player: PlayerAreasView;
}) {
  const discard = player.discard.cards ?? [];
  const top = discard[discard.length - 1];
  return (
    <Slot
      playerId={player.id}
      own={player.id === model.bottom}
      dest="discard"
      className={styles.cell}
      testId={`discard-${player.id}`}
    >
      <div className={styles.cellLabel}>Discard</div>
      {top && (
        <Layer index={0}>
          <CardFace card={top} data={model.view.cards[top.cardId]} rotate />
        </Layer>
      )}
      <span
        className={styles.countBadge}
        data-testid={`discard-count-${player.id}`}
      >
        {player.discard.count}
      </span>
    </Slot>
  );
}

function MatCell({
  model,
  player,
  opponent,
  area,
}: {
  model: BoardModel;
  player: PlayerAreasView;
  opponent: string;
  area: MatArea;
}) {
  switch (area.kind) {
    case "zone":
      return <ZoneCell model={model} player={player} zone={area.zone} />;
    case "strategy":
      return <StrategyZone model={model} player={player} index={area.index} />;
    case "rage":
      return <RageZone model={model} player={player} opponent={opponent} />;
    case "deck":
      return (
        <Pile
          label="Deck"
          count={player.deck.count}
          testId={`deck-count-${player.id}`}
          cellTestId={`deck-${player.id}`}
        />
      );
    case "monsterDeck":
      return (
        <Pile
          label="Monster deck"
          count={player.monsterDeck.count}
          testId={`monster-deck-count-${player.id}`}
          cellTestId={`monster-deck-${player.id}`}
        />
      );
    case "discard":
      return <Discard model={model} player={player} />;
  }
}

/** Where each zone sits in `MAT`, for the path arrows. */
const ZONE_AT = new Map(
  MAT.flatMap(({ area, col, row }) =>
    area.kind === "zone" ? [[area.zone, { col, row }] as const] : [],
  ),
);

/**
 * The playmat's arrows, as (from, to) zone pairs. Path arrows (solid) follow the monster's path
 * 1 to 8; counter arrows (dotted) point from each front zone to the zone behind it, where a
 * countered monster moves (5.15.1.1).
 */
const PATH: readonly [ZoneNumber, ZoneNumber][] = [
  [1, 2],
  [2, 3],
  [3, 4],
  [4, 5],
  [5, 6],
  [6, 7],
  [7, 8],
];
const COUNTER: readonly [ZoneNumber, ZoneNumber][] = [
  [8, 3],
  [7, 4],
  [6, 5],
];

/**
 * A chevron from zone `from` to zone `to`, drawn in the destination cell at the midpoint between
 * the two cells' centers: in the gap for neighbors, in the empty cell for 8 to 3. It sits under
 * the cards, so it never covers a chip.
 */
function MatArrow({
  from,
  to,
  flip,
  kind,
}: {
  from: ZoneNumber;
  to: ZoneNumber;
  flip: boolean;
  kind: "path" | "counter";
}) {
  const a = ZONE_AT.get(from);
  const b = ZONE_AT.get(to);
  if (!a || !b) return null;
  const sign = flip ? -1 : 1;
  const dx = (b.col - a.col) * sign;
  const dy = (b.row - a.row) * sign;
  const angle = (Math.atan2(dy, dx) * 180) / Math.PI;
  return (
    <span
      className={kind === "path" ? styles.pathArrow : styles.counterArrow}
      style={{
        // Counter arrows sit a quarter card to the side, clear of the 5 to 6 path arrow.
        left: `calc(50% - ${dx / 2} * (var(--card-w) + var(--mat-gap)) + ${kind === "counter" ? sign / 4 : 0} * var(--card-w))`,
        top: `calc(50% - ${dy / 2} * (var(--card-h) + var(--mat-gap)))`,
        rotate: `${angle}deg`,
      }}
      data-testid={`${kind}-arrow`}
      data-from={from}
      data-to={to}
      aria-hidden
    />
  );
}

/**
 * One player's mat. The bottom player's mat reads as `MAT`; the opponent's is rotated 180°, like
 * across a real table (column c becomes 6 - c, the rows mirror). So the two zone 8s face each
 * other in column 3, and same-column zones (4.4.5.4) line up: your Z1 under their Z5 and Z6.
 */
function Mat({
  model,
  player,
  opponent,
  side,
  glow,
  mat,
}: {
  model: BoardModel;
  player: PlayerAreasView;
  opponent: string;
  side: "opp" | "you";
  /** The turn glow's current color name (M5f), or `null` when this mat doesn't glow. */
  glow: string | null;
  /** The custom mat image (M5f), drawn behind the zones; the opponent's is turned 180°. */
  mat: MatView | null;
}) {
  const color = glow ? GLOW_COLORS[glow] : undefined;
  return (
    <div
      className={`${styles.mat}${mat ? ` ${styles.matCustom}` : ""}`}
      data-testid={`mat-${side}`}
      data-player={player.id}
      data-glow={glow ?? undefined}
      style={
        color
          ? { boxShadow: `0 0 0 3px ${color}, 0 0 18px 4px ${color}` }
          : undefined
      }
    >
      {mat && (
        <div
          className={styles.matImage}
          data-testid="mat-image"
          style={{
            backgroundImage: `url(${mat.url})`,
            backgroundSize: `${mat.scale}% auto`,
            backgroundPosition: `${mat.x}% ${mat.y}%`,
            rotate: side === "opp" ? "180deg" : undefined,
          }}
        />
      )}
      {MAT.map(({ area, col, row, cols = 1, rows = 1 }) => {
        const c = side === "you" ? col : 6 - (col + cols - 1);
        const r = side === "you" ? row : 2 - (row + rows - 1);
        return (
          <div
            key={`${area.kind}-${col}-${row}`}
            className={
              area.kind === "strategy"
                ? `${styles.matCell} ${styles.matCellStrategy}`
                : area.kind === "monsterDeck" ||
                    area.kind === "deck" ||
                    area.kind === "discard"
                  ? `${styles.matCell} ${styles.matCellNarrow}`
                  : styles.matCell
            }
            style={{
              gridColumn: `${c + 1} / span ${cols}`,
              gridRow: `${r + 1} / span ${rows}`,
            }}
            data-testid="mat-cell"
            data-area={
              area.kind === "zone"
                ? `Z${area.zone}`
                : area.kind === "strategy"
                  ? `Strategy ${area.index}`
                  : area.kind
            }
            data-col={c}
            data-row={r}
            data-rows={rows}
          >
            <MatCell
              model={model}
              player={player}
              opponent={opponent}
              area={area}
            />
            {area.kind === "zone" &&
              [
                ...PATH.filter(([, to]) => to === area.zone).map(
                  ([from]) => [from, "path"] as const,
                ),
                ...COUNTER.filter(([, to]) => to === area.zone).map(
                  ([from]) => [from, "counter"] as const,
                ),
              ].map(([from, kind]) => (
                <MatArrow
                  key={`${kind}-${from}`}
                  from={from}
                  to={area.zone}
                  flip={side === "opp"}
                  kind={kind}
                />
              ))}
          </div>
        );
      })}
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
  zoneChoice = new Map(),
  highlight = new Set(),
  name = (id) => id,
  log = null,
  settings = null,
  step = null,
  animation = "off",
  onAnimating,
  turnGlow = false,
  mat = null,
}: {
  model: BoardModel;
  /** The prompt panel's content (M5c: the step, Pass, turn flags, Concede, the bot's state). */
  prompt: ReactNode;
  /** The bottom player's legal actions (M5b); empty while they can't act. */
  actions?: readonly Action[];
  /** True while the bottom player can't act (a bot decides, or the game is over). */
  locked?: boolean;
  onAction?: (action: Action) => void;
  /** Words for an action in the destination menu. */
  labelOf?: (action: Action) => string;
  /** Zones a zone choice offers (M5c), by `<player>:<zone>`, with the action each one takes. */
  zoneChoice?: ReadonlyMap<string, Action>;
  /** Where the bot's last move landed (M5c), as `<player>|<destination>`. */
  highlight?: ReadonlySet<string>;
  /** Seat names for the phase tracker (M5d): "You", "Bot", or the player id. */
  name?: (playerId: string) => string;
  /** The battle log (M5d) for the right column, or `null` while it is hidden (L). */
  log?: ReactNode;
  /** The settings panel (M5d). */
  settings?: ReactNode;
  /**
   * The shown state's action count while live, `null` in the history view (M5f): a change of
   * exactly one step animates, anything else shows at once.
   */
  step?: number | null;
  /** Animation speed (M5f setting). */
  animation?: AnimationSpeed;
  /** Called when card animations start and end, so input and the bot wait for them. */
  onAnimating?: (animating: boolean) => void;
  /** Glow the turn player's mat border in their monster's colors (M5f setting). */
  turnGlow?: boolean;
  /** A custom mat image behind both mats (M5f), or `null` for the default mat. */
  mat?: MatView | null;
}) {
  const [selected, setSelected] = useState<string | null>(null);
  const [dragging, setDragging] = useState<string | null>(null);
  const [menu, setMenu] = useState<HandAction[] | null>(null);
  const [previewed, setPreviewed] = useState<string | null>(null);
  const [previewedCard, setPreviewedCard] = useState<Card | null>(null);
  const { view } = model;
  const you = view.players.find(
    (p) => p.id === model.bottom,
  ) as PlayerAreasView;
  const opp = view.players.find((p) => p.id === model.top) as PlayerAreasView;

  // M5f: card movement animations, locked input while they play, and the turn glow.
  const mainRef = useRef<HTMLElement | null>(null);
  const dropRef = useRef<{ instanceId: string; box: Box; at: number } | null>(
    null,
  );
  const [animating, setAnimating] = useState(false);
  const flights = useMoveAnimations({
    root: mainRef,
    model,
    step,
    speed: animation,
    drop: dropRef,
    onAnimating: (on) => {
      setAnimating(on);
      onAnimating?.(on);
    },
  });
  const turnPlayer = view.players.find((p) => p.id === view.turnPlayer);
  const turnMonster = turnPlayer?.invadingMonsterZone.cards?.at(-1);
  const glow = useGlow(
    turnGlow && turnMonster
      ? glowCycle(view.cards[turnMonster.cardId]?.colors ?? [])
      : null,
  );
  const glowFor = (player: PlayerAreasView) =>
    player.id === view.turnPlayer ? glow : null;

  const playable = useMemo(
    () => (locked ? new Set<string>() : playableCards(actions)),
    [actions, locked],
  );
  const lit = useMemo(
    () => new Set([...playable].filter((id) => isLit(id, actions))),
    [actions, playable],
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
      setPreviewedCard(null);
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
    // The card settles into its slot from where it was let go (M5f).
    const at = event.active.rect.current.translated;
    if (at) {
      const instanceId = String(event.active.id);
      dropRef.current = {
        instanceId,
        box: { x: at.left, y: at.top, width: at.width, height: at.height },
        at: performance.now(),
      };
    }
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
    previewCard: setPreviewedCard,
    zoneChoice,
    highlight,
    act: onAction,
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
          <aside className={styles.leftColumn} data-testid="left-column">
            <section className={styles.panel} data-testid="prompt">
              <div className={styles.panelTitle}>Prompt</div>
              {prompt}
            </section>
            <section className={styles.panel} data-testid="phase-tracker">
              <div className={styles.panelTitle}>Phase</div>
              <PhaseTracker view={view} name={name} />
            </section>
            {settings}
          </aside>
          <main className={styles.main} ref={mainRef}>
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
                  <CardBack key={i} testId="opponent-card-back" small />
                );
              })}
            </div>
            <Mat
              model={model}
              player={opp}
              opponent={you.id}
              side="opp"
              glow={glowFor(opp)}
              mat={mat}
            />
            <div className={styles.centerLine} />
            <Mat
              model={model}
              player={you}
              opponent={opp.id}
              side="you"
              glow={glowFor(you)}
              mat={mat}
            />
            <Hand
              model={model}
              player={you}
              playable={playable}
              lit={lit}
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
          <aside className={styles.rightColumn} data-testid="right-column">
            {log && (
              <section
                className={`${styles.panel} ${styles.logPanel}`}
                data-testid="log-panel"
              >
                <div className={styles.panelTitle}>Battle log</div>
                {log}
              </section>
            )}
          </aside>
          {flights.length > 0 && (
            <FlightLayer
              flights={flights}
              speed={animation}
              cards={view.cards}
            />
          )}
          {animating && (
            // Input waits while cards move (M5f).
            <div
              className={styles.animationLock}
              data-testid="animation-lock"
            />
          )}
          {(previewed || previewedCard) && (
            <Preview
              model={model}
              instanceId={previewed}
              card={previewedCard}
            />
          )}
        </div>
        <DragOverlay dropAnimation={null}>
          {draggedCard ? (
            <div className={`${styles.handCard} ${styles.dragOverlay}`}>
              <CardFace
                card={draggedCard}
                data={view.cards[draggedCard.cardId]}
              />
            </div>
          ) : null}
        </DragOverlay>
      </DndContext>
    </InteractionContext.Provider>
  );
}
