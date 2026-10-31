import { describe, expect, it, vi } from "vitest";
import {
  DISCORD_DESCRIPTION_MAX,
  discordPayload,
  fitWithTail,
  postRelease,
  SLACK_MAX,
  slackMrkdwn,
  slackPayload,
} from "../src/announce";

const URL =
  "https://github.com/pwluedke/gojisim/releases/tag/release-2026-10-31-1";
const NOTES = `### #133 Easy's blunders are plausible moves (#132)

- Changed: the Easy bot makes fewer **nonsense** moves. See [the issue](https://github.com/pwluedke/gojisim/issues/132).
- Text like @everyone, <@123> and <script> stays text.

### Also merged

- #129 E2E servers raise the upload rate limit
`;
const post = { title: "Release 2026-10-31", url: URL, notes: NOTES };

describe("release posts (#134)", () => {
  it("cuts long text at a line break, ends it with …, and always keeps the link last", () => {
    expect(fitWithTail("short", " END", 100)).toBe("short END");
    const long = Array.from(
      { length: 50 },
      (_, i) => `line ${i} ${"x".repeat(30)}`,
    ).join("\n");
    const cut = fitWithTail(long, "\n\nFull notes: L", 300);
    expect(cut.length).toBeLessThanOrEqual(300);
    expect(cut.endsWith("\n…\n\nFull notes: L")).toBe(true);
    // Whole lines only.
    expect(
      cut
        .split("\n…")[0]
        ?.split("\n")
        .every((l) => /^line \d+ x{30}$/.test(l)),
    ).toBe(true);
    // One huge line is cut mid-line rather than dropped.
    expect(fitWithTail("y".repeat(500), " T", 50)).toMatch(/^y+\n… T$/);
  });

  it("Slack: mrkdwn headings, bold, links and bullets; <, > and & escaped, so no mention or tag works", () => {
    const text = slackMrkdwn(NOTES);
    expect(text).toContain("*#133 Easy's blunders are plausible moves (#132)*");
    expect(text).toContain(
      "• Changed: the Easy bot makes fewer *nonsense* moves.",
    );
    expect(text).toContain(
      "<https://github.com/pwluedke/gojisim/issues/132|the issue>",
    );
    expect(text).toContain("&lt;@123&gt; and &lt;script&gt;");
    const payload = slackPayload(post);
    expect(payload.text.startsWith(`*<${URL}|Release 2026-10-31>*\n\n`)).toBe(
      true,
    );
    expect(payload.text.endsWith(`Full notes: ${URL}`)).toBe(true);
    expect(payload.unfurl_links).toBe(false);
  });

  it("Slack: long notes stay inside the message limit, with the link last", () => {
    const notes = Array.from(
      { length: 400 },
      (_, i) => `- note ${i}: ${"words ".repeat(5)}`,
    ).join("\n");
    const { text } = slackPayload({ ...post, notes });
    expect(text.length).toBeLessThanOrEqual(SLACK_MAX);
    expect(text.endsWith(`…\n\nFull notes: ${URL}`)).toBe(true);
  });

  it("Discord: one embed, title linked, notes as the description cut to 4,096 with the link last, mentions off", () => {
    const payload = discordPayload(post);
    expect(payload.allowed_mentions).toEqual({ parse: [] });
    expect(payload.embeds).toHaveLength(1);
    const embed = payload.embeds[0];
    expect(embed?.title).toBe("Release 2026-10-31");
    expect(embed?.url).toBe(URL);
    expect(embed?.description).toContain(
      "**#133 Easy's blunders are plausible moves (#132)**",
    );
    expect(embed?.description.endsWith(`Full notes: ${URL}`)).toBe(true);
    const notes = "- a long line of release notes\n".repeat(400);
    const long =
      discordPayload({ ...post, notes }).embeds[0]?.description ?? "";
    expect(long.length).toBeLessThanOrEqual(DISCORD_DESCRIPTION_MAX);
    expect(long.endsWith(`…\n\nFull notes: ${URL}`)).toBe(true);
  });

  it("posts to each webhook that is set; missing secrets and failed posts only warn, never with the address", async () => {
    const calls: { url: string; body: unknown }[] = [];
    const ok = vi.fn(
      async (url: string | URL | Request, init?: RequestInit) => {
        calls.push({ url: String(url), body: JSON.parse(String(init?.body)) });
        return new Response("ok");
      },
    );
    const warnings: string[] = [];
    const both = {
      SLACK_RELEASE_WEBHOOK: "https://hooks.slack.com/services/T/B/secret1",
      DISCORD_RELEASE_WEBHOOK: "https://discord.com/api/webhooks/1/secret2",
    };
    expect(
      await postRelease(post, both, ok as unknown as typeof fetch, (l) =>
        warnings.push(l),
      ),
    ).toEqual(["Slack", "Discord"]);
    expect(calls.map((c) => c.url)).toEqual([
      both.SLACK_RELEASE_WEBHOOK,
      both.DISCORD_RELEASE_WEBHOOK,
    ]);
    expect(calls[1]?.body).toMatchObject({ allowed_mentions: { parse: [] } });
    expect(warnings).toEqual([]);

    expect(
      await postRelease(post, {}, ok as unknown as typeof fetch, (l) =>
        warnings.push(l),
      ),
    ).toEqual([]);
    expect(warnings).toEqual([
      "::warning::SLACK_RELEASE_WEBHOOK isn't set: the release isn't posted to Slack.",
      "::warning::DISCORD_RELEASE_WEBHOOK isn't set: the release isn't posted to Discord.",
    ]);

    warnings.length = 0;
    const failing = vi
      .fn()
      .mockResolvedValueOnce(new Response("no", { status: 404 }))
      .mockRejectedValueOnce(new TypeError("fetch failed"));
    expect(
      await postRelease(post, both, failing as unknown as typeof fetch, (l) =>
        warnings.push(l),
      ),
    ).toEqual([]);
    expect(warnings).toEqual([
      "::warning::The Slack post failed (HTTP 404); the release stands.",
      "::warning::The Discord post failed (TypeError); the release stands.",
    ]);
    expect(warnings.join("\n")).not.toMatch(/secret|hooks\.slack|discord\.com/);
  });
});
