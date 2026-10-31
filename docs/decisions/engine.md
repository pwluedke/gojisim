# Decisions: Engine and rules

Accepted decisions about `packages/engine`, the ability data in `packages/cards/data/abilities/`, and rulings, numbered as they were in CLAUDE.md. New ones go at the end of the file that fits (docs/decisions/README.md).

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

Accepted by Monarch in the M12f review (PR #61).

503. ESC01-001's discard of a [godzilla] card is a play cost like EBP04-045's (`costCardInstanceId`): offered only when the plain play is too high, one action per paying card, and any card type with the Godzilla trait can pay.
504. ESC01-001's "place this card on the bottom of your deck" after a counter takes its whole stack; the cards under it go to the discard pile (decision 152).
505. ESC01-002: the card played from the discard pile stays when its Evolution search finds nothing (5.8.1.2); with no such card in the discard pile nothing happens.
506. ESC01-003's conditions (zone 8, an invasion this turn) are checked when it resolves (decision 126); "invaded this turn" is the invade action, EBP03-004's invasion from the deck included.
507. ESC01-005 reads the milled card's printed rank (a monster card's I–IV counts as 1–4); an empty deck mills nothing, so nothing is destroyed.
508. ESC01-006's "you may discard your entire hand" is an optional ability whose first effect is the discard (not a cost), since the rage counts the cards "discarded by this effect"; with an empty hand Yes does nothing.
509. The manual-card web tests (the ManualPanel test and the e2e `manual` fixture) moved from ESC01-003 to FC01-003, manual until M12g (amends decision 389); M12g needs a test-only manual card for them.
510. Plain words word a rage change "for each" card an earlier effect bound ("…increase your rage by 1 for each strategy card among them").

Accepted by Monarch in the M12g review (PR #62).

511. FC01-001's +10,000 total counter power has no turn gate; a total counter power bonus only matters in its master's own counter phase.
512. FC01-003's "search your deck for one battle card" is `exact 1`, and like every search it may find nothing (decision 139).
513. FC01-004 counts the battle cards in the opponent's zones by stack top (tokens included, Q39); covered cards don't count.
514. FC01-005's "During your counter phase, discard all cards in your hand" fires once, at the beginning of your counter phase (mandatory); its monster-play trigger also fires on Burst plays and on the next monster after a counter in your turn (decision 155).
515. FC01-006 is active on the opponent's turn only, read at the destroy; crush and overload still destroy (Q35).
516. When one destroy takes several cards, every card's "cannot be destroyed by your opponent's effects" is read before any of them leaves (5.12), for every card with that flag.
517. `/debug` imports are labelled with `deckName` and grouped by `[deck]` folder; imports with no folder come first, then each folder in name order, after the other groups. Keys stay `imported:<index>`.
518. "No entry means manual" uses RAGE-E01; every card with text (388 in scope plus 5 tokens) is implemented, and tests that need a manual window use `MANUAL_TEST_CARD`.

Accepted by Monarch in the community rulings review (PR #69).

582. EBP04-079 uses the existing `onePerZone` play flag with no `preferEmpty`. The Q3 empty-zones-first rule stays for every other effect play.
583. "Play simultaneously" is met by choosing every zone before placing any card (decision 143); the [enter] abilities enter standby at each card's place event and resolve after all are placed.
584. Q270 applies through `playAllowed` to every play: hand, effect play, play on top, Evolution and token. An Evolution with nothing it can play still searches and shuffles (finding nothing, 5.8.1.2) rather than being skipped.
585. Making the token's catalog entry moved before the zone check, so a token that can't be placed anywhere still joins the catalog (unused).
586. Battra's ruling is numbered Q43 (Q42 is hidden decklists), as Monarch accepted.
587. The planner never pairs a card the log put on the deck bottom with a copy that turned up elsewhere in the same step.

Accepted by Monarch in the Space Beam review (PR #103).

609. Q44 (Paul, provisional): Space Beam's (EBP03-069) "a [mechagodzilla] card in zone 8" counts any Mechagodzilla card in your zone 8, your invading monster included; Q40 is unchanged.
610. The deckGuess `knowsDecklists` test has a 30 s timeout: it takes about 6 s on the CI runner, and main's CI failed on it from #70 to #101.

Accepted by Monarch in the Frozen replacement crash review (PR #110).

611. Stress has P1 confirm single options in every game (P2 never does), so pauses that only a human seat produces are played.
612. A `play` pick is private when any candidate is in a deck or hand, whatever the `from`.
613. A step's replacement ask is worded "applies / doesn't apply <card>'s replacement to <card>" in the log and announcements.

Accepted by Monarch in the Q45 monster-in-zones review (PR #113).

619. Q45 (Paul, provisional): Gigan (1972) (EBP02-064) and M.O.G.U.E.R.A. (EBP02-067) count an invading monster with the trait standing in its master's zones, like a battle card. No other "a card ... in your / their zones" condition changes: the rest name cards that exist only as battle cards or tokens.
