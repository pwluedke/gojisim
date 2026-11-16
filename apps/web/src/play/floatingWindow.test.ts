import { readdirSync, readFileSync } from "node:fs";
import { join, relative } from "node:path";
import { describe, expect, it } from "vitest";

/**
 * Paul, Nov 16: every modal is movable by default. A window renders through `FloatingWindow`
 * (dragged by its title bar, kept in the viewport); a dialog role or a backdrop written anywhere
 * else in the app fails this check, unless it is one of the exceptions below, each with its why.
 */
const SRC = new URL("..", import.meta.url).pathname;

/** Where a window is drawn by hand: a dialog role, or a backdrop class. */
const HAND_DRAWN =
  /role="(alert)?dialog"|styles\.modalBackdrop|styles\.backdrop\b/g;

/** The exceptions, by file and how many such places each may have, with the reason. */
const ALLOWED: Record<string, { count: number; why: string }> = {
  "play/FloatingWindow.tsx": { count: 0, why: "the window itself" },
  "play/PlayScreen.tsx": {
    count: 2,
    why: "the yes / no confirm (a one-line question, fixed in the middle) and the expanded hand (H: a view of the whole hand, not a dialog)",
  },
  "online/OnlineScreen.tsx": {
    count: 1,
    why: "the undo request (a one-line question with Allow / Refuse)",
  },
};

function tsxFiles(dir: string): string[] {
  return readdirSync(dir, { recursive: true, encoding: "utf8" })
    .filter((f) => f.endsWith(".tsx") && !f.includes(".test."))
    .map((f) => join(dir, f));
}

describe("every modal is movable (Paul, Nov 16)", () => {
  it("no window is drawn by hand outside FloatingWindow, but the allowed exceptions", () => {
    const found: Record<string, number> = {};
    for (const file of tsxFiles(SRC)) {
      const name = relative(SRC, file);
      if (name === "play/FloatingWindow.tsx") continue;
      const count = readFileSync(file, "utf8").match(HAND_DRAWN)?.length ?? 0;
      if (count > 0) found[name] = count;
    }
    const allowed = Object.fromEntries(
      Object.entries(ALLOWED)
        .filter(([, a]) => a.count > 0)
        .map(([name, a]) => [name, a.count]),
    );
    // A new dialog: render it through FloatingWindow, or add it here with the reason.
    expect(found).toEqual(allowed);
  });
});
