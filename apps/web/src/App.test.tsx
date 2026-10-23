import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { App } from "./App";

describe("@gojisim/web", () => {
  it("renders the menu: the GojiSim heading and its three screens", () => {
    const html = renderToStaticMarkup(<App />);
    expect(html).toContain(">GojiSim</h1>");
    expect(html).toContain('href="/play?mode=bot"');
    expect(html).toContain('href="/play?mode=hotseat"');
    expect(html).toContain('href="/debug"');
  });
});
