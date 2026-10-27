# Deploying GojiSim for testers

GojiSim runs on Railway as one Node service at `https://gojisim.somanygames.app`, the same way Session Zero runs at `somanygames.app`. The service:

- builds the web app and the server (`pnpm build`);
- runs `apps/server`, which serves the built app, the card images and `/api/decklog`;
- puts every route behind one shared password.

It deploys from `main`, and only after the `ci` check on that commit has passed.

The repo's `railway.json` holds the build command, the start command and the health check, so Railway needs no build settings typed in.

## What you need

- The Railway account that hosts Session Zero.
- The Porkbun account for `somanygames.app`.
- The Railway CLI on your Mac, for the one-time image step: `brew install railway`, then `railway login`.

## 1. Create the service

1. In Railway, open the project that holds Session Zero (or create a new project: **New Project → Empty Project**).
2. **Create → GitHub Repo → `pwluedke/gojisim`**. Railway reads `railway.json` and starts a first deploy. That deploy fails until step 2's variables are set; that's expected.
3. Open the new service and name it `gojisim` (**Settings → Service Name**).
4. **Settings → Source:**
   - Branch: `main`.
   - Turn on **Wait for CI**. Railway then deploys a commit only after its GitHub checks pass; the one that matters is `ci`, which needs every other check.

## 2. Set the variables

**Variables → New Variable** for each:

| Variable           | Value                            | Why                                                                                           |
| ------------------ | -------------------------------- | --------------------------------------------------------------------------------------------- |
| `GOJISIM_PASSWORD` | the testers' password            | The one shared password. Testers type it once per browser.                                    |
| `SESSION_SECRET`   | 64 random characters (see below) | Signs the login cookie. The server won't start with a password and a missing or short secret. |
| `CARDS_DIR`        | `/data/cards`                    | Where the server finds the card images (the volume, step 3).                                  |

Make the secret on your Mac with `openssl rand -hex 32` and paste the output. Railway sets `PORT` itself; don't add it.

## 3. Attach a volume for the card images

1. In the project canvas, right-click the `gojisim` service → **Attach Volume**.
2. Mount path: `/data`. The images take about 75 MB, so the smallest size is plenty.
3. Railway redeploys. The app works now, but cards show their names instead of images until step 4.

## 4. Load the card images once

The images aren't in git, and a deploy never downloads them. They live on the volume and survive every deploy. Fill it once:

1. On your Mac, in the `gojisim` folder: `railway link`, and pick the project and the `gojisim` service.
2. `railway ssh`. That opens a shell inside the running service.
3. In that shell: `pnpm images --out /data/cards`.

It downloads each card image from godzillatcgdb.com at the scraper's polite pace (one request a second, decision 25) and converts it to the two WebPs the app uses. That's about 950 cards (1,900 files), so roughly 16 minutes; leave the shell open until it prints its summary. If the connection drops, run the same command again: it skips every card that already has its images (decision 22).

After a card data update adds new cards, run step 4 again to fetch just the new ones.

If `pnpm images` stops with a missing `tsx` or `sharp`, the deploy left out development packages. Run `pnpm install --frozen-lockfile --prod=false` in the same shell first, then `pnpm images --out /data/cards` again.

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

## Day to day

- **Deploys:** merging a PR into `main` deploys it once that commit's `ci` check passes. Nothing else to do.
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
