# GojiSim Ability Format (M4b)

Approved by Paul, Oct 21, 2026. Inputs: `docs/abilities/survey.md`, `docs/abilities/findings.md`, `docs/rules/spec.md`.

## Summary

Card abilities are written as JSON data, one file per set, validated by a Zod schema, and run by one interpreter in `@gojisim/engine`. Each ability is one of 3 kinds:

- **triggered:** an event puts it in standby (10.6), and it resolves at a check timing.
- **continuous:** it changes values or flags while active (10.8).
- **replacement:** it swaps one event for another (10.9).

Abilities are built from 6 parts: gates, triggers, conditions, selectors, effects and modifiers. These cover all 31 starter cards and the M4a survey's top patterns across all 384 cards.

Cards the format can't express yet use one of two fallbacks:

- a `custom` effect that names a code handler.
- `status: "manual"`. The card's text then shows in the viewer, and players resolve it with manual override actions.

## Rulings Q1 to Q14 (Paul approved all proposed answers, Oct 21, 2026)

| # | Ruling | Format impact |
| --- | --- | --- |
| Q1 | "When destroyed, ... instead" also replaces crush and destroy (11.3) and the overload rule (11.5) | Replacement effects hook every destroy, including rule actions |
| Q2 | The `A: B` cost is optional. With no card to pay, nothing happens | `cost` with `optional: true` |
| Q3 | "Play 2 ...": play as many as possible, empty zones first; occupied zones allowed | `play` effect with `asManyAsPossible`, `preferEmpty` |
| Q4 | When invading triggers once per zone advanced | `invading` event fires per advance step |
| Q5 | "Move to an unoccupied zone" never means the own monster's zone. Burst plays count as monster plays | Zone set `unoccupied` excludes the monster's zone |
| Q6 | City of Tokyo in zone 8: its "other battle card in zone 8" bonus has no target. Its two bonuses stack | Selector `other: true` excludes the source |
| Q7 | Awakening is checked when the trigger fires and again on resolution | Gates are checked at both points |
| Q8 | Evolve searches the deck by the target's Evolution rank and trait, then shuffles. An evolved card counts as played | `evolve` effect reuses the Evolution keyword's search; records `playedVia: "evolution"` |
| Q9 | [Your Turn] / [Opponent's Turn] make an ability active only during that turn. `opponent-turn` and `opponents-turn` are the same | `turn` gate |
| Q10 | Strategy text that is its own trigger stays active in the strategy zone and does nothing on placement | Strategy abilities declare their own trigger; `placedInStrategyZone` only when the text has none |
| Q11 | Rage placed under a card is a counter on that card | Card counters in state |
| Q12 | Scraped typos are fixed through an override file | `text-overrides.json` |
| Q13 | "Any number of this card" lifts the 4-copy limit | `deckRules` on the card |
| Q14 | "Moves as though countered" only moves; it is not a counter | `moveAsCountered` effect fires no countered event |

## How abilities run

Loop (from M3d, extended in M4): action or effect about to happen -> replacement check (10.9, new) -> event happens (logged) -> match triggers, gates checked (new) -> standby (10.6.2, once per match) -> check timing (10.4.3 order) -> resolve effects, gates rechecked, choices (new) -> effects create new events -> back to the start.

- Replacement effects run before an event, so the original event never happens (10.9.1.1). A replacement ability fires no trigger of its own.
- Gates (turn, Awakening, active area) are checked when a trigger matches and again when it resolves (Q7).
- Continuous abilities never enter standby. `getThreat`, `getCounterPower` and `getRank` read through the 10.8.1 layers (printed, abilities, flags, rage, numbers) each time they're called.

## Ability schema

Each set has one file, `packages/cards/data/abilities/<SET>.json`, keyed by `deckCardNumber`. The Zod schema lives in `packages/cards/src/abilities.ts`; the types below are the contract. A card without an entry has `status: "manual"` by default.

```typescript
type CardAbilities = {
  deckCardNumber: string;
  status: "implemented" | "partial" | "manual"; // partial: some abilities manual
  abilities: Ability[];
  deckRules?: DeckRule[];                         // Q13, Resonance (12.8)
  notes?: string;                                 // rulings used, with Q numbers
};

type Ability =
  | { kind: "triggered"; id: string; gates?: Gate[]; trigger: Trigger;
      condition?: Condition; optional?: boolean; cost?: Cost; effects: Effect[] }
  | { kind: "continuous"; id: string; gates?: Gate[]; condition?: Condition;
      modifiers: Modifier[] }
  | { kind: "replacement"; id: string; gates?: Gate[]; replaces: ReplaceableEvent;
      condition?: Condition; optional?: boolean; instead: Effect[] }
  | { kind: "keyword"; keyword: KeywordAbility };   // Burst, Evolution, Base, Revenge

type Gate =
  | { gate: "turn"; whose: "yours" | "opponents" }                      // Q9
  | { gate: "awakening"; zone: 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8 };          // 12.4

type Trigger =
  | { on: "enter" }                                                       // 12.2
  | { on: "invading" }                                                    // 12.3, per advance (Q4)
  | { on: "placedInStrategyZone" }                                        // 10.1.1.1.2 (Q10)
  | { on: "phaseBegins"; phase: Phase; whose: "yours" | "opponents" | "either" }
  | { on: "destroyed"; what: Selector }
  | { on: "discarded"; what: Selector; byOpponentEffect?: boolean }
  | { on: "rageChanged"; whose: PlayerRef; change: "increased" | "reduced" | "setToZero" }
  | { on: "cardPlayed"; by: PlayerRef; what: Selector }
  | { on: "countered"; whose: PlayerRef }
  | { on: "advanced"; whose: PlayerRef; toZone?: Zone }
  | { on: "gameStarts" };

type Condition =
  | { all: Condition[] } | { any: Condition[] } | { not: Condition }
  | { rage: PlayerRef; op: Op; value: number }
  | { zoneOf: "this" | "yourMonster" | "opponentMonster"; in: ZoneSet }
  | { count: Selector; op: Op; value: number }
  | { monsterRank: PlayerRef; op: Op; value: number }
  | { playedVia: "evolution" | "burst" | "effect" }
  | { didLastStep: true };                          // "if you do" (10.5.4)

type Selector = {
  owner: "you" | "opponent" | "any";
  area: "zones" | "hand" | "deck" | "discard" | "strategy" | "monster"
      | "monsterDeck" | "under" | "bound";        // bound = a card named by `as`
  this?: true; other?: true;                       // other: excludes the source (Q6)
  type?: "Monster" | "Battle" | "Strategy";
  name?: string; traits?: string[]; keyword?: string; colors?: string[];
  rank?: { op: Op; value: number | ValueRef };
  zones?: ZoneSet;
  bind?: string;                                   // area: "bound" reads this name
};

type ZoneSet =
  | Zone[]
  | { relation: "adjacentTo" | "sameColumnAs" | "inFrontOf" | "behind";
      of: "this" | "yourMonster" | "opponentMonster" | { bound: string };
      includeSelf?: boolean }
  | "unoccupied" | "any";                          // unoccupied never includes your monster's zone (Q5)

type Amount = number | { per: Selector; times: number } | ValueRef;
type ValueRef = { ref: string; field: "rank" | "counterPower" | "threat" };  // last known info (10.10)

type Modifier =
  | { stat: "counterPower" | "threat" | "rank"; target: Selector; amount: Amount }
  | { stat: "totalCounterPower"; amount: Amount }
  | { flag: "cannotEngage" | "cannotBeDestroyedByOpponent" | "cannotAdvanceOrInvade"
          | "cannotBeCounteredAtOrBelow" | "rageCannotBeReduced"; target: Selector; value?: number };

type Cost = { optional: boolean; effects: Effect[] };   // `A: B` (Q2), `you may A to B` (10.5.4)

type Count = { exact: number } | { upTo: number } | "all" | "anyNumber";
```

Each effect is an object with an `effect` key (see the table below). Each effect can carry `as: "<name>"`, which binds what it touched so later effects in the same ability can reference it (for example, "the discarded card's rank"). Bindings last for one resolution.

## Building blocks and coverage

The 22 effects below cover every starter card. With the 7 modifiers, they also cover the survey's 20 most common patterns. Rows marked M12 are defined in the schema now but built later.

**Effects**

| Effect | Parameters | Survey cards | Starters | Built in |
| --- | --- | --- | --- | --- |
| `destroy` | `target: { select, count, chooser }`, `oneByOne?` | 93 | 7 | M4c |
| `discard` | `player`, `count`, `filter`, `chooser` | 36 | 1 | M4d |
| `discardDownTo` | `player`, `size` (that player chooses which to keep, 5.7.2) | 19 | 3 | M4d |
| `rage` | `player`, `delta` (+ or -), floor 0 (3.4.4) | 52 | 3 | M4c |
| `setRage` | `player`, `value` | 3 | 0 | M12 |
| `search` | `player`, `filter`, `count`, `reveal?`, then nested `effects` on the found cards; may find nothing (5.8.1.2) | 14 | 2 | M4d |
| `play` | `from`, `filter`, `count`, `zones?`, `asManyAsPossible?`, `preferEmpty?`, `ignoreRankLimit?` (default true: 8.2.1 limits only the main phase action) | 24 | 2 | M4d |
| `addToHand` | `target` (usually bound) | 14 | 1 | M4d |
| `shuffle` | `player` | 16 | 2 | M4d |
| `draw` | `player`, `count` | 14 | 1 | M4c |
| `moveBattle` | `target`, `to: ZoneSet`, `optional?` | 9 | 1 | M4e |
| `putOnDeck` | `target`, `where: top or bottom` | 6 | 2 | M4e |
| `evolve` | `target` (search by its Evolution keyword, Q8) | 9 | 1 | M4f |
| `chooseZone` | `owner`, `as` (binds the chosen zone) | 10 | 1 | M4c |
| `advance` / `retreat` | `player`, `by` or `toZone` | 25 | 0 | M12 |
| `mill` | `player`, `count` | 19 | 0 | M12 |
| `revealTop` / `lookTop` | `player`, `count`, then nested effects | 17 | 0 | M12 |
| `placeUnder` | `target`, `under` | 14 | 0 | M12 |
| `returnToHand` | `from: discard`, `target` | 17 | 0 | M12 |
| `createToken` | `name`, `zones` | 10 | 0 | M12 |
| `chooseOne` | `options: Effect[][]` (10.5.2.2.1) | 9 | 0 | M12 |
| `custom` | `handler: string`: named code for one card | as needed | 0 | any |

**Modifiers (continuous)**

| Modifier | Survey cards | Starters |
| --- | --- | --- |
| `counterPower` +/- N on selected cards | 71 | 5 |
| `threat` +/- N on a monster | 23 | 2 |
| `rank` +/- N (8.2.1 and 8.3.1 legality read the modified rank) | 21 | 0 |
| `totalCounterPower` + N | 7 | 0 |
| Flags: cannot engage, cannot be destroyed, cannot advance or invade, cannot be countered at or below N, rage cannot be reduced | 25 | 0 |

**Gates, triggers and conditions used by the starters**

- Gates: `turn` (2 starters, 59 cards), `awakening` (4 starters, 44 cards).
- Triggers: `enter` (8 starters), `invading` (4), `placedInStrategyZone` (5), `phaseBegins` via Evolution (2), `rageChanged` (1), `cardPlayed` (1).
- Conditions: `rage` (5 starters), `zoneOf` (3), `monsterRank` (1), `playedVia` (1), `count` scaling via `Amount.per` (1).
- Replacement: `replaces: "destroyed"` (2 starters, 13 cards), on every destroy, including rule actions (Q1).
- Keywords as data: Burst (3 starters), Evolution (2 starters). Base, Revenge and Resonance are in the schema for M12.

## Worked examples

**ESD01-003 Godzilla (2023):** "If this card has 2 or more [rage], this card gains +5000 threat level."

```json
{ "deckCardNumber": "ESD01-003", "status": "implemented", "abilities": [
  { "kind": "continuous", "id": "rage-threat",
    "condition": { "rage": "you", "op": ">=", "value": 2 },
    "modifiers": [ { "stat": "threat", "target": { "owner": "you", "area": "monster", "this": true }, "amount": 5000 } ] }
] }
```

**ESD01-010 City of Tokyo:** two bonuses on "your other battle card in zone 8". They stack, and give nothing when City of Tokyo is the zone 8 card (Q6).

```json
{ "deckCardNumber": "ESD01-010", "status": "implemented", "abilities": [
  { "kind": "continuous", "id": "rage-bonus",
    "condition": { "rage": "you", "op": ">=", "value": 2 },
    "modifiers": [ { "stat": "counterPower", "target": { "owner": "you", "area": "zones", "type": "Battle", "other": true, "zones": [8] }, "amount": 5000 } ] },
  { "kind": "continuous", "id": "awakening-bonus", "gates": [ { "gate": "awakening", "zone": 6 } ],
    "modifiers": [ { "stat": "counterPower", "target": { "owner": "you", "area": "zones", "type": "Battle", "other": true, "zones": [8] }, "amount": 5000 } ] }
] }
```

**ESD01-011 Godzilla (2023):** an Enter trigger plus a replacement on destroy. The replacement also covers rule-action destruction (Q1).

```json
{ "deckCardNumber": "ESD01-011", "status": "implemented", "abilities": [
  { "kind": "triggered", "id": "enter-rage", "trigger": { "on": "enter" },
    "condition": { "rage": "you", "op": ">=", "value": 2 },
    "effects": [ { "effect": "rage", "player": "opponent", "delta": -1 } ] },
  { "kind": "replacement", "id": "bottom-instead",
    "replaces": { "event": "destroyed", "what": { "owner": "you", "area": "zones", "this": true } },
    "instead": [ { "effect": "putOnDeck", "target": { "owner": "you", "area": "zones", "this": true }, "where": "bottom" } ] }
] }
```

**ESD01-013 Ginza Annihilated:** strategy text that is its own trigger, gated to your turn. It does nothing on placement (Q9, Q10).

```json
{ "deckCardNumber": "ESD01-013", "status": "implemented", "abilities": [
  { "kind": "triggered", "id": "rage-destroy", "gates": [ { "gate": "turn", "whose": "yours" } ],
    "trigger": { "on": "rageChanged", "whose": "you", "change": "increased" },
    "effects": [ { "effect": "destroy",
      "target": { "select": { "owner": "opponent", "area": "zones", "type": "Battle", "rank": { "op": "<=", "value": 6 } },
                  "count": { "exact": 1 }, "chooser": "you" } } ] }
] }
```

**ESD02-004 Godzilla (1994):** an optional cost, with a bound card whose rank feeds the destroy filter (Q2, Q4, 10.10).

```json
{ "deckCardNumber": "ESD02-004", "status": "implemented", "abilities": [
  { "kind": "triggered", "id": "invading-destroy", "trigger": { "on": "invading" },
    "cost": { "optional": true, "effects": [
      { "effect": "discard", "player": "you", "count": { "exact": 1 },
        "filter": { "owner": "you", "area": "hand", "type": "Battle" }, "chooser": "you", "as": "paid" } ] },
    "effects": [ { "effect": "destroy",
      "target": { "select": { "owner": "opponent", "area": "zones", "type": "Battle",
                             "rank": { "op": "<=", "value": { "ref": "paid", "field": "rank" } } },
                  "count": "all", "chooser": "you" } } ] }
] }
```

**ESD02-007 Mothra (Larva) (1992):** Evolution is a keyword, so the engine expands it into the 12.6.2 trigger. The data carries only the rank and trait.

```json
{ "deckCardNumber": "ESD02-007", "status": "implemented", "abilities": [
  { "kind": "keyword", "keyword": { "name": "evolution", "rank": 5, "trait": "Mothra" } }
] }
```

The engine expands that keyword into an optional `phaseBegins` (main, yours) trigger. It runs `search` for a Battle card with trait Mothra and rank 5 or lower, plays it on top of this card with `playedVia: "evolution"`, then shuffles. ESD02-010's `playedVia` condition reads that value.

## Engine changes for M4

Each one adds a line to `docs/rules/spec.md`.

| # | Change | Why | Source |
| --- | --- | --- | --- |
| 1 | Ability loader: reads `abilities/<SET>.json`, validates it with Zod at startup, and replaces the M3d test-only registry | Abilities become data | This doc |
| 2 | Interpreter: matches triggers, evaluates conditions and selectors, runs effects, binds `as` names for the rest of one resolution | Runs the data | 10.5 |
| 3 | Gates checked when a trigger matches and again at resolution | Q7, Q9 | 10.3.2 |
| 4 | A replacement check before each destroy, including crush and destroy (11.3) and the overload rule (11.5) | Q1 | 10.9 |
| 5 | Strategy cards: a `placedInStrategyZone` trigger only when the card's ability declares it; otherwise its abilities stay active in the strategy zone. Remove `strategyTextPending` | Q10 | 10.3.4.3 |
| 6 | `invading` event fires once per advance step of an invasion, and only if the monster moved (12.3.2.1) | Q4 | 12.3 |
| 7 | Card memory on each instance: `playedVia`, counters (Q11), `placedOnTurn` | Q8, Q11 | 12.5, 12.6 |
| 8 | `getCounterPower(card)` and `getRank(card)` through the 10.8.1 layers, next to the existing `getThreat`. 7.4.2, 8.2.1 and 8.3.1 call them | F10 | 10.8.1 |
| 9 | Revealed cards: `getPlayerView` shows a card to both players while it is revealed (5.10) | F12 | 5.10 |
| 10 | Manual override action set in `/debug`: move a card, change rage, advance or retreat, draw, shuffle, reveal. Offered when a `manual` card's ability would trigger. Every manual action is logged | Hybrid mode | Spec "Manual override" |

**Deferred to M12** (other sets): vertical monster moves, moving as though countered (Q14), the third strategy zone, starting in zone 5, extra advances, placing cards under cards, tokens, "trigger all [enter] abilities again" (F13), Japanese-name matching for FC01 and PR cards, and the Revenge keyword (12.7: triggers when the card goes from the field to the discard pile, other than by overload processing; inactive while stacked under another card). Revenge is built with the first set that uses it (EBP02, 11 cards); Paul approved Oct 21, 2026.

## M4 build plan

Five PRs cover all 31 starter cards. Each card gets one test per ability, named with its card number and the rule it exercises.

1. **M4c ability core:** loader, interpreter, gates, continuous modifiers, `getCounterPower`/`getRank` layers. Effects `destroy`, `rage`, `draw`, `chooseZone`. Cards: ESD01-001, 003, 008, 009, 010, 016; ESD02-001, 002, 006, 009, 011, 012, 013, 015 (14 cards).
2. **M4d hand and deck effects:** `discard`, `discardDownTo`, `search`, `play`, `addToHand`, `shuffle`, costs, per-step `invading`, revealed cards in views. Cards: ESD01-002, 004, 014, 015; ESD02-003, 004, 005, 010 (8 cards).
3. **M4e replacement, move and rage triggers:** the replacement check on every destroy, `moveBattle`, `putOnDeck`, `rageChanged` and `cardPlayed` triggers, strategy-zone activity (Q10). Cards: ESD01-011, 012, 013 (3 cards).
4. **M4f Burst and Evolution:** Burst play legality and its end-phase discard (12.5), the Evolution keyword, `evolve`, `playedVia`. Cards: ESD01-005, 006, 007; ESD02-007, 008, 014 (6 cards).
5. **M4g finish:** manual override actions in `/debug`, a coverage report (`pnpm abilities:coverage` lists every card as implemented, partial or manual), text-override typo fixes (Q12), `deckRules` for "any number" (Q13), and stress runs with both official starter decks.

**M4 exit criteria**

- All 31 starter cards are `implemented`, each with passing effect tests.
- 1,000 stress games per policy with ESD01 official vs ESD02 official: 0 failures.
- Paul plays ESD01 official vs ESD02 official in `/debug` and confirms the card effects.

## M12 additions

Pieces from `docs/abilities/m12-plan.md` (approved by Monarch, Oct 23, 2026), added here as each PR builds them. The schema in `packages/cards/src/abilities.ts` is the contract.

### M12a-1: C5, C6, C7, T1, T3, T4, T5, T6, T8

```typescript
type Selector = { ...;
  threat?: { op: Op; value: number };        // C5: the invading monster's threat includes rage (3.4.5)
  counterPower?: { op: Op; value: number };  // C5: through the 10.8.1 layers
  nameIncludes?: string;                     // C5: "with \"MB\" in their name"
  anyTraits?: string[];                      // C5: "[gigan] or [megalon]"
  invadeIcon?: number;                       // C5: "a card with [invade-2]"
};

type Amount = ...
  | { rageOf: PlayerRef; times: number }             // C6: "for each of your opponent's [rage]"
  | { monsterRankOf: PlayerRef; times: number }      // C6
  | { unoccupiedZonesOf: PlayerRef; times: number }; // C6: not counting the monster's zone
type Count = { exact: number | Amount } | ...;       // C6: "destroy 1 for each ..."

type Condition = ... | { playedVia: "evolution" | "burst" | "effect" | "hand" };  // C7: burst counts as hand

type Trigger = ...
  | { on: "destroyed"; what: Selector;               // T1: last known information (10.6.4.1.2)
      cause?: "effect" | "crush" | "overload"; by?: PlayerRef;
      invasion?: true;                               // a crush by an invasion advance (EBP01-007)
      as?: string }                                  // binds the card, rank included
  | { on: "discarded"; what: Selector; from: "hand" | "strategy";        // T3
      cause?: "effect" | "cost" | "invasion" | "rage"; byOpponentEffect?: boolean; as?: string }
  | { on: "countered"; whose: "this" | PlayerRef }                         // T4
  | { on: "advanced"; whose: "this" | PlayerRef; toZone?: Zone;           // T5
      intoColumnOf?: "opponentMonster"; during?: Phase }
  | { on: "invades"; whose: PlayerRef; intoZones?: Zone[] };              // T6: once per invasion

// T3: a triggered ability may also be active in a hand or the discard pile (10.3.4).
type TriggeredAbility = { ...; activeIn?: ("hand" | "discard")[] };

// T8: abilities that last until the end of the turn, as timed triggers (10.6.5). Their triggers
// are checked whether or not the card is still active, and can fire more than once: "this turn"
// is the indicated period (10.6.5.1). They end at 7.5.6.
type Effect = ... | { effect: "until"; duration: "endOfTurn"; abilities: TriggeredAbility[] };
```

Built differently from the plan:

- C5 `countsAs` (Godzilla's Skeleton, EBP03-071) waits for EBP03, its only card.
- T1 adds `invasion: true` for EBP01-007's "[invading] When this card destroys your battle cards". A card's own "when this card is destroyed" is not needed by any card yet.
- T3 `from` is required; a destroyed strategy card counts as sent from a strategy zone (EBP03-039).
- A cost that reduces your own rage needs that much rage (10.5.4.1, EBP01-020).

### M12a-2: C2, E1 to E5, E7 to E10, E13, E17, E18, M1, M2 (and C1's `if`)

```typescript
type Selector = { ...; stackOf?: "this" };          // E4: with area "under", the cards under this card
type Amount = ... | { invasionAdvancesThisTurn: PlayerRef };                     // C2 (5.13.3)
type Condition = ... | { thisTurn: "invaded" | "opponentBattleDestroyed"; whose?: PlayerRef };  // C2

type Effect = ...
  | { effect: "if"; condition: Condition; then: Effect[]; else?: Effect[] }       // C1, decided once
  | { effect: "advance" | "retreat"; player: EffectPlayer; by?: number; toZone?: Zone;
      filter?: Selector }                                                         // E1: moves only if it matches
  | { effect: "mill"; player: EffectPlayer; count: number; as?: string }          // E2 (5.7.3)
  | { effect: "lookTop"; player: "you"; count: number;
      putBack: "anyNumberAnyOrder"; rest: "discard" }                             // E3 (5.5): first picked on top
  | { effect: "placeUnder"; target: Selector; under: Selector; count?: Count }    // E4 (3.2), default exactly 1
  | { effect: "returnDiscardToDeck"; player: EffectPlayer }                       // E5, then shuffle (5.3)
  | { effect: "chooseOne"; options: { gates?: Gate[]; condition?: Condition; effects: Effect[] }[] }  // E7
  | { effect: "setRage"; player: EffectPlayer; value: number }                    // E8 (3.4)
  | { effect: "swap"; owner: "you" | "opponent"; optional?: boolean }             // E9 (5.6)
  | { effect: "moveBattle"; ... }               // E10: with several targets the effect's player picks one first
  | { effect: "moveAsCountered"; player: "you" | "opponent" }                     // E13 (5.15.1.1, Q14)
  | { effect: "activate"; from: "deck" | "hand" | "discard"; filter: Selector; count: Count }  // E17 (5.9)
  | { effect: "evolve"; target: Selector; count?: "all" };                        // E18: each in turn

type Modifier = ...
  | { flag: "cannotEngage"; target: Selector }                                    // M1 (5.16.1)
  | { flag: "cannotBeDestroyedByOpponent"; target: Selector }                     // M1 (5.12)
  | { flag: "counterProof"; target: Selector; atOrBelow: number; insteadMoves: boolean };  // E13 (7.4.3)

// M2: how a card is played from the hand (8.2.1, 8.3.1); after the play it has its printed rank.
type Ability = ... | { kind: "playRule"; id: string; gates?: Gate[]; condition?: Condition;
                       rankReduction?: Amount; forbidden?: Condition };
```

Built differently from the plan:

- C1's `if` effect is built here (EBP01 needs it after a mill). `didLastStep` stays with EBP02.
- M1 builds the flags EBP01 uses: `cannotEngage`, `cannotBeDestroyedByOpponent` and E13's `counterProof`. The other M1 flags (cannot advance, invade, play, draw, be moved; rage that can't be reduced) come with their first cards.
- M2 builds `rankReduction` and `forbidden`. `onlyInZones` and `alternative` come with EBP04.
- E5's `returnToHand` is `addToHand` from the discard pile, as before; `putOnDeck` already takes cards from the discard pile.
- E3 `revealTop` is not needed: EBP01-015's "reveal the top 5 and send them to your discard pile" is a mill, since the discard pile is public.
- A card the opponent's effects can't destroy can still be chosen by them; the destroy does nothing to it (1.3.3; Q35, Paul's provisional ruling, `docs/rules/rulings-to-confirm.md`). Crush and destroy (11.3) and overload (11.5) still destroy it.
- `chooseOne` offers only the options whose gates are open and whose condition holds, as choice kind `option`. With one, it runs without a choice, except for seats that confirm every choice (`confirmSingleOption`: human seats in `/play`, Paul's ruling), which see the one-option modal.

### M12b-1: C3, T7, E3, E11, E19, K3, CU, and M1/M2 additions

```typescript
type ZoneSet = ... | { relation: "sameNumberAs" | "atOrBefore"; of: ZoneAnchor };  // C3 (4.4.3, 4.4.5.3)
type Selector = { ...; stackOf?: "this" | "yourMonster" };       // cards under your monster (EBP02-065)
type Condition = ... | { amount: Amount; op: Op; value: number };  // EBP02-079

type Trigger = ...
  | { on: "invading"; as?: string }                 // T7: binds the card discarded for this invasion
  | { on: "cardPlayed"; ...; from?: "hand" | "deck" | "discard" | "monsterDeck"; as?: string }  // T7
  | { on: "discarded"; ...; from: "hand" | "strategy" | "monster"; cause?: ... | "burst" };    // Burst's discard

type Effect = ...
  | { effect: "revealTop"; player: "you"; count: number;
      take: { filter: Selector; count: Count }; rest: "discard" }                   // E3 (5.10)
  | { effect: "discard"; ...; count: Count | "hand" }                                // E11: the whole hand
  | { effect: "discardDownTo"; ...; optional?: boolean; as?: string }               // E11: "may discard"; binds them
  | { effect: "play"; ...; onePerZone?: boolean }                                   // EBP02-028
  | { effect: "boost"; duration: "endOfTurn"; target: Selector;
      stat: "counterPower" | "threat" | "rank"; amount: Amount | "double" }        // E19 (10.8.2)
  | { effect: "custom"; handler: "jointStruggle" };                                 // CU (EBP02-080)

type Modifier = ...
  | { stat: "playRankReduction"; target: Selector; amount: Amount }                 // M2: other hand cards
  | { flag: "cannotAdvance" | "cannotInvade"; target: Selector }                     // M1
  | { flag: "cannotPlay"; player: PlayerRef; what: Selector; zones?: ZoneSet };     // M1, Q32

type Ability = ... | { kind: "setup"; id: string; startZone: Zone };              // K3 (6.3.1.6, Q31)
```

Built differently from the plan:

- E19 is a `boost` effect: bonuses fixed at resolution for the cards picked then, kept in `state.continuousEffects` and ended at 7.5.6. `gate: "phase"` and `snapshot` amounts wait for a card that needs them.
- C3 builds `sameNumberAs` and `atOrBefore`; zone-number conditions and `numbersFrom` come with EBP03 and EBP04.
- T7's binding also covers [invading] ("the card discarded for this card's invade action", EBP02-022): the latest invasion discard by the monster's master.
- `cannotPlay` reads `what` wherever the card is, so an effect that would put a strategy card into play from the discard pile is blocked too (Q32).
- `cannotAdvance` stops every advance, the 7.5.2 one included (1.3.3).
- CU handlers live in `packages/engine/src/customHandlers.ts` and register when the engine loads.
- A `rage` effect whose delta is an amount ("by 1 for each ...") makes one change of `times` per counted card, each its own event (Q38).
- A selector's `type: "Battle"` also picks tokens, which are battle cards in zones (Q39, 9.1.4.1).

### M12b-2: E6 tokens, T2 Revenge, E12, E15, E21

```typescript
type Effect = ...
  | { effect: "createToken"; name: string; zones?: ZoneSet; count?: number | "each" }  // E6 (9.1.2, 5.11.4)
  | { effect: "counter"; player: "you" | "opponent" }                                    // E12 (5.15.1, Q24)
  | { effect: "addToHand"; target: Selector; count?: Count }                            // E5: "up to 1"
  | { effect: "advance" | "retreat"; ...; by?: Amount };                                // E15: by an amount

type Trigger = ...
  | { on: "advanced"; ...; cause?: "endPhase" | "invasion" | "effect" }                 // E15
  | { on: "revenge" };                                       // T2: expanded from the keyword

// T2 (12.7): the keyword carries what a triggered ability would.
type KeywordAbility = ... | { name: "revenge"; effects: Effect[]; optional?: boolean;
                              condition?: Condition; cost?: Cost };

// E21: a strategy card leaving at 7.2.3 can be replaced; `optional` asks its master.
type ReplaceableEvent = { event: "destroyed" | "strategyToDiscard"; what: Selector };
```

Built differently from the plan:

- Token data is `packages/cards/data/tokens.json` (the base print of each Token in `cards.json`, kept in step by a test), so the engine doesn't load the full card list (decision 33). A token joins the game's card catalog the first time one appears.
- Tokens are battle cards (Q39). A token that would go to the discard pile or a deck disappears (9.1.4.2, logged `tokenGone`); it never counts toward the deck it came from.
- Revenge expands into a trigger checked from the discard pile: the destroy event names the destroyed top card's new id there. Overload (11.5) doesn't trigger it (Q17), and neither does a card that was under another (12.7.3).
- E15 is `advance` with `by` as an amount, from an `advanced` trigger with `cause: "endPhase"`; the extra advances are by an effect, so they don't trigger it again (EBP02-056). EBP04-007's "advances 2 zones" comes with EBP04.
- E12 `counter` is always the last effect: if the next-monster choice opens, the resolution ends there and the choice continues the check timing.
- E21 builds `strategyToDiscard` at 7.2.3 with optional replacements: the step asks the replacement's master per card and runs again with the answers (`state.replacementAsks`). The `rageReset` and `invasionCost` events come with EBP04 and EBP03.

### M12c-1: EBP03 with built pieces (and small extensions), EPR-020

No new pieces from the plan: C4, E14, E16, E20, K1, K2, X and C5's `countsAs` come with M12c-2. These extensions of built pieces carry the 66 EBP03 cards and EPR-020:

```typescript
type ZoneSet = ...
  | { relation: "horizontallyAdjacentTo"; of: Anchor }  // C3: beside it in its row (4.4.5.2, 4.4.5.5)
  | { ranksOf: string };                                // C3: zones numbered like the bound cards' ranks (EBP03-073)

type Effect = ...
  | { effect: "revealTop"; player: "you"; count: Amount;                   // E3: "as many as the opponent's monster's rank"
      take: { filter: Selector; count: Count } | { filter: Selector; count: Count }[]; rest: "discard" }
  | { effect: "chooseZone"; owner: "you" | "opponent"; zones?: ZoneSet; as: string }   // C3: only these zones
  | { effect: "play"; ...; onTop?: Selector }                               // E18: "play it on top of" that card (3.2.5)
  | { effect: "placeUnder"; ...; hostAs?: string }                          // E4: binds the card they went under
  | { effect: "putOnDeck"; ...; count?: Count }                             // E5: "up to 1"
  | { effect: "playMonster"; from: "monsterDeck"; filter: Selector;         // E18, Q27 (EBP03-074)
      rankAbove: number; sharesTrait: boolean; increasesRage: boolean }
  | { effect: "discardDownTo"; player: "each"; size: number };              // E11: each player (EBP03-029)

type Trigger = ...
  | { on: "destroyed"; ...; underAs?: string };  // binds the cards that were under it, now in the discard pile
```

Built differently from the plan:

- EBP03-004 (invade by milling the top card instead of discarding, an `invasionCost` replacement, and "this card's [rage] cannot be reduced by your opponent's effects") and EBP03-051 (a main phase play on top of a [little-godzilla] battle card at rank −2) are new actions, not data: they move to M12c-2 with the planned pieces. M12c-2 has 14 cards.
- "When this card is destroyed" abilities trigger from the card's last known information on the field (10.6.4.1.2): the engine checks the destroyed top card's own `destroyed` triggers with `what.this` after it leaves (EBP03-052). The destroy log lists the discard ids of the cards that were under it (`underDiscardIds`); the discard pile is public.
- `placeUnder` with several possible cards to go under asks the effect's player which one (it took the first before). A card on the field goes under alone; the cards under it stay in its zone.
- `play` with `onTop` stacks the played card on that card's stack (3.2.5), with no zone choice and no overload; with that card gone, nothing is played.
- A `discard` effect binds the discarded cards with `as` (EBP03-032: "+1,000 for each card discarded this way").
- "A card with [base] in play" is a strategy card with Base in your strategy zones; it reads the printed [base] icon until the Base cards get data in M12c-2 (decision 131).
- EPR-020's data is in a new `PR.json` set file; the rest of PR waits for M12e.

### M12c-2: C4, E14, E16, E20, K1, K2, X, C5 `countsAs`, and two new actions (EBP03 done)

```typescript
type Amount = ... | { colorsAmong: Selector; times: number };      // C4: distinct colors, White included

target { select; count; chooser; order?: "lowestRank" | "leftmost" | "rightmost" }   // X: ties to the chooser (Q33)

type Effect = ...
  | { effect: "moveMonsterVertically"; player: "you" | "opponent"; filter: Selector; fromZones: Zone[] }  // E14, Q21
  | { effect: "loseGame" | "winGame"; player: "you" | "opponent" }                                        // E16 (1.2.4)
  | { effect: "setStrategyZones"; player: "you"; count: 3 };                                              // E20 (4.5.2)

type Modifier = ... | { flag: "rageCannotBeReducedByOpponent"; target: Selector };   // M1, Q16
type ReplaceableEvent = { event: "destroyed" | "strategyToDiscard" | "invasionCost"; what: Selector };  // E21

playRule { ...; onTopOf?: Selector }                                  // M2: a main phase play on top of that card
{ kind: "countsAs"; id; type: "Monster"; area: "discard" }            // C5, Q34 (an ability kind)
{ kind: "keyword"; keyword: { name: "base" } }                        // K1: 7.2.3 skips the card
deckRules: [{ rule: "resonance"; colors: Color[]; conditions: (       // K2 (6.1.2, 12.8.2)
  { every: "Monster" | "Battle" | "Strategy"; anyTraits?: string[]; minRank?: number; text: string }
  | { atLeast: number; cards: "Monster" | "Battle" | "Strategy"; text: string })[] }]
```

Built differently from the plan:

- EBP03-004's `invasionCost` replacement is a new main phase action, `invadeFromDeck`, offered while the invading monster has it: the replacement's effects (a mill of 1, bound as `paid`) pay for the invasion, and the milled card's invasion icon counts (8.6.1.1). The `/play` prompt shows it as a button next to Pass.
- EBP03-051's play rule is a `playBattle` action with `onTop: true`, offered for zones whose top card the rule's `onTopOf` picks, at the reduced rank; the card is stacked on that card (3.2.5), with no overload. The plain play into that zone stays.
- C5's `countsAs` is an ability kind, not a selector filter: counting monster cards in its owner's discard pile (a condition's `count` or an amount's `per`) also counts the card, by either player (Q34); selecting monster cards never picks it.
- A strategy zone list holds 2 zones, or 3 after E20; strategy zone 3 shows on the mat in the corner past zone 8 only once a player has it.
- An "X" counter power or threat (printed as -1 in the card data) reads as 0; the card's ability gives it (EBP03-067).
- Base's automatic ability ("When any monster card invades into zones 6-8, [destroy] this card") is ordinary data: an `invades` trigger with `whose: "any"` and `intoZones: [6, 7, 8]` (Q18, Q19).
- EBP03-078's two destroys run in turn, the rightmost first; the leftmost is then picked among the cards left.
