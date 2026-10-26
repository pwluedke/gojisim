import { useState } from "react";

/** Card movement animation speed (M5f). */
export type AnimationSpeed = "off" | "normal" | "fast";

/** The theme (M5g): one variable set each in `theme.css`. Showa Poster is the default. */
export type Theme = "showa" | "dark" | "grey" | "light";

export const THEMES: readonly Theme[] = ["showa", "dark", "grey", "light"];

/** Each theme's name in Settings. */
export const THEME_NAMES: Record<Theme, string> = {
  showa: "Showa Poster",
  dark: "Dark",
  grey: "Grey",
  light: "Light",
};

/**
 * `/play` settings (M5c, M5d, M5f), saved in this browser under `gojisim.settings`. Storage
 * can be missing or blocked, so every read and write is guarded and the defaults always work.
 */
export interface Settings {
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
  /** The combo modal when a combo succeeds (M5g, default on); the log line always shows. */
  comboCallouts: boolean;
  /** Theme (M5g; default Showa Poster). `index.html` applies it before the first paint. */
  theme: Theme;
  /** "Undone: ..." lines in the battle log (M5h #10, default off). */
  showUndone: boolean;
  /** The invade arrow while a card is dragged over your discard pile (M5h #7, default on). */
  invadeArrow: boolean;
}

export const DEFAULT_SETTINGS: Settings = {
  botDelay: 600,
  showRules: false,
  expandedHand: true,
  animation: "normal",
  turnGlow: true,
  logCollapsed: false,
  comboCallouts: true,
  theme: "showa",
  showUndone: false,
  invadeArrow: true,
};

/** Applies a theme to the page (`:root[data-theme]`, see `theme.css`). */
export function applyTheme(theme: Theme): void {
  document.documentElement.dataset["theme"] = THEMES.includes(theme)
    ? theme
    : "showa";
}

const STORAGE_KEY = "gojisim.settings";

export function loadSettings(): Settings {
  try {
    const text = window.localStorage.getItem(STORAGE_KEY);
    const saved = text ? (JSON.parse(text) as Record<string, unknown>) : {};
    // Only known keys: removed settings (M5h: `hotseatCover`, `confirmPass`) drop quietly and
    // are gone after the next save.
    const known = Object.fromEntries(
      Object.entries(saved).filter(([key]) => key in DEFAULT_SETTINGS),
    ) as Partial<Settings>;
    return { ...DEFAULT_SETTINGS, ...known };
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
  const update = (change: Partial<Settings>) => {
    if (change.theme) applyTheme(change.theme);
    setSettings((current) => {
      const next = { ...current, ...change };
      saveSettings(next);
      return next;
    });
  };
  return [settings, update];
}
