/**
 * Release posts (#134): after the GitHub Release, the workflow posts its title, link and notes to
 * Slack #gojisim-release-notes and the GojiSim Discord server through incoming webhooks
 * (`SLACK_RELEASE_WEBHOOK`, `DISCORD_RELEASE_WEBHOOK`). A missing secret or a failed post only
 * warns; the release stands either way. Pure except `postRelease`, which takes `fetch`.
 */

export interface ReleasePost {
  title: string;
  url: string;
  /** The release's Markdown text (`releaseBody`). */
  notes: string;
}

/** Slack's limit for one message's text is 40,000 characters; it reads best under 4,000. */
export const SLACK_MAX = 3900;
/** Discord's embed description limit. */
export const DISCORD_DESCRIPTION_MAX = 4096;
/** Discord's embed title limit. */
export const DISCORD_TITLE_MAX = 256;

/**
 * `text`, then `tail`, in at most `max` characters: when the text doesn't fit, it's cut at the last
 * line break that leaves room (mid-line only when there is none) and ends with "…".
 */
export function fitWithTail(text: string, tail: string, max: number): string {
  const whole = `${text.trimEnd()}${tail}`;
  if (whole.length <= max) return whole;
  const room = max - tail.length - "\n…".length;
  if (room <= 0) return tail.slice(0, max);
  const head = text.slice(0, room);
  const lineEnd = head.lastIndexOf("\n");
  const kept = (lineEnd > 0 ? head.slice(0, lineEnd) : head).trimEnd();
  return `${kept}\n…${tail}`;
}

/** Release Markdown as Slack mrkdwn: headings and bold as `*bold*`, links as `<url|text>`, bullets as •. */
export function slackMrkdwn(markdown: string): string {
  return markdown
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/^#{1,6}\s+(.+)$/gm, "*$1*")
    .replace(/\*\*(.+?)\*\*/g, "*$1*")
    .replace(/\[([^\]]+)\]\((https?:\/\/[^)\s]+)\)/g, "<$2|$1>")
    .replace(/^(\s*)[-*] /gm, "$1• ");
}

/** Release Markdown for a Discord embed: headings as bold lines (embeds don't render `###`). */
export function discordMarkdown(markdown: string): string {
  return markdown.replace(/^#{1,6}\s+(.+)$/gm, "**$1**");
}

/** The Slack incoming-webhook body: the title linked, the notes, then the link. */
export function slackPayload({ title, url, notes }: ReleasePost): {
  text: string;
  unfurl_links: boolean;
  unfurl_media: boolean;
} {
  const head = `*<${url}|${slackMrkdwn(title)}>*\n\n`;
  const tail = `\n\nFull notes: ${url}`;
  return {
    text: head + fitWithTail(slackMrkdwn(notes), tail, SLACK_MAX - head.length),
    unfurl_links: false,
    unfurl_media: false,
  };
}

/**
 * The Discord webhook body: one embed, its title linked to the release and the notes as its
 * description, cut to 4,096 characters with "Full notes: <link>" last. Mentions are off, so no
 * text in the notes can ping anyone.
 */
export function discordPayload({ title, url, notes }: ReleasePost): {
  allowed_mentions: { parse: never[] };
  embeds: { title: string; url: string; description: string }[];
} {
  return {
    allowed_mentions: { parse: [] },
    embeds: [
      {
        title: title.slice(0, DISCORD_TITLE_MAX),
        url,
        description: fitWithTail(
          discordMarkdown(notes),
          `\n\nFull notes: ${url}`,
          DISCORD_DESCRIPTION_MAX,
        ),
      },
    ],
  };
}

/** Where each post goes, by its secret's name. */
const TARGETS = [
  { name: "Slack", secret: "SLACK_RELEASE_WEBHOOK", payload: slackPayload },
  {
    name: "Discord",
    secret: "DISCORD_RELEASE_WEBHOOK",
    payload: discordPayload,
  },
] as const;

/**
 * Posts the release to every webhook whose secret is set. Never throws: a missing secret, an
 * error answer or a network failure is one warning line (GitHub's `::warning::` form), which never
 * includes the webhook's address.
 */
export async function postRelease(
  post: ReleasePost,
  env: Record<string, string | undefined>,
  fetchImpl: typeof fetch = fetch,
  warn: (line: string) => void = (line) => console.log(line),
): Promise<string[]> {
  const posted: string[] = [];
  for (const target of TARGETS) {
    const webhook = env[target.secret]?.trim();
    if (!webhook) {
      warn(
        `::warning::${target.secret} isn't set: the release isn't posted to ${target.name}.`,
      );
      continue;
    }
    try {
      const res = await fetchImpl(webhook, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(target.payload(post)),
      });
      if (res.ok) posted.push(target.name);
      else
        warn(
          `::warning::The ${target.name} post failed (HTTP ${res.status}); the release stands.`,
        );
    } catch (err) {
      const reason = err instanceof Error ? err.name : "error";
      warn(
        `::warning::The ${target.name} post failed (${reason}); the release stands.`,
      );
    }
  }
  return posted;
}
