import type { MouseEvent } from "react";
import { PlayerBadge } from "./PlayerBadge";
import styles from "./ThemeHeader.module.css";

/**
 * The theme's header (Showa Poster, Oct 26, 2026): the GOJISIM! wordmark with ゴジシム! in
 * katakana under it, and the signed-in player. Only a theme that sets `--header-display` shows
 * it. On the menu, new game and history screens it is a full-width bar (`--header-h`); on the
 * board (Paul, Nov 10) it is a `block` over the left panel, at the panel's width, with the player
 * under the wordmark, so the mat reaches the top of the screen. #211: the wordmark links home
 * (`/`); `onHome` may hold the click (a game in progress asks first) by returning `false`.
 */
export function ThemeHeader({
  onHome,
  block = false,
}: { onHome?: () => boolean; block?: boolean } = {}) {
  const click = (e: MouseEvent<HTMLAnchorElement>) => {
    // A new tab or window (Cmd, Ctrl, Shift, the middle button) leaves this game alone.
    if (e.metaKey || e.ctrlKey || e.shiftKey || e.altKey || e.button !== 0)
      return;
    if (onHome && !onHome()) e.preventDefault();
  };
  return (
    <header
      className={block ? styles.block : styles.header}
      data-testid="theme-header"
      data-header={block ? "block" : "bar"}
    >
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
      {/* #150: the signed-in player, at the bar's right end or under the block's wordmark. */}
      <PlayerBadge className={styles.player} />
    </header>
  );
}
