import { deflateRawSync } from "node:zlib";
import { describe, expect, it } from "vitest";
import {
  buildNotes,
  clean,
  CONTEXT,
  fileFor,
  load,
  type PageFile,
  pagesOf,
  readSeen,
  summary,
  writeSeen,
} from "../src/notes";
import { parseJsonPage, parseTextPage } from "../src/parse";
import { readZip } from "../src/zip";

// Made-up exports (#84): the names, text and links are invented, in Discrub's two formats.

/** A zip of the files given: deflated, or stored when `store` is set. */
function makeZip(files: Record<string, string>, store = false): Buffer {
  const locals: Buffer[] = [];
  const centrals: Buffer[] = [];
  let offset = 0;
  for (const [name, text] of Object.entries(files)) {
    const raw = Buffer.from(text, "utf8");
    const data = store ? raw : deflateRawSync(raw);
    const nameBuf = Buffer.from(name, "utf8");
    const local = Buffer.alloc(30);
    local.writeUInt32LE(0x04034b50, 0);
    local.writeUInt16LE(store ? 0 : 8, 8);
    local.writeUInt32LE(data.length, 18);
    local.writeUInt32LE(raw.length, 22);
    local.writeUInt16LE(nameBuf.length, 26);
    const central = Buffer.alloc(46);
    central.writeUInt32LE(0x02014b50, 0);
    central.writeUInt16LE(store ? 0 : 8, 10);
    central.writeUInt32LE(data.length, 20);
    central.writeUInt32LE(raw.length, 24);
    central.writeUInt16LE(nameBuf.length, 28);
    central.writeUInt32LE(offset, 42);
    locals.push(local, nameBuf, data);
    centrals.push(central, nameBuf);
    offset += 30 + nameBuf.length + data.length;
  }
  const dir = Buffer.concat(centrals);
  const end = Buffer.alloc(22);
  end.writeUInt32LE(0x06054b50, 0);
  end.writeUInt16LE(Object.keys(files).length, 8);
  end.writeUInt16LE(Object.keys(files).length, 10);
  end.writeUInt32LE(dir.length, 12);
  end.writeUInt32LE(offset, 16);
  return Buffer.concat([...locals, dir, end]);
}

const user = (id: string, name: string) => ({
  id,
  username: name.toLowerCase(),
  global_name: name,
});
const ANN = user("11", "Ann Example");
const BO = user("22", "Bo Sample");

/** A JSON page (newest first, as Discrub writes it). */
const jsonPage = JSON.stringify([
  {
    id: "105",
    type: 6,
    timestamp: "2026-10-01T10:05:00+00:00",
    content: "",
    author: ANN,
  },
  {
    id: "104",
    type: 0,
    timestamp: "2026-10-01T10:04:00+00:00",
    content: "https://example.com/only-a-link",
    author: BO,
  },
  {
    id: "103",
    type: 19,
    timestamp: "2026-10-01T10:03:00+00:00",
    content: "Yes, <@11> is right <:goji:999>\nsee https://example.com/rules",
    author: BO,
    mentions: [ANN],
    message_reference: { message_id: "101" },
  },
  {
    id: "102",
    type: 0,
    timestamp: "2026-10-01T10:02:00+00:00",
    content: "",
    author: ANN,
    attachments: [
      { filename: "board.png", url: "https://cdn.example.com/board.png" },
    ],
  },
  {
    id: "101",
    type: 0,
    timestamp: "2026-10-01T10:01:00+00:00",
    content: "Does the made-up card count its own zone?",
    author: ANN,
  },
]);

/** A text page (newest first), one message in two paragraphs, a reply and a system event. */
const textPage = [
  "@Bo Sample (10/02/2026 1:15 PM, edited 10/02/2026 1:16 PM)",
  "Second paragraph follows.",
  "",
  "It continues here.",
  "Reactions: 👍 ×2",
  "",
  "-- @Ann Example: system event (10/02/2026 1:10 PM) --",
  "",
  "> @Ann Example: Is this the first message?",
  "@Bo Sample (10/02/2026 12:05 PM)",
  "It is not.",
  "[Attachment: scan.jpg — https://cdn.example.com/scan.jpg]",
  "",
  "@Ann Example (10/02/2026 11:59 AM)",
  "Is this the first message?",
  "",
].join("\n");

