# Deploying GojiSim for testers

GojiSim runs on Railway as one Node service at `https://gojisim.somanygames.app`, the same way Session Zero runs at `somanygames.app`. The service:

- builds the web app and the server (`pnpm build`);
- runs `apps/server`, which serves the built app, the card images and `/api/decklog`;
- puts every route behind one shared password.

It deploys only when Paul says so: Railway watches a branch named `release`, not `main`, so merging a PR never deploys or spends Railway credits. Paul deploys by pushing main's current commit to `release` (see [Deploy](#deploy)). Only Paul deploys; Mecha never pushes to `release` and never runs Railway deploy commands.

The repo's `railway.json` holds the build command, the start command and the health check, so Railway needs no build settings typed in.

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
   - **Root Directory:** empty (the repo root), so Railway reads the repo's `railway.json` and builds the whole workspace.
   - **Branch:** `release`.
   - Turn on **Wait for CI**. Railway then deploys a commit only after its GitHub checks pass; the one that matters is `ci`, which needs every other check. A commit pushed from `main` has already passed it, so it deploys right away.

   The first deploy fails until step 2's variables are set; that's expected.

## 2. Set the variables

**Variables → New Variable** for each:

| Variable           | Value                            | Why                                                                                           |
| ------------------ | -------------------------------- | --------------------------------------------------------------------------------------------- |
| `GOJISIM_PASSWORD` | the testers' password            | The one shared password. Testers type it once per browser.                                    |
| `SESSION_SECRET`   | 64 random characters (see below) | Signs the login cookie. The server won't start with a password and a missing or short secret. |
| `CARDS_DIR`        | `/data/cards`                    | Where the server finds the card images (the volume, step 3).                                  |

Make the secret on your Mac with `openssl rand -hex 32` and paste the output. Railway sets `PORT` itself; don't add it.

Railway stages variable edits: nothing changes until you click **Apply changes** (or **Deploy**) at the top of the canvas. Click it after adding the variables.

**Check the gate is on.** In **Deployments**, open the new deploy's **Deploy Logs**. The last line must end with `(password gate on)`:

```
GojiSim server listening on http://localhost:<port> (password gate on)
```

If it doesn't, the site is open to anyone: the variables weren't applied. On Railway, a server without `GOJISIM_PASSWORD` also logs `WARNING: no password gate, the site is open to anyone`. Apply the variables and check again.

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
4. **Copy them to the volume:**

   ```
   COPYFILE_DISABLE=1 tar czf - -C apps/web/public/cards . | railway ssh -i ~/.ssh/railway_ed25519 -- "mkdir -p /data/cards && tar xzf - -C /data/cards && ls /data/cards | wc -l"
   ```

   It prints the number of files on the volume (1900 for 950 cards). `COPYFILE_DISABLE=1` keeps macOS metadata out of the archive; without it, the copy still works but prints harmless `tar: Ignoring unknown extended header keyword 'LIBARCHIVE.xattr.com.apple.provenance'` lines.

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
2. In Railway, open the `gojisim` service → **Deployments**. The new deploy appears for that commit, builds, passes the `/healthz` check and becomes **Active**. That takes a few minutes.
3. Open `https://gojisim.somanygames.app` and check the change.

**Roll back:** Railway → `gojisim` → **Deployments** → pick an older, working deploy → **⋯ → Redeploy**. The site goes back to that build at once. The `release` branch still points at the newer commit, so the next `git push origin main:release` deploys main again as usual.

## Day to day

- **Deploys:** only by hand, with [Deploy](#deploy) above. Merges into `main` never deploy.
- **Change the password:** edit `GOJISIM_PASSWORD` in **Variables**; Railway redeploys. People already signed in stay signed in.
- **Sign everyone out:** change `SESSION_SECRET` (a new `openssl rand -hex 32`). Every old login cookie stops working, and everyone types the password again.
- **Health:** `https://gojisim.somanygames.app/healthz` answers `{"status":"ok"}` without a password; Railway checks it on each deploy.
- **Bug reports:** testers press **Report bug** (left column, under Settings). It downloads the game as a JSON file for them to send you. Open it with **Load a game record** on the new-game screen, or in `/debug`.

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
