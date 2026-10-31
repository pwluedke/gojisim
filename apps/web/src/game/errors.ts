import type { Action } from "@gojisim/engine";

/**
 * What went wrong last in this page (#105; #95 will upload from the same capture): the human's
 * last answer, kept even when applying it threw (a crashing action is never saved in the record),
 * and the last error: a thrown action, a bot error, or an uncaught error or unhandled rejection.
 * Both are cleared when a game starts, so a report only carries this game's.
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
  lastError = { ...describe(err), source, at: new Date().toISOString() };
  return lastError;
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