describe("discord-notes (#84)", () => {
  it("reads a zip, deflated or stored", () => {
    for (const store of [false, true]) {
      const entries = readZip(
        makeZip({ "a/b-page-1.txt": "hello", "a/README.txt": "x" }, store),
      );
      expect(entries.map((e) => [e.name, e.data.toString()])).toEqual([
        ["a/b-page-1.txt", "hello"],
        ["a/README.txt", "x"],
      ]);
    }
    expect(() => readZip(Buffer.from("not a zip"))).toThrow(/not a zip/);
  });

  it("text pages: a message runs to the next header (paragraphs included); quotes make replies; reactions and system events drop; oldest first", () => {
    const messages = parseTextPage(textPage, "made_up_chat");
    expect(messages.map((m) => [m.author, m.time, m.text])).toEqual([
      ["Ann Example", "2026-10-02 11:59", "Is this the first message?"],
      ["Bo Sample", "2026-10-02 12:05", "It is not."],
      [
        "Bo Sample",
        "2026-10-02 13:15",
        "Second paragraph follows.\n\nIt continues here.",
      ],
    ]);
    expect(messages[1]?.replyTo).toEqual({
      author: "Ann Example",
      text: "Is this the first message?",
    });
    expect(messages[1]?.attachments).toEqual([
      { name: "scan.jpg", url: "https://cdn.example.com/scan.jpg" },
    ]);
    // Keys come from the content, so the same message in two exports is one message.
    expect(parseTextPage(textPage, "made_up_chat").map((m) => m.key)).toEqual(
      messages.map((m) => m.key),
    );
  });

  it("JSON pages: default, reply and slash-command messages, with mentions, attachments and reply keys", () => {
    const messages = parseJsonPage(jsonPage, "made_up_rules");
    expect(messages.map((m) => m.key)).toEqual([
      "json:104",
      "json:103",
      "json:102",
      "json:101",
    ]);
    const reply = messages.find((m) => m.key === "json:103");
    expect(reply?.replyTo?.key).toBe("json:101");
    expect(reply?.mentions).toEqual({ "11": "Ann Example" });
    expect(messages.find((m) => m.key === "json:102")?.attachments).toEqual([
      { name: "board.png", url: "https://cdn.example.com/board.png" },
    ]);
  });

  it("clean: emoji, mentions and links become plain words; line breaks become ' / '", () => {
    expect(
      clean({
        text: "Yes, <@11> is right <:goji:999> <@&5> <#6>\nsee https://example.com/x",
        mentions: { "11": "Ann Example" },
      }),
    ).toBe("Yes, @Ann Example is right :goji: @role #channel / see [link]");
    expect(clean({ text: "<@!77> hi" })).toBe("@user hi");
  });

  it("load: a channel exported as JSON skips its text pages; overlapping exports count once; replies get their parent", () => {
    const pages: PageFile[] = [
      ...pagesOf(
        "one.zip",
        readZip(
          makeZip({ "made_up_rules/made_up_rules-page-1.json": jsonPage }),
        ),
      ),
      ...pagesOf(
        "two.zip",
        readZip(
          makeZip({ "made_up_rules/made_up_rules-page-1.json": jsonPage }),
        ),
      ),
      ...pagesOf(
        "three.zip",
        readZip(
          makeZip({
            "made_up_rules/made_up_rules-page-1.txt": textPage,
            "made_up_chat/made_up_chat-page-1.txt": textPage,
            "made_up_chat/README.txt": "readme",
          }),
        ),
      ),
    ];
    const loaded = load(pages);
    expect([...loaded.channels.keys()].sort()).toEqual([
      "made_up_chat",
      "made_up_rules",
    ]);
    expect(loaded.channels.get("made_up_rules")?.map((m) => m.key)).toEqual([
      "json:101",
      "json:102",
      "json:103",
      "json:104",
    ]);
    expect(loaded.skippedText).toEqual(["made_up_rules"]);
    expect(loaded.sources).toEqual(["one.zip", "three.zip", "two.zip"]);
    const reply = loaded.channels
      .get("made_up_rules")
      ?.find((m) => m.key === "json:103");
    expect(reply?.replyTo).toMatchObject({
      author: "Ann Example",
      text: "Does the made-up card count its own zone?",
    });
  });

  it("notes: new messages with 20 earlier ones for context, marked (seen); bare links drop; attachments of new messages only", () => {
    const messages = Array.from({ length: 30 }, (_, i) => ({
      id: String(200 + i),
      type: 0,
      timestamp: `2026-10-03T10:${String(i).padStart(2, "0")}:00+00:00`,
      content: `message ${i}`,
      author: i % 2 ? ANN : BO,
      attachments:
        i === 3 || i === 29
          ? [
              {
                filename: `f${i}.png`,
                url: `https://cdn.example.com/f${i}.png`,
              },
            ]
          : [],
    }));
    messages[28] = {
      ...messages[28],
      content: "https://example.com/bare",
    } as (typeof messages)[number];
    const loaded = load([
      {
        source: "x.zip",
        path: "made_up_rules/made_up_rules-page-1.json",
        text: JSON.stringify(messages),
      },
    ]);
    // The first 27 were handed out before; 27, 28 and 29 are new (28 is a bare link).
    const seen = new Set(messages.slice(0, 27).map((m) => `json:${m.id}`));
    const notes = buildNotes(loaded, seen);
    const [channel] = notes.channels;
    expect(channel?.newCount).toBe(3);
    expect(channel?.contextCount).toBe(CONTEXT);
    expect(channel?.lines).toHaveLength(CONTEXT + 2);
    expect(channel?.lines[0]).toBe(
      "(seen) Ann Example (2026-10-03 10:07): message 7",
    );
    expect(channel?.lines.at(-1)).toBe(
      "Ann Example (2026-10-03 10:29): message 29 [attached: f29.png]",
    );
    expect(notes.newKeys).toEqual(["json:227", "json:228", "json:229"]);
    expect(channel?.attachments.map((a) => a.name)).toEqual(["f29.png"]);
    // Nothing new: no channel.
    expect(
      buildNotes(loaded, new Set([...seen, ...notes.newKeys])).channels,
    ).toEqual([]);
    const text = summary(loaded, notes, "2026-10-30", seen.size);
    expect(text).toContain(
      "New messages: 3 in 1 channel(s); 27 were seen before.",
    );
    expect(text).toContain(
      "- `made_up_rules.txt`: made_up_rules, 3 new (2026-10-03T10:27 to 2026-10-03T10:29), 20 earlier for context",
    );
    expect(text).toContain(
      "- made_up_rules · Ann Example · 2026-10-03T10:29 · f29.png: https://cdn.example.com/f29.png",
    );
  });

  it("thread folders become their own files; seen.json round-trips and refuses other versions", () => {
    expect(fileFor("made_up_chat/threads/Deck help?")).toBe(
      "made_up_chat--threads--Deck help_.txt",
    );
    const seen = readSeen(writeSeen(new Set(["json:2", "json:1"])));
    expect([...seen]).toEqual(["json:1", "json:2"]);
    expect(readSeen(null).size).toBe(0);
    expect(() => readSeen('{"version":2,"keys":[]}')).toThrow(/version 1/);
  });
});
