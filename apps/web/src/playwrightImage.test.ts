import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

// CI runs the e2e shards in Microsoft's Playwright image, which carries the browsers for one
// Playwright version. A Playwright bump that leaves the image behind would fail every e2e run
// with a missing browser, so the tag must match the version in the lockfile.
const root = new URL("../../../", import.meta.url);
// #92: the smoke check workflow uses the image too.
const workflow = ["ci.yml", "smoke.yml"]
  .map((file) =>
    readFileSync(new URL(`.github/workflows/${file}`, root), "utf8"),
  )
  .join("\n");
const lockfile = readFileSync(new URL("pnpm-lock.yaml", root), "utf8");

describe("CI's and the smoke check's Playwright image", () => {
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
