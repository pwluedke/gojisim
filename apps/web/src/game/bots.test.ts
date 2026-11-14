import { PRESETS } from "@gojisim/bot";
import { describe, expect, it } from "vitest";
import {
  BETA_BOT_DIFFICULTY,
  defaultBotDifficulty,
  lockSeat,
  seatFromRecord,
} from "./bots";

/** Beta (Paul, Nov 13, 2026): every new game's bot seat plays at the locked level. */
describe("the beta bot level lock", () => {
  it("is 100", () => {
    expect(BETA_BOT_DIFFICULTY).toBe(100);
  });

  it("a bot seat saved at Easy or Medium plays at 100; a human seat stays human", () => {
    expect(lockSeat({ kind: "bot", difficulty: PRESETS.easy })).toEqual({
      kind: "bot",
      difficulty: 100,
    });
    expect(lockSeat({ kind: "bot", difficulty: PRESETS.medium })).toEqual({
      kind: "bot",
      difficulty: 100,
    });
    expect(lockSeat({ kind: "human" })).toEqual({ kind: "human" });
  });

  it("new bot seats start at 100", () => {
    expect(defaultBotDifficulty()).toBe(100);
  });

  it("a loaded record keeps its recorded level", () => {
    expect(
      seatFromRecord({
        kind: "bot",
        bot: "ismcts",
        settings: { difficulty: PRESETS.easy },
      }),
    ).toEqual({ kind: "bot", difficulty: PRESETS.easy });
  });
});
