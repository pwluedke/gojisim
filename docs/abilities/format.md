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
| `play` | `from`, `filter`, `count`, `zones?`, `asManyAsPossible?`, `preferEmpty?`, `ignoreRankLimit` | 24 | 2 | M4d |
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
