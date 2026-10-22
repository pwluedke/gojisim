/**
 * Freeze guard for the parts `cloneState` shares between states (decision 168): log entries and
 * the card catalog. With the guard on, they are deep-frozen when created, so any engine write to
 * them throws instead of silently changing every state that shares them. Off in production; tests
 * and stress turn it on with the environment variable `GOJISIM_FREEZE=1`.
 */
let guard =
  (globalThis as { process?: { env?: Record<string, string | undefined> } })
    .process?.env?.["GOJISIM_FREEZE"] === "1";

export function setFreezeGuard(on: boolean): void {
  guard = on;
}

export function isFreezeGuardOn(): boolean {
  return guard;
}

function deepFreeze<T>(value: T): T {
  if (value === null || typeof value !== "object" || Object.isFrozen(value))
    return value;
  Object.freeze(value);
  for (const key of Object.keys(value))
    deepFreeze((value as Record<string, unknown>)[key]);
  return value;
}

/** Deep-freezes a shared value when the guard is on; returns it either way. */
export function freezeShared<T>(value: T): T {
  return guard ? deepFreeze(value) : value;
}
