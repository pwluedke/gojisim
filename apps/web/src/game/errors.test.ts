import { afterEach, describe, expect, it } from "vitest";
import {
  answerFailed,
  clearCapture,
  getLastAnswer,
  getLastError,
  installErrorCapture,
  recordAnswer,
  recordError,
} from "./errors";

const pass = { type: "pass", player: "P1" } as const;

describe("error capture for Report bug (#105)", () => {
  afterEach(clearCapture);

  it("keeps the last answer, marked with the error when applying it threw", () => {
    recordAnswer(pass, "Pass");
    expect(getLastAnswer()).toMatchObject({ action: pass, label: "Pass" });
    expect(getLastAnswer()?.error).toBeUndefined();
    answerFailed(
      new Error("not implemented: a replacement effect that needs a choice"),
    );
    expect(getLastAnswer()?.error).toBe(
      "not implemented: a replacement effect that needs a choice",
    );
    expect(getLastError()).toMatchObject({
      source: "action",
      message: "not implemented: a replacement effect that needs a choice",
    });
    expect(getLastError()?.stack).toContain("Error");
  });

  it("the last error wins; a new game clears both", () => {
    recordError("first", "bot");
    recordError(new Error("second"), "window");
    expect(getLastError()).toMatchObject({
      message: "second",
      source: "window",
    });
    recordAnswer(pass, "Pass");
    clearCapture();
    expect(getLastError()).toBeNull();
    expect(getLastAnswer()).toBeNull();
  });

  it("listens for uncaught errors and unhandled rejections until cleaned up", () => {
    const listeners = new Map<string, (e: unknown) => void>();
    const target = {
      addEventListener: (type: string, fn: (e: unknown) => void) =>
        listeners.set(type, fn),
      removeEventListener: (type: string) => listeners.delete(type),
    } as unknown as Window;
    const stop = installErrorCapture(target);
    listeners.get("error")?.({
      error: new Error("uncaught"),
      message: "uncaught",
    });
    expect(getLastError()).toMatchObject({
      message: "uncaught",
      source: "window",
    });
    listeners.get("unhandledrejection")?.({ reason: "rejected" });
    expect(getLastError()).toMatchObject({
      message: "rejected",
      source: "rejection",
    });
    stop();
    expect(listeners.size).toBe(0);
  });
});
