import { execFile } from "node:child_process";
import { mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { createServer } from "node:http";
import type { AddressInfo } from "node:net";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { promisify } from "node:util";
import { validateTestDeckSet } from "@gojisim/cards/test-deck-set";
import { describe, expect, it } from "vitest";
import {
  DEFAULT_SITE,
  summary,
  testDeckSetOf,
  uploadTestDecks,
} from "../src/testDeckUpload";

/**
 * #359: the test decks upload, on a made-up deck file: the public starter lists under sample
 * names (the real file stays on Paul's Mac, never in the repo).
 */
const starter = (file: string) =>
  readFileSync(
    new URL(`../../../packages/cards/data/decks/${file}`, import.meta.url),
    "utf8",
  );
const sampleFile = [
  starter("esd01-starter.txt").replace(/^\[deck\].*$/m, "[deck] Sample A"),
  starter("esd02-starter.txt").replace(/^\[deck\].*$/m, "[deck] Sample B"),
].join("\n\n");
const TOKEN = "secret-token-1234567890";

describe("#359 test decks upload", () => {
  it("reads the sample file as a valid set and lists its decks without their lists", () => {
    const set = testDeckSetOf(sampleFile);
    expect(validateTestDeckSet(set)).toEqual([]);
    expect(summary(set)).toEqual([
      "Sample A: 4 monster, 50 main",
      "Sample B: 4 monster, 50 main",
    ]);
  });

  it("a file with a problem throws every problem before anything is sent", () => {
    expect(() =>
      testDeckSetOf(
        `${sampleFile}\n\n[deck] Sample A\n[main deck]\n1 ESD01-005`,
      ),
    ).toThrow("decks[2]: name Sample A twice");
  });

  it("sends the whole set with the token to the site, or TEST_DECKS_URL", async () => {
    const set = testDeckSetOf(sampleFile);
    const sent: { url: string; init: RequestInit }[] = [];
    const fake = (async (url: string, init: RequestInit) => {
      sent.push({ url, init });
      return new Response('{"decks":2}', { status: 200 });
    }) as unknown as typeof fetch;
    const answer = await uploadTestDecks(
      set,
      { TEST_DECKS_UPLOAD_TOKEN: TOKEN },
      fake,
    );
    expect(answer).toEqual({ ok: true, status: 200, body: '{"decks":2}' });
    expect(sent[0]?.url).toBe(`${DEFAULT_SITE}/api/test-decks/upload`);
    expect(sent[0]?.init.method).toBe("POST");
    expect(
      (sent[0]?.init.headers as Record<string, string>).authorization,
    ).toBe(`Bearer ${TOKEN}`);
    expect(JSON.parse(sent[0]?.init.body as string)).toEqual(set);
    await uploadTestDecks(
      set,
      { TEST_DECKS_UPLOAD_TOKEN: TOKEN, TEST_DECKS_URL: "http://x:1/" },
      fake,
    );
    expect(sent[1]?.url).toBe("http://x:1/api/test-decks/upload");
  });

  it("needs TEST_DECKS_UPLOAD_TOKEN", async () => {
    await expect(
      uploadTestDecks(testDeckSetOf(sampleFile), {}),
    ).rejects.toThrow("TEST_DECKS_UPLOAD_TOKEN isn't set");
  });

  it("`test-decks upload --file` sends the file to the server and never prints the token", async () => {
    const dir = mkdtempSync(join(tmpdir(), "gojisim-test-decks-cmd-"));
    const file = join(dir, "decks.txt");
    writeFileSync(file, sampleFile);
    const got: { auth: string | undefined; body: string }[] = [];
    const server = createServer((req, res) => {
      let body = "";
      req.on("data", (c: Buffer) => (body += c.toString()));
      req.on("end", () => {
        got.push({ auth: req.headers.authorization, body });
        res.writeHead(200, { "content-type": "application/json" });
        res.end('{"decks":2}');
      });
    });
    await new Promise<void>((r) => server.listen(0, r));
    const { port } = server.address() as AddressInfo;
    try {
      const cwd = fileURLToPath(new URL("..", import.meta.url));
      const { stdout, stderr } = await promisify(execFile)(
        "pnpm",
        ["exec", "tsx", "src/testDecksCmd.ts", "upload", "--file", file],
        {
          cwd,
          env: {
            ...process.env,
            INIT_CWD: dir,
            TEST_DECKS_UPLOAD_TOKEN: TOKEN,
            TEST_DECKS_URL: `http://localhost:${port}`,
          },
        },
      );
      expect(stdout).toContain("2 test decks, valid:");
      expect(stdout).toContain("Sample A: 4 monster, 50 main");
      expect(stdout).toContain('Upload: 200 {"decks":2}');
      expect(stdout + stderr).not.toContain(TOKEN);
      expect(got).toHaveLength(1);
      expect(got[0]?.auth).toBe(`Bearer ${TOKEN}`);
      expect(
        (
          JSON.parse(got[0]?.body ?? "") as { decks: { name: string }[] }
        ).decks.map((d) => d.name),
      ).toEqual(["Sample A", "Sample B"]);
    } finally {
      server.close();
    }
  }, 30_000);
});
