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
