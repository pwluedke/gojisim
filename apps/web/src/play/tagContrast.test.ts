import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

// M5h #4: the battle log tags draw their word with CSS (axe doesn't check pseudo-element text),
// so their contrast is checked here, in every theme: white text on each tag color, at least
// 4.5:1 (WCAG AA for small text).
const css = readFileSync(new URL("../theme.css", import.meta.url), "utf8");

function luminance(hex: string): number {
  const [r, g, b] = [1, 3, 5].map((i) => {
    const c = parseInt(hex.slice(i, i + 2), 16) / 255;
    return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
  }) as [number, number, number];
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

const ratio = (a: string, b: string) => {
  const [x, y] = [luminance(a), luminance(b)].sort((p, q) => q - p) as [
    number,
    number,
  ];
  return (x + 0.05) / (y + 0.05);
};

describe("battle log tag contrast (M5h #4)", () => {
  const themes = css
    .split(/:root\[data-theme="(showa|light|grey|dark)"\]/)
    .slice(1);
  const blocks = new Map<string, string>();
  // The variable block is each theme's first match (later rules, like Showa's form controls,
  // name the theme too).
  for (let i = 0; i < themes.length; i += 2)
    if (!blocks.has(themes[i] as string))
      blocks.set(themes[i] as string, themes[i + 1] as string);

  it.each(["showa", "light", "grey", "dark"])(
    "%s: every tag reads at 4.5:1 or more",
    (theme) => {
      const block = blocks.get(theme) ?? "";
      const value = (name: string) =>
        new RegExp(`--${name}: (#[0-9a-f]{6});`).exec(block)?.[1];
      const text = value("color-tag-text");
      expect(text).toBeDefined();
      for (const tag of ["destroy", "rage", "info", "play", "move", "combo"]) {
        const bg = value(`color-tag-${tag}`);
        expect(bg, tag).toBeDefined();
        expect(ratio(text as string, bg as string), tag).toBeGreaterThanOrEqual(
          4.5,
        );
      }
    },
  );
});
