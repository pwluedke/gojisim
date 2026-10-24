# M12 Plan: Abilities for Every Set (M12-0)

Gap report for M12, the milestone that gives every card outside the starter decks ability data. Inputs: `pnpm abilities:coverage`, `docs/abilities/survey.json`, `docs/abilities/format.md`, `docs/abilities/findings.md`, `docs/rules/spec.md`, the Comprehensive Rules v1.2 and the card text in `packages/cards/data/cards.json` (errata applied). Written Oct 23, 2026; set order updated the same day (Paul: EBP03 before EBP04).

## Summary

- 353 of the 384 cards in scope are manual today; only the 31 starter cards (ESD01, ESD02) have ability data.
- 116 of the 353 can be written with today's format, as data only (vanilla cards included). The other 237 need new format pieces: 45 pieces, listed in section 3. Most of them are shared: 40 pieces are used by 2 or more sets, so they are built once, in the first set that needs them.
- Order: EBP01, EBP02, EBP03, EBP04, then PR/EPR, ESC01 and FC01 (Paul's order, Oct 23, 2026; the deck counts alone put EBP04 before EBP03).
- 20 rules questions (Q15 to Q34, section 4), all approved by Paul on Oct 23, 2026, Q23 reworded.
- No card stays manual: with Q22 and Q23 ruled, EBP04-012, EBP04-033 and EBP04-034 go in the EBP04 PR (section 5). M12 ends at 384 of 384.
- 8 PRs: one per set, with EBP01 split in two (section 6). EBP01 builds the most pieces (24); later sets mostly reuse them.

## 1. Sets and counts

Counts from `cards.json`: prints (all printings, parallels included), distinct cards (one per deck card number) and base cards. "In scope" leaves out Rage cards and tokens, as the coverage report does. Tokens need ability data too, but they come with the set that creates them (piece E6).

| Set                | What it is         | Prints | Distinct | In scope | Monster | Battle | Strategy | Tokens | Implemented | Manual  |
| ------------------ | ------------------ | ------ | -------- | -------- | ------- | ------ | -------- | ------ | ----------- | ------- |
| ESD01              | Starter deck       | 24     | 16       | 16       | 7       | 5      | 4        | 0      | 16          | 0       |
| ESD02              | Starter deck       | 20     | 15       | 15       | 6       | 7      | 2        | 0      | 15          | 0       |
| EBP01              | Booster            | 162    | 80       | 80       | 25      | 38     | 17       | 0      | 0           | 80      |
| EBP02              | Booster            | 168    | 84       | 80       | 35      | 30     | 15       | 4      | 0           | 80      |
| EBP03              | Booster            | 160    | 80       | 80       | 29      | 38     | 13       | 0      | 0           | 80      |
| EBP04              | Booster            | 179    | 90       | 89       | 36      | 38     | 15       | 1      | 0           | 89      |
| ESC01              | Special set        | 12     | 6        | 6        | 2       | 4      | 0        | 0      | 0           | 6       |
| FC01               | Godzilla Fest 2025 | 6      | 6        | 6        | 1       | 3      | 2        | 0      | 0           | 6       |
| PR, EPR            | Promos             | 96     | 76       | 12       | 8       | 2      | 2        | 0      | 0           | 12      |
| RAGE               | Rage cards         |        | 42       | 0        |         |        |          |        |             |         |
| **Total in scope** |                    |        |          | **384**  |         |        |          |        | **31**      | **353** |

Notes:

- PR has 96 prints but only 15 base cards of its own (PR-001 to PR-003 and PR-006 to PR-010 are vanilla monsters, PR-011 to PR-013 are Rage cards, PR-014 is a strategy card, PR-015 and PR-016 are battle cards) plus EPR-005 Godzilla's Bite. Every other PR print is a reprint whose deck card number belongs to its original set (decision 20), so its abilities come with that set. The 12 in-scope PR cards are the 12 non-Rage originals.
- FC01's 6 cards have Japanese names and English text. Ten PR prints also have Japanese names; matching a card by name ("a card named ...") against them is in format.md's deferred list. None of the 12 cards here names a Japanese-named card, so it isn't needed in M12.
- EBP02's tokens are EBP02-T01 Conductorless Train Bombers, T02 Tentacles, T03 Crystals and T04 Chibi Godzilla 2nd Form; EBP04's is EBP04-T01 Godzilla Earth. Three of them have abilities (T01, T03, T04).

## 2. Priority

Counted from `local-decks/paul-decks.txt` (25 decks), grouped by each card's deck card number set. Counts only, no deck contents.

| Order | Set          | Copies | Decks using it | Distinct cards used |
| ----- | ------------ | ------ | -------------- | ------------------- |
| 1     | EBP01        | 430    | 23             | 59                  |
| 2     | EBP02        | 355    | 17             | 52                  |
| 3     | EBP03        | 144    | 16             | 32                  |
| 4     | EBP04        | 174    | 14             | 44                  |
| -     | ESD01 (done) | 149    | 12             | 16                  |
| -     | ESD02 (done) | 79     | 6              | 15                  |
| 5     | PR, EPR      | 12     | 4              | 1                   |
| 6     | ESC01        | 7      | 2              | 1                   |
| 7     | FC01         | 0      | 0              | 0                   |

The decks use 189 distinct manual cards (1,122 copies). By copies EBP04 comes before EBP03, but Paul set the order EBP01, EBP02, EBP03, EBP04 (Oct 23, 2026). EBP03 therefore builds the pieces it shares with EBP04: colors (C4), Base (K1), Resonance (K2), targeting orders (X) and the vertical move (E14).

## 3. Format gaps

Each piece below is a proposed addition to `docs/abilities/format.md`, written in its style. Every piece is built once, in the first PR whose set needs it ("Built in"); later sets reuse it. Card numbers are deck card numbers; the per-set tables in section 6 list every card with the pieces it needs.

### Shared pieces

| Piece                                                                       | Built in | EBP01 | EBP02 | EBP03 | EBP04 | PR  | ESC01 | FC01 | Sets |
| --------------------------------------------------------------------------- | -------- | ----- | ----- | ----- | ----- | --- | ----- | ---- | ---- |
| C1 "If you do" and "otherwise"                                              | EBP02    |       | 4     | 14    | 7     | 1   | 1     | 1    | 6    |
| C2 This-turn memory                                                         | EBP01    | 2     | 2     | 1     |       |     | 1     |      | 4    |
| C3 Zone numbers and positions                                               | EBP02    |       | 3     | 3     | 5     |     |       |      | 3    |
| C4 Colors                                                                   | EBP03    |       |       | 1     | 17    |     |       |      | 2    |
| C5 New selector filters                                                     | EBP01    | 2     | 5     | 5     | 4     |     |       | 1    | 5    |
| C6 New amounts                                                              | EBP01    | 2     | 5     | 4     |       |     |       |      | 3    |
| C7 How a card was played                                                    | EBP01    | 1     |       | 1     |       |     |       |      | 2    |
| T1 Destroyed trigger                                                        | EBP01    | 1     |       |       | 3     |     |       |      | 2    |
| T2 Revenge (keyword)                                                        | EBP02    |       | 5     | 3     | 3     |     |       |      | 3    |
| T3 Discarded trigger, and abilities that work from the hand or discard pile | EBP01    | 2     | 2     | 7     | 5     |     |       |      | 4    |
| T4 Countered trigger                                                        | EBP01    | 1     |       | 3     | 1     |     | 1     |      | 4    |
| T5 Advanced trigger                                                         | EBP01    | 3     | 1     |       |       |     |       |      | 2    |
| T6 Invades trigger (once per invasion)                                      | EBP01    | 3     |       | 2     | 1     |     |       |      | 3    |
| T7 Card-played trigger: source area and the played card                     | EBP02    |       | 1     | 1     | 2     |     |       |      | 3    |
| T8 Delayed triggers made by an effect                                       | EBP01    | 1     |       |       |       | 1   |       |      | 2    |
| T9 Trigger an ability again                                                 | EBP04    |       |       |       | 1     |     |       |      | 1    |
| E1 Advance and retreat                                                      | EBP01    | 7     | 6     | 7     | 2     |     | 1     |      | 5    |
| E2 Mill (send the top of the deck to the discard pile)                      | EBP01    | 4     | 5     | 1     | 6     |     | 1     | 1    | 6    |
| E3 Reveal or look at the top of the deck                                    | EBP01    | 3     | 3     | 4     | 2     |     |       | 1    | 5    |
| E4 Place a card under a card                                                | EBP01    | 2     | 2     | 7     | 1     | 1   |       |      | 5    |
| E5 Return from the discard pile                                             | EBP01    | 1     | 2     | 2     |       |     |       |      | 3    |
| E6 Tokens                                                                   | EBP02    |       | 8     |       | 2     |     |       |      | 2    |
| E7 Choose one                                                               | EBP01    | 1     | 4     | 3     | 1     |     |       |      | 4    |
| E8 Set rage                                                                 | EBP01    | 1     |       | 1     |       |     |       |      | 2    |
| E9 Swap two battle cards                                                    | EBP01    | 1     | 1     |       | 1     |     |       |      | 3    |
| E10 Move battle cards: choice of card, opponent's cards, this card          | EBP01    | 1     | 3     | 2     | 1     |     |       |      | 4    |
| E11 Discard: whole hand, each player, and the discarded cards               | EBP02    |       | 1     | 3     |       |     | 1     | 1    | 4    |
| E12 Counter (the instruction)                                               | EBP02    |       | 1     |       | 1     |     |       |      | 2    |
| E13 Move as though countered, and counter-proof monsters                    | EBP01    | 3     | 1     |       | 1     |     |       |      | 3    |
| E14 Vertical monster move                                                   | EBP03    |       |       | 1     | 1     |     |       |      | 2    |
| E15 Extra advances                                                          | EBP02    |       | 1     |       | 1     |     |       |      | 2    |
| E16 Win or lose the game                                                    | EBP03    |       |       | 1     |       |     |       |      | 1    |
| E17 Activate a strategy card from the deck, hand or discard pile            | EBP01    | 1     |       | 1     | 1     |     |       |      | 3    |
| E18 Play and evolve extensions                                              | EBP01    | 4     | 1     | 7     | 4     |     | 1     |      | 5    |
| E19 Effects that last (until end of turn, rest of game, during a phase)     | EBP02    |       | 2     | 1     | 1     |     |       |      | 3    |
| E20 A third strategy zone                                                   | EBP03    |       |       | 1     |       |     |       |      | 1    |
| E21 More replacements                                                       | EBP02    |       | 1     | 2     | 1     |     |       |      | 3    |
| M1 Flags and statuses                                                       | EBP01    | 5     | 5     | 3     | 11    |     |       | 1    | 5    |
| M2 Play cost: reduced rank, restrictions and alternative plays              | EBP01    | 6     | 2     | 2     | 6     |     | 1     | 1    | 6    |
| M3 Rank modifiers on cards in a hand                                        | EBP04    |       |       |       | 3     |     |       |      | 1    |
| K1 Base (keyword)                                                           | EBP03    |       |       | 4     | 4     |     |       |      | 2    |
| K2 Resonance (deck rules)                                                   | EBP03    |       |       | 3     | 1     |     |       |      | 2    |
| K3 Start in another zone                                                    | EBP02    |       | 1     |       |       |     |       |      | 1    |
| X Targeting orders and constrained picks                                    | EBP03    |       |       | 2     | 2     |     |       |      | 2    |
| CU Custom handlers                                                          | EBP02    |       | 1     |       | 3     |     |       |      | 2    |

### Conditions and values

#### C1. "If you do" and "otherwise"

Rules: 10.5.4, 10.5.4.1. Built in: EBP02.

```typescript
type Condition = ... | { didLastStep: true }          // schema today, build it: the previous step was done (10.5.4)
type Effect = ... | { effect: "if"; condition: Condition; then: Effect[]; else?: Effect[] }   // "otherwise", "if you do not"
```

`didLastStep` is in the schema but throws today. Most "you may A. If you do, B" cards are an optional cost (Q2, built in M4d), including every EBP01 card with that wording. C1 covers the rest: an "if you do" after a step that isn't a cost (a search that may find nothing, a move, the opponent's discard in "if they discard at least 1"), and "if you do not, destroy this card" (EBP04-055) through `else`.

