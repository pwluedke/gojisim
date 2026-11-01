/**
 * Tester reports to the Discord staff #reports channel (#136) and Slack #gojisim-reports (#146):
 * when a stored upload adds a Report bug, Bad Bot!, Good Bot!, Monster Island Mailbox note or
 * crash, the server posts one message per new entry to the webhooks in `DISCORD_REPORTS_WEBHOOK`
 * and `SLACK_REPORTS_WEBHOOK`. No decklists and no record go with it,
 * mentions are off, and the upload's answer never waits for it. An entry already in the game's
 * earlier upload isn't posted again. The record is read as plain JSON: the server doesn't depend
 * on the engine.
 */

/** Discord's message limit is 2,000 characters; the post stays under it. */
export const MESSAGE_MAX = 1900;
/** A tester's note is at most 1,000 characters in the app (`MAX_REPORT_LENGTH`); cut past that. */
export const NOTE_MAX = 1000;
/** Posts per upload: more new entries than this get one "and N more" line instead. */
export const POSTS_PER_UPLOAD = 5;
/** How long one post may take. */
export const POST_TIMEOUT_MS = 5000;

export type ReportKind =
  "Report bug" | "Bad Bot!" | "Good Bot!" | "Mailbox" | "Crash";

/** One new entry, as the post shows it. */
export interface NewReport {
  kind: ReportKind;
  reporter: string | null;
  /** The tester's note, or for a crash the error message. */
  text: string;
  /** "Turn 6, Main phase", when the entry says. */
  when: string | null;
  actionIndex: number | null;
  /** The bot move a Bad Bot! / Good Bot! marks (its battle-log label). */
  move: string | null;
  /** A crash's first frame from the app's code, and where the error came from. */
  frame: string | null;
  source: string | null;
}

type Json = Record<string, unknown>;
const obj = (v: unknown): Json | null =>
  typeof v === "object" && v !== null && !Array.isArray(v) ? (v as Json) : null;
const str = (v: unknown): string | null => (typeof v === "string" ? v : null);
const num = (v: unknown): number | null =>
  typeof v === "number" && Number.isInteger(v) ? v : null;
const list = (v: unknown): Json[] =>
  Array.isArray(v) ? v.map(obj).filter((e): e is Json => e !== null) : [];

/** The first frame from the app's own code (V8's `at …`, Firefox's and Safari's `fn@url`), as `pnpm feedback` reads it. */
export function firstAppFrame(stack: string | null): string | null {
  const line = (stack ?? "")
    .split("\n")
    .filter((l) => /^\s*at\s/.test(l) || /^[^@]*@\S+:\d+:\d+$/.test(l.trim()))
    .find((l) => /https?:\/\//.test(l));
  return line ? line.trim() : null;
}

/** The turn and phase at the end of a Bad Bot! label ("… (Turn 6, Main phase)"). */
const whenInLabel = (label: string | null) =>
  label ? (/\((Turn \d+, [^)]*)\)$/.exec(label)?.[1] ?? null) : null;

/** Every feedback entry in a record, with the key that tells a repeat upload's copy apart. */
function entries(record: Json): { key: string; report: NewReport }[] {
  const out: { key: string; report: NewReport }[] = [];
  const base = (e: Json) => ({
    reporter: str(e["reporter"]),
    text: str(e["text"]) ?? "",
    actionIndex: num(e["actionIndex"]),
    move: null,
    frame: null,
    source: null,
  });
  for (const e of list(record["bugReports"]))
    out.push({
      key: `bug|${str(e["at"])}|${str(e["text"])}`,
      report: { kind: "Report bug", ...base(e), when: str(e["when"]) },
    });
  for (const e of list(record["botFeedback"])) {
    const good = e["kind"] === "good";
    const label = str(e["label"]);
    out.push({
      key: `${good ? "good" : "bad"}|${str(e["at"])}|${str(e["text"])}`,
      report: {
        kind: good ? "Good Bot!" : "Bad Bot!",
        ...base(e),
        when: whenInLabel(label),
        move: label,
      },
    });
  }
  for (const e of list(record["ideas"]))
    out.push({
      key: `idea|${str(e["at"])}|${str(e["text"])}`,
      // A suggestion isn't about a moment of the game (decision 3 of #111): no turn.
      report: { kind: "Mailbox", ...base(e), when: null, actionIndex: null },
    });
  const crash = obj(record["crash"]);
  if (crash)
    out.push({
      key: `crash|${str(crash["at"])}`,
      report: {
        kind: "Crash",
        reporter: null,
        text: str(crash["message"]) ?? "",
        when: str(crash["when"]),
        actionIndex: num(crash["actionIndex"]),
        move: null,
        frame: firstAppFrame(str(crash["stack"])),
        source: str(crash["source"]),
      },
    });
  return out;
}

