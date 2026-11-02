# Deploying GojiSim for testers

GojiSim runs on Railway as one Node service at `https://gojisim.somanygames.app`, the same way Session Zero runs at `somanygames.app`. The service:

- builds the web app and the server (`pnpm build`);
- runs `apps/server`, which serves the built app, the card images and `/api/decklog`;
- puts every route behind one shared password.

It deploys only when Paul says so: Railway watches a branch named `release`, not `main`, so merging a PR never deploys or spends Railway credits. Paul deploys by pushing main's current commit to `release` (see [Deploy](#deploy)). Only Paul deploys; Mecha never pushes to `release` and never runs Railway deploy commands.

The repo's `.railway/railway.ts` (Railway's Infrastructure as Code) holds the service's settings: the build and start commands, the health check, the `release` branch, the volume, the region and the domain. Paul changes them by planning and applying that file with the Railway CLI ([Railway settings as code](#railway-settings-as-code)). Railway stops reading `railway.json` on 2026-12-01; the repo no longer has one.

## What you need

- The Railway account that hosts Session Zero.
- The Porkbun account for `somanygames.app`.
- The Railway CLI on your Mac, for the one-time image step: `brew install railway`, then `railway login`.
- The card images on your Mac (`pnpm images`, which fills `apps/web/public/cards/`).

## 1. Create the service

1. On your Mac, in the `gojisim` folder, create the `release` branch once: `git push origin main:release`.
2. In Railway, open the project that holds Session Zero (or create a new project: **New Project → Empty Project**).
3. **Create → GitHub Repo → `pwluedke/gojisim`**.
4. **Keep one service.** Railway sees the repo's workspace packages and may make one service for each (web, server, stress, ability-survey, bots, scraper). Delete all but one: open each extra service, then **Settings → Danger → Delete Service**.
5. Open the one you kept and name it `gojisim` (**Settings → Service Name**).
6. **Settings → Source:**
   - **Root Directory:** empty (the repo root), so Railway builds the whole workspace.
   - **Branch:** `release`.
   - Turn on **Wait for CI**. Railway then deploys a commit only after its GitHub checks pass; the one that matters is `ci`, which needs every other check. A commit pushed from `main` has already passed it, so it deploys right away.

   - **Watch Paths:** leave them empty in the dashboard. `.railway/railway.ts` sets `watchPatterns` to `**`, so every push to `release` deploys; a web-only change limited by dashboard Watch Paths never would.

   The first deploy fails until step 2's variables are set; that's expected.

## 2. Set the variables

**Variables → New Variable** for each:

| Variable                  | Value                            | Why                                                                                                                                                                                                                                                |
| ------------------------- | -------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `GOJISIM_PASSWORD`        | the testers' password            | The one shared password. Testers type it once per browser.                                                                                                                                                                                         |
| `SESSION_SECRET`          | 64 random characters (see below) | Signs the login cookie. The server won't start with a password and a missing or short secret.                                                                                                                                                      |
| `CARDS_DIR`               | `/data/cards`                    | Where the server finds the card images (the volume, step 3).                                                                                                                                                                                       |
| `RECORDS_DIR`             | `/data/records`                  | Where uploaded game records go (the volume, step 3). This is the default; set it to be sure. Capped at 1 GB: past it, uploads answer 507 and the log says "the records folder is full" (download and clear old days to make room).                 |
| `GOJISIM_TEST_SITE`       | `on` or `off`                    | The Test Site panel (Bad Bot!, Report bug, Test settings) and game uploads. Default `on`.                                                                                                                                                          |
| `DISCORD_REPORTS_WEBHOOK` | the staff #reports webhook URL   | Optional (#136): each new Report bug, Bad Bot!, Good Bot!, Mailbox note and crash is posted to the Discord staff #reports channel. Unset, nothing is posted and the log says so once. See [Tester reports in Discord](#tester-reports-in-discord). |
| `SLACK_REPORTS_WEBHOOK`   | the #gojisim-reports webhook URL | Optional (#146): the same posts to Slack #gojisim-reports, where Monarch reads them. Either webhook works without the other. See [Tester reports in Slack](#tester-reports-in-slack).                                                              |

Make the secret on your Mac with `openssl rand -hex 32` and paste the output. Railway sets `PORT` itself; don't add it.

