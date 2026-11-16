import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { parseArgs } from "node:util";
import { summary, testDeckSetOf, uploadTestDecks } from "./testDeckUpload";

/*
 * #359: `pnpm test-decks check --file <path>` checks Paul's local test deck file and lists its
 * decks; `pnpm test-decks upload --file <path>` also sends it to the server, replacing the test
 * decks there (`testDeckUpload.ts`). The token comes from `TEST_DECKS_UPLOAD_TOKEN` and is never
 * printed.
 */

const { values, positionals } = parseArgs({
  allowPositionals: true,
  options: { file: { type: "string" } },
});

async function main() {
  const [kind] = positionals;
  if ((kind !== "check" && kind !== "upload") || !values.file)
    throw new Error("Usage: pnpm test-decks check|upload --file <path>");
  const file = resolve(process.env["INIT_CWD"] ?? ".", values.file);
  const set = testDeckSetOf(readFileSync(file, "utf8"));
  console.log(`${set.decks.length} test decks, valid:`);
  for (const line of summary(set)) console.log(`  ${line}`);
  if (kind !== "upload") return;
  const { ok, status, body } = await uploadTestDecks(set, process.env);
  console.log(`Upload: ${status} ${body}`);
  if (!ok) process.exitCode = 1;
}

await main();