Cards (28): EBP02-007, EBP02-052, EBP02-059, EBP02-070, EBP03-001, EBP03-002, EBP03-003, EBP03-005, EBP03-014, EBP03-016, EBP03-017, EBP03-025, EBP03-026, EBP03-028, EBP03-033, EBP03-034, EBP03-035, EBP03-047, EBP04-009, EBP04-010, EBP04-014, EBP04-027, EBP04-050, EBP04-055, EBP04-064, PR-016, ESC01-003, FC01-003.

#### C2. This-turn memory

Rules: 8.6, 5.13.3. Built in: EBP01.

```typescript
type Condition = ... | { thisTurn: "invaded" | "opponentBattleDestroyed"; whose?: PlayerRef }
type Amount   = ... | { invasionAdvancesThisTurn: PlayerRef }      // zones advanced by invasion this turn
```

Kept in `turnFlags` (cleared at 7.1.1): whether the player invaded, how many zones the invasion advanced (5.13.3 counts only real moves), and whether an opponent's battle card was destroyed. EBP02-079 branches on the advance count with `chooseOne`-style `if` steps.

Cards (6): EBP01-012, EBP01-033, EBP02-019, EBP02-079, EBP03-064, ESC01-003.

#### C3. Zone numbers and positions

Rules: 4.4.3, 4.4.5.3, 4.4.5.5. Built in: EBP02.

```typescript
type Condition = ... | { zoneNumber: "this"; op: Op; of: "opponentMonster" | "yourMonster" }
type ZoneSet   = ... | { relation: "sameNumberAs" | "atOrBefore" | "sideAdjacent"; of: ZoneAnchor }
               | { numbersFrom: { bound: string; field: "rank" } }      // zones matching revealed ranks
chooseZone: { owner, as, within?: ZoneSet }                             // limit the zone choice
```

"Same number as the zone your opponent's monster occupies" (EBP02-008, -015), "at or before" (EBP02-018), side-to-side moves (EBP03-058), zone-number comparisons (EBP04-016 to -019) and zones named by revealed ranks (EBP03-073, EBP04-013).

Cards (11): EBP02-008, EBP02-015, EBP02-018, EBP03-009, EBP03-058, EBP03-073, EBP04-013, EBP04-016, EBP04-017, EBP04-018, EBP04-019.

#### C4. Colors

Rules: 2.4 (colors). Built in: EBP03.

```typescript
type Amount   = ... | { colorsAmong: Selector; times?: number; white?: boolean }   // distinct colors
type Selector = { ...; notColors?: Color[] }                                     // "non-red"
```

Distinct colors among a selection (Monster X, Kaizer Ghidorah), "non-red"/"non-green" filters, and "an opponent's blue monster card" (already a `colors` filter on `area: "monster"`). Whether white counts is per card (EBP04-047 says it does).

Cards (18): EBP03-067, EBP04-011, EBP04-021, EBP04-031, EBP04-032, EBP04-033, EBP04-034, EBP04-035, EBP04-036, EBP04-039, EBP04-044, EBP04-045, EBP04-047, EBP04-057, EBP04-066, EBP04-068, EBP04-082, EBP04-088.

#### C5. New selector filters

Rules: 2.5, 2.6, 2.10 (card information). Built in: EBP01.

```typescript
type Selector = { ...;
  threat?: { op: Op; value: number };        // "monster card with 50,000 or lower threat level"
  counterPower?: { op: Op; value: number };  // "6000 or lower counter power"
  nameIncludes?: string;                     // "with \"MB\" in their name"
  anyTraits?: string[];                      // "[gigan] or [megalon]"
  invadeIcon?: number;                       // "a card with [invade-2]"
  countsAs?: "Monster";                      // Godzilla's Skeleton (EBP03-071)
}
```

Today a selector filters by owner, area, type, name, traits (all of), keyword, colors, rank and zones.

Cards (17): EBP01-015, EBP01-072, EBP02-023, EBP02-036, EBP02-040, EBP02-042, EBP02-064, EBP03-047, EBP03-050, EBP03-054, EBP03-071, EBP03-076, EBP04-022, EBP04-027, EBP04-043, EBP04-051, FC01-003.

#### C6. New amounts

Rules: 3.4, 10.8.1. Built in: EBP01.

```typescript
type Amount = ... | { rageOf: PlayerRef; times: number }          // per [rage]
  | { monsterRankOf: PlayerRef; times: number }                    // per rank of a monster
  | { unoccupiedZonesOf: PlayerRef; times: number }
type Count = ... | { exact: Amount }                               // "destroy 1 for each ..."
```

`Amount.per` (count a selection) exists; these add rage, monster rank and empty zones, and let a count be an amount (EBP02-004, -054).

Cards (11): EBP01-056, EBP01-075, EBP02-004, EBP02-045, EBP02-051, EBP02-054, EBP02-074, EBP03-007, EBP03-011, EBP03-053, EBP03-057.

#### C7. How a card was played

Rules: 5.11.3, 8.2. Built in: EBP01.

```typescript
type Condition = ... | { playedVia: "evolution" | "burst" | "effect" | "hand" }   // "if this card was played from your hand"
```

A main phase play from the hand has no `playedVia` today; give it `"hand"`.

Cards (2): EBP01-019, EBP03-036.

### Triggers

#### T1. Destroyed trigger

Rules: 5.12, 11.3, 11.5, 10.10. Built in: EBP01.

```typescript
type Trigger = ... | { on: "destroyed"; what: Selector; cause?: "effect" | "crush" | "overload";
                       by?: PlayerRef; as?: string }          // binds the destroyed card (last known info, 10.10)
```

In the schema, not matched today. The destroy log needs the cause (effect, 11.3 crush, 11.5 overload) and whose effect, and the trigger binds the destroyed card so EBP04-005 can read its rank.

Cards (4): EBP01-007, EBP04-002, EBP04-005, EBP04-039.

#### T2. Revenge (keyword)

Rules: 12.7.1 to 12.7.3, 10.6.4. Built in: EBP02.

```typescript
{ kind: "keyword"; keyword: { name: "revenge" } } +
{ kind: "triggered"; id; trigger: { on: "revenge" }; effects }   // expands to: this card moved from the field
                                                                  // to its discard pile, not by overload (12.7.2)
```

Deferred to the first set that uses it (format.md, Paul approved Oct 21, 2026). It resolves from the discard pile, so the engine needs "look-back" triggers: the ability is checked as it was on the field (inactive if the card was stacked under another, 12.7.3).

Cards (11): EBP02-058, EBP02-059, EBP02-060, EBP02-062, EBP02-064, EBP03-059, EBP03-060, EBP03-062, EBP04-059, EBP04-062, EBP04-063.

#### T3. Discarded trigger, and abilities that work from the hand or discard pile

Rules: 5.7, 7.2.3, 8.6.1.1, 12.5.2, 10.3. Built in: EBP01.

```typescript
type Trigger = ... | { on: "discarded"; what: Selector; from: "hand" | "strategy";
                       cause?: "effect" | "invasion" | "cost" | "burst"; byOpponentEffect?: boolean; as?: string }
type Ability (triggered) = { ...; activeIn?: ("field" | "hand" | "discard")[] }   // default: the field
```

"When this card is discarded from your hand by your opponent's effect, you may play this card" (Fire Rodan and others), "whenever you discard a battle card from your hand", "when your card is sent from a strategy zone to the discard pile", and the Burst discard (EBP02-009).

Cards (16): EBP01-059, EBP01-066, EBP02-009, EBP02-022, EBP03-015, EBP03-016, EBP03-017, EBP03-039, EBP03-061, EBP03-063, EBP03-067, EBP04-014, EBP04-015, EBP04-046, EBP04-052, EBP04-085.

#### T4. Countered trigger

Rules: 5.15, 7.4.3. Built in: EBP01.

```typescript
type Trigger = ... | { on: "countered"; whose: "this" | "you" | "opponent" }   // "this card is countered" /
                                                                             // "you successfully counter"
```

In the schema, not matched today. A move "as though it were countered" is not a counter (Q14, approved).

Cards (6): EBP01-043, EBP03-019, EBP03-020, EBP03-023, EBP04-022, ESC01-001.

#### T5. Advanced trigger

Rules: 5.13.1, 5.13.3. Built in: EBP01.

```typescript
type Trigger = ... | { on: "advanced"; whose: "this" | PlayerRef; toZone?: Zone;
                       intoColumnOf?: "opponentMonster"; during?: Phase }
```

Any real advance (end phase 7.5.2, invasion, effect). "Reaches zone 8" (EBP01-004), "advances into the same column as your opponent's monster card" (EBP01-011).

Cards (4): EBP01-004, EBP01-011, EBP01-037, EBP02-047.

#### T6. Invades trigger (once per invasion)

Rules: 5.14.1, 8.6. Built in: EBP01.

```typescript
type Trigger = ... | { on: "invades"; whose: PlayerRef; intoZones?: ZoneSet }   // the 8.6 action, not [invading]
```

"Whenever your monster card invades" fires once per invasion action, unlike [invading] (once per advance, Q4). Base cards use it with `intoZones: [6, 7, 8]` and `whose: "any"` (Q18, Q19).

Cards (6): EBP01-020, EBP01-073, EBP01-076, EBP03-042, EBP03-062, EBP04-050.

#### T7. Card-played trigger: source area and the played card

Rules: 5.11, 8.2. Built in: EBP02.

```typescript
type Trigger (cardPlayed) = { on: "cardPlayed"; by; what; from?: "hand" | "deck" | "discard"; as?: string }
```

"Whenever your opponent plays a battle card from their deck" (EBP04-028, -072); "destroy ... in the same column as that battle card" (EBP02-073) binds the played card.

