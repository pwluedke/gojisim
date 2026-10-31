# Decisions: Repo and CI

Accepted decisions about the workspace setup, tooling and CI, numbered as they were in CLAUDE.md. New ones go at the end of the file that fits (docs/decisions/README.md).

Accepted by Monarch in the M0 review (PR #1).

1. TypeScript is pinned to `~6.0.3`. TS 7 exists, but typescript-eslint 8.x supports only TS `<6.1`. Revisit when typescript-eslint supports TS 7.
2. pnpm is pinned to 12.14.0 through `packageManager` (corepack).
3. Library packages export `src/index.ts` directly and use composite project references (`tsc -b`). Vite and Vitest consume source; tsc maps cross-package imports to built `.d.ts`. Library `typecheck` writes to gitignored `dist/` because composite projects can't use `--noEmit`. Each library has a `tsconfig.test.json` so test files are typechecked.
4. `apps/server` uses `module`/`moduleResolution: NodeNext` instead of the base `bundler`, because it runs directly on Node.
5. Playwright runs the Vite dev server on port 5179 with `reuseExistingServer` off, so e2e never tests another local app on Vite's default 5173.
6. The web unit test renders with `react-dom/server`, so there is no jsdom dependency.
7. `pnpm lint` runs ESLint and `prettier --check`.
8. CI uses `actions/checkout@v7` and `actions/setup-node@v7`, and uploads the Playwright report when a run fails.

Accepted by Monarch in the CI speed review (PR #52).

439. CI runs as parallel jobs: lint + typecheck, unit tests, build + speed guard, stress, and E2E in 3 shards. A final job named `ci` needs them all and is the one check for branch protection.
440. Each job uses the composite action `.github/actions/setup`: Node from `.nvmrc`, pnpm through corepack, the pnpm store cached with `actions/cache` on the lockfile.
441. Each E2E shard uploads a blob report; the `E2E report` job merges them into one HTML report only when a shard fails.
442. The Playwright browser is cached per Playwright version; on a hit only `install-deps` runs.
443. Stress plays 200 games on a pull request and 1,000 on a push to main, seeded by the commit; the nightly run is unchanged.
444. A newer push to a pull request cancels its older CI run.

Accepted by Monarch in the CI fixes review (PR #55).

462. The e2e shards run in Microsoft's Playwright image (`mcr.microsoft.com/playwright:v<version>-noble`, `--user 1001`), so nothing installs from Ubuntu's apt mirror; the browser cache and install steps (decision 442) are gone. It costs about 25 s on a good run and removes the 6 to 10 minute tail.
463. The image tag must match the lockfile's Playwright version; `apps/web/src/playwrightImage.test.ts` checks it, so it also runs locally with `pnpm test`.
464. The nightly stress test runs two jobs side by side: uniform 10,000 games (60 min timeout) and weighted 4,500 games (90 min timeout). The weighted count is sized from the runner's rate (about 78 games a minute) to finish in about 60 min; past 75 min, it is lowered.
465. Decision 123's single 120-minute nightly timeout is replaced by each job's own timeout.
