import { afterEach, describe, expect, it } from "vitest";
import { DEFAULT_SETTINGS, loadSettings } from "./settings";

describe("settings", () => {
  const store = new Map<string, string>();
  const g = globalThis as { window?: unknown };
  afterEach(() => {
    delete g.window;
    store.clear();
  });

  it("Skip First / Second pick defaults off and reads back what was saved", () => {
    expect(DEFAULT_SETTINGS.skipFirstPick).toBe(false);
    g.window = {
      localStorage: {
        getItem: (k: string) => store.get(k) ?? null,
        setItem: (k: string, v: string) => store.set(k, v),
      },
    };
    expect(loadSettings().skipFirstPick).toBe(false);
    store.set("gojisim.settings", JSON.stringify({ skipFirstPick: true }));
    expect(loadSettings().skipFirstPick).toBe(true);
  });
});
