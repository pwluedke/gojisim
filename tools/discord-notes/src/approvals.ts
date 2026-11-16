import {
  type ApiChannel,
  type ApiMessage,
  type DiscordGet,
  messagesAfter,
  snowflakeAt,
} from "./discordApi";
import { messageLink, slackEscape } from "./digest";

/*
 * Paul, Nov 15: Paul approves or declines Monarch's cards in Discord #approvals with a reaction.
 * The digest lists each decided card once: its link, its first line (the R-id) and the decision.
 * Only Paul's own reactions count; anyone else's, and the bot's own, are ignored.
 */

/** Paul's Discord user id (public; Monarch's message, Nov 15). */
export const APPROVER_ID = "340621144308711455";
/** How far back #approvals is read for decisions. */
export const APPROVALS_DAYS = 14;
/** The decisions: the emoji Paul reacts with, and what it means. */
const DECISIONS = [
  { emoji: "✅", name: "approved" },
  { emoji: "❌", name: "declined" },
] as const;
/** The seen cache's key for a posted decision (kept 15 days, `pruneSeen`). */
export const decisionKey = (messageId: string) => `approval:${messageId}`;

export interface Decision {
  channel: ApiChannel;
  card: ApiMessage;
  decision: (typeof DECISIONS)[number]["name"];
}

/** The bot's cards in #approvals from the last 14 days that Paul reacted to, not yet posted. */
export async function approvalDecisions(
  get: DiscordGet,
  channels: readonly ApiChannel[],
  now: number,
  seen: ReadonlySet<string>,
): Promise<Decision[]> {
  const out: Decision[] = [];
  const after = snowflakeAt(now - APPROVALS_DAYS * 24 * 3600_000);
  for (const channel of channels.filter(
    (c) => c.name.toLowerCase() === "approvals",
  )) {
    const messages = await messagesAfter(get, channel.id, after);
    for (const card of messages) {
      if (!card.author.bot || seen.has(decisionKey(card.id))) continue;
      for (const { emoji, name } of DECISIONS) {
        if (!(card.reactions ?? []).some((r) => r.emoji.name === emoji))
          continue;
        const users = await get<{ id: string }[]>(
          `/channels/${channel.id}/messages/${card.id}/reactions/${encodeURIComponent(emoji)}?limit=100`,
        );
        if (users.some((u) => u.id === APPROVER_ID)) {
          out.push({ channel, card, decision: name });
          break;
        }
      }
    }
  }
  return out;
}

/** The digest's "#approvals decisions" section: each card's link, first line and decision. */
export function decisionsSection(
  decisions: readonly Decision[],
  guildId: string,
): string[] {
  if (decisions.length === 0) return [];
  return [
    "*#approvals decisions*",
    ...decisions.map(({ channel, card, decision }) => {
      const first = (card.content ?? "").split("\n")[0]?.trim() ?? "";
      const mark = decision === "approved" ? ":white_check_mark:" : ":x:";
      return `${mark} ${decision}: <${messageLink(guildId, channel.id, card.id)}> ${slackEscape(first)}`;
    }),
  ];
}