Railway stages variable edits: nothing changes until you click **Apply changes** (or **Deploy**) at the top of the canvas. Click it after adding the variables.

**Check the gate is on.** In **Deployments**, open the new deploy's **Deploy Logs**. The last line must end with `(password gate on)`:

```
GojiSim server listening on http://localhost:<port> (password gate on)
```

If it doesn't, the site is open to anyone: the variables weren't applied. On Railway, a server without `GOJISIM_PASSWORD` also logs `WARNING: no password gate, the site is open to anyone`. Apply the variables and check again.

### Tester reports in Discord

One time, Paul's step (#136). Until it's done, uploads work as before and the deploy log says once that `DISCORD_REPORTS_WEBHOOK` isn't set.

1. In the GojiSim Discord server, open the staff **#reports** channel's settings (the gear) → **Integrations → Webhooks → New Webhook**. Name it (for example "GojiSim reports") and **Copy Webhook URL**.
2. In Railway: the `gojisim` service → **Variables → New Variable**. Name: `DISCORD_REPORTS_WEBHOOK`. Value: the URL. Click **Apply changes** (Railway restarts the server).

Each new entry is one message: its kind, the reporter, the turn and phase, the bots and deck names, the note, and the file with `--at` for `pnpm feedback`. A crash shows its error and first frame. No decklist and no game file goes to Discord, and mentions are off, so a tester's note can't ping anyone. An entry is posted once, even when the same game uploads again. Five entries at most per upload; past that, one "…and N more" line. A slow (over 5 s) or failed post is a line in the deploy log, and the upload itself never waits for Discord.

Treat the URL like a password: anyone with it can post to #reports. If it leaks, delete the webhook in the channel's settings, make a new one, and replace the variable.

### Tester reports in Slack

One time, Paul's step (#146). The same posts go to Slack #gojisim-reports, so Monarch reads every report with no manual step. Either webhook works without the other; until this one is set, the deploy log says once that `SLACK_REPORTS_WEBHOOK` isn't set.

1. api.slack.com/apps → the existing GojiSim Slack app → **Incoming Webhooks → Add New Webhook to Workspace** → pick **#gojisim-reports** → **Allow**, then copy the URL.
2. In Railway: the `gojisim` service → **Variables → New Variable**. Name: `SLACK_REPORTS_WEBHOOK`. Value: the URL. Click **Apply changes**.

The Slack message is the Discord one in Slack's format: `&`, `<` and `>` are escaped, so a tester's note can't mention anyone or make a link. The same rules apply as for Discord: once per entry, the smoke check's games skipped, at most five per upload, and the upload never waits. The whole flow is in [docs/feedback-flow.md](feedback-flow.md).

## 3. Attach a volume for the card images

1. In the project canvas, right-click the `gojisim` service → **Attach Volume**.
2. Mount path: `/data`. The images take about 75 MB, so the smallest size is plenty.
3. Railway redeploys. The app works now, but cards show their names instead of images until step 4.

## 4. Load the card images once

The images aren't in git, and a deploy never downloads them. They live on the volume and survive every deploy. The running service has Node only (no `pnpm`, `npx` or `corepack`), so `pnpm images` can't run there: make the images on your Mac and copy them up through `railway ssh`.

1. **An SSH key for Railway** (once). `railway ssh` needs a key registered with Railway:

   ```
   ssh-keygen -t ed25519 -f ~/.ssh/railway_ed25519
   railway ssh keys add --key ~/.ssh/railway_ed25519.pub --name <a name for this Mac>
   ```

   Pass `-i ~/.ssh/railway_ed25519` to every `railway ssh`.

2. **Link the folder** (once): on your Mac, in the `gojisim` folder, `railway link`, and pick the project and the `gojisim` service.
3. **Make the images locally:** `pnpm images`. It downloads each card image from godzillatcgdb.com at the scraper's polite pace (one request a second, decision 25) and writes the two WebPs the app uses into `apps/web/public/cards/`: about 950 cards (1,900 files, roughly 16 minutes the first time). It skips every card that already has its images (decision 22), so a second run only fetches new cards.
   **3b. The official First / Second cards and card back** (TOHO art, not in git either). Put the 5 source files in `apps/web/public/cards/official-src/` (`first-godzilla-vs-godzilla.png`, `first-resonance-of-rivals.png`, `second-monsters-raid-again.png`, `second-endless-wars.png`, `card-back.webp`). `pnpm images` converts them at its end, or `pnpm official-images` alone: `first-1`, `first-2`, `second-1`, `second-2` and `back`, each as `<name>.webp` and `<name>-thumb.webp`. Without them the app draws its own card backs and First / Second faces.

