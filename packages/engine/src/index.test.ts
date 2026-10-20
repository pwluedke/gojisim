import { describe, expect, it } from "vitest";
import { ENGINE_DEPENDENCIES, ENGINE_PACKAGE } from "./index";

describe("@gojisim/engine", () => {
  it("links @gojisim/cards through the workspace", () => {
    expect(ENGINE_PACKAGE).toBe("@gojisim/engine");
    expect(ENGINE_DEPENDENCIES).toContain("@gojisim/cards");
  });
});
