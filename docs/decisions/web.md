# Decisions: Web app

Accepted decisions about `apps/web`: `/play`, `/debug`, themes, animations, sounds and announcements, numbered as they were in CLAUDE.md. New ones go at the end of the file that fits (docs/decisions/README.md).

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

Accepted by Monarch in the First / Second pick modal review (PR #58).

479. The board under the pick modal is the 6.3.1.4 board (`prePickSession`): decks shuffled in place, no hands, no invading monsters, an empty log, no pending choice, and "Setup" in the prompt and phase panels, so nothing tells who goes first. Card 0's game tells which card reads First; the pick then builds the game with the picked card, as before.
480. The modal keeps the pick's face-down cards and First / Second faces, with the 1 / 2 and Space keys.
481. Casual games show a one-line hint about the peek key (Cmd on a Mac, Ctrl elsewhere); Tournament games show none.
482. The peek ends on key release or when the window loses focus; a card picked while peeking counts as peeked.
483. `firstPickPeeked` is an optional, information-only record field (like `showOpponentHand`, M11 leaves such games out); the board's root shows both flags as `data-first-pick-peeked` and `data-show-opponent-hand`.
484. An empty bot hand is a half-size slot outlined like an empty pile, with the 0 count badge.
485. The bot hand's count badge holds the hand size from before the step while any card of the step flies (`heldCounts` from the animation hook), since one step's moves animate together (decision 257).

Accepted by Monarch in the Tester fixes 1 review (PR #63).

519. The official images are `<name>.webp` and `<name>-thumb.webp` (`first-1`, `first-2`, `second-1`, `second-2`, `back`); the board and the pick use the 300 px thumbs. `pnpm official-images` (also the end of `pnpm images`) converts them from the gitignored `public/cards/official-src/`; the volume copy excludes that folder.
520. The back image switches on through a one-time load check (`data-card-back="image"` on `<html>`), with no drawn border or outline in any theme; without the image the drawn back is the fallback.
521. `/debug`'s plain board keeps its drawn backs (decision 190).
522. The First and Second fronts are picked independently from one FNV hash of the game's seed (bit 0 and bit 1), never from the game's RNG.
523. Face-down pick cards show the back image with the key number low on the card.
524. A pick of 2 or more cards selects, then Confirms (`multiPick`); picks whose options depend on earlier picks stay one card at a time: ordered destroys (X), rank totals, and "exactly N" read from the game.
525. Done is disabled while cards are selected (Confirm sends them); with none selected it works as before.
526. "Show whole deck" starts off; the searched deck is listed by card number, the matching cards pickable and the rest dimmed.
527. Esc while viewing the board only returns to the modal; Esc in the modal clears a selection before anything else.
528. Zone choices (a banner, with the board already visible) get no View board.
529. Hovering a card in a modal shows the preview over the modal's top right, covering View board while the hover lasts.

Accepted by Monarch in the bot announcements review (PR #66).

553. A choice's announcement is its main public result, in this order: evolve, search, next monster, destroy, a played card, discard, move, add to hand; otherwise the choice itself. A private choice with none of those reads "Bot makes a choice". Hand actions name only the card they play or discard.
554. Announcements call the bot "Bot" against a human and "Bot P1" / "Bot P2" between two bots; cards are "your" (the human's), "its" (the actor's own) or "Bot P2's".
555. `ANNOUNCED_KINDS` is a JSON file (`apps/web/src/game/announcedKinds.json`) of 21 kinds; a kind left out shows nothing, and the bot doesn't wait for it.
556. A line's time starts when it shows, alongside the move's animation; the bot's next decision starts once both are done, and the Bot delay setting still applies after that.
557. A line holds the bot through both `pause` (no new decision starts) and `hold` (a reply already in flight waits).
558. Choice, search, combo and game-over modals wait for the line, so the bot's winning move is announced first.
559. With Confirm, Space dismisses the line before anything else, even with a combo or game-over modal waiting; not while a Bad Bot! or Report bug popup is open.
560. A loaded record's actions are not announced; after an undo, the next action at that index is.
561. The landing-zone highlight (decision 221) stays with announcements on; only the toast is replaced.
562. Turning Announce bot plays off clears the queued lines at once.
563. The bot's next monster is announced only when the bot chooses among 2 or more; a single candidate is placed during the human's step (5.15.1.2).
564. A zone choice renders in the Prompt panel through the same `ChoiceModal` (number keys, Done, Undo), with "Your zone N" / "Bot's zone N" buttons; every other choice kind stays a modal.
565. Report bug sends on Send; a failed send, or sharing off (the button then reads Download), downloads the file. Bad Bot! with sharing off still points to Report bug.
566. The records cap (1 GB, 1024³ bytes) includes the incoming record: total + body > cap answers 507, logged once while full. Two uploads at the same moment can pass it by a record or two; a restart re-reads the folder.
567. EBP01-023's Weapon trait is a per-card override in `overrides.json` (trait-spellings.json renames a trait everywhere); `cards.json` was edited for those two prints, with no re-scrape.
568. #65's release-notes date is Paul's local date (2026-10-28 CDT; it merged 2026-10-29 01:03 UTC).

Accepted by Monarch in the sound effects review (PR #71).

588. Sources: Kenney's site blocks scripted downloads, so every pack came from its OpenGameArt copy (same CC0 packs), each page's license checked.
589. Sounds were chosen by name, length and a rough pitch check (zero crossings), not by ear: win is a rising jingle (SAX02), loss a falling one (SAX01). Swapping is a `sounds.json` change.
590. Evolution and the slam crash are each one mixed file (thud + roar, slam + explosion), rather than two sounds played together.
591. Card, monster, strategy and evolve sounds wait for the move to land; destroy, counter, rage, draw and shuffle play when the step's moves start (the shards explode then).
592. Repeats in one step are spaced (stomps 180 ms, destroys 50 ms) so the 80 ms throttle lets a few through instead of one.
593. A game counts as loaded when its record has actions at start; a loaded record's choice gets no chime and its end no stinger.
594. The first `pointerdown` anywhere unlocks audio (Start or the First / Second pick in practice); a sound cued at that very moment is lost, since its file is still loading.
595. The Volume slider is disabled while Sound is off; M toggles the same Sound setting.

Accepted by Monarch in the card sounds review (PR #112).

617. A card sound replaces only the event the issue lists for that card (play, activation, monster placement, token made). Evolution keeps its own sound.
618. Volume is 0.9 for the two monster cards and 0.8 for the rest, matching the generic monster (0.9), card and strategy (0.8) sounds they replace.

Accepted by Monarch in the Showa sizing review (PR #114).

620. Decision 453 is amended: Showa's 44 px controls are for the new-game screen only. On the board, controls take the other themes' sizes with a 1 px ink border.
621. On the board, Showa's buttons use the body font in bold (Dela Gothic One stays for headings, the fight card and the new-game screen's primary actions).
622. The mat's Illegal deck badge shows a reason count. The reasons are its tooltip (decision 349's wording is unchanged in the tooltip and on the new-game screen).
623. The expanded hand overlay sits above the Test Site panel.
624. Not changed: Showa's cards stay a little smaller than the other themes', since the header bar takes 56 px (decisions 446 and 447). The parity test compares the mats only for fit, not size.
