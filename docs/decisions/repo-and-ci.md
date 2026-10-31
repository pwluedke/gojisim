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

Accepted by Monarch in the Slack watcher review (PR #101).

602. The watcher reads `.envrc` itself when the variable isn't set, since a background shell may not run direnv.
603. A thread whose replies call failed has its `latest_reply` left unrecorded, so the next poll reads it again.
604. Lines print oldest first, Monarch's `[Monarch]` prefix dropped, whitespace collapsed.

Accepted by Monarch in the Dependabot review (PR #102).

605. TypeScript ignores minor updates as well as majors. Decision 1's reason is that typescript-eslint 8.x supports only TS < 6.1, so a bump to 6.1 would break lint just as a major would. Patches (6.0.x) still come.
606. `pnpm` is ignored, so it stays pinned through `packageManager` (decision 2).
607. Playwright (`@playwright/test`, `playwright`, `playwright-core`) gets its own minor/patch group. The e2e image tag must match the lockfile's Playwright version (decision 463, checked by `playwrightImage.test.ts`), so a Playwright bump fails CI until the tag in `ci.yml` is changed by hand. Its own PR means that doesn't hold up every other minor update.
608. The `github-actions` entry lists `/` (the workflows) and `/.github/actions/*`, since Dependabot reads only `.github/workflows` from `/` and would miss the composite setup action's `actions/cache` and `actions/setup-node`.

Accepted by Monarch in the Discord notes review (PR #115).

625. A channel exported in both formats is read from JSON only. The text format has the exporter's local time with no time zone and no ids, so its messages can't be matched to JSON's (the Oct 29 sample is the same channel in both). The summary names the skipped text pages.
626. Duplicates across overlapping exports are kept once: JSON by message id, text by the hash of channel, author, minute and text.
627. Context is the 20 messages before a channel's first new message. Seen messages between new ones are shown too, marked `(seen)`.
628. Zips are read in place (no unzip step for Paul). Zip64 and encrypted zips are refused with a plain message.

Accepted by Monarch in the GitHub Releases review (PR #122).

640. Release notes are GitHub Releases made from PR descriptions at each push to `release`. This retires decision 540's dating and "not merged yet" fix-ups; PRs don't edit `docs/release-notes.md`.
641. The tag is `release-<YYYY-MM-DD in America/Chicago>-<n>`, and the title is "Release <date>" (plus " (n)" after the first that day).
642. Before the first tag, the range starts after the archive's newest PR.
643. PRs without a "## Release notes" section are listed by title, not left out.
644. The `no-release-notes` label made for #121 was deleted (Monarch).

Accepted by Monarch in the templates review (PR #124).

645. The Done checklist is five lines; the sections are headings only, with one comment under Release notes.
646. Three issue forms; blank issues stay allowed.
647. The release workflow ignores HTML comments in a "Release notes" section.

Accepted by Monarch in the decision log review (PR #125).

648. Decisions live in `docs/decisions/` by area, whole review by whole review, numbers unchanged. A review that spans areas goes in its main area's file; the README index lists each review's file.
649. CLAUDE.md keeps one pointer line per area, so a session reads an area's decisions before working in it.
650. New accepted decisions go at the end of the area's file, continuing the global numbering.
