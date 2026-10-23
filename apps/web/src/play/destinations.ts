import type { Action } from "@gojisim/engine";

/**
 * Where a hand card goes for each action (M5b, docs/ui/board-design.md "Hand and card movement"):
 * a zone for `playBattle` (8.2), a strategy zone for `activateStrategy` (8.3), the player's own
 * invading monster for `playMonster` (8.5, 12.5), their Rage zone for `gainRage` (8.4),
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

/** Hand cards with at least one legal action: they can be selected and dragged. */
export function playableCards(actions: readonly Action[]): Set<string> {
  const ids = new Set<string>();
  for (const action of actions)
    if (destinationOf(action) && "cardInstanceId" in action)
      ids.add(action.cardInstanceId);
  return ids;
}

/** Actions that play a hand card to a zone: a battle, strategy or monster play. */
const ZONE_PLAYS: ReadonlySet<Action["type"]> = new Set([
  "playBattle",
  "activateStrategy",
  "playMonster",
]);

/**
 * Whether a hand card is lit in the hand strip (Paul's ruling, Oct 23, 2026): only when it can be
 * played to a zone (8.2, 8.3, 8.5). A card whose only actions are `invade` or `gainRage` stays
 * unlit, though selecting or dragging it still lights the discard pile and the Rage zone.
 */
export function isLit(cardInstanceId: string, actions: readonly Action[]) {
  return actions.some(
    (action) =>
      ZONE_PLAYS.has(action.type) &&
      "cardInstanceId" in action &&
      action.cardInstanceId === cardInstanceId,
  );
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
