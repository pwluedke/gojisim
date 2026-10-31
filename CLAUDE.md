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
- While working, run only the affected tests: `pnpm vitest related <changed files> --run` for unit tests, and the e2e specs for the screens touched (`pnpm --filter @gojisim/web exec playwright test e2e/<spec>`). Run the full suite (`pnpm lint`, `pnpm typecheck`, `pnpm test`, `pnpm e2e`) once before each push.

## Communication

- Slack: post status and questions in #gojisim-dev. Start every Slack message with "[Mecha]".

## Git

- Never push to main without Paul's approval. Work on a branch, open a PR. PR descriptions follow `.github/pull_request_template.md` (What changed, Release notes, Decisions, Tests, the Done checklist, `Closes #N`); issues use the forms in `.github/ISSUE_TEMPLATE/`.

## Release notes

- Every PR description has a "## Release notes" section in plain words for Paul and the testers ("Nothing to try in the game." when testers see no change). Paul's push to `release` publishes them as a GitHub Release (`.github/workflows/release.yml`). PRs don't edit `docs/release-notes.md`, the archive up to #120.

## Deploys

- Only Paul deploys. Mecha never pushes to the `release` branch and never runs Railway deploy commands (`railway up`, `railway redeploy` and the like). Railway deploys from `release`, which Paul updates with `git push origin main:release` (docs/deploy.md).

## Decisions

Accepted decisions are in `docs/decisions/`, numbered in the order they were made. Before changing an area, read its file:

- `packages/engine`, ability data and rulings: `docs/decisions/engine.md`
- `packages/cards`, card data, deck lists, imports and legality: `docs/decisions/cards-and-decks.md`
- `packages/bot` and `tools/bots`: `docs/decisions/bot.md`
- `apps/web` (`/play`, `/debug`, themes, sounds): `docs/decisions/web.md`
- `apps/server`, deploys, Test Site uploads and feedback tools: `docs/decisions/server-and-feedback.md`
- Workspace setup, tooling and CI: `docs/decisions/repo-and-ci.md`

New decisions: a PR lists them under "## Decisions"; once Monarch accepts them, they go at the end of the area's file, continuing the numbering (docs/decisions/README.md).
