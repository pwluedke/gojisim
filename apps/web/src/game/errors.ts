import type { Action } from "@gojisim/engine";

/**
 * What went wrong last in this page (#105; #95 will upload from the same capture): the human's
 * last answer, kept even when applying it threw (a crashing action is never saved in the record),
 * and the last error: a thrown action, a bot error, or an uncaught error or unhandled rejection.
 * Both are cleared when a game starts, so a report only carries this game's. #95 listens here to
 * upload the first error from the app's own code as the game's crash.
 */

export interface CapturedError {
  message: string;
  stack?: string;
  /** Where it came from: a human action, the bot, or the page (`error` / `unhandledrejection`). */
  source: "action" | "bot" | "window" | "rejection";
  at: string;
}

export interface LastAnswer {
  action: Action;
  /** The action in the battle log's wording at the time. */
  label: string;
  at: string;
  /** Set when applying it threw. */
  error?: string;
}

let lastAnswer: LastAnswer | null = null;
let lastError: CapturedError | null = null;
/** #95: who hears about each error as it is recorded (the crash upload). */
const listeners = new Set<(error: CapturedError) => void>();

/** Calls `listener` with every error recorded from now on; returns the unsubscribe. */
export function onError(listener: (error: CapturedError) => void): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

/**
 * #95: whether an error came from the app's own code: a frame of its stack names a script on the
 * site's origin. Errors from browser extensions, third-party scripts or with no stack (a cross-origin
 * "Script error.") are left out.
 */
export function isAppError(
  error: Pick<CapturedError, "stack">,
  origin: string,
): boolean {
  return stackFrames(error.stack).some((line) => line.includes(`${origin}/`));
}

/**
 * The lines of a stack that are frames: V8's `    at fn (url:line:col)` and Firefox's and
 * Safari's `fn@url:line:col` (Safari's top level is `global code@url…`). A message line (V8's first line, which may quote a URL) isn't one.
 */
export function stackFrames(stack: string | undefined): string[] {
  return (stack ?? "")
    .split("\n")
    .filter(
      (line) =>
        /^\s*at\s/.test(line) || /^[^@]*@\S+:\d+:\d+$/.test(line.trim()),
    );
}

function describe(err: unknown): { message: string; stack?: string } {
  if (err instanceof Error)
    return { message: err.message, ...(err.stack ? { stack: err.stack } : {}) };
  return { message: String(err) };
}

/** Keeps `err` as the last error and returns it. */
export function recordError(
  err: unknown,
  source: CapturedError["source"],
): CapturedError {
  const captured: CapturedError = {
    ...describe(err),
    source,
    at: new Date().toISOString(),
  };
  lastError = captured;
  for (const listener of listeners) listener(captured);
  return captured;
}

/** Keeps the human's answer before it is applied; `answerFailed` marks it if applying threw. */
export function recordAnswer(action: Action, label: string): void {
  lastAnswer = { action, label, at: new Date().toISOString() };
}

export function answerFailed(err: unknown): void {
  if (lastAnswer) lastAnswer = { ...lastAnswer, error: describe(err).message };
  recordError(err, "action");
}

export const getLastAnswer = (): LastAnswer | null => lastAnswer;
export const getLastError = (): CapturedError | null => lastError;

/** A new game: nothing from an earlier one is reported. */
export function clearCapture(): void {
  lastAnswer = null;
  lastError = null;
}

/** Listens for uncaught errors and unhandled rejections; returns the cleanup. */
export function installErrorCapture(target: Window = window): () => void {
  const onError = (e: ErrorEvent) => {
    recordError(e.error ?? e.message, "window");
  };
  const onRejection = (e: PromiseRejectionEvent) => {
    recordError(e.reason, "rejection");
  };
  target.addEventListener("error", onError);
  target.addEventListener("unhandledrejection", onRejection);
  return () => {
    target.removeEventListener("error", onError);
    target.removeEventListener("unhandledrejection", onRejection);
  };
}
