# Decisions: Server, deploy and feedback

Accepted decisions about `apps/server`, Railway deploys, the Test Site uploads and the feedback tools, numbered as they were in CLAUDE.md. New ones go at the end of the file that fits (docs/decisions/README.md).

Accepted by Monarch in the deploy for testers review (PR #59).

486. The login page, `robots.txt` (it disallows everything) and `/healthz` answer without the login cookie; every other route, card images and `/api/*` included, needs it. Every response carries `X-Robots-Tag: noindex, nofollow`.
487. Without the cookie, a page (a GET with no file extension, outside `/api/`) gets a 303 to the login page and back after; everything else gets 401.
488. Only wrong passwords count toward the limit: 10 a minute per IP, keyed by `clientIp` (`X-Real-IP`, which Railway's edge sets and overwrites, then the last `X-Forwarded-For` entry, never the first, then the socket address). IPs with no try in the last minute are forgotten once the map holds over 1,000.
489. The login cookie is self-contained (`<expiry>.<HMAC-SHA256 of v1.expiry with SESSION_SECRET>`, HttpOnly, Secure, SameSite=Lax, 30 days), so a redeploy keeps everyone signed in and a new secret signs everyone out. The server refuses to start with a password and no secret of 32 or more characters.
490. After login, the return path (`safeNext`) must start with one `/` and hold no backslash, no control character and no percent-encoded form of either; anything else becomes `/`.
491. Every request runs through `safeHandler`: an error is logged and answered with 500 if nothing was sent (otherwise the response is cut off), and the server keeps serving. A file read that fails mid-stream cuts off that response only.
492. Static files are served only from under their folder (`fileUnder`, after decoding; a NUL or a path that leaves the folder is refused). Card images are cached 30 days, `/assets/` a year (immutable), everything else is checked on each visit; a path with no extension gets `index.html`.
493. Report bug sits under Settings, above modal backdrops, and is hidden during the First / Second pick.
494. The volume holds only the card WebPs (`CARDS_DIR=/data/cards`), copied up from Paul's Mac (docs/deploy.md step 4); a deploy never touches them.
495. The production-build test (`e2e:prod`, a CI job `ci` needs) runs the built server with the gate on, on port 5199.
496. Railway runs one service from the repo root (`railway.json`), deploying only from the `release` branch, which only Paul moves (`git push origin main:release`); merges into `main` never deploy.

Accepted by Monarch in the deploy docs and Import all review (PR #60).

497. Import all keeps the modal open with its report ("Saved N of M decks", then each deck not saved with its reasons); Cancel becomes Close. Import all is disabled once it has saved, until the text changes.
498. The last deck Import all saves becomes P1's pick (decision 292).
499. A deck with no cards isn't saved by Import all ("No cards").
500. Lines outside any deck are reported but don't block Import all; the single Save deck still needs a list with no errors anywhere.
501. A deck name with nothing after its last "/" ("Community/") is kept whole.
502. On Railway with no `GOJISIM_PASSWORD`, the open-site warning prints before and after the listening line, so it sits next to the line the deploy check reads.

Accepted by Monarch in the M13b review (PR #65).

541. An upload is stored exactly as the client sent it (no server fields), so nothing about the request reaches the file; the day folder is the server's UTC date.
542. The upload shape check is `version: 1`, a number or string `seed`, two `decks` and an `actions` array; nothing deeper (the server never replays a record).
543. The upload rate limit counts every attempt, including ones then refused for size or shape.
544. The Test Site switch defaults to on; when `/api/config` can't be read, the web app treats it as off.
545. A game uploads when it ends in this page; a record loaded already finished doesn't upload again. A Bad Bot! send after the game ended uploads at once, with no later retry.
546. Report bug and Bad Bot! are disabled during the First / Second pick (no record yet); the opponent's-hand toggle works there and flags the game at action 0.
547. Bad Bot!'s `label` stores the battle-log line plus turn and phase ("Bot (Hard): Play … (Turn 7, Main phase)"); a private bot choice stays private ("makes a private choice").
548. Bad Bot! and Report bug have no keyboard shortcuts (B and U are taken).
549. The Test Site panel sits above modal backdrops (z 32), so both buttons work mid-choice and after the game ends; the popups sit above the panel.
550. The open / closed state of Test settings and Which button? is saved on the summary click, not on the `toggle` event (which comes a task later and could be lost to a reload).
551. Plain deck reasons are a new `reasons` field on each `validateDeck` failure; `rule` and `message` stay for Tournament blocking and `/debug`.
552. `bot-positions --from` writes next to the record unless `--out` says otherwise, never into `tools/bots/positions/`.

Accepted by Monarch in the one-file-per-game review (PR #67).

569. `gameId` is made in `newSession`; the First / Second pick's probe and pre-pick sessions get ids too, but only the started game's session uploads.
570. The server lowercases `gameId` before using it as a file name, so the same id in any case is one file.
571. A game's earlier file is found by checking each day folder for `<gameId>.json` on each upload with an id; a game stays in the day folder where its first upload landed.
572. A malformed `gameId` is refused (400) rather than stored under a random name, so a client bug shows up instead of piling up files.
573. `bot-feedback` keeps each report from the game's file with the most actions, and lists a game's entries together, in action order.
574. Records without a `gameId` are told apart by seed and bot seed; two games with the same seed and bot seed would merge in the listing (rare: the seed is random per game).
575. `tools/bots` imports the web app's `announce.ts` by relative path, rather than moving it into a package.

Accepted by Monarch in the Good Bot! review (PR #68).

576. Good Bot! with sharing off shows only the "nothing can be sent" line: no download and no Report bug link.
577. Popups show the move in announcement wording (`plain`); the record keeps the battle-log `label` (decision 547 unchanged).
578. `bot-positions --from` writes `prefer` only when every report at that action is Good Bot!; mixed or none writes `avoid`.
579. `pnpm feedback` explains each bot report at the record's bot difficulty (Hard when the record has none), keeps the top 5 by visits, and takes `--no-download` and `--dir`.
580. Report keys are `<game>|<kind>|<action index>`; two reports of one kind at one action share a key.
581. The cap warning starts at 80% of 1 GB, measured on the local copy.

Accepted by Monarch in the Monster Island Mailbox review (PR #111).

614. Suggestions get their own record field, `ideas`, rather than `bugReports` entries with a kind, so older tools that read `bugReports` never list an idea as a bug.
615. A suggestion sent during the First / Second pick goes with the pre-pick board's record (no actions yet, its own game id), since the started game's record doesn't exist yet. It isn't carried into the game.
616. `actionIndex` is the session position when it was sent; the listing doesn't show a turn, since a suggestion isn't about a moment of the game.

Accepted by Monarch in the Report bug context review (PR #116).

629. The answer is recorded before it is applied. When applying throws, the same entry is marked with the error, and the error also becomes the last error (`source: "action"`).
630. Both are cleared when a game starts (a new game, a loaded record), so a report carries only that game's.
631. A confirmed multi-card pick is recorded as one answer: its first option as the action, and "picks …" with every option in the label.

Accepted by Monarch in the Bad Bot! move pick review (PR #117).

632. The list is the union of the bot's moves since the human's last action and the bot's latest turn, not a fixed count.
633. Between two bots (no human action), only the latest turn is listed, so the list never grows to the whole game.

Accepted by Monarch in the Railway IaC review (PR #120).

634. The service moves to Railway Infrastructure as Code (`.railway/railway.ts`, a named partial `gojisim-server`); `railway.json` is removed. This amends decision 496's "(`railway.json`)".
635. Variables are unmanaged: values stay in the dashboard, and IaC never touches them.
636. The existing volume and its `/data` mount are declared as they are, rather than left out, so the file states the whole service.
637. The restart policy isn't set, since railway.json's ON_FAILURE / 10 is Railway's default.
638. `railway` 3.16.0 (Railway's TypeScript SDK, `railwayapp/railway-ts-sdk`) is a pinned root dev dependency: the CLI's plan and apply load the file through it.
639. The migrate tool generated the partial name `@gojisim/server`, which Railway rejects (`[a-zA-Z0-9._-]` only); it's `gojisim-server`.

Accepted by Monarch in the players page review (PR #236).

659. The players page has a Season filter above the table (All seasons by default, then each season, the current one marked). In All seasons, the games total shows beta apart as a tag only while other seasons have games; with the beta filter, a "beta" tag says so. (Decision 665 replaces the tag rule.)
660. An online game counts once in the totals, and once in each of its players' rows.
661. Only players with a Discord id count, which leaves out the `smoke` player and the dev sign-ins, rather than a list of ids.
662. The admin page and its API answer 404 before the sign-in gate, so a signed-out visitor never learns the page exists.
663. The daily post is checked every minute and posts once per Central day from 8:00 on; a failed post marks the day too (no retry every minute). Its text starts "GojiSim players", since it's the server's post.
664. CSV cells starting with `= + - @` get a leading `'`, so a name can't run as a formula in a spreadsheet.

Accepted by Monarch in the players page seasons review (PR #237).

665. Every game is tagged with its season. In All seasons, the totals, the daily post and each row show games per season ("beta 80 · launch 40"): each season with games, in the order the seasons started, beta included when it's the only one. This replaces decision 659's "only while other seasons have games".
666. The table shows a player's games per season as one By season cell, sorted by their total, not a column per season, so the table doesn't widen as seasons are added. The CSV has a column per season ("Games <season>"), every season, zeros included, so a spreadsheet always has the same columns.
667. Season names come from the `seasons` table; only `beta` is named in code, as the first season.

Accepted by Monarch in the smoke check review (PR #145).

668. The smoke check runs after the Release workflow (`workflow_run`) and checks the commit Paul pushed (`head_sha`). A manual run checks `release`'s current commit.
669. "Deployed" means `/healthz` reports that commit, from `RAILWAY_GIT_COMMIT_SHA`. If Railway didn't provide it, the wait times out and the message says so.
670. The upload step concedes the game: the game-end upload is stored and checked for 201 and `smokeCheck`. No Report bug or Mailbox entry is made.
671. Smoke uploads are marked from the browser (`gojisim.smokeCheck` in localStorage), not by the server, and every reader of records skips them.
672. Playwright retries the live check once; the failure report reads the last attempt.
673. `pnpm rollback` force-pushes `release` with a lease. It's the only command that rewinds `release`, and it asks first.
674. The spec runs in `e2e:prod` on every PR as well as live, with card art served locally (the build has none) and the local test password.

Accepted by Monarch in the Slack reports review (PR #147).

675. Slack gets the same text as Discord, converted (`slackText`), not a second builder, so the two channels can't drift.
676. Escaping is all of `&<>`, then the quote marker at each line's start is restored, so a note's own `>` lines show as `> &gt; …`.
677. The poster returns the posts that went through across both webhooks. Discord posts first, then Slack, each one at a time.

Accepted by Monarch in the Discord sign-in review (PR #154).

681. The role re-check after 24 hours happens on page loads (a silent Discord redirect), not on API calls, so an upload in the middle of a game never fails. A removed Tester can keep an open tab working until they reload, at most for the cookie's life.
682. The session cookie's v2 format carries the player id. The password gate keeps v1, so switching modes signs everyone in again in the new mode.
683. The OAuth state, PKCE verifier and return path live in a signed 10-minute cookie, so there's no server-side state.
684. Players get a random id, with the Discord id unique beside it, so another sign-in method could be added later. The smoke player's id is `smoke`.
685. `DISCORD_REDIRECT_URI` is optional (default `https://gojisim.somanygames.app/auth/discord/callback`), never derived from the request's Host header.
686. Backups use `VACUUM INTO`, a consistent copy including the WAL, made only when migrations are pending on an existing file.
687. `node:sqlite`'s ExperimentalWarning is left in the log, not hidden for every warning.

Accepted by Monarch in the games linked to players review (PR #155).

688. The server writes the player into the stored record (as well as the index), so files stay self-contained for `pnpm feedback` and replays, and tools don't need the database.
689. A finished game's result comes from the client's `outcome` (display only; the server doesn't run the engine). The player never does: it always comes from the session.
690. The client's `playerId` and `playerName` are dropped in every mode, password included.
691. A game id already indexed to another player can't be uploaded over (403). Games from before accounts aren't in the index and stay as they were.
692. The start time is the game's first stored upload; the end time is the first upload with a result.
693. Smoke check games are indexed for the `smoke` player like any other; nobody else can see them.

Accepted by Monarch in the account sync review (PR #156).

694. The newest edit wins, by the browsers' edit times. Deletes are tombstones, so they reach the other browsers, and only a later edit brings a deck back.
695. Settings sync without an offer: the account's copy wins, and with none yet this browser's becomes the account's. Decks get the one-time upload offer, since two browsers can hold different decks under the same name.
696. "Not now" never deletes anything: this browser's decks stay here, unsynced. New decks saved while signed in always go to the account.
697. A clash's default is "Keep both", the choice that can't lose a deck.
698. Every setting syncs except the mat image (stored separately).

Accepted by Monarch in the seasons review (PR #160).

699. The current season is a row in `seasons` (the newest), not a variable, so the reset takes effect without a restart or deploy, and the history of seasons is kept.
700. A game belongs to the season it started in. A beta game finished after the reset stays beta.
701. The reset never deletes. It backs up first and needs the season's name typed back; without `--apply` it only prints counts.
702. Only the player-facing views (history, and statistics and achievements later) filter by season. `pnpm feedback`'s metrics keep reading every record file.
703. Season names are lowercase letters, digits and dashes (2 to 32), so they're safe in file names and easy to type over ssh.

Accepted by Monarch in the community report posts review (PR #215).

815. Both opt-outs are offered: "Post without my name" (the note posts anonymously) and "Don't post publicly" (it doesn't post at all), so a reporter can choose either.
816. A report entry records the reporter's choice as `community`. A missing value means not posted publicly, since older app versions never offered the choice.
817. The community post leaves out the bot move's battle-log label and the deck names. The issue allowed an archetype name, but the server has no archetype for a game, so none is shown.
818. The community post uses the staff post's head format ("Report bug · from Name · Turn 6, Main phase").

Accepted by Monarch in the M9a review (PR #229).

864. Head to head runs in `apps/server` with Socket.io on the same port and session cookie, and needs Discord sign-in. The server is the only authority: each seat gets only its own `boardModel` and legal actions, and a move must deep-equal one of `getLegalActions` (the server applies its own copy) and carry the current action count.
865. The First / Second picker is a random player (`firstPicker`, one function), who picks one of the two face-down cards as in `/play` (Paul's call; may change).
866. Undo by agreement in Casual games (Paul's call): the asker's last action, or the whole confirmed pick it ended, as far as `/play`'s Casual undo may go. Any move answers an open request with no. Tournament games have no undo.
867. Leaving (Paul's call): a player gone 5 minutes lets the other claim the win, and the record ends with the gone player's concede (so it replays). Both gone 30 minutes: abandoned, with no winner, `outcome.reason` "abandoned" and the record kept. A game that never started is dropped once everyone in it has been gone 30 minutes. A finished room stays 10 minutes, for the game-over screen and the history view.
868. The history view asks the server for the seat's board after N actions (Paul's call: in M9).
869. Decks: your own My decks (the server's synced copy) or an official starter. The starters are added so a new player with no decks can play, and the opponent's deck name stays hidden until the game is over (Q42).
870. The record is marked `h2h: true`, not `mode: "h2h"`, because `mode` already holds Casual or Tournament, which online games keep (Paul's answer 2). Head to head records go in the same `<day>/` folders as uploads, not `records/h2h/`, so `pnpm feedback` and the stored-game lookup read them unchanged.
871. `games` is keyed by (game_id, player_id) (migration 5), with `h2h` rows written only by the server.
872. `boardModel` moves to the engine. It is pure data, not UI, so the server can build boards too.
873. The server is bundled with esbuild, with the same `dist/` paths.
874. Dev sign-in `?as=<name>`, dev server only (Monarch's answer 5).
875. The open-game sweep keeps one replica's memory as the source of truth, with the volume files for restarts. Railway's single replica stays (`.railway/railway.ts` already has it).

Accepted by Monarch in the h2h record fix review (PR #232).

884. A head to head game's record isn't served to its players (Q42). Replaying online games would need the server to send each player's own boards, as the live history view does. That's later work.
