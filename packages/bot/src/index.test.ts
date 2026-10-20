import { describe, expect, it } from "vitest";
import { BOT_DEPENDENCIES, BOT_PACKAGE } from "./index";

describe("@gojisim/bot", () => {
  it("links @gojisim/engine through the workspace", () => {
    expect(BOT_PACKAGE).toBe("@gojisim/bot");
    expect(BOT_DEPENDENCIES).toEqual(["@gojisim/engine", "@gojisim/cards"]);
  });
});
