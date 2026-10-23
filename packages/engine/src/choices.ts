import { appendLog } from "./state";
import type { ChoiceKind, ChoiceOption, GameState, PlayerId } from "./types";

/**
 * Stops the engine until `player` makes a choice: sets `state.pendingChoice`. The log records
 * only the kind and the number of options, since options may be hidden cards. `hidden` marks
 * options only the chooser may see (their hand, a searched deck).
 */
export function requireChoice(
  state: GameState,
  player: PlayerId,
  kind: ChoiceKind,
  rule: string,
  options: ChoiceOption[],
  hidden = false,
): void {
  const id = state.nextChoiceId++;
  state.pendingChoice = hidden
    ? { id, player, kind, rule, options, private: true }
    : { id, player, kind, rule, options };
  appendLog(state, "choiceRequired", player, {
    rule,
    kind,
    choiceId: id,
    optionCount: options.length,
  });
}

/**
 * Whether `player` is asked a choice with a single legal option, which the engine would otherwise
 * make alone: every kind with `confirmSingleOption` (M5e), target picks only with the older
 * `confirmSingleTarget` (M5d), so records made with it replay unchanged.
 */
export function confirmsSingleOption(
  state: GameState,
  player: PlayerId,
  kind: "target" | "other",
): boolean {
  if (state.confirmSingleOption?.includes(player)) return true;
  return (
    kind === "target" && state.confirmSingleTarget?.includes(player) === true
  );
}
