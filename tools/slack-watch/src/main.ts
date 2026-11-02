import { readFileSync } from "node:fs";
import { newState, POLL_MS, poll, slackApi, tokenFrom } from "./watch";

/**
 * `pnpm slack-watch` (#85): polls #gojisim-dev every 30 s and prints a line for each unchecked
 * Monarch message, again every 15 minutes while it stays unchecked (#148). Mecha starts it at the
 * start of every session as a monitored background command (CLAUDE.md); a line means "check
 * slack". An error never stops it. The token comes from `SLACK_WATCH_TOKEN` or the repo's `.envrc` (README).
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
  // #148: nothing stops the loop; an unexpected error is one line and the next poll tries again.
  let waitMs = POLL_MS;
  try {
    const result = await poll(api, state);
    for (const line of result.lines) console.log(line);
    waitMs = result.waitMs;
  } catch (err) {
    console.log(
      `[slack] error poll: ${err instanceof Error ? err.message : String(err)}`,
    );
  }
  await new Promise((resolve) => setTimeout(resolve, waitMs));
}
