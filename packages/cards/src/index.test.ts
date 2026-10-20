import { describe, expect, it } from "vitest";
import { CARDS_PACKAGE } from "./index";

describe("@gojisim/cards", () => {
  it("exports its package name", () => {
    expect(CARDS_PACKAGE).toBe("@gojisim/cards");
  });
});
