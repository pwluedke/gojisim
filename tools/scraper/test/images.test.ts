import { existsSync, readFileSync } from "node:fs";
import type { Card } from "@gojisim/cards";
import { describe, expect, it } from "vitest";

const dataDir = new URL("../../../packages/cards/data/", import.meta.url);
const publicCards = new URL("../../../apps/web/public/cards/", import.meta.url);
const downloaded = existsSync(publicCards);

if (!downloaded) {
  console.warn(
    "Skipping card image tests: images are not downloaded locally (apps/web/public/cards/ is missing). Run `pnpm images` to download them.",
  );
}

describe.skipIf(!downloaded)("images.json (local card images)", () => {
  const cards = JSON.parse(
    readFileSync(new URL("cards.json", dataDir), "utf8"),
  ) as Card[];
  const manifest = JSON.parse(
    readFileSync(new URL("images.json", dataDir), "utf8"),
  ) as Record<string, { png: number; full: number; thumb: number }>;

  it("lists every card id from cards.json", () => {
    const missing = cards
      .map((c) => String(c.id))
      .filter((id) => !(id in manifest));
    expect(missing).toEqual([]);
  });

  it("has a full and thumb WebP on disk for every card", () => {
    const missing = cards.flatMap((c) =>
      ["full", "thumb"]
        .map((kind) => `${c.id}-${kind}.webp`)
        .filter((file) => !existsSync(new URL(file, publicCards))),
    );
    expect(missing).toEqual([]);
  });
});
