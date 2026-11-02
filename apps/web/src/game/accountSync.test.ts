import { describe, expect, it } from "vitest";
import { settingsWinner } from "../play/settings";
import {
  type AccountDeck,
  answerOffer,
  freeName,
  mergeDecks,
  offerAnswered,
  uploadPlan,
} from "./accountSync";
import type { SavedDeck } from "./deckStore";

const T = (min: number) =>
  new Date(Date.UTC(2026, 10, 1, 20, min)).toISOString();
const local = (
  id: string,
  name: string,
  at: string,
  list = `[deck] ${name}\n4 ESD01-001`,
): SavedDeck => ({
  id,
  name,
  list,
  savedAt: at,
  updatedAt: at,
});
const remote = (
  id: string,
  name: string,
  at: string,
  deleted = false,
): AccountDeck => ({
  id,
  name,
  list: `[deck] ${name}\n4 ESD01-001`,
  updatedAt: at,
  deleted,
});

describe("decks follow the player (#152)", () => {
  it("the account wins for a deck both have, unless this browser edited it later", () => {
    const m = mergeDecks(
      [local("d1", "Old name", T(1)), local("d2", "Mine newer", T(30))],
      [remote("d1", "New name", T(10)), remote("d2", "Theirs", T(20))],
    );
    expect(m.decks.map((d) => d.name)).toEqual(["New name", "Mine newer"]);
    expect(m.push.map((d) => d.id)).toEqual(["d2"]);
    expect(m.localOnly).toEqual([]);
  });

  it("a deck deleted in another browser goes here too, unless edited here after the delete", () => {
    const m = mergeDecks(
      [local("d1", "A", T(1)), local("d2", "B", T(40))],
      [remote("d1", "", T(10), true), remote("d2", "", T(10), true)],
    );
    expect(m.decks.map((d) => d.id)).toEqual(["d2"]);
    expect(m.push.map((d) => d.id)).toEqual(["d2"]);
  });

  it("the account's decks this browser doesn't have arrive; this browser's own stay and are offered", () => {
    const m = mergeDecks(
      [local("mine", "Only here", T(1))],
      [remote("acct", "From account", T(5)), remote("gone", "", T(5), true)],
    );
    expect(m.decks.map((d) => d.name)).toEqual(["Only here", "From account"]);
    expect(m.localOnly.map((d) => d.id)).toEqual(["mine"]);
  });

  it("a deck from before #152 (no edit time) uses its save time", () => {
    const old: SavedDeck = {
      id: "d1",
      name: "Old",
      list: "[deck] Old\n4 ESD01-001",
      savedAt: T(50),
    };
    expect(
      mergeDecks([old], [remote("d1", "Account", T(10))]).decks[0]?.name,
    ).toBe("Old");
  });

  it("the upload offer merges by name: new names upload, the same deck is nothing to do, a different deck under the same name asks", () => {
    const account = [
      local("a1", "Red Rush", T(1)),
      local("a2", "Blue Wall", T(1), "[deck] Blue Wall\n4 ESD02-001"),
    ];
    const plan = uploadPlan(
      [
        local("l1", "Green", T(2)),
        local("l2", "red rush", T(2)),
        local("l3", "Blue Wall", T(2), "[deck] Blue Wall\n4 ESD01-001"),
      ],
      account,
    );
    expect(plan.upload.map((d) => d.id)).toEqual(["l1"]);
    expect(plan.same.map((d) => d.id)).toEqual(["l2"]);
    expect(plan.clashes.map((c) => [c.local.id, c.account.id])).toEqual([
      ["l3", "a2"],
    ]);
  });

  it("keeping both names this browser's copy freely", () => {
    expect(freeName("Red", ["Red"])).toBe("Red (this browser)");
    expect(freeName("Red", ["Red", "red (this browser)"])).toBe(
      "Red (this browser 2)",
    );
  });

  it("the offer is asked once per browser and player", () => {
    const store = new Map<string, string>();
    const storage = {
      getItem: (k: string) => store.get(k) ?? null,
      setItem: (k: string, v: string) => void store.set(k, v),
    };
    expect(offerAnswered("p1", storage)).toBe(false);
    answerOffer("p1", storage);
    expect(offerAnswered("p1", storage)).toBe(true);
    expect(offerAnswered("p2", storage)).toBe(false);
  });
});

describe("settings follow the player (#152)", () => {
  it("the account's copy wins at sign-in, unless this browser changed its own later or the account has none", () => {
    expect(
      settingsWinner({ settings: { theme: "grey" }, updatedAt: T(10) }, T(5)),
    ).toBe("account");
    expect(
      settingsWinner({ settings: { theme: "grey" }, updatedAt: T(10) }, null),
    ).toBe("account");
    expect(
      settingsWinner({ settings: { theme: "grey" }, updatedAt: T(10) }, T(20)),
    ).toBe("browser");
    expect(settingsWinner({ settings: null, updatedAt: null }, null)).toBe(
      "browser",
    );
  });
});
