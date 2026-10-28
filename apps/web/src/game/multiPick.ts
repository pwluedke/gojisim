import type { Count } from "@gojisim/cards";
import type { GameState } from "@gojisim/engine";
import { currentEffect } from "./labels";

/**
 * A pick of 2 or more cards (Tester fixes 1): the modal lets the chooser select the cards, then
 * Confirm. The engine still takes one card per choice (decision 129); the UI sends the picks in
 * selection order. `min` / `max` are the legal selection sizes: exactly N, or 0 to N when the
 * choice may stop early (Done, "up to N", a search's "find nothing").
 */
export interface MultiPick {
  min: number;
  max: number;
  /** The cards the whole pick takes (for the heading): those picked already plus `max`. */
  total: number;
}

function remainingOf(count: unknown, picked: number): number | null {
  // Only a pick count: not "all", "hand", or a mill's plain number.
  if (typeof count !== "object" || count === null) return null;
  const pick = count as Exclude<Count, string>;
  if ("upTo" in pick) return pick.upTo - picked;
  return typeof pick.exact === "number" ? pick.exact - picked : null;
}

/**
 * The multi-card pick the pending choice belongs to, or `null` for a single-card pick (which
 * keeps its click-to-pick behavior) and for picks whose options depend on earlier picks (an
 * order such as "rightmost first", a rank total).
 */
export function multiPick(state: GameState): MultiPick | null {
  const choice = state.pendingChoice;
  const r = state.resolution;
  if (!choice || !r || choice.kind !== "target") return null;
  const effect = currentEffect(state);
  if (!effect) return null;
  const picked = r.chosen.filter((id) => id !== "done").length;
  let remaining: number | null = null;
  if (effect.effect === "discardDownTo") {
    // 5.7.2: the picks discard down to the size; the hand shrinks once they are all made.
    const hand =
      state.players.find((p) => p.id === choice.player)?.hand.length ?? 0;
    remaining = hand - effect.size - picked;
  } else if (effect.effect === "destroy") {
    if (effect.target.order || effect.target.maxTotalRank) return null;
    remaining = remainingOf(effect.target.count, picked);
  } else if ("count" in effect) {
    remaining = remainingOf(effect.count, picked);
  }
  const cards = choice.options.filter((o) => o.id !== "done").length;
  if (remaining === null) return null;
  const max = Math.min(remaining, cards);
  if (max < 2) return null;
  const canStop = choice.options.some((o) => o.id === "done");
  return { min: canStop ? 0 : max, max, total: picked + remaining };
}

/** Whether `selected` cards may be confirmed now. */
export function canConfirm(pick: MultiPick, selected: number): boolean {
  return selected >= Math.max(pick.min, 1) && selected <= pick.max;
}

/** A click (or number key) on a card: selects it last, or deselects it, keeping the order. */
export function toggle(
  selected: readonly string[],
  id: string,
  max: number,
): string[] {
  if (selected.includes(id)) return selected.filter((s) => s !== id);
  return selected.length >= max ? [...selected] : [...selected, id];
}
