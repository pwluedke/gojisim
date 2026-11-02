import { PlayerBadge } from "./PlayerBadge";
import styles from "./ThemeHeader.module.css";

/**
 * The theme's header bar (Showa Poster, Oct 26, 2026): the GOJISIM! wordmark, then ゴジシム! in
 * katakana. Only a theme that sets `--header-display` shows it; the board's height leaves room
 * for `--header-h`.
 */
export function ThemeHeader() {
  return (
    <header className={styles.header} data-testid="theme-header">
      <span className={styles.wordmark}>GOJISIM!</span>
      <span className={styles.wordmarkJa} lang="ja">
        ゴジシム！
      </span>
      {/* #150: the signed-in player, at the bar's right end. */}
      <PlayerBadge className={styles.player} />
    </header>
  );
}
