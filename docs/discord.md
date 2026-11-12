# Discord digest

Hourly through the day, a GitHub Action (`.github/workflows/discord-digest.yml`, #140, #148) reads the GojiSim Discord server's **COMMUNITY** category with Paul's bot and posts the last 3 hours to Slack **#gojisim-discord-digest**. Monarch reads it there, alongside the in-app reports.

- **What it reads:** every text, announcement and forum channel in the COMMUNITY category, and their threads (active ones, plus public threads archived in the window). Never a STAFF or INFO channel; the bot only ever sends GET requests, so it never posts to Discord.
- **What it posts:** one section per channel, each message with its author, time (UTC) and text. A reply sits under its parent's author and first 80 characters, and attachments are links. Mentions and custom emoji show as names (`tools/discord-notes`' cleaning). Long days are split across several Slack messages. A day with nothing new posts nothing.
- **What the log shows:** the repo is public, so the run's log has counts only (channels, threads, messages, Slack messages sent), never message text, names, the token or the webhook.
- **When:** on the hour, hourly from 7 am to 11 pm Central standard time, plus 2 am and 5 am (UTC: 13:00 to 05:00, 08:00 and 11:00; Paul, Nov 4). The longest gap between runs is 3 hours. Each run reads the last 3 hours plus a 10-minute overlap, so a late run misses nothing, and skips the Discord messages already posted (their ids are kept in the Actions cache, never committed). **Actions → Discord digest → Run workflow** runs it now, with `hours` to read further back (up to 336, two weeks); messages already posted are still skipped.

## One-time setup (Paul)

Until all three are set, each run logs a warning and posts nothing.

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

# Posting to #bugs

Paul posts to the GojiSim Discord's **#bugs** channel from GitHub, through the channel's webhook (`.github/workflows/discord-post.yml`). It's run by hand only; nothing else triggers it.

- **How:** the `gojisim` repo → **Actions → Discord post → Run workflow**, with:
  - `message`: the text, up to 2,000 characters (Discord's limit, counting a reply link). Tag a user as `<@id>`.
  - `reply_to` (optional): the id of the #bugs message it answers. Right-click the message → **Copy Message ID**, with Developer Mode on. A webhook can't thread-reply in a text channel, so the post starts with a link to that message instead (`↪ Re: https://discord.com/channels/…`).
  - `mentions` (optional): the Discord user ids the message tags, comma-separated (Paul, Nov 12). Only they are pinged, and each one must appear in the text as `<@id>`. The in-app reports in Slack #gojisim-reports show a signed-in reporter's id (`from Ian (id …)`).
  - `edit_id` (optional): the id of a message this webhook posted, to edit it (new text and mentions) instead of posting. Only the webhook's own messages can be edited.
- **The message id:** a post waits for Discord's answer, and the run's summary shows the new message's id, for a later `edit_id`.
- **Mentions:** `@everyone` and roles are never pinged, and users only when listed in `mentions` (`allowed_mentions` lists those ids alone).
- **What the log shows:** the repo is public, so the run's log shows only Discord's HTTP status and the message id, never the message or the webhook URL. A status that isn't 2xx fails the run. The code is `tools/discord-notes/src/post.ts` (`pnpm discord-post`).
- **Setup (done):** #bugs → **Edit Channel → Integrations → Webhooks → New Webhook**, copy its URL, and store it as the repo secret `DISCORD_BUGS_WEBHOOK` (**Settings → Secrets and variables → Actions**). Treat it like a password: if it leaks, delete the webhook, make a new one and replace the secret.
