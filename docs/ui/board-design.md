# GojiSim Board UI Design (M5)

Approved by Paul, Oct 22, 2026, with all proposed defaults for the open questions.

## Summary

M5 builds the real game board at `/play`, for hotseat and human-vs-bot games. Its layout and match flow follow ucgrising.com; styling is clean and functional (the kaiju theme comes in M15). `/debug` stays as is for rules checking.

The engine, `getLegalActions`, `getPlayerView`, the bot worker, game records, export/import and deck import are unchanged. The board only reads state and sends actions; it holds no game rules.

## Screen layout

Desktop browser window: a collapsible sidebar on the left, the two fields in the middle, your hand along the bottom.

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
- Card display (M5b fix, godzilla-sim formatting): every card on the board, mat zones, monster stacks, strategy zones, discard top and the hand, is the full printed card image (the 300 px thumb), with no text rows under or over it. All cards and mat cells share one size, `--card-w` by `--card-h` (63:88): the card height comes from the window height so both mats, the hand row and the half-height opponent hand row fit without scrolling. Empty cells show a faint outline with their label; small arrows mark the path between zones (1 to 8).
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

**M5 exit criteria**
- Paul plays a full game against the Hard bot at `/play` without opening `/debug`.
- Every action type works by click and by drag (Playwright).
- Every `pendingChoice` kind shows in the modal with its who / what / whose-turn heading.