Cards (4): EBP02-073, EBP03-063, EBP04-028, EBP04-072.

#### T8. Delayed triggers made by an effect

Rules: 10.6.5, 10.6.5.1. Built in: EBP01.

```typescript
type Effect = ... | { effect: "until"; duration: "endOfTurn"; abilities: Ability[] }   // a timed trigger (10.6.5)
```

"When your monster card invades this turn, [destroy] ..." (EBP01-076) and "[destroy] this card at the beginning of the end phase" (PR-016). Burst's discard already uses `state.timedTriggers` (decision 157).

Cards (2): EBP01-076, PR-016.

#### T9. Trigger an ability again

Rules: 10.6, F13. Built in: EBP04.

```typescript
type Effect = ... | { effect: "retrigger"; keyword: "enter"; target: Selector }
```

The New Gotengo (EBP04-041): "trigger all [enter] abilities of your monster card" puts those abilities in standby with no event (finding F13).

Cards (1): EBP04-041.

### Effects

#### E1. Advance and retreat

Rules: 5.13.1, 5.13.2. Built in: EBP01.

```typescript
{ effect: "advance" | "retreat"; target: Selector (area: "monster"); by?: number; toZone?: Zone }
```

In the schema, not built. Targets carry a `threat` filter (C5) for "an opponent's monster card with 50,000 or lower threat level". `advanceMonster`/`retreatMonster` already exist in the engine (M3c).

Cards (23): EBP01-008, EBP01-011, EBP01-012, EBP01-015, EBP01-030, EBP01-072, EBP01-078, EBP02-003, EBP02-013, EBP02-014, EBP02-019, EBP02-023, EBP02-036, EBP03-001, EBP03-023, EBP03-025, EBP03-035, EBP03-050, EBP03-054, EBP03-073, EBP04-013, EBP04-051, ESC01-003.

#### E2. Mill (send the top of the deck to the discard pile)

Rules: 5.7.3, 5.10. Built in: EBP01.

```typescript
{ effect: "mill"; player: EffectPlayer; count: number; reveal?: boolean; as?: string }
```

In the schema, not built. "If it is a monster card" reads the bound card with an existing `count` condition on `area: "bound"`.

Cards (18): EBP01-001, EBP01-002, EBP01-003, EBP01-072, EBP02-014, EBP02-047, EBP02-048, EBP02-049, EBP02-077, EBP03-073, EBP04-013, EBP04-021, EBP04-022, EBP04-049, EBP04-061, EBP04-075, ESC01-005, FC01-002.

#### E3. Reveal or look at the top of the deck

Rules: 5.5, 5.10, 4.8.2. Built in: EBP01.

```typescript
{ effect: "revealTop" | "lookTop"; player; count: Amount; as: string;
  effects: Effect[];                          // e.g. addToHand / play / destroy using the bound cards
  rest?: "discard" | "topAnyOrder" | "keep" }  // "send the rest to your discard pile", "put any number back in any order"
```

In the schema, not built. Looked-at cards are private to their player (decision 140 pattern); revealed cards show to both (decision 147).

Cards (13): EBP01-015, EBP01-021, EBP01-070, EBP02-007, EBP02-078, EBP02-080, EBP03-007, EBP03-011, EBP03-031, EBP03-071, EBP04-077, EBP04-079, FC01-005.

#### E4. Place a card under a card

Rules: 3.2.1 to 3.2.5. Built in: EBP01.

```typescript
{
  effect: "placeUnder";
  target: Selector;
  under: Selector;
} // from discard, hand, strategy zone, deck, or this card
```

In the schema, not built. Cards under a card have no active abilities (3.2.3.1) and move with the stack (3.2.4). `count` with `area: "under"` already reads them.

Cards (13): EBP01-026, EBP01-073, EBP02-012, EBP02-046, EBP03-025, EBP03-026, EBP03-028, EBP03-042, EBP03-043, EBP03-052, EBP03-064, EBP04-043, PR-016.

#### E5. Return from the discard pile

Rules: 5.2.1, 5.3. Built in: EBP01.

```typescript
addToHand { target: Selector (area: "discard") }            // existing effect, from the discard pile
putOnDeck  { target: Selector (area: "discard"); where }      // extend to the discard pile
{ effect: "returnDiscardToDeck"; player: EffectPlayer }        // "return all cards in your discard pile to your deck"
```

The schema's planned `returnToHand` is `addToHand` from the discard pile, which works today. New: the whole discard pile into the deck (EBP01-058, EBP02-035) and `putOnDeck` from the discard pile (EBP03-055).

Cards (5): EBP01-058, EBP02-009, EBP02-035, EBP03-055, EBP03-077.

#### E6. Tokens

Rules: 9.1, 5.11.4. Built in: EBP02.

```typescript
{ effect: "createToken"; name: string; zones: ZoneSet | "eachUnoccupied"; count?: number;
  asManyAsPossible?: boolean }       // token data comes from cards.json (EBP02-T01 to T04, EBP04-T01)
```

In the schema, not built. Tokens are treated as cards (9.1.1.1) with their own abilities (Crystals' threat, Chibi Godzilla 2nd Form's end-phase swap), exist only in zones (9.1.4.1) and disappear when moved anywhere else (9.1.4.2), so they never reach the discard pile. Their ability data goes in the set files under their token numbers. Names match case-insensitively: EBP02-020 says "Conductorless train bombers".

Cards (10): EBP02-020, EBP02-025, EBP02-035, EBP02-052, EBP02-053, EBP02-054, EBP02-057, EBP02-077, EBP04-026, EBP04-067.

#### E7. Choose one

Rules: 10.5.2.2.1. Built in: EBP01.

```typescript
{ effect: "chooseOne"; options: { gates?: Gate[]; condition?: Condition; effects: Effect[] }[] }
```

In the schema, not built. Options can carry their own gate or condition: EBP02-071's options need [awakening-6] and [awakening-8]; EBP01-064's second option needs 4 battle cards.

Cards (9): EBP01-064, EBP02-038, EBP02-049, EBP02-050, EBP02-071, EBP03-029, EBP03-046, EBP03-077, EBP04-050.

#### E8. Set rage

Rules: 3.4. Built in: EBP01.

```typescript
{
  effect: "setRage";
  player: EffectPlayer;
  value: number;
}
```

In the schema, not built. Goes through `setRage` (decision 154), which logs the change.

Cards (2): EBP01-073, EBP03-079.

#### E9. Swap two battle cards

Rules: 5.6. Built in: EBP01.

```typescript
{ effect: "swap"; owner: "you" | "opponent"; optional?: boolean }   // choose 2 battle cards in that player's zones
```

Both cards move at once (5.6.1); a swap that can't happen does nothing (5.6.2).

Cards (3): EBP01-057, EBP02-069, EBP04-053.

#### E10. Move battle cards: choice of card, opponent's cards, this card

Rules: 5.2.1, 11.5. Built in: EBP01.

```typescript
moveBattle { target: Selector; count?: Count; to: ZoneSet; optional?: boolean }   // choose which card
                                                                                  // when several match
```

`moveBattle` moves one card on its owner's field today (decision 153). Add the choice among several targets, the opponent's cards (EBP02-057) and fixed destinations such as "a zone adjacent to your monster card" (EBP04-039).

Cards (7): EBP01-022, EBP02-010, EBP02-019, EBP02-057, EBP03-030, EBP03-058, EBP04-039.

#### E11. Discard: whole hand, each player, and the discarded cards

Rules: 5.7.1, 5.7.2. Built in: EBP02.

```typescript
discard { player: EffectPlayer; count: Count | "hand"; filter?; chooser; as?: string }   // "discard your hand"
discardDownTo { player: "each"; size }                                                    // build "each"
```

"Discard your entire hand" and counting what was discarded ("for each strategy card discarded", EBP03-032, ESC01-006), and `discardDownTo` for each player (EBP03-029; decision 141 left it unbuilt).

Cards (6): EBP02-040, EBP03-010, EBP03-029, EBP03-032, ESC01-006, FC01-005.

#### E12. Counter (the instruction)

Rules: 5.15.1. Built in: EBP02.

```typescript
{ effect: "counter"; target: Selector (area: "monster") }   // 5.15.1: move back from 6-8, then the next monster
```

EBP02-012 counters the opponent's monster; EBP04-027 counters its own Gigan to rank up. The engine's `counterMonster` (M3c) already does 5.15.1.

Cards (2): EBP02-012, EBP04-027.

#### E13. Move as though countered, and counter-proof monsters

Rules: 5.15.1.1, 7.4.3. Built in: EBP01.

```typescript
{ effect: "moveAsCountered"; target: Selector (area: "monster") }        // 5.15.1.1 only
type Modifier = ... | { flag: "counterProof"; target; atOrBelow: number; insteadMoves: boolean }
```

"Cannot be countered by 50,000 or lower counter power, instead it only moves as though it were countered" changes the 7.4.3 counter check; EBP04-014's version doesn't move (Q20). Not a counter (Q14).

Cards (5): EBP01-038, EBP01-066, EBP01-077, EBP02-027, EBP04-014.

#### E14. Vertical monster move

Rules: 4.4.5.1, 11.3. Built in: EBP03.

```typescript
{ effect: "moveMonsterVertically"; target: Selector (area: "monster"); fromZones: Zone[] }   // 3 to 8, 4 to 7, 5 to 6
```

Not an advance or retreat; cards in between are not destroyed (Q21).

Cards (2): EBP03-068, EBP04-078.

#### E15. Extra advances

Rules: 7.5.2, 8.6.1.2. Built in: EBP02.

```typescript
type Modifier = ... | { flag: "extraAdvance"; when: "endPhase"; amount: Amount }
                  | { flag: "invasionAdvances"; ifIcon: number; advances: number }
```

SpaceGodzilla (EBP02-056) advances 1 more per Crystals in the end phase; Godzilla (1962) (EBP04-007) advances 2 when it invades with an icon 1 card.

Cards (2): EBP02-056, EBP04-007.

#### E16. Win or lose the game

Rules: 1.2.1, 1.2.4. Built in: EBP03.

```typescript
{
  effect: "winGame" | "loseGame";
  player: EffectPlayer;
}
```

