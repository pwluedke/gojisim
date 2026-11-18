import { describe, expect, it } from "vitest";
import { keywordParts, tagLabel } from "./keywordTags";

describe("keyword tags in card text", () => {
  it("tags the keyword abilities and leaves timing words and traits plain", () => {
    expect(
      keywordParts(
        "[burst-1](You can play this card from rank I.)\n[enter] [mothra]",
      ),
    ).toEqual([
      { text: "[burst-1]", tag: true },
      {
        text: "(You can play this card from rank I.)\n[enter] [mothra]",
        tag: false,
      },
    ]);
  });

  it("tags [evolution], [awakening-N], [base], [revenge], [resonance], [bully] and [buddy]", () => {
    const text =
      "[evolution] [evolution-2] [awakening-3] [base] [revenge] [resonance] [bully] [buddy]";
    expect(
      keywordParts(text)
        .filter((p) => p.tag)
        .map((p) => p.text),
    ).toEqual(text.split(" "));
  });

  it("text without keywords is one plain part", () => {
    expect(keywordParts("[destroy] 1 card.")).toEqual([
      { text: "[destroy] 1 card.", tag: false },
    ]);
  });

  it("labels a tag as the printed cards do", () => {
    expect(tagLabel("[burst-1]")).toBe("Burst-1");
    expect(tagLabel("[bully]")).toBe("Bully");
  });
});
