# CLAUDE.md

## Roles

- Agent name: Mecha. Project manager: Monarch. Owner: Paul.

## Stack

- pnpm workspaces monorepo, TypeScript strict, Vitest, Playwright, ESLint.

## Planned packages

- packages/cards
- packages/engine
- packages/bot
- apps/web
- apps/server

## Engine

- Engine is pure TypeScript with seeded RNG and an action log. No UI code in packages/engine.

## Testing

- Every rules behavior gets a test that cites its Comprehensive Rules v1.2 rule number.

## Communication

- Slack: post status and questions in #gojisim-dev. Start every Slack message with "[Mecha]".

## Git

- Never push to main without Paul's approval. Work on a branch, open a PR.

## Decisions

Accepted by Monarch in the M0 review (PR #1).

1. TypeScript is pinned to `~6.0.3`. TS 7 exists, but typescript-eslint 8.x supports only TS `<6.1`. Revisit when typescript-eslint supports TS 7.
2. pnpm is pinned to 12.14.0 through `packageManager` (corepack).
3. Library packages export `src/index.ts` directly and use composite project references (`tsc -b`). Vite and Vitest consume source; tsc maps cross-package imports to built `.d.ts`. Library `typecheck` writes to gitignored `dist/` because composite projects can't use `--noEmit`. Each library has a `tsconfig.test.json` so test files are typechecked.
4. `apps/server` uses `module`/`moduleResolution: NodeNext` instead of the base `bundler`, because it runs directly on Node.
5. Playwright runs the Vite dev server on port 5179 with `reuseExistingServer` off, so e2e never tests another local app on Vite's default 5173.
6. The web unit test renders with `react-dom/server`, so there is no jsdom dependency.
7. `pnpm lint` runs ESLint and `prettier --check`.
8. CI uses `actions/checkout@v7` and `actions/setup-node@v7`, and uploads the Playwright report when a run fails.

Accepted by Monarch in the M1a review (PR #2).

9. Card data is scraped from godzillatcgdb.com: the `/search` POST (empty filters) lists base cards, and each card page's embedded `allPrints` JSON supplies every print. The HTML table supplies the movie title and unknown-label detection.
10. `cardNumber` mirrors the site's display logic (PR reprints show as e.g. `EBP01-030++`; `-foil`/`-ALT` become ` (Foil)`/` (Alt)`). It is not unique; `id` is the unique key.
11. `set` is the site's `set_number`, not the card-number prefix, so PR reprints stay in PR.
12. `isParallel` means the card number ends in `+` (before any Foil/Alt suffix). Print families are linked by `parentId`.
13. `colors` are title-cased (`Red`, `Blue`, `Green`, `White`), dual colors are split, and `blank` becomes `[]`.
14. `rarity` is the site value, including its hardcoded display overrides (id 834 -> `ACSP`, id 860 -> `SSPT`) and lowercase `rage`.
15. `movie` is `null` for blank-property cards (all Rage cards plus a few others).
16. Card `text` and `notes` are normalized from CRLF to LF; empty notes become `null`.
17. `pnpm-workspace.yaml` allows esbuild's build script (`allowBuilds`), needed by `tsx` under pnpm 12. `packages/cards/data/` and the scraper's HTML fixtures are in `.prettierignore`.
