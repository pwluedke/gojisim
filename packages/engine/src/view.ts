import type { Card } from "@gojisim/cards";
import type {
  CardInstance,
  ChoiceOption,
  PendingChoice,
  CardStack,
  GameState,
  PlayerId,
  PlayerState,
  StrategyPlacement,
  ZoneNumber,
} from "./types";
import { ZONE_NUMBERS } from "./types";

export type Viewer = PlayerId | "spectator";

/** A card revealed from a hidden area (5.10), and where it is. */
export interface RevealedCard {
  card: CardInstance;
  player: PlayerId;
  area: "hand" | "deck" | "monsterDeck";
}

export interface PendingChoiceView extends Omit<PendingChoice, "options"> {
  optionCount: number;
  options: ChoiceOption[] | null;
}

/** Deep copy. Game state is plain JSON, so a JSON round trip is exact. */
function cloneJson<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T;
}

/** An area as one viewer sees it. `cards` is `null` when its contents are hidden from them. */
export interface AreaView<T> {
  /** Every player may check the number of cards in any area (4.1.2.2). */
  count: number;
  cards: T[] | null;
}

export interface PlayerAreasView {
  id: PlayerId;
  rage: number;
  zones: Record<ZoneNumber, AreaView<CardStack>>;
  strategyZones: [AreaView<StrategyPlacement>, AreaView<StrategyPlacement>];
  monsterDeck: AreaView<CardInstance>;
  invadingMonsterZone: AreaView<CardInstance>;
  monsterPosition: ZoneNumber | null;
  deck: AreaView<CardInstance>;
  hand: AreaView<CardInstance>;
  discard: AreaView<CardInstance>;
}

/** What one player or a spectator may see. Never includes the seed or RNG state. */
export interface PlayerView {
  viewer: Viewer;
  players: [PlayerAreasView, PlayerAreasView];
  resolutionArea: AreaView<CardInstance>;
  firstPlayer: PlayerId;
  turn: number;
  turnPlayer: PlayerId;
  phase: GameState["phase"];
  step: GameState["step"];
  currentStep: GameState["currentStep"];
  turnFlags: GameState["turnFlags"];
  standby: GameState["standby"];
  continuousEffects: GameState["continuousEffects"];
  /**
   * The pending choice. Only its player sees the options of a `nextMonster` choice, which come
   * from their hidden monster deck (4.6.2), or of a private choice (their hand, a searched deck);
   * everyone sees the option count.
   */
  pendingChoice: PendingChoiceView | null;
  /** Cards revealed to both players, with where they are, until they move or the effect ends (5.10). */
  revealed: RevealedCard[];
  /** Public engine status a search bot needs to rebuild a playable state (M6a). */
  counterTotal: GameState["counterTotal"];
  checkTiming: GameState["checkTiming"];
  timedTriggers: GameState["timedTriggers"];
  manualQueue: GameState["manualQueue"];
  /**
   * The paused ability resolution, only for the player who must make the pending choice (its
   * progress is their own picks); `null` for everyone else.
   */
  resolution: GameState["resolution"];
  result: GameState["result"];
  /** Card data only for cards this viewer can see. */
  cards: Record<string, Card>;
  log: GameState["log"];
}

function shown<T>(cards: T[], count = cards.length): AreaView<T> {
  return { count, cards: cloneJson(cards) };
}

function hidden(count: number): AreaView<never> {
  return { count, cards: null };
}

function playerView(player: PlayerState, viewer: Viewer): PlayerAreasView {
  const isOwner = player.id === viewer;
  const zones = {} as Record<ZoneNumber, AreaView<CardStack>>;
  for (const zone of ZONE_NUMBERS) {
    const stacks = player.zones[zone];
    zones[zone] = shown(
      stacks,
      stacks.reduce((n, stack) => n + stack.length, 0),
    );
  }
  return {
    id: player.id,
    rage: player.rage,
    zones,
    strategyZones: [
      shown(player.strategyZones[0]),
      shown(player.strategyZones[1]),
    ],
    // The monster deck zone is hidden from the opponent (4.6.2).
    monsterDeck: isOwner
      ? shown(player.monsterDeck)
      : hidden(player.monsterDeck.length),
    invadingMonsterZone: shown(player.invadingMonsterZone),
    monsterPosition: player.monsterPosition,
    // The deck is hidden from all players, so its order is too (4.8.2).
    deck: hidden(player.deck.length),
    // A player sees only their own hand (4.9.2).
    hand: isOwner ? shown(player.hand) : hidden(player.hand.length),
    discard: shown(player.discard),
  };
}

