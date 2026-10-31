# Decisions: Cards and decks

Accepted decisions about `packages/cards` (card data, errata, restrictions, images), deck lists, imports and deck legality, numbered as they were in CLAUDE.md. New ones go at the end of the file that fits (docs/decisions/README.md).

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

Accepted by Monarch in the M1b review (PR #3).

18. `packages/cards/data/overrides.json` sets 896 (`EPR-005`) to `parentId: null` as well as 443 -> 896, because the site lists 896 as a child of 443 and the 443 override alone would create a parent cycle. 628, 629 and 895 stay under 443.
19. Paul's decision on `EPR-005+` replaces the `unknownFields` flag proposed in the PR #2 review.
20. `deckCardNumber` comes from the root of the parent chain, not just the direct parent.
21. Card WebPs use sharp's defaults (lossy, quality 80). Thumbs are resized by width only (300 px), keeping the aspect ratio.
22. `pnpm images` skips WebPs that already exist; `pnpm images --force` re-converts them.
23. The image test checks the manifest and that both WebP files exist on disk; it is skipped when `apps/web/public/cards/` is missing (as on CI).
24. ESLint `no-unused-vars` ignores `_`-prefixed names and rest siblings.
25. `image.godzillatcgdb.com` has no robots.txt (it returns 403); image downloads follow the same politeness rules as the page scrape.
26. The README Layout table lists `tools/scraper`.

Accepted by Monarch in the M1c review (PR #4).

27. Official-site sources come from Internet Archive snapshots when the site is down, recording the original URL, the snapshot URL and the retrieval date in `packages/cards/data/sources/`. The Rodan(2004) erratum source is Paul's screenshot summary, to be re-checked against `errata/759` once the official site is back.
28. Errata entries carry `field: "text" | "traits"`. `getCardText` reports trait errata through `hasErrata` without changing the ability text; `getCardTraits` applies them. Trait errata store the trait lists comma-separated in the same spelling as `Card.traits` (no 《》 brackets).
29. Text errata store the official excerpt verbatim (including its `...`). `getCardText` swaps the excerpt into the full card text in either direction and throws if it matches neither wording.
30. Restriction lists have `choiceRestrictions: [{ deckCardNumbers }]` for "Choice-Restricted" groups, read by `getChoiceRestrictions(asOf)`. `getMaxCopies` returns 4 for those cards; deck validation enforces "only one card from the group".
31. Restriction lists record their `announced` date as well as `effective`.
32. Restriction dates compare against the UTC calendar day of `asOf`.
33. `@gojisim/cards` uses `rootDir: "."` and `resolveJsonModule` so it can import its own `errata.json` and `restrictions.json`. It never imports `cards.json`.
34. A later restriction list replaces an earlier one only for the cards it names, unless its page says otherwise.
35. The Sep 1, 2026 list's second card, `EBP03-016` Godzilla(2003) → 0, is recorded and tested alongside Gravity Beam.

Accepted by Monarch in the M1d review (PR #5).

36. `parseTraits` and `getCardTraits` live in `@gojisim/cards`; the scraper imports `parseTraits` from there.
37. Trait errata store comma-separated trait lists (`"Rodan, Weapon"`). `getCardTraits` compares whole lists and throws if a card's traits match neither the printed nor the corrected list.
38. The Comprehensive Rules v1.2 PDF in `docs/rules/` is Paul's local download of the official file (the official URL was down and has no Internet Archive snapshot); its SHA-256 is in `docs/rules/README.md`.
39. `docs/rules/comprehensive-rules-v1.2.txt` has `===== Page N =====` markers for citing, and is extracted column by column (see `docs/rules/README.md`).

Accepted by Monarch in the M3f review (PR #12).

114. A card number in a deck list resolves to the base print first, then the print whose number matches its own set, then the lowest id.
115. Deck list header names are case-insensitive. A `[deck]` header with no name, or a section header with no `[deck]` before it, gets the name "Deck N".
116. A deck list line that isn't a count plus a card number is a parse error of its own kind.
117. `formatDeckList` writes consecutive runs of the same card, so card order survives a round trip.
118. Restriction failures use "Restriction list" and "Choice restriction" in place of a rule number.
119. Resonance (6.1.2) deck checks wait for M4 ability data.
120. `deckLegality` is optional in `GameRecord` (older records still load) and records the `asOf` date; replay ignores it.
121. `validateDeck` is on the main `@gojisim/cards` entry; parsing is the `@gojisim/cards/deck-lists` subpath, because it imports `cards.json`.
122. `/debug` checks decks against today's date, defaults to ESD01 official vs ESD02 official, stores imported decks as deck list text under `gojisim.debug.importedDecks`, and exports the picked decks as `gojisim-decks.txt`.
123. `pnpm stress` takes `--progress N` (default 10; nightly uses 500). The nightly timeout is 120 minutes.
124. Weighted stress policy weights: playBattle 32, gainRage 20, playMonster 12, activateStrategy 8, pass 8, choose 4, invade 1. Battle cards go to the player's own empty zone 8 first, then to empty zones behind its own monster.

Accepted by Monarch in the M7a review (PR #33).

288. Deck list formats are detected from the text: GojiSim text (`gojisim`, which godzilla-sim exports also are), the godzillatcgdb.com deck page (`godzillatcgdb-page`) and its printable list (`godzillatcgdb-print`). The print format has whole card numbers; the deck page has set and id in separate cells.
289. Saved decks are stored as GojiSim deck list text. A text with several decks offers a picker; one deck is saved per import. A godzilla-sim export with no deck name suggests an empty name.
290. On the deck page, a card in the Cards section with no count badge is an error, not a count of 1. Card parsing stops at the comment section and the page footer.
291. The dev decks stay in the `/play` picker as their own group after My decks (they exist only on Paul's machine).
292. A newly saved or restored deck becomes P1's pick.
293. My decks renames and deletes in place; delete asks once.
294. The decks backup file is `{ app: "gojisim", kind: "decks", version: 1, decks: [{ name, list }] }`. A restore skips decks it can't parse and says so.
295. The My decks panel reports `data-decks-stored`; reload tests wait for it.
296. The My decks panel and the import modal sit inside the new-game form with no nested forms; Enter never starts a game from them.
297. Light's `--color-legal` is `#187634` (it was `#1a7f37`).
298. The godzillatcgdb fixtures come from a public deck with its title and author replaced.

Accepted by Monarch in the deck legality and speed guard review (PR #39).

346. Tournament games block every deck check failure: size, copies, colors (6.1.1.3), invasion icon 2 (6.1.1.2.2), Token cards, the restriction list and choice restrictions.
347. Illegal decks stay listed in a Tournament game's picker, disabled as "(illegal)"; a pick that becomes illegal when the mode switches to Tournament blocks Start and doesn't change by itself.
348. Random test decks are checked for legality with the game's seed.
349. A Casual game's "Illegal deck" badge sits in the mat's free corner past zone 8, its reasons worded from the deck and the start date the record stored.
350. A loaded record with an illegal deck loads in any mode (it replays what happened) and shows the badge.
351. The speed guard plays 8 fixed games (seed `bench-guard`, random EBP01/EBP02 test decks, weighted policy) and times 9 rounds of 150 ms after a warm-up, comparing medians.
352. The guard compares times divided by a fixed plain-JavaScript workload timed in the same rounds. `bench/baseline.json` holds numbers measured on the CI runner (copied from a CI log when a slowdown is accepted) and is prettier-ignored.

Accepted by Monarch in the Decklog import review (PR #40).

353. The Decklog route lives in `apps/server/src/decklog.ts`; Vite's config imports it as dev-server middleware, so both servers run one implementation.
354. The route answers 400 for a malformed code (no request sent), 404 when Decklog answers `[]`, 422 for another game's deck (`game_title_id` ≠ 7) and 502 when Decklog can't be reached or answers something unreadable; 10 s timeout, a "GojiSim deck import" user agent, and the deck's view page as referer (without it Decklog answers `[]`).
355. A `+` print missing from the card data reads as its base card (6.1.1.4.1), and the import modal says so.
356. Decklog's `sub_list` is left out (the game has no side deck), with a note when it has cards.
357. An imported Decklog deck is named after its title, collapsed to one line, or "Decklog <code>" without one.
358. Decklog fixtures are the full recorded answers, prettier-ignored so they stay as recorded.

Accepted by Monarch in the English promos review (PR #48).

417. EPR-015 and EPR-016 are hand-entered base prints and the deck card numbers; PR-015 and PR-016 get only a `deckCardNumber` override (no `parentId`), since the scraper links parents before it merges hand-entered cards.
418. Hand-entered cards use cards.json's existing spellings for names, traits and movies, and the official text icons map to the existing text tokens.
419. A PR print of a booster card whose `+` number the site already uses for another print is numbered `<number>+ (Alt)` (EBP01-073+ (Alt), like EBP02-070+ (Alt)); its name and text are the base card's, and its printed title goes in `notes`.
420. The official "+" mark on a battle card's counter power has no schema field; it stays in the source files.
421. The M12 plan's "Implemented after" column counts the original 384 plus the 3 new M12e cards; with EPR-020, 388 cards are in scope.

Accepted by Monarch in the dev-deck auto-load review (PR #49).

422. A development deck's folder is its `[deck]` name up to the last "/". Picker keys are `file:<file>:<full name>`, so a pick survives a file change and reload; a repeated name in one file gets `#2`.
423. A change to a `local-decks/*.txt` file reloads the page rather than updating the pickers in place.
424. Each picker screen has one development-deck filter box, shared by both seats and shown only when there are file or imported decks; starters, My decks and each seat's pick always stay listed.
425. A browser-stored deck is hidden behind a file deck with the same full name, folder included.
426. Clear imported decks asks once; picks that were imports go back to the starters, and file decks stay.
427. `.gitignore` ignores the root `/local-decks/` only, so the made-up test fixtures in `apps/web/e2e/fixtures/local-decks/` are tracked.
428. `GOJISIM_LOCAL_DECKS` points the dev server at another deck folder (Playwright uses it); Vitest reads the fixture folder.