/** The entries in `record` that `earlier` (the game's previous upload, if any) didn't have. */
export function newReports(record: unknown, earlier: unknown): NewReport[] {
  const now = obj(record);
  // #92: the post-deploy smoke check's game is never a tester's report.
  if (!now || now["smokeCheck"] === true) return [];
  const before = obj(earlier);
  const seen = new Set(before ? entries(before).map((e) => e.key) : []);
  return entries(now)
    .filter((e) => !seen.has(e.key))
    .map((e) => e.report);
}

/** The game's bot level(s) and deck names, from the record's seats and `deckNames`. */
export interface GameContext {
  bots: string;
  decks: string;
}

const PRESETS: Record<number, string> = {
  20: "Easy",
  55: "Medium",
  90: "Hard",
};
/** A bot difficulty as the app names it (`difficultyName`): a preset, else "Level N". */
export const levelName = (difficulty: number) =>
  PRESETS[difficulty] ?? `Level ${difficulty}`;

export function gameContext(record: unknown): GameContext {
  const r = obj(record) ?? {};
  const seats = obj(r["seats"]) ?? {};
  const names = obj(r["deckNames"]) ?? {};
  const levels = ["P1", "P2"].map((id) => {
    const seat = obj(seats[id]);
    if (seat?.["kind"] !== "bot")
      return seat?.["kind"] === "human" ? "human" : "?";
    const d = obj(seat["settings"])?.["difficulty"];
    return typeof d === "number" ? levelName(d) : "bot";
  });
  const deckNames = ["P1", "P2"].map((id) => str(names[id]) ?? "Mystery Deck");
  return {
    bots: `${levels[0]} vs ${levels[1]}`,
    decks: `${deckNames[0]} vs ${deckNames[1]}`,
  };
}

/** `text` in at most `max` characters, ending with "…" when cut. */
const cut = (text: string, max: number) =>
  text.length <= max ? text : `${text.slice(0, max - 1).trimEnd()}…`;
/** Each line quoted, so a note's own Markdown headings and lists stay inside the quote. */
const quote = (text: string) =>
  text
    .split(/\r?\n/)
    .map((l) => `> ${l}`)
    .join("\n");
/** Backticks would close the code spans around the file and frame. */
const code = (text: string) => `\`${text.replace(/`/g, "'")}\``;

/**
 * One entry's post: kind, reporter, turn and phase, the bots and decks, the note (cut to fit),
 * then where `pnpm feedback` finds it (`<day>/<game>.json --at N`).
 */
export function reportMessage(
  report: NewReport,
  game: GameContext,
  file: string,
): string {
  const head = [
    `**${report.kind}**`,
    report.reporter ? `from ${cut(report.reporter, 80)}` : null,
    report.when,
    report.source ? `source: ${report.source}` : null,
  ]
    .filter(Boolean)
    .join(" · ");
  const lines = [head, `${game.bots} · ${cut(game.decks, 200)}`];
  if (report.move) lines.push(`Move: ${cut(report.move, 300)}`);
  const where = `${code(file)}${report.actionIndex !== null ? ` --at ${report.actionIndex}` : ""}`;
  const frame = report.frame ? `Frame: ${code(cut(report.frame, 300))}` : null;
  const tail = [frame, where].filter(Boolean).join("\n");
  const room = MESSAGE_MAX - lines.join("\n").length - tail.length - 10;
  const text = report.text.trim() === "" ? "(no text)" : report.text.trim();
  lines.push(quote(cut(text, Math.max(50, Math.min(NOTE_MAX, room)))));
  return cut(`${lines.join("\n")}\n${tail}`, MESSAGE_MAX);
}

