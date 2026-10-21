import type { PlayerId, ZoneNumber } from "./types";

/** A zone on a specific player's field. */
export interface ZoneRef {
  player: PlayerId;
  zone: ZoneNumber;
}

const IN_FRONT: Partial<Record<ZoneNumber, ZoneNumber>> = { 3: 8, 4: 7, 5: 6 };
const BEHIND: Partial<Record<ZoneNumber, ZoneNumber>> = { 8: 3, 7: 4, 6: 5 };

/** The zone in front of `zone` (8 is in front of 3, 7 of 4, 6 of 5), or `null` (4.4.5.1). */
export function inFrontOf(zone: ZoneNumber): ZoneNumber | null {
  return IN_FRONT[zone] ?? null;
}

/** The zone behind `zone` (3 is behind 8, 4 behind 7, 5 behind 6), or `null` (4.4.5.1). */
export function behind(zone: ZoneNumber): ZoneNumber | null {
  return BEHIND[zone] ?? null;
}

/**
 * Adjacent (4.4.5.2): one player's zones whose numbers differ by 1 or that are in front of /
 * behind each other, or a player's zone 8 and the opponent's zone 8.
 */
export function isAdjacent(a: ZoneRef, b: ZoneRef): boolean {
  if (a.player !== b.player) return a.zone === 8 && b.zone === 8;
  return (
    Math.abs(a.zone - b.zone) === 1 ||
    inFrontOf(a.zone) === b.zone ||
    behind(a.zone) === b.zone
  );
}

/** `zone` is before `reference`: same player, lower or equal number (4.4.5.3, 4.4.5.3.1). */
export function isBefore(zone: ZoneRef, reference: ZoneRef): boolean {
  return zone.player === reference.player && zone.zone <= reference.zone;
}

/** `zone` is beyond `reference`: same player, higher or equal number (4.4.5.3, 4.4.5.3.1). */
export function isBeyond(zone: ZoneRef, reference: ZoneRef): boolean {
  return zone.player === reference.player && zone.zone >= reference.zone;
}

/** Left-to-right position from the owner's view: 1, 2, {3, 8}, {4, 7}, {5, 6} (4.4.5.5.1). */
const OWN_POSITION: Record<ZoneNumber, number> = {
  1: 0,
  2: 1,
  3: 2,
  8: 2,
  4: 3,
  7: 3,
  5: 4,
  6: 4,
};

/**
 * Left-to-right position (0 = leftmost) of a zone as seen by `viewer`. The opponent's zones are
 * mirrored (4.4.5.5.2), so a position is also the column index across the table.
 */
export function leftRightPosition(ref: ZoneRef, viewer: PlayerId): number {
  const own = OWN_POSITION[ref.zone];
  return ref.player === viewer ? own : 4 - own;
}

/** `a` is further left than `b` from `viewer`'s perspective (4.4.5.5). Same position: false. */
export function isLeftOf(a: ZoneRef, b: ZoneRef, viewer: PlayerId): boolean {
  return leftRightPosition(a, viewer) < leftRightPosition(b, viewer);
}

/** `a` is further right than `b` from `viewer`'s perspective (4.4.5.5). Same position: false. */
export function isRightOf(a: ZoneRef, b: ZoneRef, viewer: PlayerId): boolean {
  return leftRightPosition(a, viewer) > leftRightPosition(b, viewer);
}

/**
 * Same column (4.4.5.4): a player's zone 1 and the opponent's 5 and 6, zone 2 and the opponent's
 * 4 and 7, zones 3 and 8 and the opponent's 3 and 8. Only zones of different players.
 */
export function sameColumn(a: ZoneRef, b: ZoneRef): boolean {
  return (
    a.player !== b.player &&
    leftRightPosition(a, a.player) === leftRightPosition(b, a.player)
  );
}
