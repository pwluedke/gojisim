import { useState } from "react";

/** Card movement animation speed (M5f). */
export type AnimationSpeed = "off" | "normal" | "fast";

/**
 * `/play` settings (M5c, M5d, M5f), saved in this browser under `gojisim.settings`. Storage
 * can be missing or blocked, so every read and write is guarded and the defaults always work.
 */
export interface Settings {
  /** Ask "Pass with playable cards left?" when a lit hand card exists (default on). */
  confirmPass: boolean;
  /** In hotseat, cover the board when the decider changes. */
  hotseatCover: boolean;
  /** Bot delay per action, 0 to 3,000 ms (M5d). */
  botDelay: number;
  /** Show rule numbers in the battle log (M5d, default off). */
  showRules: boolean;
  /** H opens the expanded hand (M5d, default on). */
  expandedHand: boolean;
  /** Card movement and destroy animations (M5f, default normal). */
  animation: AnimationSpeed;
  /** The turn player's mat border glows in their monster's colors (M5f, default on). */
  turnGlow: boolean;
  /** The battle log column is folded to a thin strip (M5f, button or L; default open). */
  logCollapsed: boolean;
  /** A banner on the board when a combo succeeds (M5g, default on); the log line always shows. */
  comboCallouts: boolean;
}

export const DEFAULT_SETTINGS: Settings = {
  confirmPass: true,
  hotseatCover: true,
  botDelay: 600,
  showRules: false,
  expandedHand: true,
  animation: "normal",
  turnGlow: true,
  logCollapsed: false,
  comboCallouts: true,
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
