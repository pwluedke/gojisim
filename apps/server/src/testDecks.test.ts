import { mkdirSync, mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import type { AddressInfo } from "node:net";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeAll, describe, expect, it } from "vitest";
import { createAppServer } from "./index.js";
import { MAX_TEST_DECKS_BYTES } from "./testDecks.js";

/**
 * #359: the test decks routes, on made-up decks (the public starter lists under sample names;
 * the real test decks live on the server only).
 */

const starter = (file: string) =>
  readFileSync(
    new URL(`../../../packages/cards/data/decks/${file}`, import.meta.url),
    "utf8",
  );
const esd01 = starter("esd01-starter.txt");
const esd02 = starter("esd02-starter.txt");

let root = "";
let distDir = "";
beforeAll(() => {
  root = mkdtempSync(join(tmpdir(), "gojisim-test-decks-"));
  distDir = join(root, "dist");
  mkdirSync(distDir);
  writeFileSync(join(distDir, "index.html"), "<!doctype html><title>x</title>");
});

let servers: ReturnType<typeof createAppServer>[] = [];
afterEach(() => {
  for (const server of servers) server.close();
  servers = [];
});

const TOKEN = "t".repeat(32);

async function serve(options: Parameters<typeof createAppServer>[0] = {}) {
  const testDecksDir = mkdtempSync(join(root, "test-decks-"));
  const server = createAppServer({
    distDir,
    recordsDir: join(root, "records"),
    testDecksDir,
    ...options,
  });
  servers.push(server);
  await new Promise<void>((resolve) => server.listen(0, resolve));
  const { port } = server.address() as AddressInfo;
  const call = (path: string, init: RequestInit = {}) =>
    fetch(`http://localhost:${port}${path}`, { redirect: "manual", ...init });
  return { call, testDecksDir };
}

const set = (...names: string[]) => ({
  decks: names.map((name, i) => ({ name, list: i % 2 ? esd02 : esd01 })),
});

const upload = (
  call: Awaited<ReturnType<typeof serve>>["call"],
  body: unknown,
  token = TOKEN,
) =>
  call("/api/test-decks/upload", {
    method: "POST",
    headers: {
      authorization: `Bearer ${token}`,
      "content-type": "application/json",
    },
    body: typeof body === "string" ? body : JSON.stringify(body),
  });

const names = async (call: Awaited<ReturnType<typeof serve>>["call"]) =>
  (
    (await (await call("/api/test-decks")).json()) as {
      decks: { name: string }[];
    }
  ).decks.map((d) => d.name);

describe("#359 test decks routes", () => {
  it("GET /api/test-decks answers the stored decks, none at first", async () => {
    const { call } = await serve();
    const res = await call("/api/test-decks");
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ decks: [] });
  });

  it("the upload is off without TEST_DECKS_UPLOAD_TOKEN (404), and needs the right token (401)", async () => {
    const off = await serve();
    expect((await upload(off.call, set("Sample A"))).status).toBe(404);
    const on = await serve({ testDecksToken: TOKEN });
    expect((await upload(on.call, set("Sample A"), "wrong")).status).toBe(401);
    expect(
      (
        await on.call("/api/test-decks/upload", {
          method: "POST",
          body: JSON.stringify(set("Sample A")),
        })
      ).status,
    ).toBe(401);
    // Only POST uploads.
    expect(
      (
        await on.call("/api/test-decks/upload", {
          headers: { authorization: `Bearer ${TOKEN}` },
        })
      ).status,
    ).toBe(404);
    expect(await names(on.call)).toEqual([]);
  });

  it("an upload is stored on the server's volume and read back in its order", async () => {
    const { call, testDecksDir } = await serve({ testDecksToken: TOKEN });
    const res = await upload(call, set("Sample B", "Sample A"));
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ decks: 2 });
    expect(await names(call)).toEqual(["Sample B", "Sample A"]);
    const stored = JSON.parse(
      readFileSync(join(testDecksDir, "test-decks.json"), "utf8"),
    ) as { decks: { list: string }[] };
    expect(stored.decks[0]?.list).toBe(esd01);
  });

  it("a new upload replaces the set: a changed list is updated and a deck left out is gone", async () => {
    const { call } = await serve({ testDecksToken: TOKEN });
    await upload(call, set("Sample A", "Sample B"));
    await upload(call, { decks: [{ name: "Sample A", list: esd02 }] });
    const data = (await (await call("/api/test-decks")).json()) as {
      decks: { name: string; list: string }[];
    };
    expect(data.decks).toEqual([{ name: "Sample A", list: esd02 }]);
  });

  it("a set that fails the check, or isn't JSON, is refused (400) and nothing is stored", async () => {
    const { call } = await serve({ testDecksToken: TOKEN });
    await upload(call, set("Sample A"));
    const bad = await upload(call, {
      decks: [{ name: "Bad", list: "[deck] x\n[main deck]\n4 NOPE01-999" }],
    });
    expect(bad.status).toBe(400);
    expect(((await bad.json()) as { problems: string[] }).problems).toEqual([
      "decks[0]: line 3: Unknown card number NOPE01-999",
    ]);
    expect((await upload(call, "not json")).status).toBe(400);
    expect((await upload(call, { decks: [], extra: 1 })).status).toBe(400);
    expect(await names(call)).toEqual(["Sample A"]);
  });

  it(`an upload over ${MAX_TEST_DECKS_BYTES} bytes is refused (413)`, async () => {
    const { call } = await serve({ testDecksToken: TOKEN });
    const res = await upload(call, {
      decks: [{ name: "Big", list: "#".repeat(MAX_TEST_DECKS_BYTES) }],
    });
    expect(res.status).toBe(413);
    expect(await names(call)).toEqual([]);
  });

  it("a stored file that no longer passes the check reads as no decks", async () => {
    const { call, testDecksDir } = await serve();
    writeFileSync(
      join(testDecksDir, "test-decks.json"),
      JSON.stringify({ decks: [{ name: 3 }] }),
    );
    expect(await names(call)).toEqual([]);
  });

  it("with the password gate on, GET /api/test-decks needs the sign-in; the token upload doesn't", async () => {
    const { call } = await serve({
      password: "kaiju tea party",
      secret: "s".repeat(40),
      testDecksToken: TOKEN,
    });
    const res = await call("/api/test-decks");
    expect(res.status).toBe(401);
    expect((await upload(call, set("Sample A"))).status).toBe(200);
  });
});
