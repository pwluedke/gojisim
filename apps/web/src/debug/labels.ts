import { type Card, type Effect, getCardAbilities } from "@gojisim/cards";
import type { Action, CardInstance, GameState } from "@gojisim/engine";

export function cardData(
  state: GameState,
  card: CardInstance | { cardId: number },
): Card | undefined {
  return state.cards[card.cardId];
}

/** Every card instance in the game, by instance id (hand, monster deck, field, piles). */
export function findInstance(
  state: GameState,
  instanceId: string,
): CardInstance | undefined {
  for (const player of state.players) {
    const all = [
      ...player.hand,
      ...player.monsterDeck,
      ...player.deck,
      ...player.discard,
      ...player.invadingMonsterZone,
      ...Object.values(player.zones).flat(2),
      ...player.strategyZones.flat().map((p) => p.card),
    ];
    const found = all.find((c) => c.instanceId === instanceId);
    if (found) return found;
  }
  return state.resolutionArea.find((c) => c.instanceId === instanceId);
}

function nameOf(state: GameState, instanceId: string): string {
  const instance = findInstance(state, instanceId);
  const card = instance && cardData(state, instance);
  return card ? `${card.name} [${card.cardNumber}]` : instanceId;
}

/** A button label for an action, e.g. "Play Godzilla (2023) [ESD01-011] → zone 4". */
export function actionLabel(state: GameState, action: Action): string {
  switch (action.type) {
    case "playBattle":
      return `Play ${nameOf(state, action.cardInstanceId)} → zone ${action.zone}`;
    case "activateStrategy":
      return `Activate ${nameOf(state, action.cardInstanceId)} → strategy zone ${action.strategyZone}`;
    case "gainRage":
      return `Discard ${nameOf(state, action.cardInstanceId)} for +1 rage`;
    case "playMonster":
      return `Play monster ${nameOf(state, action.cardInstanceId)}`;
    case "invade": {
      const instance = findInstance(state, action.cardInstanceId);
      const icon = (instance && cardData(state, instance)?.invadeZones) ?? 0;
      return `Invade: discard ${nameOf(state, action.cardInstanceId)} (icon ${icon})`;
    }
    case "pass":
      return "Pass";
    case "choose": {
      const choice = state.pendingChoice;
      const option = choice?.options.find((o) => o.id === action.optionId);
      const card =
        option && option.cardId !== null
          ? state.cards[option.cardId]
          : undefined;
      if (choice?.kind === "standbyOrder")
        return `Resolve ${option?.abilityId ?? "?"} (${card?.name ?? "?"})`;
      if (choice?.kind === "zone") {
        const [player, zone] = action.optionId.split(":");
        return `Choose ${player}'s zone ${zone}`;
      }
      if (choice?.kind === "manual") return "Done (close the manual override)";
      if (choice?.kind === "replacementOrder")
        return `Apply ${action.optionId} (${choice.rule})`;
      if (choice?.kind === "confirm")
        return `${action.optionId === "yes" ? "Yes" : "No"} (${option?.abilityId ?? "?"}, ${choice.rule})`;
      const named = card
        ? `${card.name} [${card.cardNumber}]`
        : action.optionId;
      // Hand and deck choices say what happens to the card.
      switch (choice?.rule) {
        case "5.7.2":
          return `Keep ${named}`;
        case "5.7.1":
          return `Discard ${named}`;
        case "5.8.1":
        case "12.6.2":
          return action.optionId === "done" ? "Find nothing" : `Take ${named}`;
        case "5.17":
          return `Evolve ${named}`;
        case "10.5.3":
          return action.optionId === "done"
            ? "Stop choosing"
            : `Target ${named}`;
      }
      if (action.optionId === "done") return "Stop choosing (or find nothing)";
      return `Choose ${named}`;
    }
    case "concede":
      return "Concede";
    case "manual":
      return `Manual: ${action.op.kind}`;
  }
}

/** The effect a paused ability is performing (format.md), from its card's ability data. */
function currentEffect(state: GameState): Effect | undefined {
  const r = state.resolution;
  if (!r) return undefined;
  const [number, id] = r.standby.abilityId.split("#");
  const ability = getCardAbilities(number ?? "").abilities.find(
    (a) => "id" in a && a.id === id,
  );
  if (!ability || ability.kind !== "triggered") return undefined;
  let effects =
    r.stage === "cost" ? (ability.cost?.effects ?? []) : ability.effects;
  let effect: Effect | undefined;
  for (const index of r.path) {
    effect = effects[index];
    if (!effect) return undefined;
    effects = "effects" in effect ? effect.effects : [];
  }
  return effect;
}

/**
 * Who is deciding and what, e.g. "P2 is choosing which cards to keep (the rest are discarded)
 * during P1's turn". A choice can belong to the player whose turn it isn't.
 */
export function decisionHeading(state: GameState): string {
  if (state.result) return "Game over";
  const choice = state.pendingChoice;
  if (!choice) return `${state.turnPlayer}'s turn: choose an action`;
  const who = choice.player;
  const source = state.resolution
    ? (state.cards[state.resolution.standby.sourceCardId]?.name ?? "")
    : "";
  const by = source ? ` for ${source}` : "";
  let what: string;
  switch (choice.kind) {
    case "standbyOrder":
      what = "choosing which ability resolves first";
      break;
    case "nextMonster":
      what = "choosing their next monster";
      break;
    case "zone":
      what = `choosing a zone${by}`;
      break;
    case "confirm":
      what = `deciding whether to use${source ? ` ${source}'s` : ""} ability`;
      break;
    case "replacementOrder":
      what = "choosing which replacement applies";
      break;
    case "manual":
      what = "resolving a card by hand (manual override)";
      break;
    default: {
      const effect = currentEffect(state);
      if (choice.rule === "5.7.2" && effect?.effect === "discardDownTo") {
        const left = effect.size - (state.resolution?.chosen.length ?? 0);
        what = `choosing what to discard: keeping ${effect.size} card${effect.size === 1 ? "" : "s"}, the rest are discarded${by} (pick ${left} more to keep)`;
      } else if (choice.rule === "5.7.1")
        what = `choosing a card to discard${by}`;
      else if (choice.rule === "5.8.1" || choice.rule === "12.6.2")
        what = `searching their deck${by}`;
      else if (choice.rule === "5.17") what = "choosing a card to evolve";
      else if (choice.rule === "5.11.1") what = `choosing a card to play${by}`;
      else what = `choosing a target${by}`;
    }
  }
  const during =
    who === state.turnPlayer ? "" : ` during ${state.turnPlayer}'s turn`;
  return `${who} is ${what}${during}`;
}
