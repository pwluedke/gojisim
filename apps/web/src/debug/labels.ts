import type { Card } from "@gojisim/cards";
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
      if (choice?.kind === "replacementOrder")
        return `Apply ${action.optionId} (${choice.rule})`;
      if (choice?.kind === "confirm")
        return `${action.optionId === "yes" ? "Yes" : "No"} (${option?.abilityId ?? "?"}, ${choice.rule})`;
      if (action.optionId === "done") return "Stop choosing (or find nothing)";
      return `Choose ${card ? `${card.name} [${card.cardNumber}]` : action.optionId}`;
    }
    case "concede":
      return "Concede";
  }
}
