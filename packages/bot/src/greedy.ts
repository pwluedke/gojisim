import { type Action, advanceToDecision, applyAction } from "@gojisim/engine";
import { determinize } from "./determinize";
import { evaluate } from "./evaluate";
import type { Bot } from "./types";

/**
 * One-step lookahead (M6b): for each of `samples` determinizations (default 1, M6a), apply each
 * legal action, run the engine to the next decision (by either player) or the end of the game,
 * and evaluate there from the bot's point of view. The best average wins; ties go to the seeded
 * rng. Choices (targets, discards, zones, yes/no) use the same lookahead.
 */
export const greedyBot: Bot = {
  name: "greedy",
  chooseAction: ({ view, legalActions, knowledge, rng, settings }) => {
    if (legalActions.length === 1) return legalActions[0] as Action;
    const me = view.viewer;
    const samples = Math.max(1, Number(settings["samples"] ?? 1));
    const scores = legalActions.map(() => 0);
    for (let s = 0; s < samples; s++) {
      const state = determinize(view, knowledge, rng);
      legalActions.forEach((action, i) => {
        const next = advanceToDecision(applyAction(state, action));
        scores[i] = (scores[i] as number) + evaluate(next, me);
      });
    }
    const best = Math.max(...scores);
    const ties = legalActions.filter(
      (_, i) => (scores[i] as number) >= best - 1e-12,
    );
    return ties[Math.floor(rng() * ties.length)] as Action;
  },
};
