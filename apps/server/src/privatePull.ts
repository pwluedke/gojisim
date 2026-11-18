import { mkdir, rm, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";

/*
 * The private card set's files, pulled from its private GitHub repo when the server starts, so a
 * release has them without a build step (Paul set `GOJISIM_PRIVATE_TOKEN`, a read-only
 * fine-grained token, on Railway). Only the set's data is fetched: the files under
 * `packages/cards/data/` (its cards, ability files and decks), through GitHub's API with plain
 * `fetch` (no git or tar in the image). The token is sent only in the Authorization header and is
 * never logged. With no token it skips; any failure is logged and the server starts without the
 * set (its route then answers 404 like for everyone).
 */

/** The files the set needs, under the repo root. */
const DATA = "packages/cards/data/";

export interface PullOptions {
  token: string | undefined;
  /** `owner/name` (`GOJISIM_PRIVATE_REPO`; default `pwluedke/gojisim-private`). */
  repo: string;
  /** Where the checkout goes (`PRIVATE_SET_DIR`; `private/` at the repo root). */
  dir: string;
  ref?: string;
  fetchImpl?: typeof fetch;
  log?: (line: string) => void;
}

/** How many files were written, or null when skipped or failed. */
export async function pullPrivateSet({
  token,
  repo,
  dir,
  ref = "main",
  fetchImpl = fetch,
  log = (line) => console.log(line),
}: PullOptions): Promise<number | null> {
  if (!token) {
    log("GojiSim: no GOJISIM_PRIVATE_TOKEN; the private card set is off.");
    return null;
  }
  if (!/^[\w.-]+\/[\w.-]+$/.test(repo)) {
    log(
      "GojiSim: GOJISIM_PRIVATE_REPO isn't owner/name; the private card set is off.",
    );
    return null;
  }
  const headers = {
    authorization: `Bearer ${token}`,
    "x-github-api-version": "2022-11-28",
    "user-agent": "gojisim-server",
  };
  try {
    const treeRes = await fetchImpl(
      `https://api.github.com/repos/${repo}/git/trees/${encodeURIComponent(ref)}?recursive=1`,
      { headers: { ...headers, accept: "application/vnd.github+json" } },
    );
    if (!treeRes.ok)
      throw new Error(`the file list answered ${treeRes.status}`);
    const tree = (await treeRes.json()) as {
      tree?: { path?: string; type?: string }[];
    };
    const paths = (tree.tree ?? [])
      .filter(
        (e) =>
          e.type === "blob" &&
          typeof e.path === "string" &&
          e.path.startsWith(DATA) &&
          !e.path.split("/").includes("..") &&
          /\.(json|txt)$/.test(e.path),
      )
      .map((e) => e.path as string);
    const files: [string, string][] = [];
    for (const path of paths) {
      const res = await fetchImpl(
        `https://api.github.com/repos/${repo}/contents/${path
          .split("/")
          .map(encodeURIComponent)
          .join("/")}?ref=${encodeURIComponent(ref)}`,
        { headers: { ...headers, accept: "application/vnd.github.raw" } },
      );
      if (!res.ok) throw new Error(`a file answered ${res.status}`);
      files.push([path, await res.text()]);
    }
    // Replace the old checkout's data only once every file has arrived.
    await rm(join(dir, DATA), { recursive: true, force: true });
    for (const [path, text] of files) {
      const to = join(dir, path);
      await mkdir(dirname(to), { recursive: true });
      await writeFile(to, text);
    }
    log(`GojiSim: the private card set: ${files.length} files pulled.`);
    return files.length;
  } catch (err) {
    // The message names no token: only statuses and our own wording reach it.
    const why = err instanceof Error ? err.message : "unknown error";
    log(
      `GojiSim: the private card set couldn't be pulled (${why.replaceAll(token, "[token]")}); it's off.`,
    );
    return null;
  }
}
