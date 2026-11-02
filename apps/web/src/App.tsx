import "./theme.css";
import styles from "./Menu.module.css";
import { PlayerBadge } from "./PlayerBadge";
import { ThemeHeader } from "./ThemeHeader";
import { WhatsNew } from "./WhatsNew";

/** The `/` menu (M5a): Play vs bot, Debug (hotseat was removed in M5h) and What's new (#134). */
export function App() {
  return (
    <div className="gojisim">
      <ThemeHeader />
      <main className={styles.menu}>
        <h1 className={styles.title}>GojiSim</h1>
        <PlayerBadge className={styles.player} />
        <a
          className={styles.item}
          href="/play?mode=bot"
          data-testid="menu-play-bot"
        >
          Play vs bot
        </a>
        <a className={styles.item} href="/decks" data-testid="menu-decks">
          Deckbuilder
        </a>
        <a className={styles.debug} href="/debug" data-testid="menu-debug">
          Debug
        </a>
        <WhatsNew className={styles.whatsNew} />
      </main>
    </div>
  );
}
