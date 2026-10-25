# GojiSim Board UI Design (M5)

Approved by Paul, Oct 22, 2026, with all proposed defaults for the open questions.

## Summary

**M5h change (Paul, Oct 25, 2026):** hotseat is removed until M9 adds online play. `/play` is human vs bot (P1 can also be a bot, to watch two bots); the privacy cover, its setting, "Pass to P2" and P2's First / Second pick are gone. Records with two human seats load in `/debug`. Every Pass asks "End Main and move to the Counter Phase?" (it replaces "Pass with playable cards left?" and its setting). Also in M5h-1: hover labels on the discard pile, decks, strategy zones and monsters; both monsters glow in their colors (under Turn glow); phase tracker steps have hovers; the hand label reads "Your Hand (N)"; the history view's Back to live is a full-width bar; "Show opponent's hand" against the bot (flagged in the record); search picks name what is searched for, without number badges or repeated location labels; and a game-over modal with lines from `gameOverLines.json`. M5h-2 adds: battle log colors and tags, rule tooltips and a rules panel, a stack viewer for public stacks, undo history in the record, plain-words yes/no prompts, the invade arrow, animations for every card move, the app's own tooltips (no browser `title`) on phase steps, piles that blank under their hover label, and new-game seats that never overflow. The text below is the original plan.

M5 builds the real game board at `/play`, for hotseat and human-vs-bot games. Its layout and match flow follow ucgrising.com; styling is clean and functional (the kaiju theme comes in M15). `/debug` stays as is for rules checking.

The engine, `getLegalActions`, `getPlayerView`, the bot worker, game records, export/import and deck import are unchanged. The board only reads state and sends actions; it holds no game rules.

## Screen layout

Desktop browser window: a collapsible sidebar on the left, the two fields in the middle, your hand along the bottom.

