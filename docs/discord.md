# Discord digest

Hourly through the day, a GitHub Action (`.github/workflows/discord-digest.yml`, #140, #148) reads every category of the GojiSim Discord server with Paul's bot and posts the last 3 hours to Slack **#gojisim-discord-digest**. Monarch reads it there, alongside the in-app reports.

- **What it reads:** every text, announcement and forum channel in every category, STAFF and INFO included (Paul, Nov 15; it was COMMUNITY only), plus any outside a category, and their threads (active ones, plus public threads archived in the window). A channel the bot's role can't see is skipped and counted in the log. The digest only ever sends GET requests, so it never posts to Discord.
- **What it posts:** grouped by category (its name as a heading, in Discord's order), then one section per channel (its id beside its name, and each thread's id beside it, Paul, Nov 15), each message with its author, time (UTC), its direct link (`https://discord.com/channels/<server>/<channel or thread>/<message>`, a thread reply's inside its thread) and text. A reply sits under its parent's author and first 80 characters, and attachments are links. Mentions and custom emoji show as names (`tools/discord-notes`' cleaning). Long days are split across several Slack messages. A day with nothing new posts nothing.
- **What the log shows:** the repo is public, so the run's log has counts only (channels, categories, threads, messages, channels skipped, Slack messages sent), never message text, names, the token or the webhook.
- **When:** every 15 minutes, all day, at :05, :20, :35 and :50 UTC (Paul, Nov 13; hourly in the day before), so the hourly bug watch sees Discord replies within about an hour. Each run reads the last 3 hours plus a 10-minute overlap, so a late run misses nothing, and skips the Discord messages already posted (their ids are kept in the Actions cache, never committed). **Actions → Discord digest → Run workflow** runs it now, with `hours` to read further back (up to 336, two weeks); messages already posted are still skipped.

## One-time setup (Paul)

Until all three are set, each run logs a warning and posts nothing.

**1. The bot**

1. Go to discord.com/developers/applications and open your bot's application (or **New Application**, then **Bot**).
2. **Bot → Privileged Gateway Intents:** turn on **Message Content Intent**. Without it, Discord returns messages with empty text.
3. **Bot → Reset Token**, then copy the token.
4. **OAuth2 → URL Generator:** scope `bot`, with the permissions **View Channels** and **Read Message History** only. Open the URL and add the bot to the GojiSim server.
5. In the server, give the bot's role **View Channels** and **Read Message History** in every category the digest should read: COMMUNITY, STAFF, INFO and Deck Guides (Paul, Nov 15). A category it can't see is skipped, not an error.

**2. The server id**

Discord → **User Settings → Advanced → Developer Mode** on, then right-click the GojiSim server's icon → **Copy Server ID**.

**3. The Slack webhook**

api.slack.com/apps → the existing GojiSim Slack app → **Incoming Webhooks → Add New Webhook to Workspace** → pick **#gojisim-discord-digest**, then copy the URL.

**4. On GitHub:** the `gojisim` repo → **Settings → Secrets and variables → Actions**:

- **Secrets → New repository secret:** `DISCORD_BOT_TOKEN` (the token from step 1) and `SLACK_DIGEST_WEBHOOK` (the URL from step 3).
- **Variables → New repository variable:** `DISCORD_GUILD_ID` (the server id from step 2; not secret).

Then **Actions → Discord digest → Run workflow** to check: the log should say how many channels, threads and messages it read, and #gojisim-discord-digest gets the digest if there were any.

Treat the token and the webhook like passwords. If one leaks, reset the bot token (step 1.3) or delete the webhook and make a new one, then replace the secret.

# Posting to Discord

Paul posts to the GojiSim Discord from GitHub (`.github/workflows/discord-post.yml`) through the bot, named **Monarch** (Paul, Nov 15): to **#bugs** by default, or to any channel or thread with `channel_id`. For #bugs, the bot posts to the webhook's own channel, and the webhook is only the fallback when the bot post fails. It's run by hand only; nothing else triggers it.

- **How:** the `gojisim` repo → **Actions → Discord post → Run workflow**, with:
  - `message`: the text, up to 2,000 characters (Discord's limit, counting a reply link). Tag a user as `<@id>`.
  - `reply_to` (optional): the id of the #bugs message it answers. Right-click the message → **Copy Message ID**, with Developer Mode on. A webhook can't thread-reply in a text channel, so the post starts with a link to that message instead (`↪ Re: https://discord.com/channels/…`).
  - `mentions` (optional): the Discord user ids the message tags, comma-separated (Paul, Nov 12). Only they are pinged, and each one must appear in the text as `<@id>`. The in-app reports in Slack #gojisim-reports show a signed-in reporter's id (`from Ian (id …)`).
  - `edit_id` (optional): the id of a message this webhook posted, to edit it (new text and mentions) instead of posting. Only the webhook's own messages can be edited; with `channel_id`, the bot's own messages in that channel or thread.
  - `channel_id` (optional, Paul, Nov 15): a channel or thread id (right-click → **Copy Channel ID**). The message goes there through the bot (`DISCORD_BOT_TOKEN`), with no webhook fallback (the webhook only reaches #bugs). Without it, the bot posts to #bugs, falling back to the webhook if the bot post fails. Through the bot, `reply_to` is a real Discord reply; through the webhook, a link line.
- **The message id:** a post waits for Discord's answer, and the run's summary shows the new message's id, for a later `edit_id`.
- **Mentions:** `@everyone` and roles are never pinged, and users only when listed in `mentions` (`allowed_mentions` lists those ids alone).
- **What the log shows:** the repo is public, so the run's log shows only Discord's HTTP status and the message id (with `channel_id`, also the channel id), never the message, the webhook URL or the bot token. A status that isn't 2xx fails the run. The code is `tools/discord-notes/src/post.ts` (`pnpm discord-post`).
- **Setup (done):** #bugs → **Edit Channel → Integrations → Webhooks → New Webhook**, copy its URL, and store it as the repo secret `DISCORD_BUGS_WEBHOOK` (**Settings → Secrets and variables → Actions**). Treat it like a password: if it leaks, delete the webhook, make a new one and replace the secret.
- **Setup for `channel_id` (Paul):** the bot uses the digest's `DISCORD_BOT_TOKEN` secret. Its role needs **Send Messages** and **Send Messages in Threads** (and **View Channels**) in the channels Monarch answers in; the digest's own reading needs only View Channels and Read Message History.
