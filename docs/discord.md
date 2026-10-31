# Discord digest

Once a day, a GitHub Action (`.github/workflows/discord-digest.yml`, #140) reads the GojiSim Discord server's **COMMUNITY** category with Paul's bot and posts the last 24 hours to Slack **#gojisim-discord-digest**. Monarch reads it there, alongside the in-app reports.

- **What it reads:** every text, announcement and forum channel in the COMMUNITY category, and their threads (active ones, plus public threads archived in the window). Never a STAFF or INFO channel; the bot only ever sends GET requests, so it never posts to Discord.
- **What it posts:** one section per channel, each message with its author, time (UTC) and text. A reply sits under its parent's author and first 80 characters, and attachments are links. Mentions and custom emoji show as names (`tools/discord-notes`' cleaning). Long days are split across several Slack messages. A day with nothing new posts nothing.
- **What the log shows:** the repo is public, so the run's log has counts only (channels, threads, messages, Slack messages sent), never message text, names, the token or the webhook.
- **When:** daily at 13:00 UTC (8:00 CDT, 7:00 CST). **Actions → Discord digest → Run workflow** runs it now, with `hours` to read further back (up to 336, two weeks).

## One-time setup (Paul)

Until all three are set, the daily run logs a warning and posts nothing.

**1. The bot**

1. Go to discord.com/developers/applications and open your bot's application (or **New Application**, then **Bot**).
2. **Bot → Privileged Gateway Intents:** turn on **Message Content Intent**. Without it, Discord returns messages with empty text.
3. **Bot → Reset Token**, then copy the token.
4. **OAuth2 → URL Generator:** scope `bot`, with the permissions **View Channels** and **Read Message History** only. Open the URL and add the bot to the GojiSim server.
5. In the server, make sure the bot's role can see the COMMUNITY channels, and can't see STAFF. The digest never reads STAFF either way, but the bot doesn't need to see it.

**2. The server id**

Discord → **User Settings → Advanced → Developer Mode** on, then right-click the GojiSim server's icon → **Copy Server ID**.

**3. The Slack webhook**

api.slack.com/apps → the existing GojiSim Slack app → **Incoming Webhooks → Add New Webhook to Workspace** → pick **#gojisim-discord-digest**, then copy the URL.

**4. On GitHub:** the `gojisim` repo → **Settings → Secrets and variables → Actions**:

- **Secrets → New repository secret:** `DISCORD_BOT_TOKEN` (the token from step 1) and `SLACK_DIGEST_WEBHOOK` (the URL from step 3).
- **Variables → New repository variable:** `DISCORD_GUILD_ID` (the server id from step 2; not secret).

Then **Actions → Discord digest → Run workflow** to check: the log should say how many channels, threads and messages it read, and #gojisim-discord-digest gets the digest if there were any.

Treat the token and the webhook like passwords. If one leaks, reset the bot token (step 1.3) or delete the webhook and make a new one, then replace the secret.
