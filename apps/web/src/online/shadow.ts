import type {
  AreaView,
  CardInstance,
  GameState,
  PlayerAreasView,
  PlayerState,
  PlayerView,
  StrategyPlacement,
  ZoneNumber,
} from "@gojisim/engine";
import { ZONE_NUMBERS } from "@gojisim/engine";

/*
 * A head to head game's board in the browser (M9b): a display-only `GameState` built from the
 * seat's `PlayerView`, so `/play`'s board, log, prompts and animations run unchanged. Every
 * hidden card (the other hand, both decks, the other monster deck) is a placeholder with no card
 * data, `HIDDEN_CARD_ID`, shown only as a card back. The browser never runs the engine on it:
 * the server checks every move and sends the legal actions and the board numbers.
 */

/** The card id of a hidden card: no card has it, so nothing can show its face. */
export const HIDDEN_CARD_ID = -1;

export const isHidden = (card: { cardId: number }) =>
  card.cardId === HIDDEN_CARD_ID;

function fill(
  area: AreaView<CardInstance>,
  owner: string,
  where: string,
  shown: readonly CardInstance[] = [],
): CardInstance[] {
  if (area.cards) return area.cards;
  // Cards revealed from a hidden area (5.10) show; the rest are placeholders, in a fixed order.
  const rest = Array.from(
    { length: Math.max(0, area.count - shown.length) },
    (_, i): CardInstance => ({
      instanceId: `hidden-${owner}-${where}-${i}`,
      cardId: HIDDEN_CARD_ID,
      owner,
    }),
  );
  return [...shown, ...rest];
}

function playerFrom(view: PlayerView, p: PlayerAreasView): PlayerState {
  const revealed = (area: "hand" | "deck" | "monsterDeck") =>
    view.revealed
      .filter((r) => r.player === p.id && r.area === area)
      .map((r) => r.card);
  const zones = {} as Record<ZoneNumber, CardInstance[][]>;
  for (const zone of ZONE_NUMBERS) zones[zone] = p.zones[zone].cards ?? [];
  return {
    id: p.id,
    zones,
    strategyZones: p.strategyZones.map(
      (z): StrategyPlacement[] => z.cards ?? [],
    ) as PlayerState["strategyZones"],
    monsterDeck: fill(p.monsterDeck, p.id, "monster", revealed("monsterDeck")),
    invadingMonsterZone: p.invadingMonsterZone.cards ?? [],
    monsterPosition: p.monsterPosition,
    deck: fill(p.deck, p.id, "deck", revealed("deck")),
    hand: fill(p.hand, p.id, "hand", revealed("hand")),
    discard: p.discard.cards ?? [],
    rage: p.rage,
  };
}

export function stateFromView(view: PlayerView): GameState {
  const choice = view.pendingChoice;
  return {
    version: 1,
    seed: 0,
    rngState: 0,
    nextInstanceId: 0,
    nextTimestamp: 0,
    players: [
      playerFrom(view, view.players[0]),
      playerFrom(view, view.players[1]),
    ],
    resolutionArea: view.resolutionArea.cards ?? [],
    firstPlayer: view.firstPlayer,
    turn: view.turn,
    turnPlayer: view.turnPlayer,
    phase: view.phase,
    step: view.step,
    currentStep: view.currentStep,
    turnFlags: view.turnFlags,
    standby: view.standby,
    continuousEffects: view.continuousEffects,
    counterTotal: view.counterTotal,
    // The other player's private choice shows as theirs, with no options.
    pendingChoice: choice
      ? (({ optionCount: _, ...rest }) => ({
          ...rest,
          options: choice.options ?? [],
        }))(choice)
      : null,
    resolution: view.resolution,
    revealed: view.revealed.map((r) => r.card.instanceId),
    timedTriggers: view.timedTriggers,
    manualQueue: view.manualQueue,
    checkTiming: view.checkTiming,
    pendingLosses: [],
    nextChoiceId: 0,
    loopGuard: [],
    loop: null,
    result: view.result,
    cards: view.cards,
    log: view.log,
  };
}
