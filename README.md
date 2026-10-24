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

Other root scripts: `pnpm lint`, `pnpm typecheck`, `pnpm build`, `pnpm scrape` (refresh card data, see `tools/scraper`), `pnpm survey` (regenerate the ability survey in `docs/abilities/`), `pnpm abilities:coverage` (every card's ability status: implemented, partial or manual; `--set`, `--status`, `--json`). `pnpm bench` (engine speed: clone, applyAction, getLegalActions, random games per second; `--check` is the CI speed guard, which fails if `applyAction` or `getLegalActions` is more than 50 % over `bench/baseline.json` (fixed EBP01/EBP02 games, median of 9 rounds, in units of a fixed JavaScript workload), and `--update-baseline` rewrites the baseline in a PR that accepts a slowdown on purpose; the baseline is measured on the CI runner, so copy the `measured` numbers from that PR's Speed guard log into `bench/baseline.json`), `pnpm bots --a greedy --b random --games 400 --seed s --decks official` (bot tournament between `random`, `weighted`, `greedy`, `ismcts` and the difficulty presets `easy`, `medium`, `hard`; `--a-settings difficulty=70` or `samples=4` passes bot settings; `--workers 16` plays games in parallel; report in `bot-reports/`).

## Debug viewer

`pnpm --filter @gojisim/web dev`, then open `http://localhost:5173/`: a menu with Play vs bot, Hotseat and Debug. `/play` is the game board (M5, in progress), laid out like the official playmat: click a hand card to light its destinations and click one, or drag the card there (cards that can be played to a zone are lit; any card can still be selected to invade or gain rage); hover any card for the preview panel; Esc cancels. The left column's prompt shows the step, the turn flags, Pass [Space] (it asks first while a lit card is left; a second Space passes, Esc cancels) and Concede; every choice opens a modal (number keys 1 to 9, hold the eye button to see the board; target cards show where they are, and hovering one rings that place on the mat; a single legal target is still asked, so you see what your effect hits; the same goes for a single next monster or a single zone), zone choices light the zones, and hotseat covers the board between players. A new game starts with the First / Second pick (two face-down cards; the human picks against a bot, P2 in hotseat). Casual games have Undo [U], back to the last draw, search, reveal, shuffle, random result or opponent action; Tournament games have none. Tournament games take legal decks only: on the new-game screen an illegal deck is greyed out as "(illegal)", the seat lists why (deck size, copies, Token cards, colors, the restriction list), and Start waits for a legal pick. Casual games play an illegal deck with an "Illegal deck" badge on that player's mat for the whole game (hover for the reasons). The game record stores each deck's legality at game start. Every deck search you make ends in a search modal showing what was searched for and what was found (or "0 found"). Strategy cards are turned 90° in the hand and on the discard pile so the whole card shows. Strategy zones are landscape slots, so a strategy card there shows whole, and every zone keeps clear of the mat's edge. Hand cards fill the hand row's height. The battle log column collapses to a thin strip (its button or L; remembered), and the board takes the width. When a combo from `docs/combos/combos.md` succeeds (for either player), a combo modal opens once the cards land (with a brief shake): its name, who made it, its cards (hover for the preview), steps and result, as in combos.md; Close or Space closes it, and the bot waits meanwhile. The log gets a line, e.g. `Combo: Ginza Inferno (You)`; Settings → Combo callouts turns the modal off, never the line. Settings → Theme switches Dark / Grey / Light (default Grey) for every page, `/debug` included; all colors are `theme.css` variables, one set per theme on `:root[data-theme=…]`, applied before the first paint. The combos are data in `packages/cards/data/combos/` (one file per deck, checked against combos.md by a test), detected by `@gojisim/engine`'s combo module, and counted per bot in `pnpm bots` reports. Every card move animates (drags settle into the slot, bot moves, draws, discards, searches, monster changes, evolution); a destroyed card breaks into angular shards like glass (the same way on every replay) that hang for a moment, then reassemble as they fly to where the card goes, and several destroys play together. Input and the bot wait for the animation. Settings adds Animation speed (Off / Normal / Fast), Turn glow (the turn player's mat border glows in their invading monster's colors) and Mat image (upload a PNG, JPG or WebP up to 8 MB, with scale and position and Reset; stored in the browser). The battle log in the right column groups plain-language lines by turn (card names open the preview, which covers the log while open; clicking a line shows that moment read-only until "Back to live"), the left column's phase tracker lights the step in progress, and its Settings panel holds the bot delay, rule numbers, confirm before Pass, the hotseat cover and the expanded hand. Every change in force on a card (Burst, counter power, rank and threat modifiers, cannot engage, played via Evolution or an effect) is a chip on the card; hover the chips for the full list. Shortcuts: Space Pass, 1 to 9 choices, H expanded hand, Esc cancel / close, L log, U undo (Casual), ? the list. Bring your own deck with Import deck on the new-game screen (see [Importing decks](#importing-decks)). "Load a game record" on the new-game screen continues an exported game (the M5c choice fixtures in `apps/web/e2e/fixtures` are such records; `pnpm --filter @gojisim/web e2e:fixtures` regenerates them). `/debug` (`http://localhost:5173/debug`) is the debug viewer. Pick a seed and a test deck for each player (`buildTestDeck`, ESD01 or ESD02), then play both sides. All hidden information is shown. Step back and forward through the actions, and export the game record as JSON to attach to a bug report (import loads it again). Card images appear once `pnpm images` has run. Either seat can be a bot (Seat: Bot, difficulty 0 to 100 with Easy / Medium / Hard presets). The bot thinks in a Web Worker and sees only its own view. Against a human it plays at once and hides its hidden cards (toggle); two bots wait for Play, with Pause, Step, a delay slider and a spectator view.

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

## Importing decks

On the `/play` new-game screen, **Import deck** takes a pasted deck list in any of these forms (the format is detected):

| Source                           | How to copy it                                                                                                                                                   |
| -------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| godzillatcgdb.com deck page      | Open the deck (`/d/<id>`), press Cmd+A (Ctrl+A), then Cmd+C (Ctrl+C), and paste. The counts come from the card badges.                                           |
| godzillatcgdb.com printable list | On the deck page click Print deck list, select all, copy and paste.                                                                                              |
| godzilla-sim                     | In the Deck Builder, Export to Clipboard (one deck) or Export All Decks. Both are GojiSim deck list text; a single-deck export has no name line, so you name it. |
| GojiSim                          | Copy on a saved deck, or a deck list file (the format above).                                                                                                    |

Unknown card numbers and unreadable lines block saving; legality problems (deck size, copies, the restriction list) are warnings, and the deck still plays in Casual games (Tournament games take legal decks only). Saved decks are **My decks**, kept in this browser's IndexedDB (only for the current visit when storage is blocked), with Rename, Copy (plain text), Delete, and Export all / Import backup as one JSON file. The gitignored `local-decks` import in `/debug` stays for development.

Not supported:

- **Bushiroad Decklog:** not supported, no text export or browser access (its API sends no CORS header, and its export buttons copy only the deck code or URL, or save an image).
- **Deck links (URLs):** the browser can't fetch a godzillatcgdb deck page (no CORS header), so import is paste only. Link import moves to M9: `apps/server` will fetch `/d/<id>` and parse its HTML.

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
