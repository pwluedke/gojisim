import "./theme.css";
import styles from "./Menu.module.css";
import { ThemeHeader } from "./ThemeHeader";

/** The `/` menu (M5a): Play vs bot and Debug (hotseat was removed in M5h). */
export function App() {
  return (
    <div className="gojisim">
      <ThemeHeader />
      <main className={styles.menu}>
        <h1 className={styles.title}>GojiSim</h1>
        <a
          className={styles.item}
          href="/play?mode=bot"
          data-testid="menu-play-bot"
        >
          Play vs bot
        </a>
        <a className={styles.debug} href="/debug" data-testid="menu-debug">
          Debug
        </a>
      </main>
    </div>
  );
}
