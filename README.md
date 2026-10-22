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

Other root scripts: `pnpm lint`, `pnpm typecheck`, `pnpm build`, `pnpm scrape` (refresh card data, see `tools/scraper`), `pnpm survey` (regenerate the ability survey in `docs/abilities/`).

## Debug viewer

`pnpm --filter @gojisim/web dev`, then open `http://localhost:5173/debug`. Pick a seed and a test deck for each player (`buildTestDeck`, ESD01 or ESD02), then play both sides. All hidden information is shown. Step back and forward through the actions, and export the game record as JSON to attach to a bug report (import loads it again). Card images appear once `pnpm images` has run.

## Deck lists

Decks use GojiSim's plain-text deck list format (the godzilla-sim export format):

```text
# comment
[deck] Folder/Deck Name
[monster deck]
1 ESD01-001
[main deck]
4 ESD01-005
```

`/debug` imports and exports these files in the browser. Keep personal deck files in `local-decks/` (gitignored); never commit them. The official starters are in `packages/cards/data/decks/`. Illegal decks are allowed everywhere, with a warning listing every failed rule (Paul's ruling, Oct 21, 2026).

## Card images

Card images are not committed. Run this once after cloning:

```sh
pnpm images
```

It downloads every card's original PNG from godzillatcgdb.com (1 request per second, so the first run takes about 16 minutes) into `tools/scraper/.cache/images/`, then converts each one to `apps/web/public/cards/<id>-full.webp` (original size) and `<id>-thumb.webp` (300 px wide). Reruns skip files that already exist; `pnpm images --force` re-converts. The byte sizes are recorded in `packages/cards/data/images.json`.

## Layout

| Path                   | Package                   | Purpose                                                            |
| ---------------------- | ------------------------- | ------------------------------------------------------------------ |
| `packages/cards`       | `@gojisim/cards`          | Card data                                                          |
| `packages/engine`      | `@gojisim/engine`         | Pure TypeScript rules engine                                       |
| `packages/bot`         | `@gojisim/bot`            | AI opponent                                                        |
| `apps/server`          | `@gojisim/server`         | Node game server                                                   |
| `apps/web`             | `@gojisim/web`            | Vite + React client                                                |
| `tools/scraper`        | `@gojisim/scraper`        | Card data and image scraper                                        |
| `tools/stress`         | `@gojisim/stress`         | Random-game stress test                                            |
| `tools/ability-survey` | `@gojisim/ability-survey` | Card ability text survey (`pnpm survey`, writes `docs/abilities/`) |
