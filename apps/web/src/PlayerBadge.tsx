import { useEffect, useState } from "react";
import { fetchMe, type Me } from "./account";
import styles from "./PlayerBadge.module.css";

/**
 * The signed-in player (#150): Discord avatar (or initial), display name, and Sign out (a POST,
 * so a link elsewhere can't sign anyone out). Nothing shows without accounts (the password gate).
 */
export function PlayerBadge({ className }: { className?: string | undefined }) {
  const [player, setPlayer] = useState<Me | null>(null);
  useEffect(() => {
    let live = true;
    void fetchMe().then((p) => {
      if (live) setPlayer(p);
    });
    return () => {
      live = false;
    };
  }, []);
  if (!player) return null;
  return (
    <span
      className={`${styles.badge}${className ? ` ${className}` : ""}`}
      data-testid="player-badge"
    >
      {player.avatarUrl ? (
        <img className={styles.avatar} src={player.avatarUrl} alt="" />
      ) : (
        <span className={styles.avatar} aria-hidden="true">
          {player.name.slice(0, 1).toUpperCase()}
        </span>
      )}
      <span className={styles.name} data-testid="player-name">
        {player.name}
      </span>
      <form className={styles.signOut} method="post" action="/auth/logout">
        <button type="submit" data-testid="sign-out">
          Sign out
        </button>
      </form>
    </span>
  );
}
