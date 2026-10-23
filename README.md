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

Other root scripts: `pnpm lint`, `pnpm typecheck`, `pnpm build`, `pnpm scrape` (refresh card data, see `tools/scraper`), `pnpm survey` (regenerate the ability survey in `docs/abilities/`), `pnpm abilities:coverage` (every card's ability status: implemented, partial or manual; `--set`, `--status`, `--json`). `pnpm bench` (engine speed: clone, applyAction, getLegalActions, random games per second), `pnpm bots --a greedy --b random --games 400 --seed s --decks official` (bot tournament between `random`, `weighted`, `greedy`, `ismcts` and the difficulty presets `easy`, `medium`, `hard`; `--a-settings difficulty=70` or `samples=4` passes bot settings; `--workers 16` plays games in parallel; report in `bot-reports/`).

## Debug viewer

`pnpm --filter @gojisim/web dev`, then open `http://localhost:5173/`: a menu with Play vs bot, Hotseat and Debug. `/play` is the game board (M5, in progress), laid out like the official playmat: click a hand card to light its destinations and click one, or drag the card there (cards that can be played to a zone are lit; any card can still be selected to invade or gain rage); hover any card for the preview panel; Esc cancels. The top bar's prompt shows the step, the turn flags, Pass [Space] (it asks first while a lit card is left; a second Space passes, Esc cancels) and Concede; every choice opens a modal (number keys 1 to 9, hold the eye button to see the board; target cards show where they are, and hovering one rings that place on the mat; a single legal target is still asked, so you see what your effect hits), zone choices light the zones, and hotseat covers the board between players. The battle log in the right column groups plain-language lines by turn (card names open the preview, which covers the log while open; clicking a line shows that moment read-only until "Back to live"), the top bar's phase tracker lights the step in progress, and its Settings menu holds the bot delay, rule numbers, confirm before Pass, the hotseat cover and the expanded hand. Every change in force on a card (Burst, counter power, rank and threat modifiers, cannot engage, played via Evolution or an effect) is a chip on the card; hover the chips for the full list. Shortcuts: Space Pass, 1 to 9 choices, H expanded hand, Esc cancel / close, L log, ? the list. "Load a game record" on the new-game screen continues an exported game (the M5c choice fixtures in `apps/web/e2e/fixtures` are such records; `pnpm --filter @gojisim/web e2e:fixtures` regenerates them). `/debug` (`http://localhost:5173/debug`) is the debug viewer. Pick a seed and a test deck for each player (`buildTestDeck`, ESD01 or ESD02), then play both sides. All hidden information is shown. Step back and forward through the actions, and export the game record as JSON to attach to a bug report (import loads it again). Card images appear once `pnpm images` has run. Either seat can be a bot (Seat: Bot, difficulty 0 to 100 with Easy / Medium / Hard presets). The bot thinks in a Web Worker and sees only its own view. Against a human it plays at once and hides its hidden cards (toggle); two bots wait for Play, with Pause, Step, a delay slider and a spectator view.

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
| `tools/bots`           | `@gojisim/bots`           | Bot tournament harness (`pnpm bots`)                               |
