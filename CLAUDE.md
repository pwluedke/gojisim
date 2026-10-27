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

Accepted by Monarch in the M3a review (PR #6).

40. Engine state carries a card catalog (`cards: Record<cardId, Card>`) built from the decks passed to `createGame`; `getPlayerView` sends only the entries for cards the viewer can see.
41. `createGame` takes decks as full `Card[]` objects (from `cards.json` or test fixtures) and rejects two different cards with the same id.
42. The invading monster's position (`monsterPosition`, 3.3.3) is stored separately from the invading monster zone (4.7).
43. Each zone holds a list of stacks, so an overloaded zone (11.5) can exist until a check timing resolves it.
44. Instance ids are sequential strings (`c1`, `c2`, ...) re-issued on every move between areas (4.1.4), so a card leaving a hidden area can't be linked to its earlier identity.
45. Log payloads hold public information only, with the rule number in `payload.rule`, so the log goes to every viewer unfiltered.
46. After setup the state is turn 1, phase `start`, step `7.2.1`, with the first player as turn player.
47. Seeds may be a number (truncated to unsigned 32-bit) or a string (FNV-1a hash).
48. The RNG stream shuffles each main deck in `players` order, then picks the first player.
49. "Same column" (4.4.5.4) is symmetric: a relation between two zones, so it holds from both players' sides (12 cross-player pairs). Confirmed by Monarch.
50. Reshuffle (11.2) is part of drawing from M3b on (moved from M3d by Monarch).
51. The engine deep-copies state with a JSON round trip, so it has no DOM or Node dependency.
52. `docs/rules/spec.md` is in `.prettierignore`, so it stays exactly as approved.
53. Trait spelling corrections live in `packages/cards/data/trait-spellings.json` (keyed by the site's spelling, with a `reason`), applied after scraping.

Accepted by Monarch in the M3b review (PR #7).

54. `state.step` names the next engine step by rule number (`STEPS`, 18 steps), so tests can stop or set up state between any two steps.
55. `counterTotal` holds the 7.4.2 total for 7.4.3 to read; it is `null` outside those steps.
56. Actions carry `player`, and `applyAction` only accepts an action that `getLegalActions` lists.
57. The 10.4.4.1 check timing runs after each main-phase action, before the play timing is given again.
58. "Beginning of phase" triggers are logged (`phaseBegins`) and followed by a check timing.
59. 11.4.1: a strategy or monster card on top of a zone stack is illegal; a monster card under a battle card is left alone. Confirmed by Monarch.
60. Counter power counts stacks topped by a `Battle` card only; Token-type cards and cannot-engage (5.16) come later.
61. Check-timing rule actions are collected from one snapshot and applied together (11.1.3), repeating until none are left; crush and destroy also runs in every pass.
62. Destroying a stack sends every card in it to its owner's discard pile, each as a new object.
63. A draw with an empty deck and an empty discard pile is skipped; later draws in the same instruction try again. Each attempt is logged.
64. The 7.5.4 draw is mandatory ("equal to the number needed"), not the optional "draw up to" of 5.4.3.
65. 7.5.7's "pending" check looks at the standby list and at check-timing rule actions.
66. Check timing throws on a non-empty standby list until M3d implements 10.4.3.2/10.4.3.3. Confirmed by Monarch.

Accepted by Monarch in the M3c review (PR #8).

67. Monster movement functions are `advanceMonster`, `retreatMonster`, `advanceMonsterTo` and `retreatMonsterTo` (`advance(state)` is the step runner).
68. `didAdvance` (5.13.3) is the return value of the movement functions; invasion logs `invasionDone { advances, didAdvance }`.
69. `strategyZone` is 1 or 2 in actions.
70. `Action` is a discriminated union; `applyAction` accepts only an action equal to one from `getLegalActions`.
71. A win ends the game at once (1.2.1): no check timing after it, and remaining invasion steps are skipped. Confirmed by Monarch.
72. The opponent's zone 8 blocks victory through invasion if any stack there is topped by a Battle card.
73. `gainRage` and `invade` log a `discard` with the card id (the discard pile is public).
74. `invade` sets `invasionUsed` before discarding.
75. `advanceToDecision` returns a finished game instead of throwing; `advance` itself throws "game over".
76. Battle and strategy cards need a non-null `rank` to be offered as actions.

Accepted by Monarch in the M3d review (PR #9).

77. Check timing is resumable: each engine step moves `state.step` on before its check timing, and a check timing is always the last thing a step or action does. A choice pauses it (`state.checkTiming`) and `choose` resumes it.
78. 7.4.3 moves to step 7.4.4 before countering, so a `nextMonster` choice waits at 7.4.4.
79. Standby order is asked only when it can matter: copies of the same ability from the same card resolve earliest-first automatically.
80. Every log entry is an engine event for the trigger check, except `enterStandby`.
81. Abilities are active on the top card of each zone stack, the top card of the invading monster, and strategy cards (10.3.4). Other areas come with M4.
82. The ability registry is module-level code (`registerAbility`), not state; tests unregister their fixtures.
83. Standby entries also store `sourceCardId` and the triggering `event`.
84. `ResultReason` is `invasion | victoryThroughCountering | concession | effect | draw`.
85. Losses (`markLoss`) settle at the end of each engine step, action, choice and ability resolution (`resolveLosses`); both players losing is a draw (1.2.2).
86. `choiceRequired` logs only the kind and option count; the chosen next monster is logged once it is public.
87. The next-monster choice after a counter cannot be refused (searching may "find nothing" is not offered). Confirmed by Monarch.
88. `concede` comes last in every legal action list.
89. `nextChoiceId` is a state counter for choice ids.

Accepted by Monarch in the M3v review (PR #10).

90. The debug viewer builds both decks with the game seed, so a seed fully determines a game.
91. `buildTestDeck` is a subpath export (`@gojisim/cards/test-decks`) because it imports `cards.json`; the main `@gojisim/cards` entry never does. The viewer is lazy-loaded on `/debug`.
92. Test decks use only base, English prints of the chosen set; "plus White" means White cards of that set.
93. Test main decks are a seeded random draw from all legal copies (many monster cards are possible). Paul decides later whether to switch to official starter lists.
94. `buildTestDeck` does not apply restriction lists (neither ESD set has restricted cards).
95. Debug viewer player ids are `P1` and `P2`.
96. An exported game record includes `position`; import opens the viewer at that action.
97. The viewer caches every state (`states[i]` after `i` actions) for instant stepping.
98. Card images come from `pnpm images` (`/cards/<id>-thumb.webp`, `-full.webp`); missing images are hidden.
99. `/debug` is a pathname check in `main.tsx`, with no router.
100.  The 6.1.1 checks in the `buildTestDeck` test are test-only; the real validator is M8.

Accepted by Monarch in the M3e review (PR #11).

101. Loop detection compares a canonical state that leaves out instance ids, the log, counters, timestamps and RNG state; hand, discard pile and monster deck compare as sorted lists, the deck in order.
102. Loop checks run after every engine step and, inside a check timing, before every ability resolves. (Amended in the M4c review: checking after each resolution recorded the same state twice when a step ended with an ability resolving, which drew the game.)
103. `LOOP_STEP_LIMIT` (2,000 automatic steps in one turn without a player choice) also ends the game as a 13.1.1.3 draw (`kind: "stepLimit"`).
104. A `standbyOrder` choice counts as a player choice and clears the loop history.
105. 13.1.1.2 (the turn player may not repeat an identical-state action) is not enforced on player actions. Confirmed by Monarch: revisit only if a real case shows up.
106. A loop report replays the loop only where the looping abilities are registered.
107. The stress tool picks actions with its own per-game PRNG; deck seeds are `<seed>-<game>-P1/P2`.
108. Stress output goes to the directory `pnpm stress` was run from (`INIT_CWD`), changeable with `--out`.
109. `pnpm stress` takes `--turn-cap` (default 500).
110. The PR stress run is seeded with the commit SHA; nightly runs use the UTC date.
111. The invariant view-leak check collects each view's instance ids once (0.5 ms per action).
112. `stress-failures/` and `loop-reports/` are gitignored.
113. Card conservation flags opponent-owned cards in a player's areas; M4 adds an exception for effects that move a card to the opponent's field. Confirmed by Monarch.

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

Accepted by Monarch in the M4c review (PR #14).

125. Gates are checked when a trigger matches, when the ability resolves, and before each of its effects; a closed gate ends the resolution (Q7).
126. An ability's `condition` is checked when it resolves. A failed condition logs `conditionNotMet`; a closed gate logs `abilityInactive`.
127. [enter] fires when a card enters the board: a play from the resolution area, and the monster that comes in after a counter (5.15.1.2). The rank I monster placed at setup (6.3.1.6) does not trigger it. Paul's ruling, Oct 21, 2026.
128. `place` and `newInvadingMonster` log entries carry the placed card's `instanceId`.
129. Effect targets are chosen with a `target` choice, one card per choice. With N or fewer legal targets for "exactly N" there is no choice (10.5.3.1); "up to N" adds a `done` option. `chooseZone` is a `zone` choice with options `<player>:<zone>`. `ChoiceOption.cardId` is nullable.
130. A paused resolution lives in `state.resolution`; an invariant checks it exists only while a `target` or `zone` choice is pending.
131. Selector `traits` requires every listed trait. `keyword` reads ability data, or the printed `[keyword` icon for cards without data.
132. While modifiers are being collected, nested stat reads see printed values (10.8.1.6).
133. Monster rank for the 7.2.2 draw and the next-monster check stays printed; only 7.4.2, 8.2.1 and 8.3.1 read the 10.8.1 layers. Revisit in M12 when a card first modifies monster rank.
134. Triggers not built yet never match, so manual cards stay inert; `optional` and `cost` threw `not implemented` until M4d. Tests can register `custom` effect handlers.
135. `pnpm stress` takes `--decks random|official`.
136. `docs/abilities/format.md` is in `.prettierignore`, so it stays exactly as approved.
137. The M3d code ability registry is test-only (`packages/engine/src/testing.ts`).

Accepted by Monarch in the M4d review (PR #15).

138. Optional costs and `optional` abilities ask a yes/no `confirm` choice. Declining logs `abilityDeclined` or `costNotPaid`; a cost that can't be paid in full is skipped without asking (10.5.4.1). Payability is checked for `discard` costs.
139. A search always offers `done` ("find nothing", 5.8.1.2); "up to N" picks also offer `done`.
140. Choices among hidden cards are private (`PendingChoice.private`): only the chooser sees the options, and the `choose` log omits the card id.
141. `discardDownTo` has that player pick the cards to discard, one per choice, until the hand is down to the size (5.7.2; amended by Paul's ruling, Oct 22, 2026: pick discards, not keeps). `player: "each"` is not built yet.
142. `search` of another player's deck and `play` of a non-battle card are not built yet.
143. `play` chooses every zone before placing any card: own zones from the selector, minus the own monster's zone, minus zones already used if others remain, empty zones first with `preferEmpty`. One legal zone means no choice; none means that card isn't played.
144. Cards played by an effect get `playedVia: "effect"`, and their `place` log entry carries `played: true`, which [enter] matches.
145. `play.ignoreRankLimit` is optional, default true (format.md updated).
146. A resolution keeps a `stage` (useAbility, payCost, cost, main), a `path` into nested effects, and `chosen`, `zonePicks` and `answer` progress.
147. `state.revealed` holds revealed instance ids until the resolution ends; `getPlayerView().revealed` lists them. `addToHand` names a card only if it was revealed or came from the discard pile.
148. Invasion `advance` log entries carry `invasion: true`; the `invading` trigger matches them on the active monster only.

Accepted by Monarch in the M4e review (PR #16).

149. Replacements are checked while the doomed card is still in its zone (before an 11.3 crush, before overload losers are removed, before effect destroys). `instead` effects run inline under a temporary resolution; one that needs a choice is not built yet.
150. A `replacementOrder` choice is offered for effect destroys. A rule action (11.3, 11.5) can't pause, so 2 or more replacements there throw; a stress invariant flags any card with 2 or more destroy replacements, so M12 catches it.
151. A replacement logs `replace` (with `replacedRule`) instead of `destroy`; overload losers a replacement took away are left out of the 11.5 destroy.
152. `putOnDeck` on a zone card takes its whole stack; cards under it go to the discard pile without a destroy (5.12.1.1).
153. `moveBattle` offers only zones on the card owner's field, minus its current zone and the owner's monster zone; `optional: true` adds `done` to the zone choice. Several targets are not built yet.
154. Rage changes go through `setRage`, which logs `rageChanged {from, to}` or `rageUnchanged` (1.3.2.1). The 7.2.4 reset from 0 logs nothing.
155. `cardPlayed` also matches a new invading monster after a counter (5.11.2) and strategy activations (5.9); `what` is evaluated where the card landed.
156. The manual-strategy `strategyTextPending` test uses ESD02-014.

Accepted by Monarch in the M4f review (PR #17).

157. Burst's discard is a `state.timedTriggers` entry (`timed:burstDiscard`), since the card may be covered and inactive when it fires (12.5.2.1). It fires once (10.6.5.1) at the master's next end phase; a card already gone logs `gone: true`.
158. A monster card is a Burst play only when its printed rank doesn't match the current monster and its Burst rank does; a printed-rank match is a normal play.
159. Evolution is expanded in the engine (`withKeywords`) into an optional `phaseBegins` (main, yours) trigger `evolution` whose effect is `evolve` on `this`; the data carries only the keyword.
160. `evolve` reads the target's Evolution keyword from ability data (cards without data aren't offered), searches `exact 1` with "find nothing", stacks the found card on the existing stack, and logs `place` (`played: true`), `evolve` (5.17.1.1) and `shuffleDeck`.
161. `Resolution.subject` holds the card being evolved across its two choices.
162. The canonical state for loop detection includes timed triggers.
163. Tests that need a manual card use non-starter cards (EBP01-001, EBP01-032). After a Burst play the monster reads the Burst card's printed rank (ESD01-007 reads IV), confirmed by Monarch.

Accepted by Monarch in the M6a review (PR #20).

164. The engine view carries the public engine status (`counterTotal`, `checkTiming`, `timedTriggers`, `manualQueue`), revealed cards with their owner and area, and, for the player who must choose, the paused `resolution` (bindings only for the ability's master). The view-leak invariant allows exactly those.
165. Hidden choice options are sorted by instance id, so a search never reveals deck order (4.8.2).
166. `BotInput.legalActions` leaves out `concede`; it is computed from the real state but depends only on what the bot can see (the no-peeking test checks this).
167. The determinizer derives the opponent's monster deck from the presented monster deck minus `setInvadingMonster`/`newInvadingMonster` cards in the log, and hidden main-deck cards from the presented main deck minus every visible main-deck card. Cards the viewer's own private choice or resolution names go into its deck. A mismatch throws.
168. `cloneState` deep-copies by hand and shares log entries and the card catalog, which the engine never writes once created. A freeze guard (off in production) makes any such write throw in tests and stress.
169. The weighted policy lives in `@gojisim/bot` and reads the view; stress calls it.
170. The tournament harness (`tools/bots`): bot a sits in P1 in even games, the sets swap every 2 games, games past turn 500 are unfinished draws, ms per decision covers `chooseAction` only.
171. Root scripts `pnpm bench` and `pnpm bots`; `bot-reports/` is gitignored.

Accepted by Monarch in the M6b review (PR #21).

172. The freeze guard is switched by `GOJISIM_FREEZE` (read through `globalThis.process`, so the engine keeps no Node dependency) and `setFreezeGuard()`. Test fixtures replace `state.cards` instead of writing into it.
173. Every evaluation feature is own minus opponent, so `evaluate` is exactly antisymmetric.
174. `winThreat` counts an invasion as available with a card in hand, unless it's your turn and you already invaded.
175. `countersLeft` and `nextMonster` read the current monster's printed rank (decision 133).
176. `greedy` evaluates at the first decision point after the action, whoever it belongs to, or at the game's end; a single legal action is played without searching; ties within 1e-12 go to the seeded rng.
177. `@gojisim/bot` uses `rootDir: "."` and includes `data/*.json` for the weights file.
178. `pnpm bots` takes `--a-settings`/`--b-settings` as `key=value` pairs; reports label bots with their settings.

Accepted by Monarch in the M6c review (PR #22).

179. The must-block test plays the bot's whole turn and checks its zone 8 at the end (it may invade first, which neither wins from zone 5 nor ends the turn).
180. ISMCTS action keys: type + card id (+ zone or strategy zone) for plays; kind + ability id + option card id (or the option id when it names no card) for choices. Two copies of a card share a node.
181. ISMCTS tree values are stored from the side of the player who chose the move into the node; exploration 0.7; an unvisited available child is expanded first, at random; a new child starts with availability 1.
182. `rolloutTurns` counts opponent turns that end during a rollout (default 1); a rollout also stops at the game's end or after `rolloutDecisions` (60).
183. The weighted policy reads a `Board` accessor (a view, or a state in rollouts). The search budget uses `Date.now()`.
184. `ismcts` reads `iterations`, `maxMs`, `exploration`, `rollout`, `rolloutTurns`, `rolloutDecisions`, `temperature`, `blunder`; `easy`, `medium`, `hard` are registered bots, a `difficulty` setting overrides the level, explicit settings override the mapping. Blunder is rolled before the search.
185. `pnpm bots --workers N` runs shards in child processes and merges them in game order; results match a single process.

Accepted by Monarch in the M5a review (PR #25).

186. Web game code shared by `/debug` and `/play` lives in `apps/web/src/game/` (`bots`, `botWorker`, `decks`, `labels`, `session`, `useGameSession`). `useGameSession` takes `privateLabels()` and `onStart` so `/debug` keeps its hide toggle.
187. The `/play` board renders only from a `BoardModel`: the bottom player's `getPlayerView` plus public numbers computed from the real state (counter power of zone-top cards, threats, totals). Every rendered card carries `data-instance-id`. With two bot seats, the bottom is P1.
188. Until M5c, the `/play` prompt offers Pass and the human's pending choices (labels from `actionLabel`). A bot's turn shows "Bot (Medium) is thinking… 1.2 s".
189. Routes: `/play?mode=bot|hotseat` (a missing or unknown mode means bot). The menu uses plain links and the path router; `/play` is lazy-loaded like `/debug`.
190. `theme.css` is scoped to a `.gojisim` wrapper, so `/debug` keeps its plain look. Outside `/debug`, `main.tsx` adds `gojisim-body` to `<body>` to remove the page margin.
191. The new-game screen lists the same decks as `/debug` (official starters, random test decks, imported decks), each with a legality badge. The seed is random but editable.
192. The App unit test checks the menu: the "GojiSim" heading plus the three links.
193. `/play` starts every game with its bot seats playing (`autoPlay: "always"`), and bot vs bot there has Pause/Play. `/debug` keeps `"humanVsBot"`; full spectator controls stay in `/debug` until M13.

Accepted by Monarch in the M5b review (PR #26).

194. Hand destinations: the Rage zone is the `gainRage` target and the discard pile cell is the `invade` target (amended before merge: these replaced the Stats panel and the Piles row when the board became the official playmat). The monster wins over its zone for clicks and drops.
195. The hand strip overlaps with CSS only: columns `minmax(0, --hand-card-max)`, cards at least `--hand-card-min` wide, the last card right-aligned, the hovered card on top. Overlap starts at about 11 cards at 1440 px.
196. The pointer sensor starts a drag after 6 px, so a click still selects; a `DragOverlay` shows the dragged card.
197. A selection lasts only while its card still has actions (instance ids change on every move) and clears after an action.
198. The preview opens on hover and closes on leave or Esc, is off during a drag, and ignores the pointer. It shows current values; monster rank comes from `getRank`.
199. The hand is locked whenever the bottom player isn't the human who must decide.
200. Hand e2e seeds: hotseat seed 2 plus one Pass gives P1 turn 2 with all five hand actions; seed 1 with 8 passes gives P1 a hand of 10 on turn 9.
201. The "human vs Easy" card-back count in `bots.spec.ts` polls until backs minus hand equals 3, fixing a race with the bot's moves.

Accepted by Monarch in the PR #26 playmat review (decision 1, mat thumbnails shrinking with the window, was rejected by Paul and replaced by the M5b fix).

202. Hand cards whose only actions are invade or gain rage look plain (no outline, full opacity) and can still be selected and dragged; cards with no action are dimmed. Hand cards carry `data-hand-lit`.
203. The Rage zone shows rage, threat, and total counter power vs the opponent's threat. Monster rank is shown in the preview, not on the board.
204. The deck and monster deck cells show a card back and their count; the discard cell shows its top card, which can be previewed.
205. Grid positions with no mat area (the holes in the 7 × 3 grid) are left blank, with no box drawn.

Accepted by Monarch in the M5b fix review (PR #27).

206. `--card-h` is also capped by the window width, so the 7 mat columns fit beside the sidebar and the preview column (neither 1440 × 900 nor 1920 × 1080 reaches the cap).
207. The mat is centered in the space left of the preview column; the hand strip stays full width and left-aligned.
208. Several cards in one mat cell (an overloaded zone, the monster plus a battle card, two strategy cards) are offset 6 px down and right each, so every card shows.
209. Cards whose abilities are manual keep a small `M` badge in the top-left corner.
210. The deck and monster deck cells show a full-size card back with the count badge; the cell label shows only while the pile is empty.
211. A card whose image fails to load (as on CI) shows its name inside the card box; with images present no text shows.
212. Revealed cards in the opponent's hand show as half-size faces next to the backs; the one-card-size test leaves the opponent's hand row out.
213. Choice modals (M5c) use the same `CardFace` at the same size.

Accepted by Monarch in the M5c review (PR #28).

214. Choice fixtures are game records: `/play` has "Load a game record" (it continues an exported game, bots playing), and `apps/web/e2e/fixtures/*.json` stop at a P1 choice against the Medium bot, found by `e2e/fixtures/generate.ts` (`pnpm --filter @gojisim/web e2e:fixtures`). The next-monster fixture gives P1 two rank II monsters; the manual fixture puts EBP01-017 (no ability data) in P1's deck.
215. `replacementOrder` can't happen with the current card data (no card has two destroy replacements), so it is a unit test with an injected choice.
216. "Up to N" appears only on searches in the current data (ESD01-002, ESD01-014), so the Done test uses a search; Done reads "Find nothing" for searches and "Done" otherwise.
217. The hotseat cover shows when the decider changes, which includes the other player's private choices. A private choice for the player already at the board is not covered.
218. Zone choices show a banner in the right column, under the preview, listing the zones with number keys and Done, while the zones light up on the mat.
219. Choice headings name seats "You" and "Bot" against a bot, "P1" and "P2" in hotseat.
220. The `/play` manual panel lists only the cards the human's view shows; `/debug` lists every card.
221. The bot's move toast stays 3 s and the landing highlight max(delay, 600 ms); the toast uses `actionLabel` wording.
222. Concede is offered to the player at the board in hotseat, and to the human at any time against a bot (1.2.3).
223. `/play` settings are saved in the browser under `gojisim.settings`, with try/catch.
224. The hand e2e spec turns the hotseat cover off (it follows P1's hand); `passTurn` in `e2e/helpers.ts` handles the Pass confirm and the cover elsewhere.

Accepted by Monarch in the M5d review (PR #29).

225. `currentStep` is the step that ran last, or 7.3.2 once the engine waits at the play timing with no choice open; a choice from a played card's [enter] stays at 7.3.2. The golden 10-turn hash matches M4g with the field removed.
226. Battle log lines start with "You:", "Bot (Medium):", or "P1:"/"P2:" in hotseat. Confirm, standby order, replacement order and manual choices use log wording instead of `actionLabel`. Lines that would repeat their action line are left out: rage and invasion discards (8.4, 8.6) and hand plays' `place`.
227. With "Show rule numbers" on, action lines show 8.2 to 8.6 for hand actions, 1.2.3 for concession and the choice's own rule for choices; Pass has none.
228. The history view shows the board after the clicked line's action, from the live viewer's side (hotseat never flips to the other hand). Clicking the newest line returns to live. The choice modal and zone banner are hidden while viewing, and the log can't be clicked while a choice modal is open.
229. `useGameSession` takes a `hold` option: a bot reply that arrives while it is on is kept and applied once it is off, if the game hasn't moved on.
230. The strategy card mark reads "New" when placed this turn, otherwise "T<turn placed>"; its tooltip says it leaves at its owner's next start phase (7.2.3).
231. The Burst badge (from the view's timed triggers) reads "Burst R<under>→R<now> · discard at end phase".
232. The expanded hand shows full WebPs at 2.4× the card size, letterboxed; H or Esc closes it, and a click does nothing.
233. Shortcuts are ignored in input, select, textarea and contenteditable, and with Ctrl / Cmd / Alt held. Space is also ignored while a button has focus, or while a choice, dialog, overlay or history view is open.
234. The battle log takes the free height and follows the newest line while live.
235. Target location labels add "(opponent)" for the other side's cards (`Z2 (opponent)`); a card in your hand reads `Hand`, the invading monster `Monster`, a searched monster deck `Monster deck (searched)`. The mat ring also shows whose zone it is.
236. Location labels and the ring apply to `target` and `nextMonster` choices; standby and replacement order options aren't places.
237. `confirmSingleTarget` covers every `pickCards` pick with N or fewer targets, not only destroys (Monarch: keep it on for every case). M5e extends it to every choice kind as `confirmSingleOption`.
238. A loaded game record keeps the confirm option it was recorded with, so it replays exactly; the older fixtures have it off and new `/play` games have it on.
239. The counter power chip at the card's bottom edge stays; the change badge lists `CP +N` as well, so the badge is the full list.
240. `playedVia: burst` shows no chip of its own: the Burst chip covers it while the discard is pending.
241. Change chips are short (`CP`, `Can't engage`, `By effect`); the hover list and the preview give the full wording with rule numbers. New statuses must add a label to a `Record<CardStatus, …>`, so the compiler forces it.
242. The history banner sits at the bottom of the screen, over the locked hand.
243. Cards don't clip their contents, so the change list can reach past the card edge; a hovered card's layer rises above its neighbors.
244. `docs/ui/board-design.md` keeps the approved M5a diagram, with notes above it for each later layout change. The README describes the current layout.
245. Prompt, phase tracker and Settings are a fixed left column with no collapse button (Paul's correction of the "top bar" wording); Settings opens in place. The battle log is the right column, and the card preview covers it while open.

Accepted by Monarch in the M5e review (PR #30).

246. The First / Second pick uses the single 6.3.1.4 RNG draw: picking the card with your own seat's index gives the old random first player, so old seeds keep their first players. Games with no pick (two bots, `/debug`, older records) stay random. `chooseFirstPlayer` logs `pickedBy`, `card` and `firstCard`.
247. Undo boundaries include the end of the game (a concession or a win can't be undone). An open search pick counts as a search: the searcher has seen the deck before the `search` log entry.
248. Undo is offered only to the human who decides now, for their own last action, and never in the history view; when blocked the button is greyed out with a tooltip. Records with no `mode` load as Casual.
249. `confirmSingleTarget` stays readable (target picks only), so older records replay exactly; new `/play` games write `confirmSingleOption`.
250. A single ability in standby (or interchangeable copies, decision 79) and a single destroy replacement get no modal: they aren't decisions. `confirm` always has two options. Confirmed by Monarch.
251. A one-option zone choice uses the zone banner, like every zone choice (decision 218).
252. The search modal is UI only, not a record action; bots wait while it is open. `search` log entries carry the searched `filter` and `count` (public card text). In hotseat it shows only to the player at the board, before the cover.
253. Evolution searches (12.6.2) get the search modal too.
254. Ability text in order modals is the card's text line for that ability, in ability-data order, or the keyword's line for Evolution; it falls back to the whole text.
255. The opponent's revealed half-size hand cards are not rotated.
256. Decisions 234, 242 and 244 were reworded to the final left-column layout in the M5e PR.

Accepted by Monarch in the M5f review (PR #31).

257. One step (an action up to the next decision) animates as one set, all moves together. A history jump, an undo, a hotseat flip, a loaded record or a new game shows at once.
258. Animation durations at Normal: 450 ms per move; a destroy explodes for 320 ms and hangs for 300 ms before its move. Fast is about half (220, 160, 150 ms).
259. The custom mat shows behind both mats, the opponent's turned 180° like a table skin. The limit is 8 MB; scale runs 25–300% of the mat width, X/Y 0–100%. A failed save keeps the image for the visit.
260. Turn glow colors: Red #e0352b, Blue #2f6fdf, Green #2e9e4f, grey #9aa0a6, 1.2 s each.
261. The mat's outer columns are landscape (one card height wide): strategy zones on the left, deck and discard pile centered on the right. Both mats share one template, so columns line up; `--card-h` fits 5w + 2h.
262. `docs/combos/combos.md` is in `.prettierignore`, so it stays exactly as written.
263. `fake-indexeddb` 6.2.5 is a web dev dependency for the mat storage tests.
264. Choice and search modals open once the cards have landed. `useGameSession` takes `pause`, so the bot's delay starts after its move's animation.
265. `--mat-pad` (12 px) keeps every zone, strategy zone and pile clear of the mat border; the glow is on the border, outside it. The mat settings report `data-mat-stored` once storage has caught up.
266. Destroy shards are a 3 × 4 jittered grid of quads, some split into triangles and some merged into pentagons, tiling the card; the layout is seeded by the card's instance id. Hand cards fill the hand row's height with `--hand-gap` (4 px); the count label sits over the corner and the drag overlay keeps the board card size. The battle log collapses to a strip (button or L, saved); at 1440×900 and 1920×1080 `--card-h` is height-limited, so collapsing widens the board area without larger cards.
267. A moving card's pile end is measured as one card (the last card in a hand row, the pile's top or back, or a card-sized spot at its center), and it moves with one uniform scale by the longer sides about its center. A destroy explodes, hangs, then reassembles in flight to its destination.
268. Every e2e spec runs with animations Off (a default storage state in `playwright.config.ts`) unless it opts out; the m5f spec tests Normal.

Accepted by Monarch in the M5g review (PR #32).

269. Combo success conditions take one of six shapes, each with parameters: `sameTurn`, `boardState`, `foundThenBurst`, `paidCost`, `playedThenEvolved`, `evolvedThenDraw`. A new combo is data unless it needs a new shape.
270. Deep Sea Ambush follows the searched ESD01-006 through the state (the copy that reached the hand in that step), never the log: a hand card's instance id in the log would let the opponent follow a hidden card (decision 44). Any later turn counts while it stays in hand.
271. Ginza Inferno's two events can come in either order within the turn; a destroy replaced by ESD01-011/012 doesn't count.
272. Tokyo Wall: ESD01-012 tops a zone 8 stack with at least +8000 counter power from effects while City of Tokyo tops one of the owner's zones, checked at each decision point, once per ESD01-012 instance.
273. Deep Sea Ambush: the [enter] destroy must happen in the Burst turn.
274. Oxygen Destroyer: the paid card's printed rank is 8 or higher; once per resolution.
275. Twin Cocoons: one Mothra (Larva) and one Battra (Larva) from the same ESD02-003 resolution; either may evolve by any means; the window closes when the master's next counter phase begins.
276. Cosmos Call: The Legend of Infant Island evolves a Mothra (Larva), then ESD02-010's [enter] draw resolves in that turn.
277. Cadmium Barrage: each source takes at least 1 rage, and at least 2 in total, in one turn.
278. Every player's combos are called out, in order, one at a time; combos in a loaded record or removed by an undo are not; the hotseat cover hides the callout.
279. The callout e2e fixtures both land on Tokyo Wall; each combo's own coverage is in the engine tests.
280. Ginza Inferno never came up in the 200-game greedy run (a bot-strength note for M13); its engine test fires.
281. The combo callout is a modal: it opens after the cards land with a brief shake (none with Animation speed Off), stays until Close, Space or Esc, and holds the bot; a search result shows first and choice modals wait for it.
282. Light's muted grey is `#636a77` (it was `#6b7280`, 4.43:1 on the page background, under WCAG AA).
283. Text on the highlight color (the strategy mark, change chips) has its own variable, dark in every theme.
284. The theme selector is in `/play` Settings; the menu and `/debug` follow the saved theme, and `/debug` changes colors only.
285. The theme contrast check is axe's `color-contrast` rule (`@axe-core/playwright` 4.13.0, a web dev dependency).
286. Every color is a `theme.css` variable, one set per theme on `:root[data-theme=…]` (Grey also with no attribute); `index.html` sets the saved theme before the first paint.
287. A moving card stays above the stack it lands on: the stack's covered old top stays in place under it until it lands; flights and the input lock render in one top-level layer (a portal) above board cards, hover layers and chips, below the zone banner, the preview and the modals; a card sent to the deck bottom slides under a copy of the pile's top card.

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

Accepted by Monarch in the M12a-1 review (PR #35).

299. C5 `countsAs` (Godzilla's Skeleton, EBP03-071) waits for EBP03, its only card.
300. T1 `destroyed` takes `invasion: true` for EBP01-007's "[invading] When this card destroys your battle cards": only a crush caused by an invasion advance, once per destroyed stack.
301. T3 `discarded` requires `from: "hand" | "strategy"`; a destroyed strategy card counts as sent from a strategy zone.
302. `playedVia: "hand"` is recorded for main phase plays of battle and monster cards; a Burst play also counts as played from the hand.
303. "This card has N or more [rage]" on a monster card reads its master's rage (Q16).
304. A cost that reduces your own rage needs that much rage, or it can't be paid (10.5.4.1, EBP01-020).
305. T8 delayed abilities fire whether or not their card is still in play, more than once within their period ("this turn" is the indicated period, 10.6.5.1), and end at 7.5.6.
306. `pnpm stress` takes `--sets`, `--deck-file` and `--uses`; deck names never appear in the output.
307. The invariant check skips the "manual windows queued at the play timing" check once the game is over (1.2.1).
308. Engine tests that use real cards as manual examples set them manual with `setTestAbilities`; the web ManualPanel test and the e2e `manual` fixture use EBP04-037 until M12d.

Accepted by Monarch in the M12a-2 review (PR #36).

309. C1's `if` effect was built with EBP01 (needed after a mill); `didLastStep` waits for a card that needs it.
310. M1 and M2 are built as far as each set needs them; the remaining flags and play rules come with their first cards.
311. `if` and `chooseOne` decide their branch once, when the resolution reaches them (kept by path in the resolution). `chooseOne` offers only options whose gates are open and whose condition holds, as choice kind `option`, labelled by the card's "●" lines. With one option it runs at once, except for seats that confirm single options (`confirmSingleOption`: human seats in `/play`), which see the one-option choice (Paul's ruling: every human decision shows a modal).
312. "Reveal the top N and send them to your discard pile" is a mill, since the discard pile is public.
313. `lookTop` puts the kept cards back on top in pick order (first picked on top); the rest go to the discard pile.
314. A mill from an empty deck sends nothing and doesn't reshuffle; 11.2 reshuffles only for draws (11.2.2).
315. Q35 (Paul, provisional; `docs/rules/rulings-to-confirm.md`): a card the opponent's effects can't destroy can still be chosen by them; the destroy does nothing to it (1.3.3, logged `destroyPrevented`). Crush (11.3) and overload (11.5) still destroy it.
316. Counter-proof at 7.4.3: a total at or below the value doesn't counter (`counterPrevented`); with `insteadMoves` the monster moves behind as though countered (Q14).
317. "This turn" conditions and amounts are read from the log since the turn began, not new state fields.
318. "Evolve all" evolves each card in zone order; `moveBattle` with several possible cards asks which one first (Done when optional); swapping fewer than 2 cards does nothing (5.6.2).
319. Effect advances and retreats move one zone at a time or "to" a zone (5.13.1.2, 5.13.2.2); an effect advance from zone 8 never wins (5.13.1.1.1).
320. Shared engine test helpers live in `packages/engine/test/fixtures/play.ts`. The cards test for "no entry means manual" uses FC01-001.
321. Provisional rulings by Paul go in `docs/rules/rulings-to-confirm.md` and in spec.md's rulings table marked provisional, until an official ruling or FAQ settles them.

Accepted by Monarch in the M12b-1 review (PR #37).

322. E19 is a `boost` effect: bonuses fixed at resolution for the cards picked then, kept in `state.continuousEffects` and ended at 7.5.6; a card that moves to another area loses its bonus (4.1.4).
323. C3 builds `sameNumberAs` (the zone with that number on each field) and `atOrBefore`; other zone-number pieces come with their first cards.
324. T7's binding also covers [invading]: the latest card the monster's master discarded for the invasion (EBP02-022).
325. "Your opponent may discard until N" asks that player yes/no first; the discarded cards are bound in the discard pile.
326. `cannotPlay` reads its card filter wherever the card is, so effects that would put a strategy card into play are blocked too (Q32).
327. `cannotAdvance` stops every advance, the 7.5.2 one included (1.3.3), logged `noAdvance`.
328. Lake Ashi Monster (EBP02-039) is a continuous `playRankReduction` on other hand cards; reductions stack (Q36).
329. Burst's discard is a discard event (`from: "monster"`, `cause: "burst"`).
330. Joint Struggle: "differ in at least 1 trait" means different trait sets; with fewer than 2 cards they go to the discard pile.
331. `play.onePerZone` plays one card per adjacent zone (EBP02-028).
332. EBP02-079's "2" means 2 or more zones advanced by invasion.
333. Built-in custom handlers live in `packages/engine/src/customHandlers.ts` and register when the engine loads.
334. A `rage` effect whose delta is "for each" makes one change per counted card, each its own event (Q38).
335. Tokens are battle cards wherever battle cards are counted or checked (`isBattle`, Q39, 9.1.4.1).

Accepted by Monarch in the M12b-2 review (PR #38).

336. Token data is `packages/cards/data/tokens.json`, the base print of each Token in `cards.json` (a test keeps them equal), so the main cards entry never loads `cards.json` (decision 33). A token joins the game's card catalog the first time one appears.
337. Making a token works like an effect play: it enters its master's zones as a played card (its [enter] fires), never the monster's zone (Q5), empty zones first; with several possible zones, the master picks.
338. A token that would go to the discard pile or a deck disappears (9.1.4.2), logged `tokenGone`. Card conservation and the bot's determinizer leave tokens out.
339. Revenge expands into a trigger checked from the discard pile. Destroys move the cards before logging, so the event names the destroyed top card's discard instance id. Overload (11.5) doesn't trigger Revenge (Q17), and neither does a card that was under another (12.7.3).
340. E12 `counter` is the last effect of its ability; if it opens the next-monster choice, the resolution ends there and the choice continues the check timing.
341. E15 is `advance` with `by` as an amount, from an `advanced` trigger with a `cause` filter (`endPhase`, `invasion`, `effect`). The extra advances come from an effect, so EBP02-056 doesn't retrigger itself.
342. E21 covers only the 7.2.3 start-phase discard for EBP02-012: the optional replacement asks its master once per card, and the step waits and runs again with the answers (`state.replacementAsks`). A strategy card destroyed by an effect still goes to the discard pile, listed under "Engine gaps" in `docs/rules/rulings-to-confirm.md`.
343. `moveBattle` lets the effect's player pick the zone, also for the opponent's card (EBP02-057).
344. `addToHand` takes a count, for "up to 1".
345. Flag and play-rule checks (`hasFlag`, `counterProofAgainst`, `playAllowed`, `playRankReduction`) skip their scan when no active card has that kind of modifier, and Revenge's out-of-field check reads raw ability data. `pnpm bench --check` in CI fails if `applyAction` or `getLegalActions` is more than 50 % over `bench/baseline.json`.

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

Accepted by Monarch in the M12c-1 review (PRs #41 and #42).

359. Built-piece extensions for EBP03: `revealTop` by an amount with several picks in order; `chooseZone` limited to a zone set; the zone sets `horizontallyAdjacentTo` (adjacent, at another left-right position) and `ranksOf` (zones numbered like the bound cards' ranks).
360. "Play it on top of" a card (`play.onTop`) stacks the played card on that card (3.2.5), with no zone choice and no overload; with that card gone, nothing is played.
361. EBP03-074's monster play (Q27) is a `playMonster` effect: stacked on the invading monster, [enter] fires, no rage, and the turn's monster play is still there.
362. `placeUnder` asks which card to go under when there are several; a field card goes under alone and the cards under it stay in its zone.
363. EBP03-052's "would be destroyed by an opponent's effect, add all cards under this card to your hand" is a `destroyed` trigger (`underAs`) that returns them from the discard pile right after the destroy; a destroyed card's own "when destroyed" abilities trigger from its last known information (10.6.4.1.2).
364. "A card with [base] in play" is a strategy card with Base in your strategy zones.
365. Q40 (Paul, provisional): Space Beam's (EBP03-069) "a [mechagodzilla] card in zone 8" is your zone 8 only.
366. "Each player discards down to N" runs for the master first, then the opponent, each picking their own cards.
367. "Whenever you discard a battle card from your hand" (EBP03-015/016/017, EPR-020) counts every discard from your hand: costs, invasion and effects.

Accepted by Monarch in the M12c-2 review (PR #43).

368. Resonance failures use rule `12.8.2`, one per broken condition, naming the cards. Resonance colors are added to the rank I monster's for 6.1.1.3. Conditions are data: `every` card of a type has one of some traits or a minimum rank, or the deck holds `atLeast` N cards of a type.
369. `strategyZones` holds 2 or 3 zones. Strategy 3 shows on the mat in the corner past zone 8 only once a player has it; the "Illegal deck" badge moved one cell in. 8.3.2 then needs all 3 filled.
370. EBP03-004's alternative cost is an `invadeFromDeck` action. The milled card's invasion icon counts (8.6.1.1); it is once per turn together with the normal invade (8.6.2); it isn't a discard from the hand, so EBP03-015-style triggers don't fire.
371. EBP03-051's play on top is `playBattle` with `onTop: true`. The plain play into that zone (overload, 11.5) stays legal; ISMCTS keys the two apart.
372. C5 `countsAs` is an ability kind, not a selector flag. A count of monster cards in its owner's discard pile includes it if it passes the count's other filters (Q34); selecting monster cards never picks it.
373. A printed X (−1 in the card data) reads as 0, so the X comes only from the ability (EBP03-067, EBP04-031/032/047).
374. Fukuoka Tower (EBP03-076): "each monster or battle card in your zones 1-5 and 8" counts your battle cards there plus your invading monster when it stands in one of those zones.
375. Villain Tag Team (EBP03-078) destroys the rightmost first, then picks the leftmost among the cards left; ties at one position go to the effect's player (Q33).
376. A Base card's strategy mark reads "Base", and its tooltip says it stays at the start phase.
377. A mill is an undo boundary (a reveal), so a Casual undo can't take back cards that were seen.

Accepted by Monarch in the M12d-1 review (PR #44).

378. "Cannot be countered" (EBP04-031/032) is `counterProof` with no counter power limit; the monster doesn't move (as Q20).
379. EBP04-014's "this turn" counter-proof is a `grant`, fixed on the monster card at resolution and ended at 7.5.6.
380. "Whenever your opponent's effect causes you to discard cards" (EBP04-052) triggers once per effect, however many cards.
381. `cannotBeMovedByOpponent` (EBP04-076) stops the opponent's advances, retreats, vertical moves and moves as though countered; a counter, including one by an effect (Q24), still moves the monster.
382. `cannotDraw` (EBP04-030, "during the end phase") also stops effect draws in that phase.
383. "Any number whose ranks total 7 or less" (EBP04-024) picks one card at a time, offering only cards that still fit, until Done. "Starting with the lowest-numbered zone, one by one" (EBP04-035) takes each card from the lowest zone left; ties go to the chooser (Q33).
384. "You may play it in zone 8 instead" (EBP04-077) adds the card to the hand, revealed, then offers a play from there into zone 8. A card revealed into a hand stays revealed under its new id until the resolution ends.
385. EBP04-079 plays the revealed cards from the deck (empty zones first, Q3), so "played from the deck" triggers see them.
386. "You may destroy 4 ... If you do not, destroy this card" (EBP04-055) is a `chooseOne`; with fewer than 4 other green battle cards only "destroy this card" is left.
387. An opponent's "may discard 1 ... If they do" (EBP04-027) is an up-to-1 discard they pick.
388. "For every 5" counts at resolution, rounded down (EBP04-086); the Vultures in the discard pile count as green battle cards.
389. A card a search sends to the discard pile (EBP04-061) isn't a discard (5.7). The ManualPanel test and the e2e `manual` fixture use ESC01-003 (manual until M12f) since EBP04-037 has data (amends decision 308).

Accepted by Monarch in the M5h-1 review (PR #45).

390. Hotseat is removed until M9: `/play` is human vs bot, and P1 may be a bot to watch two bots (decision 193 stands). Only P1 can be human; P2 is always a bot. Saved settings keep known keys only, so `hotseatCover` and `confirmPass` drop quietly.
391. A record with two human seats, or with no `seats` (before M6d, which loads as two humans), is refused in `/play` with a pointer to `/debug`, which still loads it.
392. Search picks (5.8.1, 12.6.2) show no number badges; other card choices keep them. Location labels drop only when 2 or more options come from one place, so a single target keeps its zone label (decision 235).
393. Draws (1.2.2, loops) have their own `draw` lines in `gameOverLines.json`. `lossTimer` waits for the match clock. Between two bots the game-over modal speaks to P1.
394. Phase step hovers use the app's tooltip style, not a browser `title` (Monarch's change to M5h-1 decision 5).
395. The monster glow is a thinner ring than the mat's (2 px plus a 12 px blur), so it doesn't spill onto the next zone.
396. Every Pass asks "End Main and move to the Counter Phase?" (it replaced "Pass with playable cards left?" and its setting). "Show opponent's hand" is flagged in the record as `showOpponentHand`, and M11 statistics leave such games out.

Accepted by Monarch in the M5h-2 review (PR #46).

397. Log borders use one theme color for your lines and one for the opponent's, not the monsters' colors (they change during a game).
398. Log tag words come from `data-label` in CSS, so line text is unchanged. axe skips pseudo-element text, so a unit test checks every tag color against its text (4.5:1) in all three themes.
399. The app's tooltip is drawn at a fixed position in a top-level layer, so the scrolling log never clips it, and opens above the element near the window's bottom. Phase steps, rule numbers and public stacks share it.
400. Public stacks' "click to view" tip is one board-level tooltip for the innermost element with `data-view-tip`, set only while a click would open the stack viewer; a monster over a battle stack shows the monster's tip. It hides on a click and while dragging. Zone labels sit under the cards (Paul rolled back M5h-1's hover labels and the pile blanking), and the discard pile's top card previews.
401. The stack viewer opens on a click when no hand card is selected (a lit area still takes the action). Zone stacks open even with one card; strategy zones don't open.
402. An undo is recorded once per action taken back, with the log's wording kept at that time.
403. The rules parser starts a rule only at a number higher than the last one, so wrapped cross-references stay inside their rule. Tooltips cut a rule's text at 280 characters.
404. Plain words cover optional abilities, optional costs, optional replacements, Evolution, a "may" Revenge and an optional discard-down. A rank read from another card (ESD02-004) falls back to the printed text.
405. The invade arrow's step from zone 8 hops into the opponent's zone 8 (5.13.1.1.2) and stops there.
406. A token grows in or shrinks away in place. Hidden moves between piles fly as card backs. A card uncovered by a Burst discard gets no flight.
407. A deck name's full text shows under the new-game select only when it was cut.

Accepted by Monarch in the M5h-3 review (PR #47).

408. The fight card's deck names are the new-game picker's labels, stored in the record as `deckNames` (information only). Older records and the e2e fixtures read "Mystery Deck".
409. Fight-card names use the log colors for you and the opponent. "VS" is decorative (`aria-label="versus"`), so the axe check covers the names and the bot label, not the gradient.
410. The full deck name shows in the tooltip only when it was cut. Between two bots, P1 is "your" side and both sides show their bot level.
411. Selection modals show board numbers for field cards only: zone stack tops, the invading monster and strategy cards. Covered cards and other areas show the printed card.
412. Slam timing at Normal: lift 420 ms, slam 240 ms, crater 520 ms; Fast is half. It starts after the invade step's moves land, and input waits for it.
413. The slammed monster stays at 10° over the opponent's zone 8, its own place empty. The history view hides the slam; back to live, or a record loaded after the win, shows the end at once.
414. The cracks are seeded by the monster's instance id: 13 cracks, two broken rings and a shaded crater, in a theme crack color.
415. The loser's mat shakes during the first 60% of the crater time.
416. Every invasion win slams, the bot's win onto your zone 8 included; other wins don't.

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

Accepted by Monarch in the M12d-2 review (PR #50).

429. EBP04-010's replacement of the 7.2.4 rage reset is asked only when its 2 discards can be made (10.5.4.1); setting rage to 2 from higher counts as a decrease.
430. EBP04-012's monster deck card is named in the `playMonster` action (`underInstanceId`), one action per rank III card; it goes under the rank II card, logged with its id.
431. Kaizer Ghidorah's "a monster card with [monster-x] in your zones" is your invading Monster X monster card at any rank (Q23).
432. EBP04-045's cost play (`costCardInstanceId`) is offered only when the plain play can't be made, once per different paying card; its discard is logged as a cost.
433. A play rule's `onlyInZones` limits effect plays too.
434. A link (EBP04-067) is checked at every event; when it breaks, its card's ability goes into standby even if that card is gone, and destroys the linked cards still on the field as its master's effect. A zone-to-zone move breaks it.
435. EBP04-073 triggers once per card returned; "up to 1" offers Done with no separate yes/no.
436. Inherited Life's 15 / 22 / 30 effects run in order in one resolution, so one decrease can pass several; the count is lost if the card leaves its strategy zone (4.1.4).
437. `retrigger` logs its own event, and the [enter] abilities enter standby with it.
438. M3 needed no engine piece: `rank` modifiers that target hand cards are read by 8.3.1.

Accepted by Monarch in the CI speed review (PR #52).

439. CI runs as parallel jobs: lint + typecheck, unit tests, build + speed guard, stress, and E2E in 3 shards. A final job named `ci` needs them all and is the one check for branch protection.
440. Each job uses the composite action `.github/actions/setup`: Node from `.nvmrc`, pnpm through corepack, the pnpm store cached with `actions/cache` on the lockfile.
441. Each E2E shard uploads a blob report; the `E2E report` job merges them into one HTML report only when a shard fails.
442. The Playwright browser is cached per Playwright version; on a hit only `install-deps` runs.
443. Stress plays 200 games on a pull request and 1,000 on a push to main, seeded by the commit; the nightly run is unchanged.
444. A newer push to a pull request cancels its older CI run.

Accepted by Monarch in the Showa Poster review (PR #53).

445. Showa Poster is the default theme: the plain `:root` block, `index.html` and `DEFAULT_SETTINGS`; a saved theme still wins. It defines three palette names of its own (`--color-ink`, `--color-poster-red`, `--color-marigold`) for its header and fight card; every other token is shared by all four themes.
446. The header bar shows on the menu and `/play` (new game and board), not on `/debug`; it is 56 px, and the board's height and card size leave room for it.
447. The mats' frame counts in the card size (`--mat-frame`), so Showa's cards are a few pixels smaller than Grey's.
448. The counter power bar shows up to 1.5 times the threat, with the threat line two thirds along; with a threat of 0 the marker is at the start, and any counter power fills it.
449. Button fonts change only in Showa; the other themes keep the browser's button font (a custom property can't hold `revert`).
450. The turn glow replaces the mat's offset shadow while it shows.
451. Showa's log tags are white text on red, ink, brown, sea, burnt orange and dark gold, each at 4.5:1 or more. Its card backs are dark red stripes (backs aren't card frames).
452. Fonts are bundled with `@fontsource` 5.3.0 (Dela Gothic One, Zen Kaku Gothic New 400/500/700/900) as unicode-range chunks; a page downloads a font only when its theme uses it.
453. Showa's form controls (selects, text fields, file pickers, textareas, and buttons with no class or with `data-control`) take Zen Kaku Gothic New, a 2 px ink border, the panel fill and a 4 px radius, at least 44 px tall for buttons and selects; `data-primary` actions (Start, Import deck) are marigold; radios, checkboxes and sliders use the poster red accent. The rules sit in `:where()`, so classed controls keep their look.
454. A yes/no prompt's card text takes the prompt's width (it was capped at two card widths for order modals, in every theme).
455. The bot-move toast e2e test accepts any bot action toast with a lit destination, since a timed bot search may invade or gain rage instead of playing a card.

Accepted by Monarch in the bot hand row review (PR #54).

456. The bot's hand row uses half-size cards, as the old row did (decision 212), so the draw animation's pile size is unchanged.
457. The row starts at the left edge of the space left of the bot's mat, which ends 8 px before the mat; the bot's mat row is a three-column grid, so both mats stay centered and aligned.
458. In count mode with the hand shown, the one card is the first card face up with the count; hovering still fans all of them.
459. A card an effect revealed shows face up in the row and previews on hover; without "Show opponent's hand" the row never fans.
460. The fan is a panel from the row's top-left corner over the board, wrapping within the board's width, below flights, the preview and modals.
461. Rage zone text keeps its font sizes; its box grows with the cards.

Accepted by Monarch in the CI fixes review (PR #55).

462. The e2e shards run in Microsoft's Playwright image (`mcr.microsoft.com/playwright:v<version>-noble`, `--user 1001`), so nothing installs from Ubuntu's apt mirror; the browser cache and install steps (decision 442) are gone. It costs about 25 s on a good run and removes the 6 to 10 minute tail.
463. The image tag must match the lockfile's Playwright version; `apps/web/src/playwrightImage.test.ts` checks it, so it also runs locally with `pnpm test`.
464. The nightly stress test runs two jobs side by side: uniform 10,000 games (60 min timeout) and weighted 4,500 games (90 min timeout). The weighted count is sized from the runner's rate (about 78 games a minute) to finish in about 60 min; past 75 min, it is lowered.
465. Decision 123's single 120-minute nightly timeout is replaced by each job's own timeout.

Accepted by Monarch in the new-game screen review (PR #56).

466. Seat (P1's Human / Bot select, or P2's "Seat: Bot") sits in each seat's header, so every seat takes two lines: the deck with Randomize, then the bot level.
467. Randomize picks from what the development-deck filter shows (legal decks only in a Tournament game), avoids the current deck when there is another, and uses `Math.random`, never the game seed. Every Casual ↔ Tournament switch resets P1 to ESD01 and P2 to ESD02 (replacing decision 347's "doesn't change by itself").
468. Import deck, Export all and Import backup stay visible while My decks is collapsed; saving or restoring a deck opens the list.
469. Import backup is a button that opens a hidden file picker, so it looks like its neighbors in every theme.
470. The development-deck filter sits beside the new-game title.
471. "Show opponent's hand"'s note reads "(practice: no statistics)".

Accepted by Monarch in the card back border and bottom-edge hand review (PR #57).

472. Card backs are drawn in CSS in every theme (there is no back image), so the white border (3 % of the back's width, inside its box) is CSS, with a 1 px outline outside it in every theme (`--color-card-back-outline`), since Showa's paper and Light hide white.
473. A selected, raised hand card lets clicks through to the zones under it; clicking its place in the row still cancels the selection.
474. A pointer click doesn't leave focus on a hand card, so Esc lowers it (a focused card stays raised by `:focus-visible`).
475. The bot's half-size row shows a sixth of each next card and may use the board's 16 px left padding, never the mat: 3 / 5 / 17 cards fit at 1280 / 1440 / 1920 before the count card.
476. Your hand row has no panel: the cards are the row.
477. A raised hand card's bottom sits exactly on the window's bottom edge, with no gap.
478. Each hand card has a strip over its visible part of the row, stacked above any raised card, so a raised card never takes a neighbor's strip; above the row, the raised image keeps its card hovered.
