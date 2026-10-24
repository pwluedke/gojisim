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