**M5d change (Paul's play-testing, Oct 23, 2026):** Prompt, phase tracker and Settings stay in a fixed left column (no collapse); the battle log moves to the right column, and the card preview covers it while a card is previewed. Your hand is centered under your mat. `--card-h` fits the 7 mat columns between the two columns. The diagram below is the original M5a plan.

```
+--------------------+---------------------------------------------------------------------+
| Concede, Bug report|               [ Opponent hand: card backs ]                         |
| Settings, Shortcuts| Opponent's mat (rotated 180°)                                       |
+--------------------+ [Discard] [Z5]  [Z4]  [Z3]  [Z2]  [Z1]   [Monster deck]  | preview |
| Battle log         | [Deck]    [Z6]  [Z7]  [    ]  [ Rage zone ] [Strategy 2] | column  |
|  turn markers,     | [    ]    [  ]  [  ]  [Z8*]   [           ] [Strategy 1] |         |
|  card name links   | ------------------------ center line -------------------+         |
+--------------------+ [Strategy 1] [ Rage zone ] [Z8*]                         |         |
| Prompt panel       | [Strategy 2] [           ] [    ] [Z7]  [Z6]  [Deck]    |         |
|  step + main button| [Monster deck] [Z1] [Z2] [Z3] [Z4] [Z5] [Discard]       |         |
|  Pass [Space]      | Your mat: 7 columns x 3 rows, the Rage zone spans 2 x 2             |
+--------------------+                                                                     |
| Phase tracker      |  [ Your hand: always fully visible, playable cards lit;           ] |
|                    |  [ click to highlight targets, drag to play, H expands            ] |
+--------------------+---------------------------------------------------------------------+
```

| Your mat (row nearest the center line first) | Col 0 | Col 1 | Col 2 | Col 3 | Col 4 | Col 5 | Col 6 |
| --- | --- | --- | --- | --- | --- | --- | --- |
| Near row | Strategy 1 | Rage zone | Rage zone | Z8 | | | |
| Middle row | Strategy 2 | Rage zone | Rage zone | | Z7 | Z6 | Deck |
| Far row | Monster deck | Z1 | Z2 | Z3 | Z4 | Z5 | Discard pile |

The opponent's mat is rotated 180°, like a real table: column `c` becomes `6 - c` and the rows mirror. The two zone 8s (`*`) face each other in column 3, and same-column zones (4.4.5.4) line up: your Z1 sits under the opponent's Z5 and Z6.

- Zones follow the spec geometry (4.4.5): same-column zones line up, and the two zone 8s (`*`) face each other across the center line.
- Each invading monster sits in the zone it occupies, as its stack's top card, with rage and threat beside it in Stats.
- Card display (M5b fix, godzilla-sim formatting): every card on the board, mat zones, monster stacks, strategy zones, discard top and the hand, is the full printed card image (the 300 px thumb), with no text rows under or over it. All cards and mat cells share one size, `--card-w` by `--card-h` (63:88): the card height comes from the window height so both mats, the hand row and the half-height opponent hand row fit without scrolling. Empty cells show a faint outline with their label; small arrows in the gaps, under the cards, mark the path between zones (solid, 1 to 8) and where a countered monster moves (dotted, 8 to 3, 7 to 4, 6 to 5; 5.15.1.1).
- Overlay chips replace the text rows: a counter power chip at the bottom edge of a battle card (printed value plus the colored modifier), a threat chip on the invading monster, a count badge on pile cells, and "×N" on a stack.
- The card preview is a fixed panel that opens over the right column when any card is hovered. It never covers the hand or the zones.
- The sidebar collapses to icons for more board space.

## Hand and card movement

**Tucked hand (default)**
- The hand strip spans the board width. Hand cards are full cards at `--card-h`; a large hand overlaps but every card stays whole, with its left edge showing.
- Lit = can be played to a zone (battle, strategy or monster play), from `getLegalActions`. A card whose only actions are invade or gain rage stays unlit, but selecting or dragging it still lights the discard pile and the Rage zone.

**Click to highlight.** One click on a hand card selects it and lights every legal destination:

| Destination | Action | Rule |
| --- | --- | --- |
| Zones 1 to 8 | Play a battle card | 8.2 |
| Strategy zones | Activate a strategy card | 8.3 |
| Your invading monster | Play a monster card (including Burst) | 8.5, 12.5 |
| Your Rage zone | Gain rage: discard a monster card | 8.4 |
| Your discard pile | Invade: discard the card for its invasion icon | 8.6 |

- Clicking a lit destination takes the action. Clicking the card again, or Esc, cancels the selection.
- A destination with two actions for the same card asks which one (no starter card has this).

**Drag and drop**
- Dragging a hand card lights the same destinations. Dropping on one takes the action; dropping anywhere else returns the card to the hand.
- The engine's legality is the only check. The UI only offers actions that `getLegalActions` lists.

**Expanded hand (H key; Paul approved: build it, setting default on)**
- Opens the hand as a full-size grid over most of the board. H or Esc closes it.
- This view is for reading. Clicking a card here does not select it.

**Card preview**
- Hovering any card (hand, board, pile, or a card name in the log) shows it in the fixed preview panel: full image, text with the errata flag, traits, current values.

## Prompts and choices

**Prompt panel (sidebar)**
- Shows the current step's name in words ("Main phase", "Counter phase") and its main button, usually Pass [Space].
- While the bot is thinking: "Bot (Hard) is thinking…" with elapsed time; input is locked.
- Concede is always available to a human seat, with a confirm step. A bot seat never shows Concede.

**Choice modal (every `pendingChoice`)**
- The heading says who is choosing, what for, and whose turn it is, so a choice never reads as a turn change (PR #19 pattern). Example: "Discard 1 card for Godzilla (2023): your opponent's turn".
- A source line names the card that caused the choice ("from Godzilla Emerges").
- Card options show as large card images. Zone options light the zones on the board instead. Yes / no options are two buttons.
- Number keys 1 to 9 pick options. A "Done" button appears when the choice allows stopping ("up to N", find nothing).
- An eye button hides the modal while held, to look at the board behind it.
- Hotseat privacy cover (approved, on for hotseat, off against a bot): before a private choice or a turn change in hotseat, a "Pass to P2" cover hides the screen until clicked.

**M5e additions (match rules and clarity)**
- First / Second pick: every new `/play` game starts with two face-down cards, one First and one Second, shuffled by the seeded RNG at 6.3.1.4. The human picks against a bot, P2 picks in hotseat, two bots skip it. The record stores the pick (`firstPick`).
- Casual / Tournament on the new-game screen, stored in the record (`mode`). Casual has Undo [U] in the prompt panel: it takes back your own actions one at a time, never past a draw, search, reveal, shuffle, random result, opponent action or the end of the game. Undo replays the record without the last action. Tournament has no undo.
- Every human decision shows its modal, even with one option (`confirmSingleOption`): target picks, a single next monster, a single zone for an effect play, a single destination for a move.
- Every deck search by a human seat ends in a search modal, found or not: the searching card, what it searched for, the cards found or "0 found", and Confirm [Space]. Bot searches stay a log line.
- Standby and replacement order options show each ability's printed text above its card.
- Strategy cards turn 90° clockwise in the hand (tucked and expanded) and on top of the discard pile, so the whole landscape card fills the portrait slot. Strategy zones, modals and the preview keep them horizontal.

**M5f additions (board polish)**
- Card moves animate from the before and after board snapshots (FLIP): a card that left one place is paired with a new card of the same card id elsewhere (instance ids change on every move), and an unpaired card flies from or to the pile whose count changed, measured as one card there (the last card in a hand row, the pile's top or back, or a card-sized spot at its center), never the container. A moving card keeps the card's shape: its centers line up and one uniform scale matches the longer sides. Destroyed cards break into angular shards (triangles and 4 or 5 sided polygons, `shards.ts`, seeded by the card's instance id so a replay breaks the same way) that hang spread out for a moment, then reassemble in flight, arriving whole at the destination (never whole where it was destroyed); all moves of one step play together. Input is locked and the bot waits while they play. A history jump, an undo or a hotseat flip shows at once.
- The turn player's mat border glows in their invading monster's colors, each in turn, then grey.
- A custom mat image (IndexedDB) sits behind both mats, the opponent's turned 180°, with scale and position.
- The mat's outer columns are landscape (one card height wide): column 0 holds the strategy zones, so strategy cards show whole, and column 6 the deck and discard pile, centered. Both mats share the template, so columns still line up across the center line.
- `--mat-pad` (12 px, like `--mat-gap`) keeps every zone, strategy zone and pile clear of the mat's edge; the turn glow is on the mat border, outside that padding.
- The hand row takes the height left under the mats; its cards fill it, with `--hand-gap` (4 px) above and below, and overlap as before.
- The battle log column collapses to a thin strip with an expand button (its button or L, saved in settings); `--right-column-width` shrinks, so `--card-h` recomputes, and the preview opens over the board's right side.

**Bot moves**
- Each bot action shows for the delay time (600 ms default) as a short highlight on the card that moved and its destination, plus a log line.

## Information on the board

| Shown | Where | Source |
| --- | --- | --- |
| Counter power of each battle card: printed value plus a colored modifier when an ability changed it (PR #24 pattern) | Chip on the card | `getCounterPower` |
| Total counter power for the next counter phase vs the opponent's threat | Stats panel, both sides | 7.4.2, `getThreat` |
| Monster rank, rage and threat | On the monster and in Stats | `getRank`, rage, `getThreat` |
| Rank change from Burst, with the end-phase discard reminder | On the monster | 12.5 |
| Invasion used / monster played this turn | Prompt panel | `turnFlags` |
| Card counts: hand, deck, discard pile, monster deck | Piles panel, hand strip | 4.1.2.2 |
| Strategy card placed this turn or earlier (leaves at next start phase) | Corner mark on the card | 7.2.3 |
| Ability status for cards not yet coded (manual) | Badge on the card | M4g coverage |

**Battle log (sidebar)**
- Plain-language lines ("Bot plays Super-X to zone 8"), grouped under turn markers.
- Card names are links that open the preview.
- Rule numbers hidden by default; Settings has "Show rule numbers".
- Clicking a line shows the board at that moment (read-only); "Back to live" returns.

**Phase tracker**
- Lists Start, Main, Counter and End with their steps; the current step is lit.
- Names the turn player, the opponent, and the turn number.

## Keyboard shortcuts and settings

| Key | Action |
| --- | --- |
| Space | Main button in the prompt panel (usually Pass) |
| 1 to 9 | Pick an option in a choice modal |
| H | Expand / close the hand |
| Esc | Cancel the selected card, close the expanded hand or the preview |
| L | Show / hide the battle log |
| ? | Show the shortcut list |

**Settings (sidebar)**, saved in the browser (try/catch; defaults when storage isn't available):
- Bot delay per action, 0 to 3,000 ms.
- Show rule numbers in the log.
- Confirm before Pass (approved, default on): asks "Pass with playable cards left?" when a playable card is still lit.
- Expanded hand on H (default on).
- Hotseat privacy cover (default on).

## Tech approach

| Part | Choice | Reason |
| --- | --- | --- |
| Session logic | Extract `useGameSession` from `DebugViewer` (record, replay, bot worker, seats) and share it with `/play` | One source of truth for both screens |
| Routes | `/` menu (Play vs bot, Hotseat, Debug) (approved), `/play`, `/debug` | Small path router, as today |
| Drag and drop | `@dnd-kit/core` | Pointer and keyboard dragging, works with React 19 |
| Styling | CSS modules + CSS variables for every color and size | M15 kaiju theme swaps the variables without touching components |
| Card images | Existing WebP thumbs on the board, full WebP in the preview | Already downloaded (M1b) |
| Tests | Playwright for every action type by click and by drag; component tests for the action-to-destination mapping | Paul's stack |

## Build plan

1. **M5a board skeleton:** `useGameSession` extraction (no behavior change in `/debug`), `/` menu, `/play` new-game screen (decks, seats, difficulty), read-only board: zones in spec geometry, monsters with stacks, strategy zones, piles, stats, opponent hand backs.
2. **M5b hand and movement:** tucked hand strip, lit and dimmed cards, click to highlight, drag and drop for all 5 actions, card preview panel.
3. **M5c prompts and choices:** prompt panel, choice modal for every `pendingChoice` kind, hotseat privacy cover, bot thinking state and move highlight, Concede for human seats.
4. **M5d log, tracker, shortcuts:** plain-language battle log with card links and read-only rewind, phase tracker, all board numbers, keyboard shortcuts, settings, expanded hand.
5. **M5e match rules and clarity:** First / Second pick, Casual undo and Tournament, the search modal, a modal for every human decision, ability text in order modals, rotated strategy cards.
6. **M5f board polish:** card movement and destroy animations, custom mat image, turn glow, landscape strategy zones.

**M5 exit criteria**
- Paul plays a full game against the Hard bot at `/play` without opening `/debug`.
- Every action type works by click and by drag (Playwright).
- Every `pendingChoice` kind shows in the modal with its who / what / whose-turn heading.
