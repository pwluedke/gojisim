import { afterEach, describe, expect, it, vi } from "vitest";
import {
  latestTag,
  readSeen,
  resetLatestTag,
  SEEN_KEY,
  showDot,
  tagFrom,
  writeSeen,
} from "./releaseLink";

afterEach(() => resetLatestTag());

describe("What's new (#134)", () => {
  it("reads the tag from GitHub's latest-release answer, and nothing else", () => {
    expect(
      tagFrom({ tag_name: "release-2026-10-30-1", name: "Release 2026-10-30" }),
    ).toBe("release-2026-10-30-1");
    for (const bad of [
      null,
      "x",
      [],
      {},
      { tag_name: "" },
      { tag_name: 3 },
      { message: "Not Found" },
    ])
      expect(tagFrom(bad)).toBeNull();
  });

  it("shows the dot for a known tag this browser hasn't opened; never when the tag can't be read", () => {
    expect(showDot("release-2026-10-31-1", null)).toBe(true);
    expect(showDot("release-2026-10-31-1", "release-2026-10-30-1")).toBe(true);
    expect(showDot("release-2026-10-31-1", "release-2026-10-31-1")).toBe(false);
    expect(showDot(null, null)).toBe(false);
    expect(showDot(null, "release-2026-10-30-1")).toBe(false);
  });

  it("keeps the opened tag under gojisim.whatsNewSeen; blocked storage reads as unset and never throws", () => {
    const store = new Map<string, string>();
    const storage = {
      getItem: (k: string) => store.get(k) ?? null,
      setItem: (k: string, v: string) => void store.set(k, v),
    };
    expect(readSeen(storage)).toBeNull();
    writeSeen(storage, "release-2026-10-30-1");
    expect(store.get(SEEN_KEY)).toBe("release-2026-10-30-1");
    expect(readSeen(storage)).toBe("release-2026-10-30-1");
    const blocked = {
      getItem: () => {
        throw new Error("SecurityError");
      },
      setItem: () => {
        throw new Error("QuotaExceededError");
      },
    };
    expect(readSeen(blocked)).toBeNull();
    expect(() => writeSeen(blocked, "release-2026-10-30-1")).not.toThrow();
    expect(readSeen(undefined)).toBeNull();
  });

  it("asks GitHub once per page load; a failed or refused call gives no tag", async () => {
    const ok = vi.fn(
      async () =>
        new Response(JSON.stringify({ tag_name: "release-2026-10-30-1" })),
    );
    expect(await latestTag(ok as unknown as typeof fetch)).toBe(
      "release-2026-10-30-1",
    );
    expect(await latestTag(ok as unknown as typeof fetch)).toBe(
      "release-2026-10-30-1",
    );
    expect(ok).toHaveBeenCalledTimes(1);
    resetLatestTag();
    const limited = vi.fn(async () => new Response("{}", { status: 403 }));
    expect(await latestTag(limited as unknown as typeof fetch)).toBeNull();
    resetLatestTag();
    const offline = vi.fn(async () => {
      throw new TypeError("Failed to fetch");
    });
    expect(await latestTag(offline as unknown as typeof fetch)).toBeNull();
  });
});
