/**
 * "What's new" (#134): a link to the latest GitHub Release, with a "New" dot while its tag differs
 * from the one this browser last opened. The tag comes from GitHub's API without auth (60 calls an
 * hour per IP, one per page load here); when it can't be read, the link shows with no dot.
 */

/** The latest release's page: GitHub redirects it to the newest release. */
export const RELEASES_URL =
  "https://github.com/pwluedke/gojisim/releases/latest";
/** Where the tag is read. Playwright points it at a path its specs route, so no test calls GitHub. */
export const RELEASES_API: string =
  import.meta.env?.VITE_RELEASES_API ??
  "https://api.github.com/repos/pwluedke/gojisim/releases/latest";
/** The tag this browser last opened, under `gojisim.whatsNewSeen` (decision 223's naming). */
export const SEEN_KEY = "gojisim.whatsNewSeen";

/** The release's tag from the API's answer, or `null` for anything else. */
export function tagFrom(body: unknown): string | null {
  if (typeof body !== "object" || body === null) return null;
  const tag = (body as Record<string, unknown>)["tag_name"];
  return typeof tag === "string" && tag !== "" ? tag : null;
}

/** Whether to show the dot: a known latest tag this browser hasn't opened. */
export function showDot(latest: string | null, seen: string | null): boolean {
  return latest !== null && latest !== seen;
}

/** The tag this browser last opened (`null` when unset or storage is blocked). */
export function readSeen(
  storage: Pick<Storage, "getItem"> | undefined,
): string | null {
  try {
    return storage?.getItem(SEEN_KEY) ?? null;
  } catch {
    return null;
  }
}

/** Remembers `tag` as opened; blocked storage only means the dot comes back. */
export function writeSeen(
  storage: Pick<Storage, "setItem"> | undefined,
  tag: string,
): void {
  try {
    storage?.setItem(SEEN_KEY, tag);
  } catch {
    // Private windows and blocked site data: nothing to keep.
  }
}

let latest: Promise<string | null> | null = null;

/** The latest release's tag, read once per page load (the menu and Settings share it). */
export function latestTag(
  fetchImpl: typeof fetch = fetch,
): Promise<string | null> {
  latest ??= fetchImpl(RELEASES_API, {
    headers: { Accept: "application/vnd.github+json" },
  })
    .then((res) => (res.ok ? res.json() : null))
    .then(tagFrom)
    .catch(() => null);
  return latest;
}

/** For tests: forget the page load's tag. */
export function resetLatestTag(): void {
  latest = null;
}
