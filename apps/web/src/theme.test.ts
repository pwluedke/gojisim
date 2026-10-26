import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const css = readFileSync(new URL("./theme.css", import.meta.url), "utf8");

/** The custom properties a theme's block defines (`:root[data-theme="name"] { ... }`). */
function themeVariables(name: string): Set<string> {
  const at = css.indexOf(`:root[data-theme="${name}"]`);
  if (at < 0) throw new Error(`no ${name} theme`);
  const body = css.slice(css.indexOf("{", at) + 1, css.indexOf("}", at));
  return new Set(
    [...body.matchAll(/(--[a-z0-9-]+)\s*:/g)].map((m) => m[1] as string),
  );
}

/** Showa Poster's own palette names, used only by its header and fight card. */
const SHOWA_ONLY = ["--color-ink", "--color-poster-red", "--color-marigold"];

describe("themes (M5g)", () => {
  it("every theme defines every variable the light theme defines, and no extra ones", () => {
    const light = themeVariables("light");
    expect(light.size).toBeGreaterThan(40);
    for (const name of ["grey", "dark"])
      expect([...themeVariables(name)].sort(), name).toEqual([...light].sort());
    // Showa Poster adds only its palette names.
    expect([...themeVariables("showa")].sort()).toEqual(
      [...light, ...SHOWA_ONLY].sort(),
    );
  });

  it("colors live only in the theme blocks: none outside them in theme.css", () => {
    const outside = css.replace(/:root[^{]*\{[^}]*\}/g, "");
    expect(outside).not.toMatch(/#[0-9a-fA-F]{3,8}\b|rgb\(/);
  });

  it("Showa Poster is the default (the plain :root block, Oct 26, 2026)", () => {
    expect(css).toMatch(/:root,\s*:root\[data-theme="showa"\]/);
    expect(css).not.toMatch(/:root,\s*:root\[data-theme="grey"\]/);
  });
});
