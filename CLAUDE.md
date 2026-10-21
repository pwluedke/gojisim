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
