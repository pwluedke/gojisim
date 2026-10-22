import { afterEach, describe, expect, it } from "vitest";
import { advance, cloneState, isFreezeGuardOn, setFreezeGuard } from "../src";
import { newGame } from "./fixtures/state";

describe("freeze guard for shared clone parts (decision 168)", () => {
  const was = isFreezeGuardOn();
  afterEach(() => setFreezeGuard(was));

  it("with the guard on, a write to a shared log entry or the card catalog throws", () => {
    setFreezeGuard(true);
    const state = advance(newGame());
    const copy = cloneState(state);
    const entry = copy.log[0];
    if (!entry) throw new Error("no log");
    // The entry is shared with `state`: changing it would silently change both states.
    expect(copy.log[0]).toBe(state.log[0]);
    expect(() => {
      (entry.payload as Record<string, unknown>)["rule"] = "x";
    }).toThrow(TypeError);
    expect(() => {
      copy.cards["1"] = copy.cards[
        Object.keys(copy.cards)[0] as string
      ] as never;
    }).toThrow(TypeError);
    // The rest of the state is a private copy and stays writable.
    copy.players[0].rage = 9;
    expect(state.players[0].rage).not.toBe(9);
  });

  it("with the guard off (production), nothing is frozen", () => {
    setFreezeGuard(false);
    const state = newGame();
    expect(Object.isFrozen(state.cards)).toBe(false);
    expect(Object.isFrozen(state.log[0])).toBe(false);
  });

  it("pnpm test runs with the guard on (GOJISIM_FREEZE=1)", () => {
    expect(was).toBe(
      (globalThis as { process?: { env?: Record<string, string | undefined> } })
        .process?.env?.["GOJISIM_FREEZE"] === "1",
    );
  });
});
