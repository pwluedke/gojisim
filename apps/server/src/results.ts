import { createHash, timingSafeEqual } from "node:crypto";
import { mkdir, readFile, rename, writeFile } from "node:fs/promises";
import type { IncomingMessage, ServerResponse } from "node:http";
import { join } from "node:path";
import {
  type Check,
  type Read,
  type ResultsData,
  type Run,
  validateResults,
} from "@gojisim/cards/results";
import { readBody } from "./games.js";

/*
 * #340: the results page's data (what each bot change did, by deck), kept on the server's volume
 * and never in the repo (Paul, Nov 14). `GET /api/results` is behind the site sign-in like the
 * rest of the site; `POST /api/results/upload` takes a check, a run or a players' read from the
 * `tools/bots` script
 * with the token in `RESULTS_UPLOAD_TOKEN`, and answers 404 when no token is set.
 */

/** An uploaded entry's size cap: aggregates only, far below this. */
export const MAX_RESULTS_ENTRY_BYTES = 256 * 1024;

const EMPTY: ResultsData = { checks: [], runs: [] };

/** The stored results, or none yet. */
export async function readResults(dir: string): Promise<ResultsData> {
  try {
    return JSON.parse(
      await readFile(join(dir, "results.json"), "utf8"),
    ) as ResultsData;
  } catch {
    return EMPTY;
  }
}

/** An upload: a check, a run, or a players' read (#340 part b). */
export type ResultsEntry = { check: Check } | { run: Run } | { read: Read };

/**
 * `data` with `entry` added, replacing an entry of the same id (a re-upload of a check).
 */
export function withEntry(data: ResultsData, entry: ResultsEntry): ResultsData {
  if ("read" in entry)
    return {
      ...data,
      reads: [
        ...(data.reads ?? []).filter((r) => r.id !== entry.read.id),
        entry.read,
      ],
    };
  if ("check" in entry)
    return {
      ...data,
      checks: [
        ...data.checks.filter((c) => c.id !== entry.check.id),
        entry.check,
      ],
    };
  return {
    ...data,
    runs: [...data.runs.filter((r) => r.id !== entry.run.id), entry.run],
  };
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
export const isResultsUploadPath = (path: string) =>
  path === "/api/results/upload";

export function resultsMiddleware({
  dir,
  token,
}: {
  /** The results folder (`RESULTS_DIR`, `/data/results` on Railway). */
  dir: string;
  /** `RESULTS_UPLOAD_TOKEN`; unset turns uploads off (404). */
  token: string | undefined;
}) {
  // One upload at a time, so two never read and write the file over each other.
  let queue: Promise<unknown> = Promise.resolve();
  return async (
    req: IncomingMessage,
    res: ServerResponse,
    next: () => void,
  ): Promise<void> => {
    const path = new URL(req.url ?? "/", "http://localhost").pathname;
    if (path === "/api/results" && req.method === "GET") {
      json(res, 200, await readResults(dir));
      return;
    }
    if (!isResultsUploadPath(path)) {
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
    const text = await readBody(req, MAX_RESULTS_ENTRY_BYTES);
    if (text === null) {
      json(res, 413, { error: "too-large" });
      return;
    }
    let entry: unknown;
    try {
      entry = JSON.parse(text);
    } catch {
      json(res, 400, { error: "not-json" });
      return;
    }
    const isEntry =
      typeof entry === "object" &&
      entry !== null &&
      ("check" in entry || "run" in entry || "read" in entry) &&
      Object.keys(entry).length === 1;
    if (!isEntry) {
      json(res, 400, { error: "expected { check }, { run } or { read }" });
      return;
    }
    const done = queue.then(async () => {
      const next = withEntry(await readResults(dir), entry as ResultsEntry);
      const problems = validateResults(next);
      if (problems.length > 0) return { status: 400, body: { problems } };
      await mkdir(dir, { recursive: true });
      const file = join(dir, "results.json");
      // Written whole, then renamed over the old file: a reader never sees half a file.
      await writeFile(`${file}.tmp`, JSON.stringify(next));
      await rename(`${file}.tmp`, file);
      return {
        status: 200,
        body: {
          checks: next.checks.length,
          runs: next.runs.length,
          reads: next.reads?.length ?? 0,
        },
      };
    });
    queue = done.catch(() => undefined);
    const { status, body } = await done;
    json(res, status, body);
  };
}