EBP03-013 (no cards in your strategy zones at the opponent's counter phase: you lose). Losses settle through `markLoss` (decision 85).

Cards (1): EBP03-013.

#### E17. Activate a strategy card from the deck, hand or discard pile

Rules: 5.9, 8.3. Built in: EBP01.

```typescript
{ effect: "activate"; from: "deck" | "hand" | "discard"; filter: Selector; ignoreRank?: boolean }
```

"Put it into play ... then activate it" places the card in an empty strategy zone and triggers its placement text (10.1.1.1.2).

Cards (3): EBP01-060, EBP03-012, EBP04-005.

#### E18. Play and evolve extensions

Rules: 5.11, 5.17, 12.6.2, 8.5.1.1. Built in: EBP01.

```typescript
play   { ...; onTop?: Selector }                     // "play it on top of this card" (a stack, not a zone)
play   { from: "monsterDeck"; ... }                  // EBP03-074: the next monster, rank +1, no rage
evolve { target: Selector; count?: Count }           // "evolve all of your ... battle cards"
```

Playing this card from the discard pile when its own trigger fires (Fire Rodan, Dagahra), playing on top of a chosen card, evolving several cards in turn, and playing a monster from the monster deck.

Cards (17): EBP01-035, EBP01-036, EBP01-059, EBP01-063, EBP02-022, EBP03-023, EBP03-042, EBP03-043, EBP03-047, EBP03-061, EBP03-063, EBP03-074, EBP04-046, EBP04-077, EBP04-080, EBP04-086, ESC01-002.

#### E19. Effects that last (until end of turn, rest of game, during a phase)

Rules: 10.6.5, 10.8.2, 10.8.1.7.2. Built in: EBP02.

```typescript
{ effect: "modify"; duration: "endOfTurn" | "restOfGame"; modifiers: Modifier[] }   // one-shot -> continuous effect
type Gate = ... | { gate: "phase"; phase: Phase }                                   // "during the end phase"
type Amount = ... | { snapshot: ValueRef }                                         // value at resolution
```

"For the rest of the turn, double the counter power" (EBP02-029, Q26), "this card gains +1000 counter power for each card discarded this way" for the turn (EBP03-032), "cannot be countered by 30,000 or lower this turn" (EBP04-014). The state already has `continuousEffects` with timestamps.

Cards (4): EBP02-006, EBP02-029, EBP03-032, EBP04-014.

#### E20. A third strategy zone

Rules: 4.5.2. Built in: EBP03.

```typescript
{
  effect: "setStrategyZones";
  player: "you";
  count: 3;
} // rest of the game
```

EBP03-013 only (finding F8). The state model fixes 2 strategy zones today.

Cards (1): EBP03-013.

#### E21. More replacements

Rules: 10.9, 7.2.3, 7.2.4, 8.6.1.1. Built in: EBP02.

```typescript
type ReplaceableEvent = "destroyed"
  | "rageReset"              // EBP04-010: the 7.2.4 reset to 0
  | "strategyToDiscard"      // EBP02-012: strategy cards leaving the strategy zone
  | "invasionCost"           // EBP03-004: send the top card of the deck instead of discarding
replacement { ...; optional?: boolean }   // "you may ... instead": build optional replacements
```

Optional replacements throw today (`not implemented: optional replacement`). M.O.G.U.E.R.A. (EBP03-052) "when this card would be destroyed by an opponent's effect, add all cards under this card to your hand" is a `destroyed` replacement that changes where the cards underneath go.

Cards (4): EBP02-012, EBP03-004, EBP03-052, EBP04-010.

### Modifiers, keywords and deck rules

#### M1. Flags and statuses

Rules: 5.16, 7.4.2, 7.4.3, 7.5.2, 7.5.4, 8.2, 8.3, 8.6. Built in: EBP01.

```typescript
type Modifier = ... | { flag: "cannotEngage"; target; with?: Selector }        // "cannot engage with this card"
  | { flag: "cannotBeDestroyedByOpponent"; target }
  | { flag: "cannotAdvance" | "cannotInvade"; target }
  | { flag: "cannotBeCountered"; target; atOrBelow?: number }
  | { flag: "rageCannotBeReducedByOpponent"; target }
  | { flag: "cannotPlay"; player; what: Selector; zones?: ZoneSet }
  | { flag: "cannotDiscardForInvasion"; player; what: Selector }
  | { flag: "cannotDraw"; player; during?: Phase }
  | { flag: "cannotBeMovedByOpponent"; target }
```

The schema lists five flags; none is built (only a `cannotEngage` status exists). Each flag is read at the rule it changes, e.g. `cannotAdvance` overrides the mandatory 7.5.2 advance (1.3.3).

Cards (25): EBP01-014, EBP01-028, EBP01-052, EBP01-075, EBP01-080, EBP02-024, EBP02-025, EBP02-055, EBP02-068, EBP02-070, EBP03-004, EBP03-053, EBP03-068, EBP04-006, EBP04-027, EBP04-029, EBP04-030, EBP04-031, EBP04-032, EBP04-048, EBP04-056, EBP04-076, EBP04-081, EBP04-085, FC01-006.

#### M2. Play cost: reduced rank, restrictions and alternative plays

Rules: 8.2.1, 8.3.1, 8.5, 1.3.1. Built in: EBP01.

```typescript
{ kind: "playRule"; id;
  rankReduction?: Amount; condition?: Condition; cost?: Cost;          // "with its rank reduced by 2 for each ..."
  onlyInZones?: ZoneSet; forbidden?: Condition;                        // "can only be played in zone 8", "cannot be played if"
  alternative?: { onTopOf: Selector; ignoreRank?: boolean } }          // monster plays onto a named monster
```

Read when `getLegalActions` checks 8.2.1, 8.3.1 and 8.5 (finding F10). After the play the card has its printed rank again ("After being played, this card is rank 8"). Lake Ashi Monster (EBP02-039) grants the reduction to other cards in the hand.

Cards (18): EBP01-027, EBP01-033, EBP01-058, EBP01-073, EBP01-075, EBP01-080, EBP02-039, EBP02-068, EBP03-051, EBP03-066, EBP04-012, EBP04-033, EBP04-034, EBP04-044, EBP04-045, EBP04-067, ESC01-001, FC01-004.

#### M3. Rank modifiers on cards in a hand

Rules: 8.3.1, 10.8.2, 10.8.3. Built in: EBP04.

```typescript
modifier { stat: "rank"; target: Selector (area: "hand"); amount: Amount }   // "They return to their original rank after being played."
```

The `rank` modifier exists for cards in zones; extend the selector to the hand, so 8.3.1 reads the changed rank (EBP04-028, -066, -068).

Cards (3): EBP04-028, EBP04-066, EBP04-068.

#### K1. Base (keyword)

Rules: 12.9.1, 12.9.2, 7.2.3. Built in: EBP03.

```typescript
{ kind: "keyword"; keyword: { name: "base" } }    // 7.2.3 skips the card; its automatic ability is ordinary data
type Modifier = ... | { flag: "staysInStrategyZone" }  // Inherited Life (EBP04-089) without the Base keyword
```

The Base cards' own automatic ability is "When any monster card invades into zones 6-8, [destroy] this card" (T6 with `intoZones`, Q18). Cards that ask "if you have a card with [base] in play" already filter with `keyword: "base"`, which reads ability data.

Cards (8): EBP03-070, EBP03-075, EBP03-076, EBP03-080, EBP04-076, EBP04-082, EBP04-086, EBP04-089.

#### K2. Resonance (deck rules)

Rules: 6.1.2, 12.8. Built in: EBP03.

```typescript
deckRules: [{ rule: "resonance"; colors: Color[];
  conditions: ({ section: "monster" | "main" | "both"; every: Selector }
             | { section: "main"; atLeast: number; of: Selector })[] }]
```

Read by `validateDeck` on the rank I monster (decision 119 waited for this data). EBP03-006, -018, -024 and EBP04-031.

Cards (4): EBP03-006, EBP03-018, EBP03-024, EBP04-031.

#### K3. Start in another zone

Rules: 6.3.1.6, 1.3.1. Built in: EBP02.

```typescript
{
  kind: "setup";
  startZone: Zone;
} // EBP02-024: "at the start of the game it will be played in Zone 5"
```

Finding F7. The rank I monster Biollante Rose Form also can't advance or invade (M1).

Cards (1): EBP02-024.

### Targeting and custom code

#### X. Targeting orders and constrained picks

Rules: 4.4.5.5, 5.12, 10.5.3. Built in: EBP03.

```typescript
target { ...; order?: "lowestZoneFirst" | "lowestRank" | "leftmost" | "rightmost"; oneByOne?: boolean }
count  { anyNumber: true; maxTotalRank?: number }       // "any number ... whose total ranks add up to 7 or less"
```

`anyNumber` throws today. Ties go to the effect's chooser (Q33).

Cards (4): EBP03-067, EBP03-078, EBP04-024, EBP04-035.

#### CU. Custom handlers

Rules: as cited per card. Built in: EBP02.

```typescript
{
  effect: "custom";
  handler: string;
} // already in the schema: named code for one card
```

For one-off rules that a data piece wouldn't reuse: Joint Struggle's trait comparison (EBP02-080), Godzilla Earth's linked card and token (EBP04-067), Gaira's "opponent returns a card from their discard pile" trigger (EBP04-073) and Inherited Life's rage counter with 15/22/30 thresholds (EBP04-089, Q11).

Cards (4): EBP02-080, EBP04-067, EBP04-073, EBP04-089.

## 4. Rules questions (approved)

These were not settled by the Comprehensive Rules v1.2, by Q1 to Q14 (format.md) or by Paul's earlier rulings in `docs/rules/spec.md`. Numbering continues from Q14. Paul approved every proposed answer on Oct 23, 2026, with Q23 reworded (the answer below is the approved wording); they are in the rulings table of `docs/rules/spec.md`. "Needed by" names the set PRs that use each ruling.

| #   | Needed by    | Card and text                                                                                                                                                                                                                                                                                                                                 | Question                                                                                                                                                                                                                                                                                                                                                                          | Answer (approved)                                                                                                                                                                                                                                                         |
| --- | ------------ | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Q15 | EBP04        | EBP04-007 Godzilla (1962): "[burst-3] (... send this card to your discard pile at the beginning of that turn's end phase.)" Earlier sets (EBP02-009, FC01-001) say "your next end phase".                                                                                                                                                     | Is the newer reminder text the same rule?                                                                                                                                                                                                                                                                                                                                         | Yes. A Burst play happens in your main phase, so "that turn's end phase" and "your next end phase" are the same phase (12.5.2.1). No change to decision 157.                                                                                                              |
| Q16 | EBP03, EBP04 | EBP03-004 Godzilla (2001): "This card's [rage] cannot be reduced by your opponent's effects." EBP04-010 Godzilla (2023): "When you would set this card's [rage] to 0 during your start phase ..."                                                                                                                                             | Rage belongs to the player (3.4). Does "this card's [rage]" mean its master's rage?                                                                                                                                                                                                                                                                                               | Yes: the rage of this monster card's master, read while the card is the invading monster.                                                                                                                                                                                 |
| Q17 | EBP02        | EBP02-058 Dorat and 10 other cards with [revenge]. 12.7.2: "placed into the discard pile from the field for a reason other than duplicate card processing".                                                                                                                                                                                   | Is "duplicate card processing" the overload rule (11.5)? Does Revenge trigger after a crush (11.3) or when a stack's lower cards go to the discard pile because the top card was put on the deck (5.12.1.1)?                                                                                                                                                                      | Duplicate card processing is 11.5. Revenge triggers after a crush, after any destroy by an effect, and for a card under a stack when that card itself goes to the discard pile, except that 12.7.3 keeps a card that was stacked underneath from triggering.              |
| Q18 | EBP03, EBP04 | EBP04-076 Godzilla's Dormancy, EBP03-070 Mechagodzilla Hanger and the other Base cards: "When any monster card invades into zones 6-8, [destroy] this card."                                                                                                                                                                                  | When does this trigger: once per invasion action that moves the monster into zone 6, 7 or 8, or once per zone advanced (like [invading], Q4)? Does an invasion from zone 6 to 7 count?                                                                                                                                                                                            | Once per invasion action (8.6) in which the monster enters zone 6, 7 or 8 at any step, including 6 to 7 and 7 to 8. An invasion that doesn't move (5.13.3) doesn't trigger it.                                                                                            |
| Q19 | EBP03, EBP04 | Same Base text: "When any monster card invades ..."                                                                                                                                                                                                                                                                                           | Does "any monster card" include the Base card owner's own monster?                                                                                                                                                                                                                                                                                                                | Yes, either player's monster.                                                                                                                                                                                                                                             |
| Q20 | EBP04        | EBP04-014 Godzilla (2002): "... this card cannot be countered by 30,000 or lower counter power this turn. (It will not retreat.)" EBP01-038 Godzilla (1995) says "instead, it only moves as though it were countered".                                                                                                                        | Does EBP04-014 also stay in place when the counter fails, so 7.4.3 does nothing at all?                                                                                                                                                                                                                                                                                           | Yes. EBP04-014 doesn't move and no next monster comes in; EBP01-038 moves back as though countered (Q14).                                                                                                                                                                 |
| Q21 | EBP03, EBP04 | EBP04-078 The Slithering Disaster: "Move an opponent's monster card in zones 3-5 vertically ... Battle cards in zones between them are not [destroy]." EBP03-068 Godzilla Flies: "Move your rank III or higher monster card in zone 3 vertically to zone 8."                                                                                  | Is a vertical move an advance or retreat (for [invading], advanced triggers and EBP02-079's count)? When the monster lands in zone 8 with its master's battle card there, does crush and destroy (11.3) apply?                                                                                                                                                                    | Neither an advance nor a retreat: no movement triggers, `didAdvance` false. 11.3 still applies in the destination zone, since the reminder text spares only the zones in between.                                                                                         |
| Q22 | EBP04        | EBP04-012 Biollante Plant Beast Form: "You may play this card from your hand by placing 1 rank III card from your monster deck under one of your rank II [biollante] monster cards. (You may play this card from rank II.)"                                                                                                                   | Which card goes under which: the rank III card from the monster deck goes under the rank II monster, and then this card is played on top? Does this count as the turn's monster play, and does rage go up? Can the rank III card be a monster card that would otherwise be a legal next monster?                                                                                  | This card is played on top of the rank II monster as a normal monster play (once per turn, rage +1); the rank III monster deck card goes into that stack under the rank II card.                                                                                          |
| Q23 | EBP04        | EBP04-033 and EBP04-034 Kaizer Ghidorah (rank III monster cards, trait Kaizer Ghidorah): "This card can be played by placing it on top of a monster card with [monster-x] in your zones." The only Monster X monster cards are EBP04-031 (rank I) and EBP04-032 (rank II); Monster X battle cards (EBP03-067, EBP04-047) also have the trait. | Is the "monster card with [monster-x] in your zones" your invading monster, so this is a monster play from the hand onto a rank II Monster X, ignoring both the rank and the trait match of 8.5.1? Does it use the turn's monster play and give rage? When a rank II Monster X is countered, can a Kaizer Ghidorah come in from the monster deck (5.15.1.2 needs a shared trait)? | Kaizer Ghidorah (EBP04-033/034) is played in your main phase on top of your invading Monster X monster card, as your one monster play for the turn, ignoring the rank and trait match. Like every monster play, it increases your rage by 1. Counter rules are unchanged. |
| Q24 | EBP02, EBP04 | EBP02-012 Godzilla (2016) Frozen: "counter your opponent's monster card." EBP04-027 Gigan (2004): "... If they do, counter this card."                                                                                                                                                                                                        | Does a counter by an effect fire "countered" triggers, and can it end the game through 5.15.1.2.1 (no rank+1 monster left)?                                                                                                                                                                                                                                                       | Yes to both: it is a counter (5.15.1), unlike "moves as though countered" (Q14). Countering a rank IV monster by effect wins the game for the other player. A counter by effect gives no rage, as in 7.4.3.                                                               |
| Q25 | EBP04        | EBP04-089 Inherited Life: "[your-turn] Whenever your monster card's [rage] is reduced, place that many [rage] under this card."                                                                                                                                                                                                               | Does the 7.2.4 reset to 0 in your start phase count as a reduction? Does paying a cost or an own effect count?                                                                                                                                                                                                                                                                    | Every decrease counts, whoever caused it, including the 7.2.4 reset (logged as `rageChanged`). The counter (Q11) grows by the amount of the decrease.                                                                                                                     |
| Q26 | EBP02        | EBP02-029 Biollante Plant Beast Form: "... for the rest of the turn, double the counter power of all of your opponent's battle cards in the same column as this card. (Refer to those battle card's counter power at the ability resolution timing.)"                                                                                         | Which cards are doubled: the ones in the column at resolution, or any battle card in that column later in the turn?                                                                                                                                                                                                                                                               | Only the cards in the column at resolution; each gains its counter power at resolution as a bonus for the turn. The bonus stays if the card moves to another zone (10.8.2) and ends if it leaves the zones.                                                               |
| Q27 | EBP03        | EBP03-074 A Journey of 130 Million Years: "play 1 monster card from your monster deck that shares a trait with it, whose rank is 1 higher than your monster card's current rank. (This play does not increase [rage].)"                                                                                                                       | Is the new card stacked on the current monster, keeping its position (8.5.1.1)? Does it fire [enter], and does it use up the turn's monster play?                                                                                                                                                                                                                                 | Stacked on top, keeps the position, fires [enter] (decision 127). It doesn't use the once-per-turn monster play, which limits the main phase action only.                                                                                                                 |
| Q28 | EBP04        | EBP04-067 Godzilla Earth: "[enter] Play 1 "Godzilla Earth" token in your zone 3. If either this card or that token leave their zone or move, [destroy] both of them."                                                                                                                                                                         | What if your monster is in zone 3, or zone 3 already holds a battle card?                                                                                                                                                                                                                                                                                                         | Your monster's zone: no token (Q5's rule for unoccupied zones). A battle card in zone 3: the token is played and 11.5 overload resolves it. If the token is not played, nothing links to this card.                                                                       |
| Q29 | FC01         | FC01-005 (ゴジラゴジラ・フェスに現わる): "Whenever you play a monster card, draw 5 cards from the top of your deck and add any with [fest] to your hand, discarding the remaining cards."                                                                                                                                                     | Is this a draw (5.4, reshuffling an empty deck per 11.2) or a reveal of the top 5 (5.10)?                                                                                                                                                                                                                                                                                         | A reveal of the top 5: [fest] cards go to the hand, the rest to the discard pile. No reshuffle; with fewer than 5 cards, reveal what is there.                                                                                                                            |
| Q30 | EBP04        | EBP04-041 The New Gotengo: "At the beginning of your counter phase, if this card is in zone 8, trigger all [enter] abilities of your monster card."                                                                                                                                                                                           | Are their conditions, Awakening gates and optional costs checked as usual? Do [enter] abilities of cards under the top monster card count?                                                                                                                                                                                                                                        | Checked as usual. Only the top card's [enter] abilities, since cards underneath have no active abilities (3.2.3.1).                                                                                                                                                       |
| Q31 | EBP02        | EBP02-024 Biollante Rose Form (rank I): "If this card is in your monster deck, at the start of the game it will be played in Zone 5. This card cannot advance nor invade."                                                                                                                                                                    | Is it the rank I monster placed in zone 5 at 6.3.1.6 instead of zone 1?                                                                                                                                                                                                                                                                                                           | Yes. It is placed, not played, so no [enter] (decision 127); the 7.5.2 advance is skipped while it can't advance.                                                                                                                                                         |
| Q32 | EBP02        | EBP02-070 Godzilla vs. SpaceGodzilla: "[opponent-turn] Your opponent cannot play strategy cards."                                                                                                                                                                                                                                             | Does it stop only the 8.3 activation, or also effects that put strategy cards into play (E17)?                                                                                                                                                                                                                                                                                    | Both: any strategy card entering a strategy zone by its master's action or effect.                                                                                                                                                                                        |
| Q33 | EBP03, EBP04 | EBP03-078 Megalon and Gigan: Villain Tag Team: "[destroy] 1 battle card from the rightmost and 1 from the leftmost position from among them". EBP04-035 Kaizer Ghidorah: "Starting with the battle card in your opponent's zone with the lowest number ..."                                                                                   | When several cards tie (two cards in the rightmost column, an overloaded zone), who picks?                                                                                                                                                                                                                                                                                        | The effect's player chooses among the tied cards.                                                                                                                                                                                                                         |
| Q34 | EBP03        | EBP03-071 Godzilla's Skeleton: "When counting monster cards in your discard pile, treat this card as a monster card as well."                                                                                                                                                                                                                 | Does it count for the opponent's effects that count your discard pile, and for "return a monster card" effects?                                                                                                                                                                                                                                                                   | It counts for any count of monster cards in its owner's discard pile, by either player. It is not a monster card for anything else, so it can't be returned or played as one.                                                                                             |

## 5. Cards that stay manual

None. EBP04-012 Biollante Plant Beast Form and EBP04-033/034 Kaizer Ghidorah were listed here until Paul ruled on Q22 and Q23 (Oct 23, 2026); they moved into the EBP04 PR (M12d).

Four cards use a `custom` handler for one rule that no other card shares (EBP02-080, EBP04-067, EBP04-073, EBP04-089, piece CU); they are implemented, not manual. If a ruling makes a piece much larger than planned, the card stays manual with a note in its set file and comes back in a later PR.

## 6. PR plan

One PR per set, in priority order. Each PR:

- adds the set's new pieces to `docs/abilities/format.md` (from section 3, as approved), the Zod schema in `packages/cards/src/abilities.ts` and the engine;
- adds `packages/cards/data/abilities/<SET>.json` with data for every card in the set (tokens included);
- adds an engine test per card, named with the rule numbers it exercises (CLAUDE.md, Testing);
- logs the rulings it uses in the card's `notes`;
- updates `docs/rules/spec.md` for engine behavior that changes;
- reports `pnpm abilities:coverage` before and after;
- runs `pnpm stress` with random test decks of the set (`buildTestDeck` builds booster sets the same way, decision 92) and with Paul's local decks that use the set, and reports the results (counts only).

| PR     | Set              | Cards | With today's format | New pieces built                                                   | Questions it waits for              | Implemented after |
| ------ | ---------------- | ----- | ------------------- | ------------------------------------------------------------------ | ----------------------------------- | ----------------- |
| M12a-1 | EBP01, part 1    | 47    | 39                  | 9: C5, C6, C7, T1, T3, T4, T5, T6, T8                              | none                                | 78                |
| M12a-2 | EBP01, part 2    | 33    | 0                   | 15: C2, E1, E2, E3, E4, E5, E7, E8, E9, E10, E13, E17, E18, M1, M2 | none                                | 111               |
| M12b   | EBP02 + 4 tokens | 80    | 26                  | 12: C1, C3, T2, T7, E6, E11, E12, E15, E19, E21, K3, CU            | Q17, Q24, Q26, Q31, Q32             | 191               |
| M12c   | EBP03            | 80    | 16                  | 7: C4, E14, E16, E20, K1, K2, X                                    | Q16, Q18, Q19, Q21, Q27, Q33, Q34   | 271               |
| M12d   | EBP04 + 1 token  | 89    | 22                  | 2: T9, M3                                                          | Q15, Q16, Q18 to Q25, Q28, Q30, Q33 | 360               |
| M12e   | PR, EPR          | 12    | 11                  | none                                                               | none                                | 372               |
| M12f   | ESC01            | 6     | 1                   | none                                                               | none                                | 378               |
| M12g   | FC01             | 6     | 1                   | none                                                               | Q29                                 | 384               |

M12a is split in two (Monarch, Oct 23, 2026): M12a-1 builds C5, C6, C7, T1, T3, T4, T5, T6 and T8 with every EBP01 card that needs only those pieces or today's format; M12a-2 builds the rest with the remaining EBP01 cards. M12a-2 also builds C1's `if` effect (EBP01 needs it after a mill; `didLastStep` stays with EBP02), and only the M1 flags and M2 play rules EBP01 uses; the others come with their first cards (format.md, M12 additions). The order is EBP01, EBP02, EBP03, EBP04 (Paul, Oct 23, 2026), so EBP03 builds the pieces it shares with EBP04. After M12g, all 384 cards are implemented. M12b is split the same way (Oct 24, 2026): M12b-1 builds C3, T7, E11, E19, K3, CU and small extensions with every EBP02 card that needs neither tokens nor Revenge (64 cards); M12b-2 builds E6 (tokens), T2 (Revenge), E12, E15 and E21 with the remaining 16 cards and the 4 tokens. The token data file and tokens counting as battle cards follow Q39. M12c is split too (Oct 24, 2026): M12c-1 is 66 EBP03 cards with built pieces and small extensions, plus EPR-020 (hand-entered, `manual-cards.json`; its data is in a new `PR.json`); M12c-2 builds C4, E14, E16, E20, K1, K2, X and C5's `countsAs` with the other 14 cards, EBP03-004 (invade by milling, an `invasionCost` replacement, and protected rage) and EBP03-051 (a main phase play on top of a battle card) among them. EPR-020 makes the total 385 cards in scope.

Per-set card lists, with the pieces each card needs (section 3 has the pieces):

<details><summary>EBP01: 80 cards, 39 with today's format, 41 with new pieces</summary>

| Card      | Name                                   | Type     | Pieces         |
| --------- | -------------------------------------- | -------- | -------------- |
| EBP01-001 | Godzilla (1954)                        | Monster  | E2             |
| EBP01-002 | Godzilla (1954)                        | Monster  | E2             |
| EBP01-003 | Godzilla (1954)                        | Monster  | E2             |
| EBP01-004 | Godzilla (1954)                        | Monster  | T5             |
| EBP01-005 | Godzilla (1955)                        | Monster  | today's format |
| EBP01-006 | Godzilla (1974)                        | Monster  | today's format |
| EBP01-007 | Godzilla (1975)                        | Monster  | T1             |
| EBP01-008 | Godzilla (2004)                        | Monster  | E1             |
| EBP01-009 | Godzilla (2023)                        | Monster  | today's format |
| EBP01-010 | Godzilla (2023)                        | Monster  | today's format |
| EBP01-011 | Godzilla (Fest Godzilla)               | Monster  | T5, E1         |
| EBP01-012 | Godzilla (Fest Godzilla)               | Monster  | C2, E1         |
| EBP01-013 | Godzilla (Fest Godzilla)               | Monster  | today's format |
| EBP01-014 | Godzilla (Fest Godzilla)               | Monster  | M1             |
| EBP01-015 | Godzilla (Fest Godzilla)               | Monster  | E3, C5, E1     |
| EBP01-016 | Ebirah (2004)                          | Battle   | today's format |
| EBP01-017 | Kumonga (2004)                         | Battle   | today's format |
| EBP01-018 | Mechagodzilla (1974)                   | Battle   | today's format |
| EBP01-019 | Kamacuras (1967)                       | Battle   | C7             |
| EBP01-020 | Anguirus (1968)                        | Battle   | T6             |
| EBP01-021 | Rodan (1968)                           | Battle   | E3             |
| EBP01-022 | Titanosaurus                           | Battle   | E10            |
| EBP01-023 | Mechagodzilla (1975)                   | Battle   | today's format |
| EBP01-024 | Minilla (2004)                         | Battle   | today's format |
| EBP01-025 | King Caesar (1974)                     | Battle   | today's format |
| EBP01-026 | Jet Jaguar (2023)                      | Battle   | E4             |
| EBP01-027 | Hedorah (1971)                         | Battle   | M2             |
| EBP01-028 | Godzilla vs. Mechagodzilla             | Strategy | M1             |
| EBP01-029 | Unthinkable Destruction                | Strategy | today's format |
| EBP01-030 | Godzilla Landing                       | Strategy | E1             |
| EBP01-031 | Space Beam                             | Strategy | today's format |
| EBP01-032 | Heat Ray Charge                        | Strategy | today's format |
| EBP01-033 | Final Showdown                         | Strategy | M2, C2         |
| EBP01-034 | Godzilla (1989)                        | Monster  | today's format |
| EBP01-035 | Godzilla (1989)                        | Monster  | E18            |
| EBP01-036 | Godzilla (1992)                        | Monster  | E18            |
| EBP01-037 | Godzilla (1995)                        | Monster  | T5             |
| EBP01-038 | Godzilla (1995)                        | Monster  | E13            |
| EBP01-039 | Godzilla (1999)                        | Monster  | today's format |
| EBP01-040 | Godzilla (1999)                        | Monster  | today's format |
| EBP01-041 | Godzilla (2000)                        | Monster  | today's format |
| EBP01-042 | Godzilla (2000)                        | Monster  | today's format |
| EBP01-043 | Godzilla (2000)                        | Monster  | T4             |
| EBP01-044 | Mothra (Egg) (1992)                    | Battle   | today's format |
| EBP01-045 | Meganula                               | Battle   | today's format |
| EBP01-046 | MBT-MB92                               | Battle   | today's format |
| EBP01-047 | Orga                                   | Battle   | today's format |
| EBP01-048 | Biollante Rose Form                    | Battle   | today's format |
| EBP01-049 | Destoroyah Aggregate Form              | Battle   | today's format |
| EBP01-050 | Mothra (Larva) (1992)                  | Battle   | today's format |
| EBP01-051 | Orga Phase II                          | Battle   | today's format |
| EBP01-052 | Megaguirus                             | Battle   | M1             |
| EBP01-053 | Rodan (1993)                           | Battle   | today's format |
| EBP01-054 | Destoroyah Flying Form                 | Battle   | today's format |
| EBP01-055 | Battra (Imago)                         | Battle   | today's format |
| EBP01-056 | Super X2                               | Battle   | C6             |
| EBP01-057 | Mothra (Imago) (1992)                  | Battle   | E9             |
| EBP01-058 | Biollante Plant Beast Form             | Battle   | M2, E5         |
| EBP01-059 | Fire Rodan                             | Battle   | T3, E18        |
| EBP01-060 | Destoroyah Perfect Form                | Battle   | E17            |
| EBP01-061 | Scale Attack                           | Strategy | today's format |
| EBP01-062 | Godzilla vs. Destoroyah                | Strategy | today's format |
| EBP01-063 | Guardians Awaken                       | Strategy | E18            |
| EBP01-064 | Godzilla vs. Megaguirus                | Strategy | E7             |
| EBP01-065 | Godzilla vs. Destoroyah                | Strategy | today's format |
| EBP01-066 | Godzilla vs. Biollante                 | Strategy | T3, E13        |
| EBP01-067 | Gorosaurus                             | Battle   | today's format |
| EBP01-068 | Manda (1968)                           | Battle   | today's format |
| EBP01-069 | Varan                                  | Battle   | today's format |
| EBP01-070 | Baragon (1968)                         | Battle   | E3             |
| EBP01-071 | Giant Condor                           | Battle   | today's format |
| EBP01-072 | Gigan (2022)                           | Battle   | E2, E1, C5     |
| EBP01-073 | Godzilla Against Mechagodzilla         | Battle   | M2, T6, E4, E8 |
| EBP01-074 | King Ghidorah (2024)                   | Battle   | today's format |
| EBP01-075 | Godzilla, King of the Monsters         | Battle   | C6, M1, M2     |
| EBP01-076 | Destroy All Monsters                   | Strategy | T8, T6         |
| EBP01-077 | Oxygen Destroyer                       | Strategy | E13            |
| EBP01-078 | Godzilla Attacks                       | Strategy | E1             |
| EBP01-079 | Gravity Beam                           | Strategy | today's format |
| EBP01-080 | Godzilla and its son on Monster Island | Strategy | M2, M1         |

</details>

<details><summary>EBP02: 80 cards, 26 with today's format, 54 with new pieces</summary>

| Card      | Name                                              | Type     | Pieces         |
| --------- | ------------------------------------------------- | -------- | -------------- |
| EBP02-001 | Giant Unknown Creature                            | Monster  | today's format |
| EBP02-002 | Godzilla (2016) 2nd Form                          | Monster  | today's format |
| EBP02-003 | Godzilla (2016) 2nd Form                          | Monster  | E1             |
| EBP02-004 | Godzilla (2016) 3rd Form                          | Monster  | C6             |
| EBP02-005 | Godzilla (2016) 3rd Form                          | Monster  | today's format |
| EBP02-006 | Godzilla (2016) 4th Form                          | Monster  | E19            |
| EBP02-007 | Godzilla (2016) 4th Form                          | Monster  | C1, E3         |
| EBP02-008 | Godzilla (1969)                                   | Monster  | C3             |
| EBP02-009 | Godzilla (2023)                                   | Monster  | T3, E5         |
| EBP02-010 | King Caesar (2004)                                | Battle   | E10            |
| EBP02-011 | Gabara                                            | Battle   | today's format |
| EBP02-012 | Godzilla (2016) Frozen                            | Battle   | E21, E4, E12   |
| EBP02-013 | Minilla (1969)                                    | Battle   | E1             |
| EBP02-014 | Cabinet Helicopter                                | Battle   | E2, E1         |
| EBP02-015 | Rodan (2004)                                      | Battle   | C3             |
| EBP02-016 | Anguirus (2004)                                   | Battle   | today's format |
| EBP02-017 | Operation Taba                                    | Strategy | today's format |
| EBP02-018 | Despair                                           | Strategy | C3             |
| EBP02-019 | There is no danger of the creature coming ashore. | Strategy | E10, C2, E1    |
| EBP02-020 | Operation Yashiori -Conductorless train bombers-  | Strategy | E6             |
| EBP02-021 | Godzilla (1993)                                   | Monster  | today's format |
| EBP02-022 | Godzilla (1994)                                   | Monster  | T3, E18        |
| EBP02-023 | Godzilla (1999)                                   | Monster  | E1, C5         |
| EBP02-024 | Biollante Rose Form                               | Monster  | K3, M1         |
| EBP02-025 | Biollante Rose Form                               | Monster  | M1, E6         |
| EBP02-026 | Biollante Plant Beast Form                        | Monster  | today's format |
| EBP02-027 | Biollante Plant Beast Form                        | Monster  | E13            |
| EBP02-028 | Biollante Plant Beast Form                        | Monster  | today's format |
| EBP02-029 | Biollante Plant Beast Form                        | Monster  | E19            |
| EBP02-030 | Baby Godzilla                                     | Battle   | today's format |
| EBP02-031 | MBT-MB92 Modified                                 | Battle   | today's format |
| EBP02-032 | Biollante Rose Form                               | Battle   | today's format |
| EBP02-033 | Little Godzilla                                   | Battle   | today's format |
| EBP02-034 | Super X3                                          | Battle   | today's format |
| EBP02-035 | Biollante Plant Beast Form                        | Battle   | E5, E6         |
| EBP02-036 | Godzilla (1994)                                   | Battle   | E1, C5         |
| EBP02-037 | Destoroyah Perfect Form                           | Battle   | today's format |
| EBP02-038 | Godzilla 2000: Millennium                         | Strategy | E7             |
| EBP02-039 | Lake Ashi Monster                                 | Strategy | M2             |
| EBP02-040 | Interception Operation                            | Strategy | C5, E11        |
| EBP02-041 | Gigan (1972)                                      | Monster  | today's format |
| EBP02-042 | Gigan (1972)                                      | Monster  | C5             |
| EBP02-043 | Gigan (2004)                                      | Monster  | today's format |
| EBP02-044 | Modified Gigan (2004)                             | Monster  | today's format |
| EBP02-045 | King Ghidorah (1964)                              | Monster  | C6             |
| EBP02-046 | King Ghidorah (1965)                              | Monster  | E4             |
| EBP02-047 | King Ghidorah (1991)                              | Monster  | T5, E2         |
| EBP02-048 | King Ghidorah (1991)                              | Monster  | E2             |
| EBP02-049 | King Ghidorah (1991)                              | Monster  | E7, E2         |
| EBP02-050 | Mecha-King Ghidorah                               | Monster  | E7             |
| EBP02-051 | Mecha-King Ghidorah                               | Monster  | C6             |
| EBP02-052 | SpaceGodzilla Flying Form                         | Monster  | C1, E6         |
| EBP02-053 | SpaceGodzilla                                     | Monster  | E6             |
| EBP02-054 | SpaceGodzilla                                     | Monster  | E6, C6         |
| EBP02-055 | SpaceGodzilla                                     | Monster  | M1             |
| EBP02-056 | SpaceGodzilla                                     | Monster  | E15            |
| EBP02-057 | SpaceGodzilla Flying Form                         | Monster  | E10, E6        |
| EBP02-058 | Dorat                                             | Battle   | T2             |
| EBP02-059 | Godzillasaurus                                    | Battle   | T2, C1         |
| EBP02-060 | Gigan (2004)                                      | Battle   | T2             |
| EBP02-061 | Godzilla (1972)                                   | Battle   | today's format |
| EBP02-062 | SpaceGodzilla                                     | Battle   | T2             |
| EBP02-063 | Megalon                                           | Battle   | today's format |
| EBP02-064 | Gigan (1972)                                      | Battle   | T2, C5         |
| EBP02-065 | Godzilla (1991)                                   | Battle   | today's format |
| EBP02-066 | King Ghidorah (1964)                              | Battle   | today's format |
| EBP02-067 | M.O.G.U.E.R.A.                                    | Battle   | today's format |
| EBP02-068 | Mecha-King Ghidorah                               | Battle   | M2, M1         |
| EBP02-069 | Godzilla vs. SpaceGodzilla                        | Strategy | E9             |
| EBP02-070 | Godzilla vs. SpaceGodzilla                        | Strategy | M1, C1         |
| EBP02-071 | Godzilla vs. King Ghidorah                        | Strategy | E7             |
| EBP02-072 | God of Destruction's Counterattack                | Strategy | today's format |
| EBP02-073 | Bloody Chainsaw                                   | Strategy | T7             |
| EBP02-074 | Bite Attack                                       | Strategy | C6             |
| EBP02-075 | Chibi Mothra                                      | Battle   | today's format |
| EBP02-076 | Chibi Mechagodzilla                               | Battle   | today's format |
| EBP02-077 | Chibi Godzilla                                    | Battle   | E2, E6         |
| EBP02-078 | Mothra (Imago) (2003)                             | Battle   | E3             |
| EBP02-079 | Destructive Impulse                               | Strategy | C2             |
| EBP02-080 | Joint Struggle                                    | Strategy | E3, CU         |

</details>

<details><summary>EBP03: 80 cards, 16 with today's format, 64 with new pieces</summary>

| Card      | Name                                | Type     | Pieces         |
| --------- | ----------------------------------- | -------- | -------------- |
| EBP03-001 | Godzilla (2001)                     | Monster  | C1, E1         |
| EBP03-002 | Godzilla (2001)                     | Monster  | C1             |
| EBP03-003 | Godzilla (2001)                     | Monster  | C1             |
| EBP03-004 | Godzilla (2001)                     | Monster  | E21, M1        |
| EBP03-005 | Godzilla (2001)                     | Monster  | C1             |
| EBP03-006 | Multi-Purpose Fighting System 3     | Monster  | K2             |
| EBP03-007 | Multi-Purpose Fighting System 3     | Monster  | E3, C6         |
| EBP03-008 | Multi-Purpose Fighting System 3     | Monster  | today's format |
| EBP03-009 | Multi-Purpose Fighting System 3     | Monster  | C3             |
| EBP03-010 | Multi-Purpose Fighting System 3     | Monster  | E11            |
| EBP03-011 | Multi-Purpose Fighting System 3     | Monster  | E3, C6         |
| EBP03-012 | Godzilla (1993)                     | Monster  | E17            |
| EBP03-013 | Godzilla (1995)                     | Monster  | E20, E16       |
| EBP03-014 | Godzilla (2002)                     | Monster  | C1             |
| EBP03-015 | Godzilla (2002)                     | Monster  | T3             |
| EBP03-016 | Godzilla (2003)                     | Monster  | T3, C1         |
| EBP03-017 | Godzilla (2003)                     | Monster  | T3, C1         |
| EBP03-018 | Mothra (Imago) (1996)               | Monster  | K2             |
| EBP03-019 | Mothra (Larva) (1996)               | Monster  | T4             |
| EBP03-020 | Mothra Leo                          | Monster  | T4             |
| EBP03-021 | Rainbow Mothra                      | Monster  | today's format |
| EBP03-022 | Aqua Mothra                         | Monster  | today's format |
| EBP03-023 | Armor Mothra                        | Monster  | E18, T4, E1    |
| EBP03-024 | Baragon (2001)                      | Monster  | K2             |
| EBP03-025 | Mothra (Imago) (2001)               | Monster  | E4, C1, E1     |
| EBP03-026 | Mothra (Imago) (2001)               | Monster  | E4, C1         |
| EBP03-027 | Ghidorah (2001)                     | Monster  | today's format |
| EBP03-028 | Thousand-Year Dragon King Ghidorah  | Monster  | E4, C1         |
| EBP03-029 | Thousand-Year Dragon King Ghidorah  | Monster  | E7, E11        |
| EBP03-030 | SHIRASAGI: AC-3                     | Battle   | E10            |
| EBP03-031 | MBT-MB90                            | Battle   | E3             |
| EBP03-032 | Mechagodzilla (1974)                | Battle   | E11, E19       |
| EBP03-033 | Mechagodzilla (1975)                | Battle   | C1             |
| EBP03-034 | Jet Jaguar (1973)                   | Battle   | C1             |
| EBP03-035 | Satsuma                             | Battle   | C1, E1         |
| EBP03-036 | Moguera                             | Battle   | C7             |
| EBP03-037 | Godzilla (2001)                     | Battle   | today's format |
| EBP03-038 | Multi-purpose Fighting System-3     | Battle   | today's format |
| EBP03-039 | Godzilla (2016) 4th Form            | Battle   | T3             |
| EBP03-040 | Mechagodzilla (1975)                | Battle   | today's format |
| EBP03-041 | Godzilla (2023)                     | Battle   | today's format |
| EBP03-042 | Ghogo                               | Battle   | T6, E4, E18    |
| EBP03-043 | Star Falcon                         | Battle   | E4, E18        |
| EBP03-044 | Mothra (Larva) (1992)               | Battle   | today's format |
| EBP03-045 | Mothra (Larva) (2003)               | Battle   | today's format |
| EBP03-046 | Land Moguera                        | Battle   | E7             |
| EBP03-047 | Garuda                              | Battle   | C1, E18, C5    |
| EBP03-048 | Mechagodzilla (1993)                | Battle   | today's format |
| EBP03-049 | Godzilla (2002)                     | Battle   | today's format |
| EBP03-050 | Rainbow Mothra                      | Battle   | E1, C5         |
| EBP03-051 | Godzilla Jr.                        | Battle   | M2             |
| EBP03-052 | M.O.G.U.E.R.A.                      | Battle   | E21, E4        |
| EBP03-053 | Super Mechagodzilla                 | Battle   | M1, C6         |
| EBP03-054 | Eternal Mothra                      | Battle   | E1, C5         |
| EBP03-055 | Primitive Mothra                    | Battle   | E5             |
| EBP03-056 | Manda (2004)                        | Battle   | today's format |
| EBP03-057 | Desghidorah                         | Battle   | C6             |
| EBP03-058 | Zilla                               | Battle   | E10, C3        |
| EBP03-059 | Cretaceous King Ghidorah (1998)     | Battle   | T2             |
| EBP03-060 | Mothra (Imago) (1961)               | Battle   | T2             |
| EBP03-061 | Dagahra                             | Battle   | T3, E18        |
| EBP03-062 | Baragon (2001)                      | Battle   | T6, T2         |
| EBP03-063 | King Ghidorah (1998)                | Battle   | T7, T3, E18    |
| EBP03-064 | Mothra (Imago) (2001)               | Battle   | C2, E4         |
| EBP03-065 | King Ghidorah (1998)                | Battle   | today's format |
| EBP03-066 | Thousand-Year Dragon King Ghidorah  | Battle   | M2             |
| EBP03-067 | Monster X                           | Battle   | T3, C4, X      |
| EBP03-068 | Godzilla Flies                      | Strategy | M1, E14        |
| EBP03-069 | Space Beam                          | Strategy | today's format |
| EBP03-070 | Mechagodzilla Hanger                | Strategy | K1             |
| EBP03-071 | Godzilla's Skeleton                 | Strategy | C5, E3         |
| EBP03-072 | Petit Railgun                       | Strategy | today's format |
| EBP03-073 | All-Weapon Attack                   | Strategy | E2, C3, E1     |
| EBP03-074 | A Journey of 130 Million Years      | Strategy | E18            |
| EBP03-075 | Yakusugi                            | Strategy | K1             |
| EBP03-076 | The Battle at Fukuoka Tower         | Strategy | K1, C5         |
| EBP03-077 | Rebirth of Mothra 3                 | Strategy | E7, E5         |
| EBP03-078 | Megalon and Gigan: Villain Tag Team | Strategy | X              |
| EBP03-079 | Godzilla Captured!                  | Strategy | E8             |
| EBP03-080 | Odo Island                          | Strategy | K1             |

</details>

<details><summary>EBP04: 89 cards, 22 with today's format, 67 with new pieces</summary>

| Card      | Name                                  | Type     | Pieces           |
| --------- | ------------------------------------- | -------- | ---------------- |
| EBP04-001 | Godzilla (2004)                       | Monster  | today's format   |
| EBP04-002 | Godzilla (2004)                       | Monster  | T1               |
| EBP04-003 | Godzilla (2004)                       | Monster  | today's format   |
| EBP04-004 | Godzilla (2004)                       | Monster  | today's format   |
| EBP04-005 | Godzilla (2004)                       | Monster  | E17, T1          |
| EBP04-006 | Godzilla (2004)                       | Monster  | M1               |
| EBP04-007 | Godzilla (1962)                       | Monster  | E15              |
| EBP04-008 | Godzilla (2001)                       | Monster  | today's format   |
| EBP04-009 | Godzilla (2016) 3rd Form              | Monster  | C1               |
| EBP04-010 | Godzilla (2023)                       | Monster  | E21, C1          |
| EBP04-011 | Multi-purpose Fighting System-3       | Monster  | C4               |
| EBP04-012 | Biollante Plant Beast Form            | Monster  | M2               |
| EBP04-013 | Godzilla (2000)                       | Monster  | E2, C3, E1       |
| EBP04-014 | Godzilla (2002)                       | Monster  | T3, E13, C1, E19 |
| EBP04-015 | Godzilla (2003)                       | Monster  | T3               |
| EBP04-016 | Godzilla (Fest Godzilla II)           | Monster  | C3               |
| EBP04-017 | Godzilla (Fest Godzilla II)           | Monster  | C3               |
| EBP04-018 | Godzilla (Fest Godzilla II)           | Monster  | C3               |
| EBP04-019 | Godzilla (Fest Godzilla II)           | Monster  | C3               |
| EBP04-020 | Aqua Mothra                           | Monster  | today's format   |
| EBP04-021 | Godzilla Aquatilis                    | Monster  | E2, C4           |
| EBP04-022 | Godzilla Amphibia                     | Monster  | T4, E2, C5       |
| EBP04-023 | Godzilla Terrestris                   | Monster  | today's format   |
| EBP04-024 | Godzilla Ultima                       | Monster  | X                |
| EBP04-025 | Godzilla Ultima                       | Monster  | today's format   |
| EBP04-026 | SpaceGodzilla                         | Monster  | E6               |
| EBP04-027 | Gigan (2004)                          | Monster  | M1, E12, C1, C5  |
| EBP04-028 | Gigan (2004)                          | Monster  | M3, T7           |
| EBP04-029 | Gigan (2004)                          | Monster  | M1               |
| EBP04-030 | Modified Gigan                        | Monster  | M1               |
| EBP04-031 | Monster X                             | Monster  | C4, M1, K2       |
| EBP04-032 | Monster X                             | Monster  | C4, M1           |
| EBP04-033 | Kaizer Ghidorah                       | Monster  | M2, C4           |
| EBP04-034 | Kaizer Ghidorah                       | Monster  | M2, C4           |
| EBP04-035 | Kaizer Ghidorah                       | Monster  | C4, X            |
| EBP04-036 | Kaizer Ghidorah                       | Monster  | C4               |
| EBP04-037 | Minilla (2004)                        | Battle   | today's format   |
| EBP04-038 | Kamacuras (2004)                      | Battle   | today's format   |
| EBP04-039 | Zilla                                 | Battle   | T1, C4, E10      |
| EBP04-040 | Anguirus (2004)                       | Battle   | today's format   |
| EBP04-041 | The New Gotengo                       | Battle   | T9               |
| EBP04-042 | Mothra (Imago) (2004)                 | Battle   | today's format   |
| EBP04-043 | Multi-purpose Fighting System-3       | Battle   | E4, C5           |
| EBP04-044 | Hedorah (2004)                        | Battle   | M2, C4           |
| EBP04-045 | Manda (2004)                          | Battle   | M2, C4           |
| EBP04-046 | Rodan (2004)                          | Battle   | T3, E18          |
| EBP04-047 | Monster X                             | Battle   | C4               |
| EBP04-048 | Little Godzilla                       | Battle   | M1               |
| EBP04-049 | Ebirah (2004)                         | Battle   | E2               |
| EBP04-050 | Battra (Larva)                        | Battle   | T6, E7, C1       |
| EBP04-051 | Super Mechagodzilla                   | Battle   | E1, C5           |
| EBP04-052 | Mothra (Imago) (1992)                 | Battle   | T3               |
| EBP04-053 | M.O.G.U.E.R.A.                        | Battle   | E9               |
| EBP04-054 | Destoroyah Perfect Form               | Battle   | today's format   |
| EBP04-055 | Void Ghidorah                         | Battle   | C1               |
| EBP04-056 | Kumonga (2004)                        | Battle   | M1               |
| EBP04-057 | King Caesar (2004)                    | Battle   | C4               |
| EBP04-058 | Servum                                | Battle   | today's format   |
| EBP04-059 | Rodan (2021)                          | Battle   | T2               |
| EBP04-060 | Vulture                               | Battle   | today's format   |
| EBP04-061 | Mechagodzilla (2018)                  | Battle   | E2               |
| EBP04-062 | Anguirus (2021)                       | Battle   | T2               |
| EBP04-063 | Godzilla Filius                       | Battle   | T2               |
| EBP04-064 | Jet Jaguar (2021)                     | Battle   | C1               |
| EBP04-065 | Godzilla Earth                        | Battle   | today's format   |
| EBP04-066 | Gigan (2004)                          | Battle   | M3, C4           |
| EBP04-067 | Godzilla Earth                        | Battle   | CU, M2, E6       |
| EBP04-068 | Kaizer Ghidorah                       | Battle   | M3, C4           |
| EBP04-069 | Gezora                                | Battle   | today's format   |
| EBP04-070 | Ganimes                               | Battle   | today's format   |
| EBP04-071 | Kamoebas (1970)                       | Battle   | today's format   |
| EBP04-072 | Sanda                                 | Battle   | T7               |
| EBP04-073 | Gaira                                 | Battle   | CU               |
| EBP04-074 | Rodan (1956)                          | Battle   | today's format   |
| EBP04-075 | Spiral Heat Ray                       | Strategy | E2               |
| EBP04-076 | Godzilla's Dormancy                   | Strategy | K1, M1           |
| EBP04-077 | Akane Yashiro, The MFS-3 Unit         | Strategy | E3, E18          |
| EBP04-078 | The Slithering Disaster               | Strategy | E14              |
| EBP04-079 | Godzilla Final Wars                   | Strategy | E3               |
| EBP04-080 | The Bond Between Mothra and its Child | Strategy | E18              |
| EBP04-081 | Entangling Fear                       | Strategy | M1               |
| EBP04-082 | Xilien Mothership                     | Strategy | K1, C4           |
| EBP04-083 | Godzilla vs. Destoroyah               | Strategy | today's format   |
| EBP04-084 | Atomic Breath                         | Strategy | today's format   |
| EBP04-085 | The Golden Demise                     | Strategy | T3, M1           |
| EBP04-086 | Mechagodzilla City                    | Strategy | K1, E18          |
| EBP04-087 | Together / The Two of the Beginning   | Strategy | today's format   |
| EBP04-088 | Abducted Monsters                     | Strategy | C4               |
| EBP04-089 | Inherited Life                        | Strategy | CU, K1           |

</details>

<details><summary>PR: 12 cards, 11 with today's format, 1 with new pieces</summary>

| Card    | Name                                      | Type      | Pieces         |
| ------- | ----------------------------------------- | --------- | -------------- |
| EPR-005 | Godzilla's Bite                           | Strategy  | today's format |
| PR-001  | 怪獣王ゴジラ                              | Monster   | today's format |
| PR-002  | Godzilla The Art                          | Eric Haze | Monster        | today's format |
| PR-003  | ゴジラギャラクシーオデッセイ              | Monster   | today's format |
| PR-006  | 怪獣王ゴジラ                              | Monster   | today's format |
| PR-007  | ちびゴジラ                                | Monster   | today's format |
| PR-008  | ちびゴジラ                                | Monster   | today's format |
| PR-009  | ちびゴジラ                                | Monster   | today's format |
| PR-010  | ちびゴジラ                                | Monster   | today's format |
| PR-014  | 反重力光線                                | Strategy  | today's format |
| PR-015  | Godzilla (Godzilla the Ride: Great Clash) | Battle    | today's format |
| PR-016  | KIJU Type 0 -G Breaker-                   | Battle    | E4, C1, T8     |

</details>

<details><summary>ESC01: 6 cards, 1 with today's format, 5 with new pieces</summary>

| Card      | Name                     | Type    | Pieces         |
| --------- | ------------------------ | ------- | -------------- |
| ESC01-001 | Godzilla (1954)          | Battle  | M2, T4         |
| ESC01-002 | Godzilla (1995)          | Monster | E18            |
| ESC01-003 | Godzilla (2016) 4th Form | Battle  | C2, C1, E1     |
| ESC01-004 | Godzilla (2023)          | Battle  | today's format |
| ESC01-005 | King Ghidorah (1991)     | Monster | E2             |
| ESC01-006 | Mothra (Imago) (1992)    | Battle  | E11            |

</details>

<details><summary>FC01: 6 cards, 1 with today's format, 5 with new pieces</summary>

| Card     | Name                               | Type     | Pieces         |
| -------- | ---------------------------------- | -------- | -------------- |
| FC01-001 | ゴジラ（ゴジカ・フェス）           | Monster  | today's format |
| FC01-002 | ガイガン（ゴジカ・フェス）         | Battle   | E2             |
| FC01-003 | ジェットジャガー（ゴジカ・フェス） | Battle   | C1, C5         |
| FC01-004 | ヘドラ（2021）                     | Battle   | M2             |
| FC01-005 | ゴジラゴジラ・フェスに現わる       | Strategy | E3, E11        |
| FC01-006 | キングギドラの防御                 | Strategy | M1             |

</details>
