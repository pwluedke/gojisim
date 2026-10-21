# GojiSim

GojiSim: web-based Godzilla Card Game simulator. TypeScript engine, React/Vite web app, Node/Socket.io server.

## Setup

Requires [nvm](https://github.com/nvm-sh/nvm) (or any Node version manager that reads `.nvmrc`).

```sh
nvm use          # Node 22 LTS, from .nvmrc
corepack enable  # provides the pnpm version pinned in package.json
pnpm install
pnpm test        # Vitest across all packages
pnpm e2e         # Playwright (first run: pnpm --filter @gojisim/web exec playwright install chromium)
```

Other root scripts: `pnpm lint`, `pnpm typecheck`, `pnpm build`, `pnpm scrape` (refresh card data, see `tools/scraper`).

## Layout

| Path              | Package           | Purpose                      |
| ----------------- | ----------------- | ---------------------------- |
| `packages/cards`  | `@gojisim/cards`  | Card data                    |
| `packages/engine` | `@gojisim/engine` | Pure TypeScript rules engine |
| `packages/bot`    | `@gojisim/bot`    | AI opponent                  |
| `apps/server`     | `@gojisim/server` | Node game server             |
| `apps/web`        | `@gojisim/web`    | Vite + React client          |
