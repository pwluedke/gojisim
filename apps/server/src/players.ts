import { randomUUID } from "node:crypto";
import type { DatabaseSync } from "node:sqlite";

/**
 * Players (#150): one per Discord account, plus the fixed `smoke` player the post-deploy smoke
 * check signs in as. No email is stored.
 */
export interface Player {
  id: string;
  discordId: string | null;
  displayName: string;
  avatarUrl: string | null;
  createdAt: number;
  lastSeenAt: number;
  rolesCheckedAt: number | null;
}

/** The smoke check's player id (#92, #150). */
export const SMOKE_PLAYER_ID = "smoke";

interface Row {
  id: string;
  discord_id: string | null;
  display_name: string;
  avatar_url: string | null;
  created_at: number;
  last_seen_at: number;
  roles_checked_at: number | null;
}

const fromRow = (r: Row): Player => ({
  id: r.id,
  discordId: r.discord_id,
  displayName: r.display_name,
  avatarUrl: r.avatar_url,
  createdAt: r.created_at,
  lastSeenAt: r.last_seen_at,
  rolesCheckedAt: r.roles_checked_at,
});

export function playerById(db: DatabaseSync, id: string): Player | null {
  const row = db.prepare("SELECT * FROM players WHERE id = ?").get(id) as
    Row | undefined;
  return row ? fromRow(row) : null;
}

/** A Discord account's player, created on its first sign-in; name, avatar and times refreshed. */
export function upsertDiscordPlayer(
  db: DatabaseSync,
  account: { discordId: string; displayName: string; avatarUrl: string | null },
  now: number,
): Player {
  const existing = db
    .prepare("SELECT * FROM players WHERE discord_id = ?")
    .get(account.discordId) as Row | undefined;
  if (existing) {
    db.prepare(
      "UPDATE players SET display_name = ?, avatar_url = ?, last_seen_at = ?, roles_checked_at = ? WHERE id = ?",
    ).run(account.displayName, account.avatarUrl, now, now, existing.id);
  } else {
    db.prepare(
      "INSERT INTO players (id, discord_id, display_name, avatar_url, created_at, last_seen_at, roles_checked_at) VALUES (?, ?, ?, ?, ?, ?, ?)",
    ).run(
      randomUUID(),
      account.discordId,
      account.displayName,
      account.avatarUrl,
      now,
      now,
      now,
    );
  }
  return playerById(
    db,
    (
      db
        .prepare("SELECT id FROM players WHERE discord_id = ?")
        .get(account.discordId) as { id: string }
    ).id,
  ) as Player;
}

/** The smoke check's player, made on its first sign-in. */
export function smokePlayer(db: DatabaseSync, now: number): Player {
  db.prepare(
    "INSERT INTO players (id, discord_id, display_name, avatar_url, created_at, last_seen_at, roles_checked_at) VALUES (?, NULL, 'Smoke check', NULL, ?, ?, NULL) ON CONFLICT(id) DO UPDATE SET last_seen_at = excluded.last_seen_at",
  ).run(SMOKE_PLAYER_ID, now, now);
  return playerById(db, SMOKE_PLAYER_ID) as Player;
}

/** Marks the player seen now. */
export function touchPlayer(db: DatabaseSync, id: string, now: number): void {
  db.prepare("UPDATE players SET last_seen_at = ? WHERE id = ?").run(now, id);
}
