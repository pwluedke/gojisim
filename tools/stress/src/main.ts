import { mkdir, writeFile } from "node:fs/promises";
import { parseArgs } from "node:util";
import { type GameOutcome, playGame, type Policy, TURN_CAP } from "./stress";

const { values } = parseArgs({
  options: {
    games: { type: "string", default: "100" },
    seed: { type: "string", default: "1" },
    "turn-cap": { type: "string", default: String(TURN_CAP) },
    policy: { type: "string", default: "uniform" },
    // Print a progress line every N games.
    progress: { type: "string", default: "10" },
    // pnpm runs this script inside tools/stress; INIT_CWD is where `pnpm stress` was typed.
    out: { type: "string", default: process.env["INIT_CWD"] ?? "." },
  },
});
const games = Number(values.games);
const policy = values.policy as Policy;
if (policy !== "uniform" && policy !== "weighted") {
  throw new Error(`--policy must be uniform or weighted, got ${values.policy}`);
}
const progress = Number(values.progress);
if (!Number.isInteger(progress) || progress < 1)
  throw new Error(
    `--progress must be a positive integer, got ${values.progress}`,
  );
const runSeed = values.seed;
if (!Number.isInteger(games) || games < 1)
  throw new Error(`--games must be a positive integer, got ${values.games}`);

const reasons: Record<string, number> = {};
const turns: number[] = [];
const failures: GameOutcome[] = [];
const loops: GameOutcome[] = [];
const started = performance.now();

for (let game = 0; game < games; game++) {
  const outcome = playGame(runSeed, game, Number(values["turn-cap"]), policy);
  turns.push(outcome.turns);
  if (outcome.failure) {
    failures.push(outcome);
    const dir = `${values.out}/stress-failures`;
    await mkdir(dir, { recursive: true });
    // A game record plus the failure: it loads in /debug, positioned at the failing action.
    const file = `${dir}/${runSeed}-${game}.json`;
    await writeFile(
      file,
      `${JSON.stringify({ ...outcome.record, position: outcome.actions, failure: outcome.failure }, null, 2)}\n`,
    );
    console.error(
      `FAIL game ${game} (seed ${outcome.seed}): ${outcome.failure.reason}\n  ${outcome.failure.problems.join("\n  ")}\n  -> ${file}`,
    );
  } else {
    const key = outcome.result?.reason ?? "none";
    reasons[key] = (reasons[key] ?? 0) + 1;
  }
  if (outcome.loopReport) {
    loops.push(outcome);
    const dir = `${values.out}/loop-reports`;
    await mkdir(dir, { recursive: true });
    const stamp = new Date().toISOString().replace(/[:.]/g, "-");
    await writeFile(
      `${dir}/${stamp}-${outcome.seed}.json`,
      `${JSON.stringify(outcome.loopReport, null, 2)}\n`,
    );
  }
  if ((game + 1) % progress === 0 || game + 1 === games)
    console.log(
      `  ${game + 1} / ${games} games: invasion ${reasons["invasion"] ?? 0}, countering ${reasons["victoryThroughCountering"] ?? 0}, draw ${reasons["draw"] ?? 0}, failures ${failures.length}`,
    );
}

const seconds = (performance.now() - started) / 1000;
const summary = {
  games,
  seed: runSeed,
  policy,
  winReasons: {
    invasion: reasons["invasion"] ?? 0,
    countering: reasons["victoryThroughCountering"] ?? 0,
    draw: reasons["draw"] ?? 0,
    ...Object.fromEntries(
      Object.entries(reasons).filter(
        ([k]) => !["invasion", "victoryThroughCountering", "draw"].includes(k),
      ),
    ),
  },
  loopDraws: loops.length,
  failures: failures.length,
  averageTurns: Number((turns.reduce((a, b) => a + b, 0) / games).toFixed(2)),
  maxTurns: Math.max(...turns),
  seconds: Number(seconds.toFixed(1)),
  gamesPerSecond: Number((games / seconds).toFixed(1)),
};
console.log(JSON.stringify(summary, null, 2));
if (failures.length > 0) {
  console.error(
    `${failures.length} failed game(s); records in ${values.out}/stress-failures/`,
  );
  process.exitCode = 1;
}