4. **Copy them to the volume:**

   ```
   COPYFILE_DISABLE=1 tar czf - --exclude ./official-src -C apps/web/public/cards . | railway ssh -i ~/.ssh/railway_ed25519 -- "mkdir -p /data/cards && tar xzf - -C /data/cards && ls /data/cards | wc -l"
   ```

   It prints the number of files on the volume: 1910, the 1,900 card images (950 cards) plus the 10 official images (step 3b). `--exclude ./official-src` leaves the source files on your Mac. `COPYFILE_DISABLE=1` keeps macOS metadata out of the archive; without it, the copy still works but prints harmless `tar: Ignoring unknown extended header keyword 'LIBARCHIVE.xattr.com.apple.provenance'` lines.

No redeploy is needed: the server reads `/data/cards` on each request. After a card data update adds new cards, run steps 3 and 4 again.

## 5. Add the address

1. In Railway: **Settings → Networking → Custom Domain**, enter `gojisim.somanygames.app`. Railway shows a CNAME target like `xxxxxxxx.up.railway.app`.
2. In Porkbun: **Domain Management → somanygames.app → DNS → Add record**:
   - Type: `CNAME`
   - Host: `gojisim`
   - Answer: the target Railway showed
   - TTL: `600`

   If Railway also shows a TXT record to verify the domain, add it the same way.

3. Wait for Railway to show the domain as active, with its certificate issued. That usually takes a few minutes.
4. Open `https://gojisim.somanygames.app`. You get the login page; type the password, and the app opens.

## Deploy

Merging into `main` doesn't deploy. To put main's current state in front of testers:

