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
