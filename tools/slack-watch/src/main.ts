import { readFileSync } from "node:fs";
import { newState, poll, slackApi, tokenFrom } from "./watch";

/**
 * `pnpm slack-watch` (#85): polls #gojisim-dev every 30 s and prints a line for each unchecked
 * Monarch message, once per run. Run it as a monitored background command; a line means "check
 * slack". The token comes from `SLACK_WATCH_TOKEN` or the repo's `.envrc` (README).
 */
// pnpm runs this inside tools/slack-watch; .envrc is at the repo root.
const root = new URL("../../../", import.meta.url);
let envrc: string | null = null;
try {
  envrc = readFileSync(new URL(".envrc", root), "utf8");
} catch {
  // No .envrc: the environment must have the token.
}
const token = tokenFrom(process.env, envrc);
if (!token) {
  console.error(
    "[slack] no SLACK_WATCH_TOKEN in the environment or .envrc (README: Slack watcher)",
  );
  process.exit(1);
}
const api = slackApi(token);
const state = newState();
console.log("[slack] watching #gojisim-dev every 30 s");
for (;;) {
  const { lines, waitMs } = await poll(api, state);
  for (const line of lines) console.log(line);
  await new Promise((resolve) => setTimeout(resolve, waitMs));
}
