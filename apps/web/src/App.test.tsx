import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { App } from "./App";

describe("@gojisim/web", () => {
  it("renders the menu: the GojiSim heading, Play vs bot and Debug (no hotseat, M5h)", () => {
    const html = renderToStaticMarkup(<App />);
    expect(html).toContain(">GojiSim</h1>");
    expect(html).toContain('href="/play?mode=bot"');
    expect(html).toContain('href="/debug"');
    expect(html).not.toContain("hotseat");
    expect(html.match(/<a /g)).toHaveLength(2);
  });
});
