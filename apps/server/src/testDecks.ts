import { createHash, timingSafeEqual } from "node:crypto";
import { mkdir, readFile, rename, writeFile } from "node:fs/promises";
import type { IncomingMessage, ServerResponse } from "node:http";
import { join } from "node:path";
import {
  type TestDeckSet,
  validateTestDeckSet,
} from "@gojisim/cards/test-deck-set";
import { readBody } from "./games.js";

/*
 * #359: the test decks (the decks the bot is tested with), shown in `/play`'s pickers and the
 * Deckbuilder next to the starter decks. Their lists are kept on the server's volume and never in
 * the repo, like the results data (#340). `GET /api/test-decks` is behind the site sign-in like
 * the rest of the site; `POST /api/test-decks/upload` takes the whole set from `pnpm test-decks
 * upload` with the token in `TEST_DECKS_UPLOAD_TOKEN`, replacing what's stored (a deck left out is
 * gone), and answers 404 when no token is set.
 */

/** An upload's size cap: a few dozen deck lists of a few hundred bytes each, far below this. */
export const MAX_TEST_DECKS_BYTES = 256 * 1024;

const FILE = "test-decks.json";

/** The stored test decks, or none yet. */
export async function readTestDecks(dir: string): Promise<TestDeckSet> {
  try {
    const data: unknown = JSON.parse(await readFile(join(dir, FILE), "utf8"));
    return validateTestDeckSet(data).length === 0
      ? (data as TestDeckSet)
      : { decks: [] };
  } catch {
    return { decks: [] };
  }
}

/** Constant-time token check: equal-length SHA-256 digests. */
const sameToken = (given: string, token: string) =>
  timingSafeEqual(
    createHash("sha256").update(given).digest(),
    createHash("sha256").update(token).digest(),
  );

const json = (res: ServerResponse, status: number, body: unknown) => {
  res.writeHead(status, { "content-type": "application/json" });
  res.end(JSON.stringify(body));
};

/** The upload route, which runs before the sign-in gate (the script has no session). */
export const isTestDecksUploadPath = (path: string) =>
  path === "/api/test-decks/upload";

export function testDecksMiddleware({
  dir,
  token,
}: {
  /** The test decks folder (`TEST_DECKS_DIR`, `/data/test-decks` on Railway). */
  dir: string;
  /** `TEST_DECKS_UPLOAD_TOKEN`; unset turns uploads off (404). */
  token: string | undefined;
}) {
  // One upload at a time, so two never write the file over each other.
  let queue: Promise<unknown> = Promise.resolve();
  return async (
    req: IncomingMessage,
    res: ServerResponse,
    next: () => void,
  ): Promise<void> => {
    const path = new URL(req.url ?? "/", "http://localhost").pathname;
    if (path === "/api/test-decks" && req.method === "GET") {
      json(res, 200, await readTestDecks(dir));
      return;
    }
    if (!isTestDecksUploadPath(path)) {
      next();
      return;
    }
    const auth = req.headers.authorization ?? "";
    const given = auth.startsWith("Bearer ") ? auth.slice(7) : "";
    if (!token || req.method !== "POST") {
      json(res, 404, { error: "not-found" });
      return;
    }
    if (!given || !sameToken(given, token)) {
      json(res, 401, { error: "bad-token" });
      return;
    }
    const text = await readBody(req, MAX_TEST_DECKS_BYTES);
    if (text === null) {
      json(res, 413, { error: "too-large" });
      return;
    }
    let set: unknown;
    try {
      set = JSON.parse(text);
    } catch {
      json(res, 400, { error: "not-json" });
      return;
    }
    const problems = validateTestDeckSet(set);
    if (problems.length > 0) {
      json(res, 400, { problems });
      return;
    }
    const done = queue.then(async () => {
      await mkdir(dir, { recursive: true });
      const file = join(dir, FILE);
      // Written whole, then renamed over the old file: a reader never sees half a file.
      await writeFile(`${file}.tmp`, JSON.stringify(set));
      await rename(`${file}.tmp`, file);
      return { decks: (set as TestDeckSet).decks.length };
    });
    queue = done.catch(() => undefined);
    json(res, 200, await done);
  };
}