function choiceView(
  choice: PendingChoice | null,
  viewer: Viewer,
): PendingChoiceView | null {
  if (choice === null) return null;
  const hidden =
    (choice.kind === "nextMonster" || choice.private === true) &&
    viewer !== choice.player;
  return {
    ...cloneJson(choice),
    optionCount: choice.options.length,
    options: hidden ? null : cloneJson(choice.options),
  };
}

function visibleCardIds(view: Omit<PlayerView, "cards">): Set<number> {
  const ids = new Set<number>();
  const add = (cards: CardInstance[] | null) =>
    cards?.forEach((c) => ids.add(c.cardId));
  for (const player of view.players) {
    for (const zone of ZONE_NUMBERS)
      player.zones[zone].cards?.forEach((stack) => add(stack));
    for (const strategyZone of player.strategyZones) {
      add(strategyZone.cards?.map((placement) => placement.card) ?? null);
    }
    add(player.monsterDeck.cards);
    add(player.invadingMonsterZone.cards);
    add(player.hand.cards);
    add(player.discard.cards);
  }
  add(view.resolutionArea.cards);
  add(view.revealed.map((r) => r.card));
  for (const entry of view.log) {
    if (typeof entry.payload["cardId"] === "number")
      ids.add(entry.payload["cardId"]);
  }
  return ids;
}

/** Filters the game state for one player or a spectator (spec "Hidden information"). */
export function getPlayerView(state: GameState, viewer: Viewer): PlayerView {
  if (viewer !== "spectator" && !state.players.some((p) => p.id === viewer)) {
    throw new Error(`Unknown viewer ${viewer}`);
  }
  const view: Omit<PlayerView, "cards"> = {
    viewer,
    players: [
      playerView(state.players[0], viewer),
      playerView(state.players[1], viewer),
    ],
    resolutionArea: shown(state.resolutionArea),
    firstPlayer: state.firstPlayer,
    turn: state.turn,
    turnPlayer: state.turnPlayer,
    phase: state.phase,
    step: state.step,
    currentStep: state.currentStep,
    turnFlags: { ...state.turnFlags },
    standby: cloneJson(state.standby),
    continuousEffects: cloneJson(state.continuousEffects),
    pendingChoice: choiceView(state.pendingChoice, viewer),
    revealed: state.players.flatMap((p) =>
      (["hand", "deck", "monsterDeck"] as const).flatMap((area) =>
        p[area]
          .filter((c) => state.revealed.includes(c.instanceId))
          .map((c) => ({ card: cloneJson(c), player: p.id, area })),
      ),
    ),
    counterTotal: state.counterTotal,
    checkTiming: cloneJson(state.checkTiming),
    timedTriggers: cloneJson(state.timedTriggers),
    manualQueue: cloneJson(state.manualQueue),
    // Only the chooser sees the paused resolution, and only its master sees what it bound (a card
    // its own search found, for example).
    resolution:
      state.pendingChoice !== null &&
      state.pendingChoice.player === viewer &&
      state.resolution !== null
        ? {
            ...cloneJson(state.resolution),
            bindings:
              state.resolution.standby.master === viewer
                ? cloneJson(state.resolution.bindings)
                : {},
          }
        : null,
    result: cloneJson(state.result),
    log: cloneJson(state.log),
  };
  const cards: Record<string, Card> = {};
  for (const id of visibleCardIds(view)) {
    const card = state.cards[id];
    if (card) cards[id] = cloneJson(card);
  }
  return { ...view, cards };
}
