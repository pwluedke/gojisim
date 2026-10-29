# Release notes

What each merged PR changed, in plain words, for Paul and the testers. Newest first. Each PR's own description has the same section, and its Tests section has the detail.

## #69 Rules fixes from community rulings: Godzilla Final Wars zones, SpaceGodzilla's lock (not merged yet)

### What changed

- **Godzilla Final Wars (EBP04-079):** you now pick the zone for each revealed [final-wars] card, and any zone works, even one with a card in it (that card may be destroyed by overload). The cards are played together, so two of them can't go to the same zone. Before, the game put them in empty zones first.
- **SpaceGodzilla (EBP02-055):** its locked column now stops every way of playing a battle card there, not only from the hand: Evolution, cards played by effects (such as Godzilla Emerges or Odo Island) and tokens (official Q&A 270).
- **Battra (Larva) (EBP04-050):** still triggers once per invasion; this is noted as a ruling to check later.

### Fixed

- Evolution, effect plays and tokens could put a battle card into a column SpaceGodzilla had locked.
- When a card went to the bottom of a deck (for example by Mothra's replacement, ESD01-011) and a copy of the same card was drawn in the same step, the animation showed the first card flying into the hand.

### Testing notes

- New engine tests for each ruling. Details in the PR's Tests section.
- Try it:
  1. Activate Godzilla Final Wars with a [final-wars] battle card on top of your deck: you choose its zone, and zones with cards in them are offered.
  2. Against SpaceGodzilla in zone 4 or later with 3 Crystals, try to evolve a battle card in its column: Evolution finds nothing.

### Known issues

- None known.

## #67 One stored file per game; plain bot moves in the report listing (not merged yet)

### What changed

- Each game is now one file on the GojiSim server, however many times it's sent. Before, every Bad Bot! report and the game's end each saved a new copy of the whole game.
- For Paul: `pnpm bot-feedback` lists each report once, says "N reports in M games", and shows the bot's move in plain words, with the stored label under it.

### Fixed

- One game with 4 Bad Bot! reports was stored as 5 files and listed 13 times.

### Testing notes

- New tests for the server (the same game sent twice keeps one file; a game that crosses midnight stays one file; older pages without a game id still get their own file), the listing (5 copies of one game list its 4 reports), and a browser test where 2 Bad Bot! reports and the game end leave one file. Details in the PR's Tests section.
- Try it:
  1. Play a game, press **Bad Bot!** twice with different notes, then finish or concede.
  2. Paul: download the records (docs/deploy.md) and run `pnpm bot-feedback records`: the game is one file, and both notes are listed once.

### Known issues

- Files saved before this change stay as they are; the listing still shows each of their reports once.

## #66 Bot announcements, Report bug sends, zone choice in the Prompt panel, Mechagodzilla (1975) Weapon (2026-10-28)

### What changed

- **Announce bot plays** (Settings, off by default): each bot action shows as one plain-English line in a banner over the top of the board, such as "Bot plays Destoroyah Flying Form to zone 3" or "Bot searches its deck and takes 1 card". It never names a card you can't see.
  - The **Pace** slider sets how long each line stays: 1.5, 2.5, 3.5 (the default), 5 or 7 seconds, a little longer for long lines. Its last step, **Confirm**, keeps each line until you press OK or Space.
  - The bot waits for the line before its next move, and choice windows wait too, so you can follow the bot's turn without reading the battle log.
  - With it off, the small move toast shows as before.
- **Report bug** now sends your note and the game straight to us (the button reads Send). If sending fails, or you turned off Share finished games, the game file downloads instead for you to send to Paul.
- **Zone choices** ("You are choosing a zone for …") now sit in the Prompt panel on the left, with buttons like "Your zone 1" and "Bot's zone 3". The battle log is no longer covered.

### Fixed

- Mechagodzilla (1975) EBP01-023 was missing its Weapon trait, so a Multi-Purpose Fighting System 3 (EBP03-006) deck with it was wrongly called illegal.

### Testing notes

- New tests for the announcement wording (no hidden card is ever named), the timing, the setting and the bot waiting; Report bug's send and its download fallback; the zone choice in the Prompt panel; and the Mechagodzilla (1975) deck. Details in the PR's Tests section.
- Try it:
  1. Open Settings, tick **Announce bot plays**, and watch the bot's turn. Move the Pace slider to Confirm and press Space after each line.
  2. Press **Report bug**, write a note and Send: it says "Thanks, sent."
  3. Play a card that makes you choose a zone (for example one that moves a battle card), and check the zone buttons in the Prompt panel.
  4. Import a Multi-Purpose Fighting System 3 deck with Mechagodzilla (1975) EBP01-023: it's legal now.

### Known issues

- None known.

## #65 M13b: Test Site panel, Bad Bot!, Report bug notes, game sharing, named deck problems (2026-10-28)

### What changed

- A **Test Site** panel sits under Settings, on the left of the board (look for the yellow and black stripes). It holds two buttons:
  - **Bad Bot!**: the bot made a bad move. Write your name and what it got wrong; your note and the game are sent to us straight away so the bot can learn from it.
  - **Report bug**: something in the game is wrong. Write your name and what happened; the game file downloads with your note inside. Send it to Paul as before.
  - Your name is remembered for next time.
- **Sharing finished games:** when a game ends, it's sent to the GojiSim server, decks included, to help improve the game and the bot. To turn this off, open **Test settings** in the panel and untick "Share finished games to improve GojiSim". With sharing off nothing is sent, Bad Bot! included.
- **Show opponent's hand** moved into Test settings and now works at any point in a game, not only at the start. It asks first, because the game is then left out of your statistics and achievements, even if you turn it off again.
- Test settings also has a short "Which button?" help.
- The **Illegal deck** badge, and the warning next to a deck when you pick one, now say exactly what's wrong, card by card: for example "Gravity Beam (EBP01-079): banned since Sep 1, 2026". Up to three show, and hovering lists them all.

### Fixed

- The Illegal deck badge said only "Restriction list" for a deck with a banned Gravity Beam, which looked like a color problem.

### Testing notes

- New tests for the server's upload route (a stored record, too large, wrong shape, too many uploads, password needed), the panel, both popups, the uploads, the opponent's-hand warning and every deck-problem wording. Browser tests watch the uploads arrive at a test server. Details in the PR's Tests section.
- Try it:
  1. Play a few moves against a bot, press **Bad Bot!**, fill in your name and a note, and press Send: it says "Thanks, sent."
  2. Press **Report bug**, write a note and Download; the file has your note in it.
  3. Open **Test settings**, tick **Show opponent's hand** mid-game, and read the warning before saying Show hand.
  4. Import a deck with a Gravity Beam and check its badge names the card.

### Known issues

- Uploaded games can only be read by Paul, by downloading them from the server (docs/deploy.md); there's no page to see them.

## #64 M13a: bot fixes from tester games, Kaizer Ghidorah after Monster X (2026-10-28)

### What changed

- Medium and Hard bots no longer play strategy cards that would do nothing: Scale Attack when you have fewer than 5 rage, or Godzilla vs. Destoroyah when their counter is already made.
- A countered rank II Monster X can now be followed by a rank III Kaizer Ghidorah from the monster deck (Paul's ruling of Oct 28, 2026).
- Easy plays exactly as before.

### Fixed

- The bot played Scale Attack while you had 4 rage, so it did nothing.
- The bot played Godzilla vs. Destoroyah's +10,000 when it had already countered without it.
- You lost when your Monster X rank II was countered, although a Kaizer Ghidorah rank III was in your monster deck.
- A bot could freeze in games with some EBP03 and EBP04 cards (EBP03-074, EBP04-010, "up to 2" searches such as EBP01-019, and EBP03-052).

### Testing notes

- 6 new rules tests for Kaizer Ghidorah and 9 new bot tests. In test positions taken from the tester games, the bot now avoids the bad play in 20 of 20 tries at Hard and at 100 (before: as few as 3 of 20). Over 1,000 bot-vs-bot games, the new Hard is as strong as the old one overall. Details in the PR's Tests and Results sections.
- Try it:
  1. Play a deck with Scale Attack or Godzilla vs. Destoroyah against a Hard bot holding them (or watch two Hard bots), and check the bot only plays them when they do something.
  2. Play a Monster X deck with a Kaizer Ghidorah rank III in the monster deck, and let your rank II Monster X get countered: Kaizer Ghidorah comes in instead of you losing.

### Known issues

- The Hard bot is no stronger overall; the bigger strength work (weight tuning, a smarter way to play out moves) comes in M13c.

## #63 Tester fixes 1: select-then-Confirm picks, whole-deck search, View board, modal preview and undo, official art (2026-10-27)

### What changed

- When you have to pick 2 or more cards (discarding down to your hand size, "up to 2" searches and the like), you now select them all, then press **Confirm** (or Enter). Selected cards are numbered in the order you picked them; click a card again to unselect it, or press Esc to clear.
- A search has a **Show whole deck** box: it lists your whole deck sorted by card number, with the cards you can't take dimmed.
- Every choice and search window has **View board** (B) to look at the board and come back.
- Hovering a card in a choice window shows the large preview.
- **Undo** (U) is in the choice window too, and one undo takes back a whole confirmed pick.
- The official card back is on every face-down card, and the First / Second pick shows the official First and Second card fronts.
- The First / Second pick reads "Pick a card. It decides who goes first."

### Fixed

- Picking several cards meant one window per card, with no way to change your mind partway.
- The choice window covered the board, so you couldn't check it before choosing.
- A search showed only the cards you could take, not what else was in your deck.

### Testing notes

- 1,165 unit tests, 271 browser tests and 3 tests of the built site pass. New browser tests cover selecting and confirming, undo from the window, View board, the preview, the whole-deck list and the official art (with and without the images). Details in [#63's Tests section](https://github.com/pwluedke/gojisim/pull/63).
- Try it:
  1. Start a game and play until you have more than 7 cards at your end phase, or play a card that searches for "up to 2".
  2. Click two cards, check the numbers, then press Enter.
  3. In any choice, press B to see the board, then B again to come back.
  4. Press U in the window to take the pick back.

### Known issues

- The official images live only on the site's storage, not in the code. After this deploy, Paul re-runs the image copy (docs/deploy.md step 4) or the drawn card backs show instead.
- This deploy was skipped by Railway's "No changes to watched files" setting until Paul cleared it in the dashboard; M13a makes the repo set it.

## #62 M12g: FC01 abilities (6 cards), all 388 cards implemented; /debug imports without folders (2026-10-27)

### What changed

- The 6 Godzilla Fest cards (FC01) work. With them, every card with text is implemented: 388 cards, plus the 5 tokens.
- Decks imported in `/debug` show in the new-game list under their folder, with the short name.

### Fixed

- A deck imported in `/debug` showed its whole folder path as its name in the deck list and on the fight card.
- When one card destroyed several cards at once, a card protected by "if your opponent has 2 or fewer battle cards" (King Ghidorah's Defense) could lose its protection partway through, as the other cards left. Protection is now read before any card leaves.

### Testing notes

- 12 new rules tests for the FC01 cards, each citing its rule, plus 800 automated games with decks full of FC01 and ESC01 cards (no errors). 1,157 unit tests, 260 browser tests and 3 tests of the built site pass. Details in [#62's Tests section](https://github.com/pwluedke/gojisim/pull/62).
- Try it:
  1. Build a deck with FC01 cards (for example Godzilla (Fest) and Gigan (Fest)) and import it.
  2. Play it against a bot and watch the battle log when the cards' abilities fire.

### Known issues

- This PR didn't reach the site at first: Railway skipped the deploy ("No changes to watched files"). Paul cleared the setting in the dashboard; M13a makes the repo set it.

## #61 M12f: ESC01 abilities (6 cards) (2026-10-27)

### What changed

- The 6 cards of the ESC01 set work: Godzilla (1954), Godzilla (1995), Godzilla (2016) 4th Form, Godzilla (2023), King Ghidorah (1991) and Mothra (Imago) (1992).
- Their effects are worded in plain words in the game, like the other sets.

### Fixed

- Nothing tester-reported in this PR.

### Testing notes

- 14 new rules tests for the ESC01 cards, each citing its rule, plus 800 automated games with decks full of ESC01 cards (no errors). 1,143 unit tests, 259 browser tests and 3 tests of the built site pass. Details in [#61's Tests section](https://github.com/pwluedke/gojisim/pull/61).
- Try it:
  1. Import a deck with ESC01 cards.
  2. Play Godzilla (1954) when its rank is too high: the game offers to discard a Godzilla card to play it 4 ranks lower.
  3. Play Mothra (Imago) (1992) and say Yes to discarding your hand: you gain 1 rage per strategy card discarded.

### Known issues

- None known.

## #60 Deploy docs fixes, open-site warning, Import all and folder-free deck names (2026-10-27)

### What changed

- **Import all:** pasting a list with several decks offers Import all, which saves every deck that has no errors. A window then says "Saved N of M decks" and lists each deck it couldn't save, with the reasons. A name you already have gets " (2)".
- An imported deck's suggested name leaves out its folder ("Community/Red Rage" becomes "Red Rage").
- For Paul: the deploy guide's image copy now runs from the Mac, and the server warns loudly if the site starts without a password.

### Fixed

- Imported deck names included their folder path.
- The deploy guide's image step didn't work on Railway (it tried to make the images on the server).

### Testing notes

- New unit tests for the deck names and Import all (a 3-deck list with one bad deck), and a browser test of Import all. 1,128 unit tests, 259 browser tests and 3 tests of the built site pass. Details in [#60's Tests section](https://github.com/pwluedke/gojisim/pull/60).
- Try it:
  1. On the new-game screen, open Import deck and paste a list with two or three decks.
  2. Press Import all and read the report.
  3. Check My decks for the new names.

### Known issues

- None known.
