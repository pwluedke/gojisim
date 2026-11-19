import {
  decide,
  difficultyBot,
  difficultySettings,
  plannedLine,
  seededRng,
  traceSink,
} from "@gojisim/bot";
import { actionLabel } from "./labels";
import type { BotRequest, BotResponse } from "./bots";
import { registerPrivateSet } from "./privateSetData";

/**
 * The bot's Web Worker (M6d): it thinks off the UI thread. It receives only the bot's input (its
 * view, legal actions, both decklists and the public log, plus settings and a seed), never the
 * real state, so the no-peeking rule holds in the browser too.
 */
const worker = self as unknown as {
  onmessage: ((event: MessageEvent<BotRequest>) => void) | null;
  postMessage(message: BotResponse): void;
};

worker.onmessage = (event) => {
  const { id, input, seed, difficulty, privateSet, trace } = event.data;
  const started = performance.now();
  try {
    // The private set's cards (with its tokens) and abilities; known ones are skipped, so every
    // request may carry them.
    if (privateSet) registerPrivateSet(privateSet);
    if (trace) {
      // #478: the same search as `difficultyBot` (its settings, then the request's), traced.
      const traced = {
        ...input,
        settings: {
          ...difficultySettings(
            Number(input.settings["difficulty"] ?? difficulty),
          ),
          ...input.settings,
        },
        rng: seededRng(seed),
        trace: traceSink(),
      };
      const decision = decide(traced);
      // The turn's plan: the search's most-visited line, labeled where each move is made.
      const plan = plannedLine(traced, decision).map(({ action, state }) =>
        actionLabel(state, action),
      );
      worker.postMessage({
        id,
        action: decision.action,
        ms: performance.now() - started,
        ...(decision.trace ? { trace: decision.trace } : {}),
        plan,
      });
      return;
    }
    const bot = difficultyBot("seat", difficulty);
    const action = bot.chooseAction({ ...input, rng: seededRng(seed) });
    worker.postMessage({ id, action, ms: performance.now() - started });
  } catch (err) {
    worker.postMessage({ id, error: String(err) });
  }
};
