import { difficultyBot, seededRng } from "@gojisim/bot";
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
  const { id, input, seed, difficulty, privateSet } = event.data;
  const started = performance.now();
  try {
    // The private set's cards (with its tokens) and abilities; known ones are skipped, so every
    // request may carry them.
    if (privateSet) registerPrivateSet(privateSet);
    const bot = difficultyBot("seat", difficulty);
    const action = bot.chooseAction({ ...input, rng: seededRng(seed) });
    worker.postMessage({ id, action, ms: performance.now() - started });
  } catch (err) {
    worker.postMessage({ id, error: String(err) });
  }
};
