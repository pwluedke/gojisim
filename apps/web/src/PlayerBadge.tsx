import { useEffect, useState } from "react";
import { BETA_NOTE, fetchMe, type Me } from "./account";
import styles from "./PlayerBadge.module.css";

/**
 * The signed-in player (#150): Discord avatar (or initial), display name, and Sign out (a POST,
 * so a link elsewhere can't sign anyone out). Nothing shows without accounts (the password gate).
 * `stacked` (Paul, Nov 10, Showa's header block on the board): the name on its own line, whole,
 * then My games and Sign out as small links on one line under it.
 */
export function PlayerBadge({
  className,
  stacked = false,
}: {
  className?: string | undefined;
  stacked?: boolean;
}) {
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
  const who = (
    <>
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
      {player.season === "beta" && (
        // #153: until the launch reset, games are beta games.
        <span className={styles.beta} data-testid="beta-tag" title={BETA_NOTE}>
          Beta
        </span>
      )}
    </>
  );
  const links = (
    <>
      {/* #151: the player's own games. */}
      <a className={styles.games} href="/history" data-testid="my-games">
        My games
      </a>
      <form className={styles.signOut} method="post" action="/auth/logout">
        <button type="submit" data-testid="sign-out">
          Sign out
        </button>
      </form>
    </>
  );
  const classes = [styles.badge, stacked ? styles.stacked : "", className ?? ""]
    .filter(Boolean)
    .join(" ");
  return (
    <span className={classes} data-testid="player-badge">
      {stacked ? (
        <>
          <span className={styles.who} data-testid="player-who">
            {who}
          </span>
          <span className={styles.links} data-testid="player-links">
            {links}
          </span>
        </>
      ) : (
        <>
          {who}
          {links}
        </>
      )}
    </span>
  );
}
