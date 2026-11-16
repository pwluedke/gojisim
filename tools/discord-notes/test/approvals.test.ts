import { describe, expect, it } from "vitest";
import {
  APPROVER_ID,
  approvalDecisions,
  decisionKey,
  decisionsSection,
} from "../src/approvals";
import {
  type ApiChannel,
  type ApiMessage,
  type DiscordGet,
  snowflakeAt,
} from "../src/discordApi";
import { pruneSeen } from "../src/digestRun";

// Made-up server, cards and users (Paul, Nov 15: decisions in #approvals by reaction).

const NOW = Date.UTC(2026, 10, 16, 2, 0);
const DAY = 24 * 3600_000;
const APPROVALS: ApiChannel = { id: "appr", type: 0, name: "approvals" };
const card = (
  n: number,
  content: string,
  reactions: string[],
  bot = true,
): ApiMessage => ({
  id: (BigInt(snowflakeAt(NOW - DAY)) + BigInt(n)).toString(),
  type: 0,
  timestamp: new Date(NOW - DAY).toISOString(),
  content,
  author: { id: bot ? "monarch" : "someone", username: "x", bot },
  reactions: reactions.map((name) => ({ emoji: { name }, count: 1 })),
});

/** A GET-only fake: #approvals' messages, and each card's reacting users by emoji. */
function fake(
  messages: ApiMessage[],
  users: Record<string, string[]>,
): DiscordGet {
  return (async (path: string) => {
    if (path.startsWith("/channels/appr/messages?")) return messages;
    const m = /\/messages\/(\d+)\/reactions\/([^?]+)/.exec(path);
    if (m)
      return (users[`${m[1]}:${decodeURIComponent(m[2] ?? "")}`] ?? []).map(
        (id) => ({ id }),
      );
    throw new Error(`unexpected ${path}`);
  }) as DiscordGet;
}

describe("#approvals decisions (Paul, Nov 15)", () => {
  const approved = card(1, "R-3 · Paul · Monster X keeps EBP03-067\nmore", [
    "✅",
  ]);
  const declined = card(2, "R-2 · BFW182 · faster replies", ["❌"]);
  const othersOnly = card(3, "R-4 · someone else reacted", ["✅"]);
  const notBot = card(4, "R-5 · a human's message", ["✅"], false);
  const users = {
    [`${approved.id}:✅`]: ["monarch", APPROVER_ID],
    [`${declined.id}:❌`]: [APPROVER_ID],
    [`${othersOnly.id}:✅`]: ["monarch", "ian"],
    [`${notBot.id}:✅`]: [APPROVER_ID],
  };

  it("lists the bot's cards Paul reacted to with ✅ or ❌; ignores anyone else's reactions and human messages; skips ones already posted", async () => {
    const get = fake([approved, declined, othersOnly, notBot], users);
    const found = await approvalDecisions(get, [APPROVALS], NOW, new Set());
    expect(found.map((d) => [d.card.id, d.decision])).toEqual([
      [approved.id, "approved"],
      [declined.id, "declined"],
    ]);
    const again = await approvalDecisions(
      get,
      [APPROVALS],
      NOW,
      new Set([decisionKey(approved.id)]),
    );
    expect(again.map((d) => d.card.id)).toEqual([declined.id]);
  });

  it("the section: each card's link, its first line (the R-id) and the decision", async () => {
    const found = await approvalDecisions(
      fake([approved], users),
      [APPROVALS],
      NOW,
      new Set(),
    );
    expect(decisionsSection(found, "g1")).toEqual([
      "*#approvals decisions*",
      `:white_check_mark: approved: <https://discord.com/channels/g1/appr/${approved.id}> R-3 · Paul · Monster X keeps EBP03-067`,
    ]);
    expect(decisionsSection([], "g1")).toEqual([]);
  });

  it("a posted decision is kept 15 days in the seen cache, past its 14-day window; plain ids still 48 h", () => {
    const tenDays = (BigInt(snowflakeAt(NOW - 10 * DAY)) + 1n).toString();
    const seen = new Set([decisionKey(tenDays), tenDays]);
    pruneSeen(seen, NOW);
    expect([...seen]).toEqual([decisionKey(tenDays)]);
  });
});
