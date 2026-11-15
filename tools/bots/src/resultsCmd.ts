import { existsSync, readdirSync, readFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { parseArgs } from "node:util";
import { counterPlays, counters } from "@gojisim/bot";
import { type Read, validateResults } from "@gojisim/cards/results";
import * as engine from "@gojisim/engine";
import {
  checkDecks,
  checkEntry,
  mistakesByDeck,
  type PlanReport,
  runCells,
  runEntry,
} from "./results";

/*
 * #340: `pnpm results check --a <plan> --b <plan> --id <id> --change "<words>" ...` or
 * `pnpm results run --plan <plan> --id <id> --name "<name>" --plans "<versions>"` builds a results
 * entry from finished plan reports and prints it (`pnpm results reads --file <reads.json>` checks
 * a list of players' reads); with `--upload` it sends it to the server
 * (`RESULTS_URL`, default the site) with the token in `RESULTS_UPLOAD_TOKEN`. Deck labels come
 * from `--label <matchup prefix>=<name>` (repeatable), or `--deck <name>` for every A side (plans
 * whose matchup ids name only the opponent); a deck without one keeps its prefix.
 */

const { values, positionals } = parseArgs({
  allowPositionals: true,
  options: {
    a: { type: "string" },
    b: { type: "string" },
    plan: { type: "string" },
    id: { type: "string" },
    change: { type: "string" },
    name: { type: "string" },
    plans: { type: "string" },
    pr: { type: "string" },
    /** The bot switch the check turned off for A (packages/bot/SWITCHES.md). */
    switch: { type: "string" },
    commit: { type: "string" },
    date: { type: "string" },
    level: { type: "string", default: "Hard" },
    seeds: { type: "string", default: "paired, same seeds in both arms" },
    first: { type: "string" },
    label: { type: "string", multiple: true, default: [] },
    /** One deck name for every matchup's A side, for plans whose ids name only the opponent. */
    deck: { type: "string" },
    /** Count missed reachable counters from the kept records, with the issues that reported it. */
    missed: { type: "boolean", default: false },
    issues: { type: "string", multiple: true, default: [] },
    upload: { type: "boolean", default: false },
    file: { type: "string" },
  },
});

const out = process.env["INIT_CWD"] ?? ".";
const plansDir = resolve(out, "bot-reports", "plans");
const labels = new Map(
  (values.label ?? []).map((l) => {
    const [k, ...v] = l.split("=");
    return [k ?? "", v.join("=")] as const;
  }),
);
const label = (deck: string) => values.deck ?? labels.get(deck) ?? deck;
const today = new Date().toISOString().slice(0, 10);

/** A plan's finished reports, by matchup id. */
function reports(plan: string): Record<string, PlanReport> {
  const dir = join(plansDir, plan);
  if (!existsSync(dir)) throw new Error(`No plan reports at ${dir}`);
  return Object.fromEntries(
    readdirSync(dir)
      .filter((f) => f.endsWith(".json"))
      .map((f) => [
        f.slice(0, -5),
        JSON.parse(readFileSync(join(dir, f), "utf8")) as PlanReport,
      ]),
  );
}

/**
 * Missed reachable counters, per matchup: of the A deck's turns with the counter not made but
 * reachable at its first main-phase decision (card rule 20's look: any zone), how many failed
 * their counter check (7.4.3). From the kept records, games 0 to `first` - 1.
 */
function missedCounts(
  plan: string,
  id: string,
  first?: number,
): { count: number; of: number } {
  const dir = join(plansDir, plan, "records", id);
  if (!existsSync(dir)) return { count: 0, of: 0 };
  let available = 0;
  let missed = 0;
  for (const file of readdirSync(dir)) {
    const n = Number(/^game-(\d+)\.json$/.exec(file)?.[1] ?? NaN);
    if (Number.isNaN(n) || (first !== undefined && n >= first)) continue;
    const r = JSON.parse(
      readFileSync(join(dir, file), "utf8"),
    ) as engine.GameRecord & { aSeat: engine.PlayerId };
    const states = engine.replayAll(r);
    const end = states.at(-1);
    const seen = new Set<number>();
    for (const s of states) {
      if (s.turnPlayer !== r.aSeat || s.pendingChoice || s.result) continue;
      if (s.step !== "7.3.2" || seen.has(s.turn)) continue;
      seen.add(s.turn);
      if (counters(s, r.aSeat)) continue;
      const legal = engine.getLegalActions(s, r.aSeat);
      if (counterPlays(s, legal, r.aSeat, true).size === 0) continue;
      available += 1;
      const check = end?.log.find(
        (e) =>
          e.seq > s.log.length &&
          e.type === "counterCheck" &&
          e.player === r.aSeat,
      );
      if (check?.payload["countered"] === false) missed += 1;
    }
  }
  return { count: missed, of: available };
}

/** Sends one entry to the server; false when it was refused. */
async function upload(entry: unknown): Promise<boolean> {
  const token = process.env["RESULTS_UPLOAD_TOKEN"];
  if (!token) throw new Error("RESULTS_UPLOAD_TOKEN isn't set");
  const url = `${process.env["RESULTS_URL"] ?? "https://gojisim.somanygames.app"}/api/results/upload`;
  const res = await fetch(url, {
    method: "POST",
    headers: {
      authorization: `Bearer ${token}`,
      "content-type": "application/json",
    },
    body: JSON.stringify(entry),
  });
  console.log(`Upload: ${res.status} ${await res.text()}`);
  return res.ok;
}

async function main() {
  const [kind] = positionals;
  if (kind === "reads") {
    // #340 part b: the players' reads, a JSON list of `Read`s (Monarch's, from the play guides
    // and tester reports), checked here and sent one by one.
    if (!values.file) throw new Error("reads needs --file <reads.json>");
    const reads = JSON.parse(
      readFileSync(resolve(out, values.file), "utf8"),
    ) as Read[];
    const problems = validateResults({ checks: [], runs: [], reads });
    if (problems.length > 0) throw new Error(problems.join("\n"));
    console.log(`${reads.length} reads, valid`);
    if (!values.upload) return;
    for (const read of reads)
      if (!(await upload({ read }))) process.exitCode = 1;
    return;
  }
  const first = values.first === undefined ? undefined : Number(values.first);
  let entry: ReturnType<typeof checkEntry> | ReturnType<typeof runEntry>;
  if (kind === "check") {
    if (!values.a || !values.b || !values.id || !values.change)
      throw new Error("check needs --a, --b, --id and --change");
    const a = reports(values.a);
    const b = reports(values.b);
    const mistakes = values.missed
      ? mistakesByDeck(
          Object.fromEntries(
            Object.keys(a)
              .filter((id) => b[id])
              .map((id) => [
                id,
                {
                  a: missedCounts(values.a as string, id, first),
                  b: missedCounts(values.b as string, id, first),
                },
              ]),
          ),
          label,
          {
            name: "missed a reachable counter",
            issues: values.issues ?? [],
            per: "chances",
          },
        )
      : [];
    entry = checkEntry(
      {
        id: values.id,
        date: values.date ?? today,
        change: values.change,
        ...(values.pr ? { pr: values.pr } : {}),
        ...(values.switch ? { switch: values.switch } : {}),
        ...(values.commit ? { commit: values.commit } : {}),
        level: values.level === "Medium" ? "Medium" : "Hard",
        seeds: values.seeds ?? "paired, same seeds in both arms",
      },
      checkDecks(a, b, label, first === undefined ? {} : { first }),
      mistakes,
    );
  } else if (kind === "run") {
    if (!values.plan || !values.id || !values.name || !values.plans)
      throw new Error("run needs --plan, --id, --name and --plans");
    entry = runEntry(
      {
        id: values.id,
        date: values.date ?? today,
        name: values.name,
        plans: values.plans,
        ...(values.commit ? { commit: values.commit } : {}),
      },
      runCells(reports(values.plan), label),
    );
  } else throw new Error("Usage: pnpm results check|run|reads ... [--upload]");
  // The server checks it again; this catches a mistake before it leaves the Mac.
  const problems = validateResults(
    "check" in entry
      ? { checks: [entry.check], runs: [] }
      : { checks: [], runs: [entry.run] },
  );
  if (problems.length > 0) throw new Error(problems.join("\n"));
  console.log(JSON.stringify(entry, null, 2));
  if (values.upload && !(await upload(entry))) process.exitCode = 1;
}

await main();