1. On your Mac, in the `gojisim` folder: `git fetch origin`, then `git push origin origin/main:release` (with `main` checked out and up to date, `git push origin main:release` is the same). If Git refuses because `release` has commits `main` doesn't, something other than this command pushed there; ask before forcing.
2. In Railway, open the `gojisim` service → **Deployments**. The new deploy appears for that commit, builds, passes the `/healthz` check and becomes **Active**. That takes a few minutes. A deploy marked **Skipped: No changes to watched files** means Watch Paths are limiting it: clear them under **Settings → Source → Watch Paths** (the repo's `watchPatterns` covers everything), then push again or redeploy.
3. Open `https://gojisim.somanygames.app` and check the change.

The same push also publishes a GitHub Release (the Release workflow, `.github/workflows/release.yml`), tagged `release-<date>-<n>`, from the "Release notes" sections of the PRs merged since the last one: nothing to do by hand. If the workflow fails, the deploy is unaffected; re-run it from GitHub → Actions. It then posts the release (title, link and notes, cut to fit with the link last) to Slack #gojisim-release-notes and the GojiSim Discord server's release notes channel, once their webhooks are set up ([Release posts](#release-posts-to-slack-and-discord)). A missing webhook or a failed post is a warning in the workflow's log; the release still stands. The site's "What's new" link (the menu and `/play`'s Settings) opens the latest release, with a "New" dot for players who haven't opened it yet.

### Release posts to Slack and Discord

One time, Paul's steps. Until they're done, releases are published as before and the workflow logs a warning for each missing webhook.

**Slack**

1. Go to api.slack.com/apps and open the existing GojiSim Slack app → **Incoming Webhooks**. Turn them on if they're off.
2. **Add New Webhook to Workspace**, pick **#gojisim-release-notes**, and allow it. Copy the webhook URL (`https://hooks.slack.com/services/…`).
3. On GitHub: the `gojisim` repo → **Settings → Secrets and variables → Actions → New repository secret**. Name: `SLACK_RELEASE_WEBHOOK`. Secret: the URL.

**Discord**

1. In the GojiSim Discord server, open the release notes channel's settings (the gear) → **Integrations → Webhooks → New Webhook**. Name it (for example "GojiSim releases") and **Copy Webhook URL** (`https://discord.com/api/webhooks/…`).
2. On GitHub, add a second repository secret the same way. Name: `DISCORD_RELEASE_WEBHOOK`. Secret: the URL.

Treat both URLs like passwords: anyone with one can post to that channel. Don't paste them into Slack, issues or PRs. If one leaks, delete the webhook (Slack: the app's Incoming Webhooks page; Discord: the channel's Webhooks), make a new one, and replace the secret. Discord posts have mentions turned off, so nothing in the notes can ping anyone.

The next push to `release` posts its release; the workflow's log says "Posted to Slack and Discord." when both worked.

**Smoke check (#92).** After the Release workflow, the Smoke check workflow (`.github/workflows/smoke.yml`) checks the live site. It waits up to 15 minutes for `/healthz` to report the pushed commit (Railway's `RAILWAY_GIT_COMMIT_SHA`). Then Playwright logs in, starts a game against Easy, checks card images load, makes the First / Second pick, passes a turn, waits for the bot's turn, and concedes, which must store the game's upload. That upload is marked `smokeCheck`, so `pnpm feedback`, the win rates and the Discord #reports posts leave it out.

- **Pass:** one line in Slack #gojisim-release-notes.
- **Fail:** a message in #gojisim-dev naming the step that failed, with the run's link and the rollback command. A failure screenshot (taken after the login page) is in the run's artifact.
- **Never blocks:** the deploy and the release don't wait for it. **Actions → Smoke check → Run workflow** runs it again by hand.

One-time setup (Paul): on GitHub, **Settings → Secrets and variables → Actions → New repository secret**:

- `SITE_PASSWORD`: the testers' password, the same as Railway's `GOJISIM_PASSWORD`.
- `SLACK_DEV_WEBHOOK`: a webhook for #gojisim-dev (the GojiSim Slack app → **Incoming Webhooks → Add New Webhook** → #gojisim-dev). Without it, a failure goes to #gojisim-release-notes (`SLACK_RELEASE_WEBHOOK`).

The run's log shows step names and the commit only. GitHub masks the secrets, and no trace or video is recorded.

**Roll back:** run `pnpm rollback` in the `gojisim` folder on your Mac. It fetches the tags and shows what's live (`release`) and the previous `release-*` tag. When you type `y`, it pushes that tag's commit to `release`, and Railway deploys it in a few minutes; the smoke check then runs on it. Going back isn't a fast-forward, so the push is forced, but only while `release` is still at the commit it showed (`--force-with-lease`). The next `git push origin main:release` goes forward again as usual. Run it again to go back one more release.

For an instant switch without a build, Railway → `gojisim` → **Deployments** → pick an older, working deploy → **⋯ → Redeploy**. The site goes back to that build at once. The `release` branch still points at the newer commit, so the next `git push origin main:release` deploys main again as usual.

## Railway settings as code

The service's settings live in `.railway/railway.ts`, not in the dashboard. Only Paul plans and applies it; Mecha prepares changes in PRs and never runs `railway config apply`, `railway config migrate cutover` or a deploy. The file is a named partial (`gojisim-server`): it manages only what it declares, so other services in the project are left alone. Variables stay unmanaged: their values live only in the dashboard (step 2), and no plan or apply changes or deletes them.

**The one-time switch from `railway.json` (before 2026-12-01).** Do these in order, before the next push to `release`. Until the apply, the service still builds from the repo's `railway.json` on `release`; a `release` without it would fall back to the dashboard's older build command (`pnpm --filter @gojisim/server build`), which doesn't build the web app.

1. After the PR merges, on your Mac in the `gojisim` folder: `git checkout main`, `git pull`, then `pnpm install` (it installs Railway's TypeScript SDK, the `railway` package, which the file imports).
2. `railway config plan`. It must show exactly this, and nothing else:

   ```
   Plan: 0 to add, 2 to change, 0 to destroy
     ~ Update @gojisim/server build.buildCommand, build.watchPatterns
       └ build.buildCommand ("pnpm --filter @gojisim/server build" → "pnpm build")
       └ build.watchPatterns (null → ["**"])
     ~ Update @gojisim/server deploy.healthcheckPath, deploy.healthcheckTimeout, deploy.startCommand
       └ deploy.healthcheckPath (null → "/healthz")
       └ deploy.healthcheckTimeout (null → 100)
       └ deploy.startCommand (null → "node apps/server/dist/index.js")
   ```

   These are `railway.json`'s settings moving into the service. If the plan shows anything to destroy, or any change to the volume, the branch, the domain or a variable, stop and ask.

3. `railway config apply`, and confirm.
4. `railway config migrate cutover`. It switches the service off Config as Code, keeping a snapshot (`railway config migrate undo` restores it). Or clear the config file path in the service's **Settings**. `railway config migrate status` should then show no service reading Config as Code.
5. `railway config plan` again: `0 to add, 0 to change, 0 to destroy`.
6. Deploy as usual ([Deploy](#deploy)). The deploy must build, pass `/healthz` and become **Active**. Then check the site: cards show their images (the volume is still mounted), and `pnpm feedback` still downloads the records.

**Changing a setting later.** Edit `.railway/railway.ts` in a PR. After it merges: `git pull`, `railway config plan` (read what it will change), then `railway config apply`. Never remove the volume (`@gojisim/server-volume`) or its `/data` mount from the file: this partial owns them once applied, so removing them would delete the card images and every uploaded record. A plan that shows `1 to destroy` for the volume means stop.

## Day to day

- **Deploys:** only by hand, with [Deploy](#deploy) above. Merges into `main` never deploy.
- **Change the password:** edit `GOJISIM_PASSWORD` in **Variables**; Railway redeploys. People already signed in stay signed in.
- **Sign everyone out:** change `SESSION_SECRET` (a new `openssl rand -hex 32`). Every old login cookie stops working, and everyone types the password again.
- **Health:** `https://gojisim.somanygames.app/healthz` answers `{"status":"ok","commit":"<the deployed commit>"}` without a password; Railway checks it on each deploy, and the smoke check waits for the commit (#92).
- **Bug reports:** testers press **Report bug** (the Test Site panel, left column), write what went wrong, and Send uploads the game to the records folder with their note in its `bugReports`. When the send fails, or Share finished games is off, the game downloads as a JSON file for them to send you instead. Open it with **Load a game record** on the new-game screen, or in `/debug`.
- **Finished games and reports:** with the Test Site on and "Share finished games" on (testers can turn it off in Test settings), each finished game uploads to `/data/records/<YYYY-MM-DD>/<gameId>.json`, and **Report bug**, **Good Bot!** and **Bad Bot!** upload at once. Every upload of a game replaces that game's one file (in the day folder where it started), so a game is one file however many reports it has; uploads from older pages with no `gameId` get a random name. There's no route to read them back. To pull the feedback, run from the repo root:

  ```
  pnpm feedback
  ```

  It downloads everything from `/data/records` into your Mac's gitignored `records/` folder (over `railway ssh`, with `~/.ssh/railway_ed25519` and the linked service), then writes `records/feedback-<YYYY-MM-DD>.md` and prints its path: totals (games, finished games, reports by kind), the human's win rate by bot level (without Show opponent's hand games or a peeked First / Second pick), and each report you haven't reviewed: the move in plain words and the note, the bot's search at that move for Good Bot! and Bad Bot!, the last battle log lines for Report bug. Paste or attach that file. `--mark-reviewed` adds the listed reports to `records/reviewed.json`, so the next run shows only new ones; `--all` lists everything; `--no-download` makes the summary from what's already downloaded. If the download fails it says why and prints the manual command. Nothing is deleted on the server: `/data/records` stays the full archive (the summary warns when it nears the 1 GB cap). `pnpm bot-explain records/<day>/<file>.json --at <index>` shows a bot decision in full, and `pnpm bot-positions --from <file> --at <index>` makes a position from it (to prefer the move for Good Bot!, to avoid it for Bad Bot!). The files hold the players' decks: never commit them.

- **Turn the Test Site off:** set `GOJISIM_TEST_SITE` to `off`. The panel disappears, nothing uploads (`POST /api/games` answers 404) and Show opponent's hand is off; records still load and replay.

## Discord sign-in (player accounts, #150)

The site can let testers in with their Discord account instead of the shared password. Only members of the GojiSim Discord server with the **Tester** role get in; anyone else sees a page asking them to ask Paul for the role. The password gate stays the default until you switch.

**One time, Paul's steps:**

1. **The OAuth app.** discord.com/developers/applications → your app (the digest bot's application works, or **New Application**) → **OAuth2**.
   - Copy the **Client ID**, and **Reset Secret** to copy the **Client Secret**.
   - **Redirects → Add Redirect:** `https://gojisim.somanygames.app/auth/discord/callback`, then **Save Changes**.
2. **The Tester role's id.** In Discord (Developer Mode on: **User Settings → Advanced**), Server Settings → **Roles** → right-click **Tester** → **Copy Role ID**. Right-click the server's icon → **Copy Server ID** for the guild id (the digest's `DISCORD_GUILD_ID` is the same value).
3. **A smoke-check token.** Make one on your Mac with `openssl rand -hex 32`.
4. **Railway → `gojisim` → Variables:**

   | Variable                 | Value                          |
   | ------------------------ | ------------------------------ |
   | `DISCORD_CLIENT_ID`      | the Client ID                  |
   | `DISCORD_CLIENT_SECRET`  | the Client Secret              |
   | `DISCORD_GUILD_ID`       | the server id                  |
   | `DISCORD_TESTER_ROLE_ID` | the Tester role id             |
   | `SMOKE_LOGIN_TOKEN`      | the token from step 3          |
   | `GOJISIM_AUTH`           | `discord` (this is the switch) |

   `SESSION_SECRET` stays as it is: it signs the new sessions too. `DISCORD_REDIRECT_URI` is only needed if the site moves (default: the address above). `GOJISIM_DB` is only needed to move the database (default `/data/gojisim.db`, on the volume).

5. **GitHub → Settings → Secrets → Actions:** add `SMOKE_LOGIN_TOKEN` with the same token, so the smoke check can sign in.
6. **Apply changes.** The deploy log ends with `GojiSim server listening on … (Discord sign-in on)`. With any of the four Discord variables missing, the server refuses to start and names it, and Railway keeps the previous deploy.

**To switch back:** set `GOJISIM_AUTH` to `password` (or delete it). The password gate works as before, and the players stay in the database for next time.

**How it works:**

- **Sign-in:** Discord OAuth2 with PKCE, asking only for `identify` and `guilds.members.read`. No email is read or stored.
- **What's stored:** each player in `/data/gojisim.db` (SQLite on the volume) with their Discord id, display name, avatar and times.
- **Roles:** checked at each sign-in, and again when a page loads more than 24 hours later (a quick, silent trip through Discord). Removing someone's Tester role takes effect within a day.
- **Session:** the session cookie names the player and lasts 30 days. Sign out (on the menu, in the Showa header, and in Settings) ends it.
- **Database updates:** they run at start. Before any update, the server copies the database to `/data/backups/gojisim-<version>-<time>.db` and keeps the last 5. A failed update stops the start (Railway keeps the old deploy). To undo one, stop the service, copy the backup back over `/data/gojisim.db` (`railway ssh`), and deploy the older code.
- **Smoke check:** it signs in with `SMOKE_LOGIN_TOKEN` as the `smoke` player. The token is compared in constant time and limited to 10 wrong tries a minute per IP, and it works only with `GOJISIM_AUTH=discord`.
- **Locally:** `pnpm dev` has a dev sign-in (`/auth/dev`) for trying the player badge. The built server has no such route.

## How the gate works

- **Every route needs the login cookie:** pages, scripts, styles, card images and `/api/*`.
  - Without it, a page goes to the login page and comes back after.
  - Anything else gets `401`.
- **Three exceptions:** the login page, `robots.txt` (it disallows everything) and `/healthz`.
- **The cookie:** HttpOnly, Secure and SameSite=Lax. It lasts 30 days and is signed with `SESSION_SECRET` (HMAC-SHA256).
- **Wrong passwords:** after 10 in a minute from one IP, that IP waits for the minute to pass. The error never hints at the password.
- **No search engines:** every response carries `X-Robots-Tag: noindex, nofollow`.
- **Locally and in the e2e tests,** there's no gate unless `GOJISIM_PASSWORD` is set. `pnpm build` then `pnpm --filter @gojisim/web e2e:prod` tests the built app with the gate on, as CI does.
- **Development decks never ship:** `local-decks/` isn't in git, and the build doesn't read it.
