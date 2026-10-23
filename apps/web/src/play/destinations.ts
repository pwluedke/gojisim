import type { Action } from "@gojisim/engine";

/**
 * Where a hand card goes for each action (M5b, docs/ui/board-design.md "Hand and card movement"):
 * a zone for `playBattle` (8.2), a strategy zone for `activateStrategy` (8.3), the player's own
 * invading monster for `playMonster` (8.5, 12.5), their Stats panel (rage) for `gainRage` (8.4),
 * their discard pile for `invade` (8.6). Other actions don't move a hand card.
 */
export type DestinationKey =
  `zone:${number}` | `strategy:${number}` | "monster" | "rage" | "discard";

/** A hand card action, the only kind `destinationOf` maps. */
export type HandAction = Extract<Action, { cardInstanceId: string }>;

export function destinationOf(action: Action): DestinationKey | null {
  switch (action.type) {
    case "playBattle":
      return `zone:${action.zone}`;
    case "activateStrategy":
      return `strategy:${action.strategyZone}`;
    case "playMonster":
      return "monster";
    case "gainRage":
      return "rage";
    case "invade":
      return "discard";
    default:
      return null;
  }
}

/** Hand cards with at least one legal action (lit in the hand strip; the rest are dimmed). */
export function playableCards(actions: readonly Action[]): Set<string> {
  const ids = new Set<string>();
  for (const action of actions)
    if (destinationOf(action) && "cardInstanceId" in action)
      ids.add(action.cardInstanceId);
  return ids;
}

/**
 * The legal destinations of one hand card, each with its actions in `getLegalActions` order. A
 * destination with more than one action gets a small menu.
 */
export function cardDestinations(
  actions: readonly Action[],
  cardInstanceId: string,
): Map<DestinationKey, HandAction[]> {
  const out = new Map<DestinationKey, HandAction[]>();
  for (const action of actions) {
    if (
      !("cardInstanceId" in action) ||
      action.cardInstanceId !== cardInstanceId
    )
      continue;
    const key = destinationOf(action);
    if (!key) continue;
    out.set(key, [...(out.get(key) ?? []), action]);
  }
  return out;
}
