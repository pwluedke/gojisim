import { describe, expect, it } from "vitest";
import { allRules, ruleByNumber } from "./rules";

describe("Comprehensive Rules v1.2 parser (M5h #11)", () => {
  it("parses numbered rules with their body numbers and text", () => {
    expect(ruleByNumber("7.2.2")?.text).toBe(
      "The turn player draws a number of cards equal to the rank of their opponent’s invading monster.",
    );
    expect(ruleByNumber("1.2.1.1")?.depth).toBe(4);
  });

  it("keeps section headings with no trailing dot (7.2 Start Phase)", () => {
    expect(ruleByNumber("7.2")?.text).toBe("Start Phase");
    expect(ruleByNumber("1.1")?.text).toBe("Number of Players");
  });

  it("keeps a wrapped cross-reference inside its rule (7.5.7 mentions 7.5.5)", () => {
    expect(ruleByNumber("7.5.7")?.text).toContain(
      "check timing in 7.5.5 did not resolve",
    );
    expect(ruleByNumber("7.5.7")?.text).toContain("go back to 7.5.4.");
  });

  it("skips the table of contents and page markers, and numbers ascend", () => {
    const rules = allRules();
    expect(rules[0]?.number).toBe("1");
    expect(rules.some((r) => r.text.includes("====="))).toBe(false);
    // 461 rules and headings in v1.2.
    expect(rules.length).toBe(461);
    const numbers = rules.map((r) => r.number);
    expect(new Set(numbers).size).toBe(numbers.length);
  });
});
