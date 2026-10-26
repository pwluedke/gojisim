import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

// CI runs the e2e shards in Microsoft's Playwright image, which carries the browsers for one
// Playwright version. A Playwright bump that leaves the image behind would fail every e2e run
// with a missing browser, so the tag must match the version in the lockfile.
const root = new URL("../../../", import.meta.url);
const workflow = readFileSync(
  new URL(".github/workflows/ci.yml", root),
  "utf8",
);
const lockfile = readFileSync(new URL("pnpm-lock.yaml", root), "utf8");

describe("CI's Playwright image", () => {
  it("matches the Playwright version in the lockfile", () => {
    const tags = [
      ...workflow.matchAll(/mcr\.microsoft\.com\/playwright:v([\d.]+)-/g),
    ].map((m) => m[1]);
    // The lockfile names each version in its packages and its snapshots sections.
    const locked = new Set(
      [...lockfile.matchAll(/^ {2}playwright@([\d.]+):/gm)].map((m) => m[1]),
    );
    expect(tags.length).toBeGreaterThan(0);
    expect(locked.size).toBe(1);
    expect(new Set(tags)).toEqual(locked);
  });
});
