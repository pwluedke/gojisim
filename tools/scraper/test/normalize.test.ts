import { describe, expect, it } from "vitest";
import { displayCardNumber } from "../src/normalize";
import type { SitePrint } from "../src/parse";

function print(set_number: string, card_number: string): SitePrint {
  return {
    id: 1,
    parent_id: null,
    set_number,
    release_set: null,
    name: "x",
    rank: null,
    invade: null,
    color: "blank",
    type: "rage",
    trait: null,
    property: null,
    text: null,
    card_number,
    rarity: "C",
    strength: null,
    notes: null,
  };
}

describe("displayCardNumber", () => {
  it.each([
    ["EBP01", "030", "EBP01-030"],
    ["EBP01", "030+", "EBP01-030+"],
    ["EBP02", "T01", "EBP02-T01"],
    ["PR", "7", "PR-007"],
    ["PR", "EBP01-030++", "EBP01-030++"],
    ["EBP01", "001-foil", "EBP01-001 (Foil)"],
    ["EBP01", "001-ALT", "EBP01-001 (Alt)"],
  ])("%s / %s -> %s", (set, num, expected) => {
    expect(displayCardNumber(print(set, num))).toBe(expected);
  });
});
