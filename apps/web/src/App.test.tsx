import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { App } from "./App";

describe("@gojisim/web", () => {
  it("renders the GojiSim heading", () => {
    expect(renderToStaticMarkup(<App />)).toBe("<h1>GojiSim</h1>");
  });
});
