import "./theme.css";
import { useEffect, useState } from "react";
import { fetchMe } from "./account";
import styles from "./Menu.module.css";
import { PlayerBadge } from "./PlayerBadge";
import { ThemeHeader } from "./ThemeHeader";
import { WhatsNew } from "./WhatsNew";

/**
 * The `/` menu (M5a): Play vs bot, Play online (M9b, head to head; hotseat was removed in M5h),
 * the Deckbuilder, Debug and What's new (#134).
 */
export function App() {
  // #235: the players page link, for admins only (`/api/me` says so).
  const [admin, setAdmin] = useState(false);
  useEffect(() => {
    void fetchMe().then((me) => setAdmin(me?.admin === true));
  }, []);
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
        <a
          className={styles.item}
          href="/online"
          data-testid="menu-play-online"
        >
          Play online
        </a>
        <a className={styles.item} href="/decks" data-testid="menu-decks">
          Deckbuilder
        </a>
        {admin && (
          <a
            className={styles.item}
            href="/admin/players"
            data-testid="menu-admin-players"
          >
            Players (admin)
          </a>
        )}
        <a className={styles.debug} href="/debug" data-testid="menu-debug">
          Debug
        </a>
        <WhatsNew className={styles.whatsNew} />
      </main>
    </div>
  );
}
