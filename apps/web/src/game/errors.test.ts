import { afterEach, describe, expect, it } from "vitest";
import {
  answerFailed,
  clearCapture,
  getLastAnswer,
  getLastError,
  installErrorCapture,
  isAppError,
  recordAnswer,
  recordError,
  stackFrames,
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

  it("#95: isAppError reads Chrome, Firefox and Safari stacks; only frames count, not the message line", () => {
    const origin = "https://gojisim.somanygames.app";
    const app = `${origin}/assets/index-abc.js`;
    const cases: [string, string, boolean][] = [
      // Chrome (V8): a message line, then "at" frames.
      [
        "Chrome",
        `Error: boom\n    at play (${app}:1:2345)\n    at run (${app}:1:99)`,
        true,
      ],
      [
        "Chrome, an extension's frame only",
        "Error: boom\n    at x (chrome-extension://abc/content.js:1:1)",
        false,
      ],
      [
        "Chrome, the site's URL only in the message",
        `Error: fetch ${origin}/api/games failed\n    at x (chrome-extension://abc/c.js:1:1)`,
        false,
      ],
      // Firefox: no message line; the first line is already a frame.
      ["Firefox", `play@${app}:1:2345\nrun@${app}:1:99`, true],
      [
        "Firefox, an extension's frame only",
        "x@moz-extension://abc/content.js:1:1",
        false,
      ],
      // Safari: no message line either; the top level is "global code@".
      ["Safari", `play@${app}:1:2345\nglobal code@${app}:1:10`, true],
      ["Safari, top level only", `global code@${app}:1:10`, true],
      [
        "Safari, another site's script",
        "global code@https://cdn.example.com/lib.js:1:1",
        false,
      ],
      ["no stack", "", false],
    ];
    for (const [name, stack, expected] of cases)
      expect(isAppError({ stack }, origin), name).toBe(expected);
    expect(stackFrames(`Error: boom\n    at play (${app}:1:2)`)).toEqual([
      `    at play (${app}:1:2)`,
    ]);
    expect(stackFrames(`global code@${app}:1:10`)).toEqual([
      `global code@${app}:1:10`,
    ]);
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
