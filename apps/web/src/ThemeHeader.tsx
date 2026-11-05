import type { MouseEvent } from "react";
import { PlayerBadge } from "./PlayerBadge";
import styles from "./ThemeHeader.module.css";

/**
 * The theme's header bar (Showa Poster, Oct 26, 2026): the GOJISIM! wordmark, then ゴジシム! in
 * katakana. Only a theme that sets `--header-display` shows it; the board's height leaves room
 * for `--header-h`. #211: the wordmark links home (`/`); `onHome` may hold the click (a game in
 * progress asks first) by returning `false`.
 */
export function ThemeHeader({ onHome }: { onHome?: () => boolean } = {}) {
  const click = (e: MouseEvent<HTMLAnchorElement>) => {
    // A new tab or window (Cmd, Ctrl, Shift, the middle button) leaves this game alone.
    if (e.metaKey || e.ctrlKey || e.shiftKey || e.altKey || e.button !== 0)
      return;
    if (onHome && !onHome()) e.preventDefault();
  };
  return (
    <header className={styles.header} data-testid="theme-header">
      <a
        className={styles.home}
        href="/"
        aria-label="GojiSim home"
        data-testid="header-home"
        onClick={click}
      >
        <span className={styles.wordmark}>GOJISIM!</span>
        <span className={styles.wordmarkJa} lang="ja">
          ゴジシム！
        </span>
      </a>
      {/* #150: the signed-in player, at the bar's right end. */}
      <PlayerBadge className={styles.player} />
    </header>
  );
}