/** The webhook body: mentions off, so no tester's note can ping anyone. */
export const discordBody = (content: string) => ({
  content,
  allowed_mentions: { parse: [] as never[] },
});

/** A tester-report post as Slack mrkdwn (#146): `&<>` escaped, so no note makes a mention or link; `**bold**` as `*bold*`. */
export function slackText(content: string): string {
  return (
    content
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      // The quote marker each note line starts with stays a quote.
      .replace(/^&gt; /gm, "> ")
      .replace(/\*\*(.+?)\*\*/g, "*$1*")
  );
}

/** The Slack webhook body (#146): the same message, Slack's format, no link previews. */
export const slackBody = (content: string) => ({
  text: slackText(content),
  unfurl_links: false,
  unfurl_media: false,
});

export interface ReportsOptions {
  /** The Discord staff #reports webhook (`DISCORD_REPORTS_WEBHOOK`). */
  webhook: string | undefined;
  /** #146: the Slack #gojisim-reports webhook (`SLACK_REPORTS_WEBHOOK`). Either works without the other. */
  slackWebhook?: string | undefined;
  fetchImpl?: typeof fetch;
  log?: (line: string) => void;
}

/**
 * The poster the upload route calls after storing a game: it never throws and the caller doesn't
 * wait. Each new entry goes to Discord #reports and Slack #gojisim-reports (#146), whichever
 * webhooks are set. A missing webhook is logged once per server start; a failed or timed-out post
 * once per post, without the webhook's address. Returns the posts that went through.
 */
export function reportPoster({
  webhook,
  slackWebhook,
  fetchImpl = fetch,
  log = (line) => console.warn(line),
}: ReportsOptions) {
  const targets = [
    {
      name: "Discord",
      variable: "DISCORD_REPORTS_WEBHOOK",
      url: webhook?.trim(),
      body: discordBody,
      warned: false,
    },
    {
      name: "Slack",
      variable: "SLACK_REPORTS_WEBHOOK",
      url: slackWebhook?.trim(),
      body: slackBody,
      warned: false,
    },
  ];
  return async (
    record: unknown,
    earlier: unknown,
    file: string,
  ): Promise<number> => {
    const reports = newReports(record, earlier);
    if (reports.length === 0) return 0;
    const game = gameContext(record);
    const messages = reports
      .slice(0, POSTS_PER_UPLOAD)
      .map((r) => reportMessage(r, game, file));
    if (reports.length > POSTS_PER_UPLOAD)
      messages.push(
        `…and ${reports.length - POSTS_PER_UPLOAD} more new entries in ${code(file)} (\`pnpm feedback\`).`,
      );
    let posted = 0;
    for (const target of targets) {
      if (!target.url) {
        if (!target.warned)
          log(
            `GojiSim: ${target.variable} isn't set; tester reports aren't posted to ${target.name}.`,
          );
        target.warned = true;
        continue;
      }
      // One at a time, in order, within each webhook's rate limit.
      for (const content of messages) {
        try {
          const res = await fetchImpl(target.url, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(target.body(content)),
            signal: AbortSignal.timeout(POST_TIMEOUT_MS),
          });
          if (res.ok) posted++;
          else
            log(
              `GojiSim: a ${target.name} report post failed (HTTP ${res.status}).`,
            );
        } catch (err) {
          log(
            `GojiSim: a ${target.name} report post failed (${err instanceof Error ? err.name : "error"}).`,
          );
        }
      }
    }
    return posted;
  };
}
