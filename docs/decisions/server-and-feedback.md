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
