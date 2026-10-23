# GojiSim Combos

Known combos for the cards GojiSim supports. M5g turns each entry into data (`packages/cards/data/combos/*.json`) so the game can call it out when it succeeds, for you and for the bot.

**What counts as a combo:** two or more cards whose effects build on each other, or stack into a result no single card reaches. A card that only repeats what another card already did (Operation Wadatsumi after ESD01-005) is not a combo.

**Success:** the condition the detector checks. A combo is called out only when it lands, not when it is started.

---

## Red: Starter Deck Godzilla Minus One (ESD01)

### 1. Ginza Inferno

| | |
| --- | --- |
| Cards | Ginza Annihilated (ESD01-013), any monster cards in hand, Godzilla Emerges (ESD01-014) |
| Steps | 1. Activate Ginza Annihilated. 2. Gain rage by discarding monster cards from your hand (8.4); each rage gained destroys 1 of the opponent's rank 6 or lower battle cards. 3. With 2 or more rage, activate Godzilla Emerges: search your deck for a battle card named Godzilla (2023) and play it. |
| Result | Several destroys, then a free rank 5 or 7 battle card on a cleared board |
| Success | In one turn, Ginza Annihilated destroys at least 1 card and Godzilla Emerges plays a battle card |

### 2. Tokyo Wall

| | |
| --- | --- |
| Cards | City of Tokyo (ESD01-010), Godzilla Emerges (ESD01-014), Godzilla (2023) battle card (ESD01-012) |
| Steps | 1. Have City of Tokyo in play and 2 or more rage. 2. Godzilla Emerges plays ESD01-012 into zone 8 (or ESD01-012 moves there when you play a monster card). |
| Result | ESD01-012 in zone 8 at +8000 counter power: +3000 from its own zone 8 bonus, +5000 from City of Tokyo |
| Success | ESD01-012 is in zone 8 with both bonuses active |

### 3. Deep Sea Ambush

| | |
| --- | --- |
| Cards | Godzilla (2023) rank II monster (ESD01-002), Godzilla (2023) rank III Burst monster (ESD01-006) |
| Steps | 1. ESD01-002 invades: search your deck for ESD01-006 and add it to your hand. 2. Next turn, Burst ESD01-006 from rank II: it enters and destroys 1 of the opponent's rank 4 or lower battle cards. |
| Result | The searched card becomes an early rank III threat and a destroy |
| Success | ESD01-006 found by ESD01-002's search is played with Burst and its [enter] destroys a card. Spans two turns |

---

## Blue: Starter Deck Heisei Series Godzilla (ESD02)

### 4. Oxygen Destroyer

| | |
| --- | --- |
| Cards | Godzilla (1994) (ESD02-004), Destoroyah Perfect Form (ESD02-013) |
| Steps | 1. ESD02-004 invades. 2. Pay its cost by discarding Destoroyah Perfect Form (rank 8) from your hand. |
| Result | Destroys every opponent battle card of rank 8 or lower, which is every battle card in the starters |
| Success | ESD02-004's cost is paid with a rank 8 card and at least 1 card is destroyed |

### 5. Twin Cocoons

| | |
| --- | --- |
| Cards | Godzilla (1992) (ESD02-003), Mothra (Larva) (ESD02-007), Battra (Larva) (ESD02-008) |
| Steps | 1. Both Larvae are in your discard pile. 2. ESD02-003 enters: play both Larvae from the discard pile into zones adjacent to it. 3. At your next main phase, evolve them into Mothra (Imago) and Battra (Imago). Mothra (Imago) draws 1. |
| Result | Two battle cards back from the discard pile, then a rank 5 and a rank 6 battle card plus a draw |
| Success | ESD02-003 plays both Larvae, and at least 1 of them evolves by the end of your next main phase. Spans two turns |

### 6. Cosmos Call

| | |
| --- | --- |
| Cards | The Legend of Infant Island (ESD02-014), Mothra (Larva) (ESD02-007), Mothra (Imago) (ESD02-010) |
| Steps | 1. Mothra (Larva) is on the board. 2. Activate The Legend of Infant Island: evolve it now, without waiting for the start of your main phase. 3. Mothra (Imago) enters through evolution and draws 1. |
| Result | Instant rank 5 battle card plus a card |
| Success | The Legend of Infant Island evolves Mothra (Larva) and Mothra (Imago)'s draw resolves |

### 7. Cadmium Barrage

| | |
| --- | --- |
| Cards | Super-X (ESD02-009), Godzilla (1993) (ESD02-005) |
| Steps | 1. With your monster in zone 4 or beyond, play Super-X in zone 8: the opponent loses 1 rage. 2. ESD02-005 invades 2 zones: the opponent loses 1 rage per zone. |
| Result | The opponent loses up to 3 rage in one turn, which shuts off the red deck's 2-or-more rage effects |
| Success | In one turn, Super-X and ESD02-005 together take at least 2 rage from the opponent |

---

## Adding combos

- New sets (M12) add entries here and in the matching JSON file.
- Each entry needs: name, deck, cards with numbers, steps, result, success condition.
- Check every new entry against the rule at the top.
