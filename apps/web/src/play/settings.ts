import { useState } from "react";

/**
 * `/play` settings (M5c; the full Settings panel comes in M5d), saved in this browser. Storage
 * can be missing or blocked, so every read and write is guarded and the defaults always work.
 */
export interface Settings {
  /** Ask "Pass with playable cards left?" when a lit hand card exists (default on). */
  confirmPass: boolean;
  /** In hotseat, cover the board when the decider changes or before a private choice. */
  hotseatCover: boolean;
}

export const DEFAULT_SETTINGS: Settings = {
  confirmPass: true,
  hotseatCover: true,
};

const STORAGE_KEY = "gojisim.settings";

export function loadSettings(): Settings {
  try {
    const text = window.localStorage.getItem(STORAGE_KEY);
    const saved = text ? (JSON.parse(text) as Partial<Settings>) : {};
    return { ...DEFAULT_SETTINGS, ...saved };
  } catch {
    return DEFAULT_SETTINGS;
  }
}

function saveSettings(settings: Settings): void {
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(settings));
  } catch {
    // Storage blocked or full: the setting still holds for this page view.
  }
}

export function useSettings(): [Settings, (change: Partial<Settings>) => void] {
  const [settings, setSettings] = useState(loadSettings);
  const update = (change: Partial<Settings>) =>
    setSettings((current) => {
      const next = { ...current, ...change };
      saveSettings(next);
      return next;
    });
  return [settings, update];
}
