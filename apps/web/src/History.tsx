import "./theme.css";
import { useEffect, useState } from "react";
import { fetchMyGames, type MyGame } from "./account";
import styles from "./History.module.css";
import { PlayerBadge } from "./PlayerBadge";
import { ThemeHeader } from "./ThemeHeader";

const RESULT: Record<NonNullable<MyGame["result"]>, string> = {
  win: "Won",
  loss: "Lost",
  draw: "Draw",
};

/** "Nov 1, 2026, 7:22 PM" in the player's own time zone. */
const when = (ms: number) =>
  new Date(ms).toLocaleString(undefined, {
    dateStyle: "medium",
    timeStyle: "short",
  });

/**
 * The signed-in player's games (#151): newest first, each with its result, date, bot level and
 * decks, and Load to replay it in `/play`. Without accounts (the password gate), a note says so.
 */
export function History() {
  const [games, setGames] = useState<MyGame[] | null | undefined>(undefined);
  useEffect(() => {
    void fetchMyGames().then(setGames);
  }, []);
  return (
    <div className="gojisim">
      <ThemeHeader />
      <main className={styles.history}>
        <h1 className={styles.title}>My games</h1>
        <PlayerBadge />
        {games === undefined ? (
          <p>Loading…</p>
        ) : games === null ? (
          <p data-testid="history-none">
            Sign in with Discord to see your games.
          </p>
        ) : games.length === 0 ? (
          <p data-testid="history-empty">
            No games yet. Finished games show here when Share finished games is
            on.
          </p>
        ) : (
          <ul className={styles.list} data-testid="history-list">
            {games.map((g) => (
              <li
                key={g.gameId}
                className={styles.row}
                data-testid="history-game"
              >
                <span
                  className={styles.result}
                  data-result={g.result ?? "open"}
                >
                  {g.result ? RESULT[g.result] : "In progress"}
                </span>
                <span className={styles.meta}>
                  {when(g.startedAt)}
                  {g.botLevel ? ` · vs ${g.botLevel}` : ""}
                  {g.deckNames ? ` · ${g.deckNames}` : ""}
                </span>
                <a
                  className={styles.load}
                  href={`/play?mode=bot&load=${encodeURIComponent(g.gameId)}`}
                  data-testid="history-load"
                >
                  Load
                </a>
              </li>
            ))}
          </ul>
        )}
        <a className={styles.back} href="/">
          Back to the menu
        </a>
      </main>
    </div>
  );
}
