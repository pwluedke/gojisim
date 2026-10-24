import { type GameState, ZONE_NUMBERS } from "@gojisim/engine";

/** Where a choice's target card is (M5d): the label above its image, and the mat cell to light. */
export interface TargetLocation {
  label: string;
  /** `data-testid` of the board element holding it. */
  testId: string;
}

/**
 * The location of a target card, from the chooser's side: `Z1` to `Z8`, `Monster`, `Strategy
 * zone 1/2`, `Discard pile`, `Revealed from hand` (or `Hand` for the chooser's own),
 * `Deck (searched)` or `Monster deck (searched)`. Cards on the other player's side add
 * "(opponent)". `null` when the option isn't a card in an area (a standby or replacement order).
 */
export function targetLocation(
  state: GameState,
  instanceId: string,
  chooser: string,
): TargetLocation | null {
  const has = (cards: readonly { instanceId: string }[]) =>
    cards.some((c) => c.instanceId === instanceId);
  for (const p of state.players) {
    const mine = p.id === chooser;
    const at = (label: string, testId: string) => ({
      label: mine ? label : `${label} (opponent)`,
      testId,
    });
    for (const zone of ZONE_NUMBERS)
      if (p.zones[zone].some(has))
        return at(`Z${zone}`, `zone-${p.id}-${zone}`);
    if (has(p.invadingMonsterZone)) return at("Monster", `monster-${p.id}`);
    // Strategy zone 3 too, once a player has it (E20).
    for (const [i, zone] of p.strategyZones.entries())
      if (has(zone.map((s) => s.card)))
        return at(`Strategy zone ${i + 1}`, `strategy-${p.id}-${i + 1}`);
    if (has(p.discard)) return at("Discard pile", `discard-${p.id}`);
    if (has(p.hand))
      return mine
        ? { label: "Hand", testId: "your-hand" }
        : at("Revealed from hand", "opponent-hand");
    if (has(p.deck)) return at("Deck (searched)", `deck-${p.id}`);
    if (has(p.monsterDeck))
      return at("Monster deck (searched)", `monster-deck-${p.id}`);
  }
  return null;
}
