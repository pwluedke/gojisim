# GojiSim Rules Spec (Comprehensive Rules v1.2)

Approved by Paul, Oct 21, 2026. Source: `docs/rules/comprehensive-rules-v1.2.txt`.

## Scope

The engine enforces every rule in Comprehensive Rules v1.2 (May 27, 2026). Card abilities arrive in M4; until then, any effect the engine doesn't model is resolved by hand with manual override actions.

| Layer | Enforced by | Milestone |
| --- | --- | --- |
| Setup, phases, draws, rage, advance, invasion, counter, win/loss, rule actions (sections 1, 3 to 8, 11) | Engine | M3 |
| Ability framework: automatic and continuous abilities, check timing, standby, effect layers, replacement effects (section 10) | Engine | M3 (framework), M4 (card data) |
| Keyword abilities: Enter, When invading, Awakening, Burst, Evolution, Revenge, Resonance, Base (section 12) | Engine | M4 |
| Effects of individual cards | Data-driven ability definitions | M4 (starters), M12 (all sets) |
| Effects not yet coded | Manual override actions, logged | M4 onward |
| Deck construction (6.1) | Deck validator in `@gojisim/cards` | M8 (uses M1c data) |

**Citation rule.** Tests cite the rule number as printed in the rule body. The rules text has a numbering defect:

- The table of contents lists sections 9 to 12. The body has a new section 9 (Special Card Procedures, tokens), so the later sections shift up by one: 10 is Playing and Resolving, 11 is Rule Actions, 12 is Keywords, 13 is Miscellaneous.
- Cross-references inside the text still use the old numbers. For example, "check timing (9.4.1)" means 10.4.1, and "interrupt type (10.1.2)" means 11.1.2.
- This spec uses body numbers throughout.

## Game state model

Each player has 8 zones, 2 strategy zones and 5 card areas; the players share one resolution area. A monster moves through its own zones 1 to 8, and it invades from its zone 8 into the opponent's zone 8.

| Area | Rule | Visibility | Order kept | Holds |
| --- | --- | --- | --- | --- |
| Zones 1 to 8 | 4.4 | Public | No | At most 1 battle card stack per zone (11.5); the invading monster's position |
| Strategy zones x2 | 4.5 | Public | No | At most 1 strategy card each (11.5), plus the turn it was placed (7.2.3) |
| Monster deck zone | 4.6 | Hidden from opponent | No | The 4 monster cards not yet played |
| Invading monster zone | 4.7 | Public | No | The invading monster stack (3.3); the top card is the active monster (3.2.3.1) |
| Deck | 4.8 | Hidden from both | Yes | Main deck; cards leave it one at a time (4.8.3) |
| Hand | 4.9 | Hidden from opponent | No | |
| Discard pile | 4.10 | Public | No | |
| Resolution area (shared) | 4.11 | Public | No | A card or ability while it resolves |

**Zone geometry (4.4.5).** The engine needs these relations for card effects:

- In front / behind: 8 is in front of 3, 7 in front of 4, 6 in front of 5. A countered monster in 6, 7 or 8 moves to the zone behind: 5, 4 or 3 (5.15.1.1).
- Adjacent: zone numbers differ by 1, or one zone is in front of the other, or it is my zone 8 and the opponent's zone 8.
- Before / beyond: lower / higher zone numbers. Each zone counts as before and beyond itself (4.4.5.3.1).
- Same column: my 1 with opponent 5 and 6; my 2 with opponent 4 and 7; my 3 and 8 with opponent 3 and 8.
- Left to right from the owner's view: 1, 2, {3, 8}, {4, 7}, {5, 6}. Zones inside one pair have no left-right relation. For the opponent's zones the direction flips (4.4.5.5.2).

**Per-player values.** Rage (3.4): an integer, minimum 0. The monster's threat is printed threat + 5,000 x rage (3.4.5).

