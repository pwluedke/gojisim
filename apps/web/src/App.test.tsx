import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { App } from "./App";

describe("@gojisim/web", () => {
  it("renders the menu: the GojiSim heading, Play vs bot, Debug (no hotseat, M5h) and What's new (#134)", () => {
    const html = renderToStaticMarkup(<App />);
    expect(html).toContain(">GojiSim</h1>");
    expect(html).toContain('href="/play?mode=bot"');
    expect(html).toContain('href="/debug"');
    expect(html).not.toContain("hotseat");
    // Play vs bot, Debug and What's new (#134).
    expect(html.match(/<a /g)).toHaveLength(4);
    // #157: the Deckbuilder.
    expect(html).toContain('href="/decks"');
    expect(html).toContain(
      'href="https://github.com/pwluedke/gojisim/releases/latest"',
    );
  });
});