**Per-game values.** Turn number, turn player, phase, whether this turn's invasion is used (8.6.2), whether this turn's monster play is used (Paul's ruling), automatic abilities in standby (10.6.2), continuous effects with timestamps (10.8.1.7), seeded RNG, action log.

**Hidden information.** The server sends each player and spectator a filtered view. A player sees their own hand and their own monster deck. Nobody sees deck order. Everyone sees the card count of every area (4.1.2.2).

**Stacks (3.2).** A stack counts as one card, and only the top card's information is read unless an effect says otherwise. A card newly placed on top counts as a different card (3.2.5). A whole stack moves together (3.2.4).

**Card identity on move (4.1.4).** A card that moves to another area, other than a zone-to-zone move, becomes a new object, and effects applied to it before the move stop applying. The engine gives each card a fresh instance id on each such move.

## Deck construction and setup

A legal deck has 54 cards: a 4-card monster deck (one each of ranks I to IV) and a 50-card main deck.

**Deck validator checks (6.1.1)**

| Rule | Check | Data used |
| --- | --- | --- |
| 6.1.1.1 | Monster deck: exactly 4 Monster cards, one each of rank 1, 2, 3, 4 | `type`, `rank` |
| 6.1.1.2 | Main deck: exactly 50 cards. Monster cards are allowed (6.1.1.2.1) | count |
| 6.1.1.2.2 | Main deck holds at most 10 cards with invasion icon 2 | `invadeZones` |
| 6.1.1.3 | Every card in both decks is White or includes a color of the rank I monster (a multi-color card passes if any of its colors matches; Paul's ruling) | `colors` |
| 6.1.1.4 | At most 4 copies per card number, counted across both decks. `+` is ignored (6.1.1.4.1) | `deckCardNumber` |
| 6.1.1.5 | No card with the Token trait | `traits` |
| Restriction lists | Copies at most `getMaxCopies(deckCardNumber, date)`; at most one card from each choice-restriction group | M1c data |
| 6.1.2, 12.8 | Resonance (rank I monster) changes the color rule and adds a condition list. Applied as a replacement for the checks above | M4 ability data |

The validator returns every failed check with its rule number, not only the first one.

**Setup (6.3.1), in order**

1. Both players present their decks (6.3.1.1). GojiSim validates both decks and shows each player a warning that lists every failed check, with its rule number. An illegal deck can still be used (Paul's ruling, Oct 21, 2026).
2. Each player places their monster deck in the monster deck zone (6.3.1.2).
3. Each player shuffles their main deck into the deck area (6.3.1.3). Uses the seeded RNG.
4. A random first player (6.3.1.4), from the seeded RNG.
5. Each player moves the top 5 cards of their deck to their hand (6.3.1.5).
6. Each player makes their rank I monster the invading monster in Zone 1 (6.3.1.6, 6.3.1.6.1).
7. Rage is set to 0 for both (6.3.1.7).

No mulligan and no first-turn restriction (Paul's ruling). On turn 1 the first player draws 1 card in the start phase, because the opponent's monster is rank I (7.2.2).

## Turn structure

Every turn runs Start, Main, Counter and End in that order (7.1.2). The main phase is the only one where the turn player chooses actions; the other three run automatically, apart from choices inside abilities.

**Start phase (7.2)**
1. 7.2.1 Trigger: beginning of start phase. Check timing.
2. 7.2.2 Draw cards equal to the rank of the opponent's monster.
3. 7.2.3 Strategy cards placed before this turn go to the discard pile (not Base, 12.9).
4. 7.2.4 Own rage set to 0.
5. 7.2.5 Check timing.

**Main phase (7.3)**
1. 7.3.1 Trigger: beginning of main phase. Check timing.
2. 7.3.2 Play timing, repeated until the player passes: battle (8.2), strategy (8.3), rage (8.4), monster (8.5), invade (8.6).

**Counter phase (7.4)**
1. 7.4.1 Trigger: beginning of counter phase. Check timing.
2. 7.4.2 Add the counter power of own battle cards in zones (skip cannot-engage, 5.16).
3. 7.4.3 Total at least the opponent's threat: counter (5.15).
4. 7.4.4 Check timing.

**End phase (7.5)**
1. 7.5.1 Trigger: beginning of end phase. Check timing.
2. 7.5.2 Monster in zone 7 or lower advances 1. 7.5.3 Check timing.
3. 7.5.4 Draw up to 5 cards in hand. 7.5.5 Check timing.
4. 7.5.6 Until-end-of-turn effects expire.
5. 7.5.7 Anything new to resolve: back to 7.5.4. Otherwise the turn ends and the opponent becomes turn player.

The non-turn player gets no play timing. They make choices only when an ability or rule asks them to (1.3.4, 10.4.3.3).

**Engine phase states:** `start`, `main`, `counter`, `end`. Each step above is a separate engine step so tests can stop between steps. A check timing (10.4.3) runs at every point the rules name one.

## Actions

`getLegalActions()` in the main phase returns these 5 action types plus `pass`. Invasion (8.6.2) and playing a monster card (Paul's ruling) are each limited to once per turn.

| Action | Rule | Legal when | Result |
| --- | --- | --- | --- |
| Play a battle card | 8.2.1, 10.5.2.1.2 | Battle card in hand with rank at most the zone number of the opponent's monster | Placed in one of the player's zones that their own monster does not occupy. A zone already holding a battle card: the new card stays, the old one is destroyed (11.5) |
| Activate a strategy card | 8.3.1, 8.3.2 | Strategy card in hand with rank at most the zone number of the player's own monster, and a strategy zone is empty | Placed in a strategy zone; its text resolves as an automatic ability on placement (10.1.1.1.2) |
| Gain rage | 8.4.1 | A monster card in hand | Discard it; rage +1. No per-turn limit |
| Play a monster card | 8.5.1, 8.5.1.1 | Not yet done this turn (Paul's ruling). Monster card in hand with rank equal to the current monster's rank and sharing at least one trait. A card with Burst (12.5) can be played as though its rank were the Burst rank, then goes to the discard pile at the start of its master's next end phase | Stacked on top of the invading monster; rage +1. The monster keeps its position |
| Invade | 8.6.1, 8.6.2 | Any card in hand; not yet used this turn | Discard it, then advance once per point of its invasion icon |
| Pass | 10.4.4.3 | Always | Main phase ends |

GojiSim plays a card the same way for every type (10.5.2): announce it, move it to the resolution area, make its choices, resolve it.

**Advance and retreat (5.13)**

- Advance moves the monster to the zone number +1. From zone 8, it wins only if the advance is part of an invasion and the opponent's zone 8 holds no battle card (5.13.1.1.2); otherwise it stays put (5.13.1.1.1).
- "Advance to zone N" does nothing if the monster is already beyond N (5.13.1.2.1). Otherwise it advances step by step, and each step counts as one advance.
- Retreat moves to zone number -1. In zone 1 nothing happens (5.13.2.1).
- A monster that ends where it started has not advanced or retreated (5.13.3). This matters for When invading triggers (12.3.2.1).
- End phase: a monster in zone 7 or lower advances 1 (7.5.2). In zone 8 it stays.

**Counter (5.15, 7.4)**

1. Total = the sum of counter power of the turn player's battle cards in zones, excluding cards that cannot engage (5.16). Monster cards in zones add nothing (7.4.2.1).
2. Total at least the opponent's threat (printed + 5,000 x rage): counter. A tie counts as a counter (7.4.3).
3. The countered monster in zone 6, 7 or 8 moves behind to 5, 4 or 3 (5.15.1.1). It keeps its position in zones 1 to 5.
4. Its master chooses a monster from their monster deck that shares a trait with the current monster and is one rank higher, and stacks it on top (5.15.1.2).
5. No such card exists: that player loses (5.15.1.2.1). Countering a rank IV monster always ends the game, so the 4th counter wins.

**Rage (3.4).** Rage goes up by 1 when a monster is played (8.5.1.1) or a monster card is discarded for rage (8.4.1). It resets to 0 at the start of its owner's turn (7.2.4). It never goes below 0 (3.4.4). Rage stays through the opponent's turn, which is when the threat bonus matters.

**Crush and destroy (11.3).** A battle card in the same zone as an invading monster is destroyed at once. Advancing your monster into your own battle card destroys that card.

## Win, loss and rule processing

The game ends the instant a player wins or loses (1.2.1); the engine stops processing and records the result and reason.

| Result | Rule | Trigger |
| --- | --- | --- |
| Victory through invasion | 5.13.1.1.2 | Monster in zone 8 advances during an invasion and the opponent's zone 8 has no battle card |
| Victory through countering | 5.15.1.2.1 | The countered player has no legal next monster in their monster deck |
| Concession | 1.2.3 | Either player, any time, including during the opponent's turn, with a confirm step. Immediate; no check timing; no effect can stop it |
| Card effect win/loss | 1.2.4 | Resolves immediately, without a check timing |
| Draw | 1.2.2, 13.1.1.3 | Both players lose at once, or an infinite loop neither player can stop |
| Match clock | Floor Rules 4.2 | Optional 30-minute clock. For now it reaches zero and nothing else happens (Paul's ruling) |

**Check timing (10.4.3)**

1. Resolve all pending rule actions together. Repeat until none are left.
2. If the turn player has automatic abilities in standby, they choose one, play and resolve it, then go back to step 1.
3. Otherwise, if the non-turn player has abilities in standby, they choose one, play and resolve it, then go back to step 1.
4. The check timing ends.

Playing abilities in standby is compulsory; only the order is chosen (10.6.3.1).

**Rule actions (11)**

| Rule action | Type | Rule | Condition | Result |
| --- | --- | --- | --- | --- |
| Reshuffle | Interrupt | 11.2 | A draw from an empty deck | Discard pile becomes the deck and is shuffled; the draw continues. Empty discard pile: nothing happens |
| Crush and destroy | Interrupt | 11.3 | A battle card shares a zone with an invading monster | The battle card is destroyed |
| Illegal cards | Check timing | 11.4 | A strategy card in a zone, a stray monster card in a zone, a non-strategy card in a strategy zone, or a leftover card in the resolution area | Card goes to its owner's discard pile |
| Overloaded | Check timing | 11.5 | 2 or more battle cards in one zone, or 2 or more strategy cards in one strategy zone | Keep the last placed, destroy the rest |

Interrupt rule actions run immediately, even in the middle of another process (11.1.2.1). Check-timing rule actions run only if their condition still holds at the check timing (11.1.2.2).

**Infinite loops (13.1).** The engine detects a loop when the same game state repeats within one turn with no new player choice. It applies 13.1.1.2 (the turn player can't repeat an identical-state action) and declares a draw only when neither player can stop the loop. On detection the engine writes a loop report file: seed, both decks, the full action log, and the game state at detection, for Paul to review. The loop-count negotiation in 13.1.1.1 stays manual.

## Abilities and effects

The M3 engine must include the framework below, so that M4 adds card abilities as data, not code.

**Ability types (10.1)**

- Automatic: "When / Whenever (condition), (effect)". Enters standby each time its trigger fires (10.6.2.1) and resolves at the next check timing. Kinds: area-changing trigger (10.6.4), timed trigger (10.6.5, fires once unless stated), situation trigger (10.6.6, re-arms after resolving).
- Continuous: everything else. Never played; always applied while active (10.5.1).
- Strategy card text is an automatic ability: "when this card is placed in the strategy zone" (10.1.1.1.2).

**When an ability is active (10.3.4)**

- Monster and battle cards: while in a zone (the invading monster counts as in its zone, 3.3.3.2).
- Strategy cards: while in a strategy zone.
- Abilities that name an area or situation: active there.
- A card stacked under another card has no active abilities (3.2.3.1, 12.7.3).

**Effect types (10.2)**

- One-shot: does its instructions once (10.7).
- Continuous: lasts for a duration; "until end of turn" ends at 7.5.6.
- Replacement: "when A, B instead". The original event never happened (10.9.1.1). Each replacement applies at most once per event; the affected player orders multiple replacements (10.9.2).

**Information layers (10.8.1).** When reading a card's values, apply in this order:

1. Printed values (after errata, M1c).
2. Effects that grant, remove, activate or nullify abilities.
3. Continuous effects that don't change numbers.
4. Rage: +5,000 threat per point.
5. Continuous effects that change numbers.
6. Within a layer: dependency first (10.8.1.6), then timestamp order (10.8.1.7).

**Resolution details the engine must get right**

| Rule | Behavior |
| --- | --- |
| 1.3.1 | Card text beats the rules |
| 1.3.2, 1.3.2.2 | Do what is possible. A count of 0 or less does nothing; no reverse action |
| 1.3.3 | A restriction beats an instruction |
| 1.3.4 | Simultaneous choices: the active player chooses first; hidden-card choices are revealed after both choose |
| 10.5.3 | Targets: choose as many as possible up to the number. "Up to" allows 0. No legal target: effects on targets are skipped |
| 10.5.4 | "You may A to B": B happens only if A was done in full |
| 10.5.2.2.1 | "Do N from the below": pick N options, resolve them top to bottom |
| 10.5.2.3.3 | An automatic ability resolves even if its card has left its area |
| 10.10 | Card left the area during resolution: use its last known information |
| 4.1.2.3, 5.8.1.2 | Searching a hidden area for cards with given properties may legally find nothing, even if a match exists |
| 9.1 | Tokens: treated as cards, exist only in zones (battle tokens), disappear if moved elsewhere |
| 5.17, 12.6 | Evolve: the new battle card is stacked on top of the old one |

**M4 engine changes** (`docs/abilities/format.md`, "Engine changes for M4"):

- Ability loader (format.md change 1): card abilities are data in `packages/cards/data/abilities/<SET>.json`, validated with Zod (`packages/cards/src/abilities.ts`) on first use and in CI. A card with no entry is `manual` and its abilities don't run. The M3d code registry is test-only.
- Interpreter (format.md change 2, 10.5): `packages/engine/src/interpreter.ts` matches triggers on engine events, evaluates conditions and selectors, runs effects in order and binds `as` names for one resolution. A target or zone choice pauses the resolution (`state.resolution`) until the player chooses. Effects not built yet throw `not implemented: <effect>`.
- Gates (format.md change 3, Q7, Q9, 10.3.2): turn and Awakening gates are checked when a trigger matches, again when the ability resolves, and before each of its effects. A closed gate ends the resolution. The ability's condition is checked when it resolves.
- Strategy cards (format.md change 5, Q10): a card with ability data declares its own trigger (`placedInStrategyZone` when its text has none). Only cards without data still log `strategyTextPending`.
- Layers (format.md change 8, 10.8.1): `getCounterPower(card)`, `getRank(card)` and `getThreat` read printed values, then continuous modifiers. 7.4.2 totals `getCounterPower` plus `totalCounterPower` modifiers; 8.2.1 and 8.3.1 compare `getRank`.
- Hand and deck effects (format.md build plan item 2): `discard` (the chooser picks), `discardDownTo` (that player picks the cards to discard until the hand is down to the size, 5.7.2, Paul's ruling; a hand at or below the size is untouched, 5.7.2.1), `search` (the whole deck, may find nothing, 4.1.2.3, 5.8.1.2; its own effects run on the found cards), `play` from the deck, discard pile or a bound card (zones per 5.11.1.1 to 5.11.1.3; `ignoreRankLimit` defaults to true, since 8.2.1 limits only the main phase action; `asManyAsPossible` and `preferEmpty`, Q3), `addToHand` and `shuffle`. A card played by an effect triggers [enter].
- Costs and optional abilities (Q2, 10.5.4): an optional cost asks the player first; a cost that can't be paid in full, or is declined, stops the effects. `optional: true` asks "use this ability?" before resolving it. Choices of hidden cards (a hand, a searched deck) show their options only to the chooser.
- When invading (format.md change 6, Q4, 12.3.2.1): fires once per advance step of an invasion, only when the monster moved; the step that wins the game ends it first (1.2.1).
- Revealed cards (format.md change 9, 5.10): `getPlayerView` shows a revealed card to both players until it moves or the effect ends (5.10.1.1).
- Replacement check (format.md change 4, Q1, 10.9): before every destroy (effects, crush and destroy 11.3, overload 11.5) the engine looks for `replaces: destroyed` abilities that pick the card. A matching replacement runs its `instead` effects and the destroy never happens (10.9.1.1): no `destroy` event, so no Revenge later. Each replacement applies at most once (10.9.2.3); with 2 or more, the card's master picks one with a `replacementOrder` choice (10.9.2.1). With an overload, the old card goes where the replacement says and the new card stays.
- `putOnDeck` (top or bottom) and `moveBattle` (zone to zone: the card keeps its instance id, 4.1.4; never into the own monster's zone, Q5; an occupied destination is resolved by 11.5).
- `rageChanged` events (3.4): one per change, whatever its size, from the gain rage action (8.4.1), playing a monster card (8.5.1.1), the 7.2.4 reset and effects. A change to the value rage already has is no event (1.3.2.1). `cardPlayed` triggers match main phase plays, effect plays and a new invading monster (5.11), with `by` and `what`.
- Strategy cards (format.md change 5, Q10, 10.3.4.3): a strategy card's triggered and continuous abilities are active while it is in a strategy zone; `placedInStrategyZone` fires only when its data declares it. Cards without data still log `strategyTextPending`.
- Burst (format.md build plan item 4, 12.5): a monster card with Burst N can be played on an invading monster of rank N that shares a trait (still once per turn, still rage +1, 8.5.1.1). The play records `playedVia: "burst"` and creates a timed trigger (10.6.5): at the beginning of the master's next end phase the card goes from the invading monster to the discard pile, even if it isn't on top (12.5.2.1). The card below becoming the top is not an entry: no [enter], no `cardPlayed` (12.5.3). After a Burst play the monster's rank is the Burst card's printed rank (7.2.2, the next-monster check and every other rank read). A Burst play is a monster play (Q5) and triggers [enter].
- Evolution (12.6.2): the keyword expands into an optional trigger at the beginning of your main phase. It searches the deck for 1 battle card with the trait and rank N or lower (it may find nothing, 5.8.1.2), reveals it, plays it stacked on top of this card with `playedVia: "evolution"` (its [enter] and `cardPlayed` fire, Q8), then shuffles the deck either way. Declining runs no search and no shuffle. The card underneath stops being active (3.2.3.1).
- `evolve` (5.17, Q8): the player picks one of their battle cards with an Evolution keyword (a choice if several, nothing if none), then that card's Evolution search and play run as above.
- Manual override (format.md change 10): when a card without ability data would have its text apply, the engine queues a manual override window. That happens when the card is played or placed in a strategy zone, when the phase its text names begins, or when it invades. The window opens in the check timing once no ability is left in standby, as a `manual` choice for the card's master. While it is open, both players may take `manual` actions: move a card between its owner's areas, change rage, advance or retreat a monster, draw, shuffle, reveal. Each is logged as `manual` with the card that caused it, and the log is public. The master closes the window with `done`; revealed cards go back to normal (5.10.1.1), and abilities the manual actions triggered resolve.
- Text overrides (Q12): `packages/cards/data/text-overrides.json` corrects scraped typos in every print of a card, applied after scraping.
- Deck rules (Q13): a card whose data has `deckRules: [{ rule: "anyNumber" }]` is exempt from the 4-copy limit (6.1.1.4, 1.3.1); restriction lists still apply.
- Monster rank for the 7.2.2 draw and the next-monster check (5.15.1.2) stays printed.
- Bots (M6a): every bot decides from `getPlayerView(state, botId)`, its legal actions, both decklists (public at setup, 6.3.1.1) and the public log, never the real state. To make that possible, the view also carries the public engine status (`counterTotal`, `checkTiming`, `timedTriggers`, `manualQueue`), revealed cards with their area (5.10), and, for the player who must choose, the paused resolution (its bindings only for the ability's master). Options that are hidden cards come in instance id order, so a search never shows a deck's order (4.8.2).
- Speed (M6a): `cloneState` deep-copies the state by hand and shares the parts the engine never changes once written (log entries, the card catalog), about 40 times faster than a JSON round trip; states serialize exactly as before. Revisit in M12 when a card first modifies a monster's rank.
- Destroyed triggers (M12a-1, T1, 5.12, 11.3, 11.5): every `destroy` event carries the top card's last known information (its instance id on the field and its rank, 10.6.4.1.2), and an effect destroy carries whose effect it was (`by`). A trigger matches by owner, card information, rank and the zone the card was destroyed in, and can ask for the cause (`effect`, `crush` for 11.3, `overload` for 11.5). A crush caused by an advance of an invasion is marked, for "[invading] when this card destroys your battle cards" (EBP01-007).
- Discarded triggers (M12a-1, T3, 5.7, 7.2.3): a card going from a hand or a strategy zone to the discard pile is an event that names the card in the discard pile; an effect discard says whose effect it was and whether it paid a cost; invasion (8.6.1.1) and rage (8.4.1) discards are told apart. Triggered abilities with `activeIn: ["hand"]` or `["discard"]` are checked in those areas too (10.3.4), so "when this card is discarded from your hand by your opponent's effect" works from the discard pile.
- Countered, advanced and invades triggers (M12a-1, T4 to T6): `countered` matches the counter event (5.15.1), for `this` monster or a player's; a move "as though countered" is not a counter (Q14). `advanced` matches every real advance (5.13.1, 5.13.3: end phase, invasion or effect), optionally into a zone, into the opponent's monster's column or during a phase. `invades` matches once per invasion action (8.6, 5.14.1), unlike [invading]; the invasion event records the zones it started and ended in, so `intoZones` can ask whether the monster entered one of them.
- Played from the hand (M12a-1, C7, 5.11.3): main phase plays of battle and monster cards record `playedVia: "hand"`; a Burst play records `burst`, which also counts as played from the hand.
- Abilities that last for the turn (M12a-1, T8, 10.6.5): an `until` effect creates abilities as timed triggers. Their triggers are checked whether or not the card that made them is still active, and they end at 7.5.6.
- Selectors and amounts (M12a-1, C5, C6): selectors can filter by counter power, threat (the invading monster's threat includes rage, 3.4.5), part of a name, any of several traits and the invasion icon number; amounts can read a player's rage, their monster's rank or their empty zones (not counting the monster's zone), and "exactly N" can be such an amount.
- A manual window queued just before a win never opens: a finished game has no play timing (1.2.1).
- Branches (M12a-2, C1, E7): an `if` effect decides its branch once, when the resolution reaches it. A "choose one of the following" effect (10.5.2.2.1) offers only the options whose gates are open and whose condition holds, as an `option` choice; with one option it runs without asking, except for seats that confirm every choice (`confirmSingleOption`, human seats in `/play`), which see the one-option choice.
- Monster moves by effects (M12a-2, E1, 5.13): `advance` and `retreat` move a player's monster one zone at a time ("by") or to a zone (5.13.1.2, 5.13.2.2), only if it matches the effect's filter. An effect advance from zone 8 doesn't move or win (5.13.1.1). `moveAsCountered` (Q14) is only 5.15.1.1: a monster in zone 6, 7 or 8 moves behind, with no counter event and no next monster.
- Deck effects (M12a-2, E2, E3, E5): `mill` sends the top cards to the discard pile (5.7.3; an empty deck sends nothing and doesn't reshuffle) and binds them, so "if it is a monster card" reads them there. `lookTop` lets its player keep any of the top cards on top in the order picked and sends the rest to the discard pile (5.5). `returnDiscardToDeck` puts the whole discard pile into the deck and shuffles.
- Cards under cards (M12a-2, E4, 3.2): `placeUnder` puts cards under a card on the field (as new objects, 4.1.4); a selector with `stackOf: "this"` reads the cards under this card. They have no abilities there (3.2.3.1) and leave with the stack.
- Swap and move (M12a-2, E9, E10): `swap` trades the places of 2 battle cards of one player at once (5.6.1; fewer than 2 picked: nothing, 5.6.2). `moveBattle` with several possible cards first asks which one moves.
- Activate (M12a-2, E17, 5.9): an effect puts a strategy card into an empty strategy zone, regardless of rank; its text resolves as for an 8.3 activation. With no empty strategy zone, nothing happens.
- Evolve all (M12a-2, E18): each matching card evolves in turn, in zone order; each search may find nothing.
- Flags (M12a-2, M1, E13): `cannotEngage` keeps a battle card's counter power out of 7.4.2 (5.16.1). `cannotBeDestroyedByOpponent`: the opponent's effects can still choose the card, but their destroy does nothing to it (1.3.3; Q35, provisional); crush (11.3) and overload (11.5) still destroy it. `counterProof`: at 7.4.3 a total at or below its value doesn't counter the monster (`counterPrevented`); with `insteadMoves` it moves behind as though countered.
- Play rules (M12a-2, M2): a card's `playRule` can count its rank lower for the 8.2.1 or 8.3.1 check (by an amount, while its gates and condition hold), or forbid playing it. After the play the card has its printed rank.
- This turn (M12a-2, C2): "invaded this turn" and "zones advanced by invasion this turn" are read from the log since the turn began (7.1.1), counting only real advances (5.13.3).
- Zone relations (M12b-1, C3): "the zone with the same number as ..." is the zone with that number on each field (4.4.3); "at or before" means numbered at most the anchor zone's number (4.4.5.3.1).
- Played and invading bindings (M12b-1, T7): a card-played trigger can ask where the card came from (a main phase play is from the hand) and bind it; an [invading] trigger can bind the card discarded for this invasion (8.6.1.1).
- Reveal the top (M12b-1, E3, 5.10): the revealed cards show to both players; the matching ones the effect takes go to the hand, the rest to the discard pile.
- Discards (M12b-1, E11): "discard your hand" discards every card in it (5.7.1). "Your opponent may discard until N" asks that player first, then they pick the discards (5.7.2); the discarded cards are bound for "if they discarded at least 1".
- Turn-long bonuses (M12b-1, E19, 10.8.2): a `boost` fixes its bonus when it resolves, for the cards it picks then; a card that leaves for another area is a new object and loses it (4.1.4). Bonuses end at 7.5.6. EBP02-029's doubling adds each card's counter power at resolution (Q26).
- Start zone (M12b-1, K3, Q31): a rank I monster whose data names a start zone is placed there at 6.3.1.6 (not played, no [enter]).
- Restrictions (M12b-1, M1): `cannotAdvance` stops every advance of that monster, the 7.5.2 one included (1.3.3); `cannotInvade` removes the invade action (8.6); `cannotPlay` removes battle plays (or only into some zones) and strategy activations, and stops effects that would put such a card into play (Q32).
- Granted play ranks (M12b-1, M2): a continuous `playRankReduction` lowers the rank other hand cards count for 8.2.1 and 8.3.1 (EBP02-039).
- Burst's discard (M12b-1): the card leaving the invading monster for the discard pile is a discard event, so "when this card is discarded by the effect of Burst" triggers from the discard pile (EBP02-009).
- Rage by amounts (Q38, 3.4): "increase rage by 1 for each X" is one change of 1 per X, each its own `rageChanged` event, so "whenever your rage is increased" triggers once per X.
- Tokens are battle cards (Q39, 9.1.4.1): wherever the engine counts, selects or checks battle cards (selectors, conditions, 7.4.2 counter power, crush and overload, bots' board reads), a token counts as one. Effects that create tokens come with M12b-2.
- Effect plays and 8.2.1 (Q37, 1.3.1): an effect that plays a battle card ignores the rank vs. the opponent's monster's zone limit unless its data asks for it (`ignoreRankLimit: false`).
- Tokens (M12b-2, E6, 9.1): an effect makes a token appear in its master's zones (9.1.2, 5.11.4), as a played card (its [enter] fires), never in the monster's zone (Q5), empty zones first. Its data comes from the token's name (9.1.2.2, `tokens.json`). It is a battle card (Q39). Moved anywhere but a zone, it disappears (9.1.4.2): no discard pile, no deck.
- Revenge (M12b-2, T2, 12.7): when a card with Revenge is destroyed from the field by an effect or by crush and destroy (11.3), its ability triggers from the discard pile; overload (11.5, duplicate card processing) doesn't trigger it (Q17), nor does a card that was stacked under another (12.7.3).
- Counter by an effect (M12b-2, E12, Q24): a real counter (5.15.1): countered triggers fire, and a player with no next monster loses (5.15.1.2.1).
- Extra advances (M12b-2, E15): an `advanced` trigger can ask for the 7.5.2 end phase advance only; EBP02-056's extra advances are by an effect.
- Strategy cards replaced at 7.2.3 (M12b-2, E21, 10.9): a replacement can send a strategy card elsewhere instead of to the discard pile (EBP02-012: under it). An optional one asks its master per card; the step waits and runs again with the answers.
- Leaving the field (M12c-1, 10.6.4.1.2): a destroyed card's own "when this card is destroyed" abilities trigger from its last known information on the field; the destroy log lists the discard pile ids of the cards that were under it, which such an ability can bind (EBP03-052: they go to the hand).
- Played on top (M12c-1, E18, 3.2.5): "play it on top of" a card stacks the played card on that card's stack, with no zone choice and no overload (EBP03-043, EBP03-047). "Play a monster card from your monster deck" one rank higher stacks it on the invading monster, keeping its zone; [enter] fires; it is not the 8.5 action and gives no rage unless the card says so (Q27, EBP03-074).
- Cards under a card (M12c-1, E4): with several cards it could go under, the effect's player picks one; a card on the field goes under alone.
- Reveal the top (M12c-1, E3): the number revealed can be an amount (the opponent's monster's rank), and an effect can take several picks in order, each from the cards left (EBP03-011).
- Zones (M12c-1, C3): "a zone beside it" is an adjacent zone of the same player at another left-right position, so not the zone in front or behind (4.4.5.2, 4.4.5.5); "zones whose numbers match the ranks" are the zones numbered like the bound cards' ranks (EBP03-073). A zone choice can be limited to a zone set (EBP03-009).
- Each player discards down to N (M12c-1, E11): the master first, then the opponent, each picking their own cards (5.7.2).
- Invasion paid another way (M12c-2, E21, 8.6.1): EBP03-004's replacement adds an invade action paid with the top card of the deck (sent to the discard pile); that card's invasion icon counts (8.6.1.1). Once per turn with the normal invasion (8.6.2).
- Play on top (M12c-2, M2, 3.2.5): a play rule with `onTopOf` adds a main phase battle play stacked on that card, at its reduced rank (EBP03-051); the card has its printed rank again once played.
- Protected rage (M12c-2, M1, Q16): "this card's [rage] cannot be reduced by your opponent's effects" protects its master's rage from the opponent's `rage` and `setRage` effects, logged `rageProtected` (1.3.3).
- Third strategy zone (M12c-2, E20, 4.5.2): an effect can give a player 3 strategy zones for the rest of the game; 8.3.2 then needs all 3 filled to stop strategy activations.
- Losing by an effect (M12c-2, E16, 1.2.4): settled with the process's other losses (decision 85).
- Vertical moves (M12c-2, E14, Q21): straight across (3 and 8, 4 and 7, 5 and 6); not an advance or retreat, so no movement triggers; crush and destroy (11.3) applies where it lands.
- Base (M12c-2, K1, 12.9.2): a strategy card with Base stays at 7.2.3. Cards without data yet are read by their printed icon.
- Resonance (M12c-2, K2, 6.1.2, 12.8.2): the deck validator reads the rank I monster's Resonance: its colors are allowed (6.1.1.3), and each condition that fails is a "12.8.2" failure.
- Colors and orders (M12c-2, C4, X): "different colors among" counts distinct colors, White included; "the lowest ranked", "rightmost" and "leftmost" (from the effect's player's view, 4.4.5.5) pick among the extreme cards, the chooser breaking ties (Q33).
- Counts as a monster card (M12c-2, C5, Q34): Godzilla's Skeleton counts in any count of monster cards in its owner's discard pile, and is nothing else.
- Undo (M12c-2): a mill is an undo boundary (the milled cards become known), as a reveal is.

**Keyword abilities (12)**, all in M4: Enter (12.2), When invading (12.3), Awakening N (12.4), Burst (12.5), Evolution (12.6), Revenge (12.7), Resonance (12.8), Base (12.9).

**Manual override (hybrid mode).** For an effect not yet coded, the engine pauses and gives both players a manual action set: move any card between areas, change rage, advance or retreat the monster, draw, shuffle, reveal. Each manual action is logged with the card that caused it. The opponent sees every manual action.

## Paul's rulings (Oct 21, 2026; Q15 to Q34 Oct 23, 2026)

Q15 to Q34 are the M12 rules questions in `docs/abilities/m12-plan.md`, approved as proposed (Q23 reworded). Provisional rulings (Q35 on) are also listed in `docs/rules/rulings-to-confirm.md` until an official ruling or FAQ settles them.

| Question | Ruling |
| --- | --- |
| Play a monster card: once per turn? | Yes, once per turn. This overrides Comprehensive Rules 8.5, which sets no limit; it matches the official glossary |
| First turn | No mulligan, no first-player restriction |
| Match clock expiry | For now the clock reaches zero and nothing else happens |
| Multi-color cards (missing rule 2.4.4.1) | A multi-color card passes 6.1.1.3 if any of its colors matches the rank I monster |
| Concede | Allowed any time, including the opponent's turn, with a confirm step |
| Infinite loop | Declare a draw and save a loop report (seed, decks, full action log, state at detection) for review |
| Discard down to N (5.7.2) | The player picks the cards to discard, not the ones to keep (Oct 22, 2026). Same result as 5.7.2's wording |
| [enter] on a monster after a counter | [enter] fires when a card enters the board, including the monster that comes in after a counter (5.15.1.2). The rank I monster placed at setup (6.3.1.6) does not trigger it, because the game hasn't started yet |
| Q15 Burst reminder "that turn's end phase" (EBP04-007) | Yes. A Burst play happens in your main phase, so "that turn's end phase" and "your next end phase" are the same phase (12.5.2.1). No change to decision 157. (Oct 23, 2026) |
| Q16 "This card's [rage]" on a monster card (EBP03-004, EBP04-010) | Yes: the rage of this monster card's master, read while the card is the invading monster. (Oct 23, 2026) |
| Q17 Revenge: duplicate card processing, crush, cards under a stack (12.7.2, 12.7.3) | Duplicate card processing is 11.5. Revenge triggers after a crush, after any destroy by an effect, and for a card under a stack when that card itself goes to the discard pile, except that 12.7.3 keeps a card that was stacked underneath from triggering. (Oct 23, 2026) |
| Q18 Base: "when any monster card invades into zones 6-8" timing | Once per invasion action (8.6) in which the monster enters zone 6, 7 or 8 at any step, including 6 to 7 and 7 to 8. An invasion that doesn't move (5.13.3) doesn't trigger it. (Oct 23, 2026) |
| Q19 Base: does "any monster card" include your own? | Yes, either player's monster. (Oct 23, 2026) |
| Q20 EBP04-014: "cannot be countered ... (It will not retreat.)" | Yes. EBP04-014 doesn't move and no next monster comes in; EBP01-038 moves back as though countered (Q14). (Oct 23, 2026) |
| Q21 Vertical moves (EBP04-078, EBP03-068) | Neither an advance nor a retreat: no movement triggers, `didAdvance` false. 11.3 still applies in the destination zone, since the reminder text spares only the zones in between. (Oct 23, 2026) |
| Q22 EBP04-012 Biollante Plant Beast Form's play from rank II | This card is played on top of the rank II monster as a normal monster play (once per turn, rage +1); the rank III monster deck card goes into that stack under the rank II card. (Oct 23, 2026) |
| Q23 EBP04-033/034 Kaizer Ghidorah played onto Monster X | Kaizer Ghidorah (EBP04-033/034) is played in your main phase on top of your invading Monster X monster card, as your one monster play for the turn, ignoring the rank and trait match. Like every monster play, it increases your rage by 1. Counter rules are unchanged. (Oct 23, 2026) |
| Q24 A counter by an effect (EBP02-012, EBP04-027) | Yes to both: it is a counter (5.15.1), unlike "moves as though countered" (Q14). Countering a rank IV monster by effect wins the game for the other player. A counter by effect gives no rage, as in 7.4.3. (Oct 23, 2026) |
| Q25 Inherited Life: "whenever your monster card's [rage] is reduced" (EBP04-089) | Every decrease counts, whoever caused it, including the 7.2.4 reset (logged as `rageChanged`). The counter (Q11) grows by the amount of the decrease. (Oct 23, 2026) |
| Q26 Doubled counter power for the rest of the turn (EBP02-029) | Only the cards in the column at resolution; each gains its counter power at resolution as a bonus for the turn. The bonus stays if the card moves to another zone (10.8.2) and ends if it leaves the zones. (Oct 23, 2026) |
| Q27 A monster played from the monster deck (EBP03-074) | Stacked on top, keeps the position, fires [enter] (decision 127). It doesn't use the once-per-turn monster play, which limits the main phase action only. (Oct 23, 2026) |
| Q28 Godzilla Earth token in zone 3 (EBP04-067) | Your monster's zone: no token (Q5's rule for unoccupied zones). A battle card in zone 3: the token is played and 11.5 overload resolves it. If the token is not played, nothing links to this card. (Oct 23, 2026) |
| Q29 "Draw 5 cards from the top of your deck" (FC01-005) | A reveal of the top 5: [fest] cards go to the hand, the rest to the discard pile. No reshuffle; with fewer than 5 cards, reveal what is there. (Oct 23, 2026) |
| Q30 "Trigger all [enter] abilities of your monster card" (EBP04-041) | Checked as usual. Only the top card's [enter] abilities, since cards underneath have no active abilities (3.2.3.1). (Oct 23, 2026) |
| Q31 Biollante Rose Form starts in zone 5 (EBP02-024) | Yes. It is placed, not played, so no [enter] (decision 127); the 7.5.2 advance is skipped while it can't advance. (Oct 23, 2026) |
| Q32 "Your opponent cannot play strategy cards" (EBP02-070) | Both: any strategy card entering a strategy zone by its master's action or effect. (Oct 23, 2026) |
| Q33 Ties for rightmost, leftmost or lowest zone (EBP03-078, EBP04-035) | The effect's player chooses among the tied cards. (Oct 23, 2026) |
| Q34 Godzilla's Skeleton counted as a monster card (EBP03-071) | It counts for any count of monster cards in its owner's discard pile, by either player. It is not a monster card for anything else, so it can't be returned or played as one. (Oct 23, 2026) |
| Q35 "Cannot be [destroy] by your opponent's effects" (EBP01-052): can the opponent choose the card for "[destroy] N of your opponent's battle cards"? | Yes: it can be chosen; the destroy does nothing to it (1.3.3); a forced "destroy 1" may be spent on it. **Provisional** (Oct 23, 2026): see [rulings-to-confirm.md](rulings-to-confirm.md) |
| Q36 Do rank reductions stack (Lake Ashi Monster EBP02-039 with EBP01-058's own)? | Yes: every active reduction adds up (-3 and -2 make -5) (Oct 24, 2026) |
| Q37 Can an ability override the normal rules, e.g. "play it in zone 8 instead" (Akane Yashiro EBP04-077) and effect plays that name a zone (Godzilla Emerges)? | Yes (1.3.1): an effect play ignores the battle card rank vs. the opponent's monster's zone limit (8.2.1) (Oct 24, 2026) |
| Q38 Is "increase rage by 1 for each X" (EBP01-015) one increase or several? | N separate increases of 1, each firing "whenever your rage is increased" (Ginza Annihilated, EBP01-003, EBP01-010, EBP02-054, EBP02-057) (Oct 24, 2026) |
| Q39 Are tokens (Crystals, Tentacles, ...) battle cards for counts and checks? | Yes: a token in your zones is a battle card for anything that counts or checks battle cards (EBP03-076, EBP01-027, EBP04-038, EBP03-010, "2 or more battle cards" conditions) (Oct 24, 2026) |
| Q40 Space Beam (EBP03-069): "if there is a [mechagodzilla] card in zone 8" names no player. Whose zone 8? | Your zone 8 only: a [mechagodzilla] card in the opponent's zone 8 doesn't make it destroy. **Provisional** (Oct 24, 2026): see [rulings-to-confirm.md](rulings-to-confirm.md) |

## Test cases

M3 must pass cases 9 to 54; cases 1 to 8 run in M8 with the deck validator. Each test name starts with its rule number (for example `7.2.2 draws equal to opponent rank`). Tests use test-only cards built in fixtures, so they don't depend on real card abilities.

**Setup and deck**

| # | Rule | Given | Expect |
| --- | --- | --- | --- |
| 1 | 6.1.1.1 | Monster deck with two rank II cards | Invalid, cites 6.1.1.1 |
| 2 | 6.1.1.2 | Main deck of 49 or 51 cards | Invalid |
| 3 | 6.1.1.2.2 | 11 cards with invasion icon 2 | Invalid; 10 is valid |
| 4 | 6.1.1.3 | Red rank I; a Blue card in the main deck | Invalid; White is valid |
| 5 | 6.1.1.4.1 | 3 copies of X plus 2 of X+ | Invalid (5 copies) |
| 6 | 6.1.1.5 | A Token-trait card in the deck | Invalid |
| 7 | Restriction | Gravity Beam on 2026-09-01 | Invalid; valid on 2026-08-31 |
| 8 | Choice restriction | EBP02-003 and EBP03-035 together | Invalid |
| 9 | 6.3.1.3, 6.3.1.4 | Same seed twice | Identical deck order and first player |
| 10 | 6.3.1.5 to 6.3.1.7 | New game | Hands of 5; rank I monsters in zone 1; rage 0 |

**Phases**

| # | Rule | Given | Expect |
| --- | --- | --- | --- |
| 11 | 7.2.2 | Opponent monster rank III | Turn player draws 3 |
| 12 | 7.2.3 | Strategy card placed last turn | Discarded at the start phase |
| 13 | 7.2.3 | Strategy card placed this turn | Stays until next start phase |
| 14 | 7.2.4 | Rage 2 at start of own turn | Rage 0 |
| 15 | 7.2.4 | Rage 2 at start of opponent's turn | Still 2 |
| 16 | 7.5.2 | Monster in zone 7 | Advances to 8 |
| 17 | 7.5.2 | Monster in zone 8 | Stays in 8; no win |
| 18 | 7.5.4 | Hand of 2 | Draws 3 |
| 19 | 7.5.4 | Hand of 7 | Draws 0, discards nothing |
| 20 | 7.5.6 | Until-end-of-turn effect | Gone at next turn |

**Main phase actions**

| # | Rule | Given | Expect |
| --- | --- | --- | --- |
| 21 | 8.2.1 | Opponent monster in zone 3; battle cards rank 3 and 4 in hand | Only the rank 3 card is legal |
| 22 | 10.5.2.1.2 | Own monster in zone 2 | Battle card legal in every zone except 2 |
| 23 | 11.5 | Battle card played to an occupied zone | Old card destroyed, new card stays |
| 24 | 8.3.1 | Own monster in zone 4; strategy rank 5 | Not legal |
| 25 | 8.3.2 | Both strategy zones filled | No strategy action available |
| 26 | 8.4.1 | 2 monster cards in hand | Rage action available twice; rage 2 |
| 27 | 8.5.1 | Rank II monster with no shared trait | Not legal |
| 28 | 8.5.1.1 | Legal monster played | Stacked on top; position unchanged; rage +1 |
| 29 | 8.6.1 | Discard a card with icon 2 from zone 3 | Monster in zone 5 |
| 30 | 8.6.2 | Invasion already used this turn | No invade action |
| 31 | 5.13.1.1.2 | Zone 8; opponent zone 8 empty; invade with icon 1 | Turn player wins by invasion |
| 32 | 5.13.1.1.1 | Zone 8; opponent zone 8 has a battle card; invade | No move; no win |
| 33 | 5.13.1.1.2 | Zone 7; invade with icon 2; opponent zone 8 empty | Advances to 8, then wins |
| 34 | 10.4.4.3 | Player passes | Main phase ends; counter phase starts |

**Counter and win/loss**

| # | Rule | Given | Expect |
| --- | --- | --- | --- |
| 35 | 7.4.3 | Counter power 10,000 vs threat 10,000 | Countered (tie) |
| 36 | 7.4.3 | 9,000 vs 10,000 | Not countered |
| 37 | 3.4.5 | Threat 6,000 with rage 1, counter power 10,000 | Not countered (11,000) |
| 38 | 7.4.2.1 | Monster card stacked in a zone | Adds nothing to the total |
| 39 | 5.16.1 | Battle card that cannot engage | Its counter power is excluded |
| 40 | 5.15.1.1 | Countered in zones 6, 7, 8 | Moves to 5, 4, 3 |
| 41 | 5.15.1.1 | Countered in zone 4 | Stays in 4 |
| 42 | 5.15.1.2 | Countered rank II | Rank III with a shared trait stacked on top |
| 43 | 5.15.1.2.1 | Countered rank IV | Its master loses; counter victory |
| 44 | 5.15.1.2.1 | Countered rank II; rank III shares no trait | Its master loses |
| 45 | 1.2.3 | Concede during opponent's turn | Concessor loses; no check timing runs |
| 46 | 1.2.2 | Both players lose at once | Draw |

**Rule actions and timing**

| # | Rule | Given | Expect |
| --- | --- | --- | --- |
| 47 | 11.2 | Draw 3 with 1 card in deck; discard pile has 5 | Draws 1, reshuffles, draws 2 |
| 48 | 11.2.4 | Draw from empty deck and empty discard pile | Nothing drawn; no error |
| 49 | 11.3 | Own monster advances into own battle card's zone | Battle card destroyed immediately |
| 50 | 10.4.3 | Both players have abilities in standby | Turn player's resolve first, one at a time, rule actions between each |
| 51 | 10.6.2.1 | A trigger fires twice | Ability resolves twice |
| 52 | Engine | 10,000 games with random legal moves | No crash, no illegal state, every game ends with a recorded result |

**Paul's rulings**

| # | Rule | Given | Expect |
| --- | --- | --- | --- |
| 53 | Ruling: monster once per turn | Monster already played this turn; a second legal monster in hand | No monster action available |
| 54 | 13.1 + ruling | Forced loop in a test fixture | Game ends in a draw; loop report file written with seed, decks, action log and state |

Keyword abilities, tokens and continuous-effect layers get their own test list in M4, written with real card data.
