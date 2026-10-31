/**
 * `pnpm rollback` (#92): puts the previous release back live. Paul runs it on his Mac; Mecha
 * never does (CLAUDE.md: only Paul deploys). Pure helpers here; `rollbackMain.ts` runs git.
 */

export interface ReleaseTag {
  name: string;
  commit: string;
}

/**
 * The release to go back to: the tag before the one `release` is at now (tags newest first).
 * When `release` isn't at a tagged commit (a push with no new PRs makes no release), the newest
 * tag at another commit. `null` when there's nothing older.
 */
export function rollbackTarget(
  tags: readonly ReleaseTag[],
  current: string,
): ReleaseTag | null {
  const at = tags.findIndex((t) => t.commit === current);
  const older = at >= 0 ? tags.slice(at + 1) : tags;
  return older.find((t) => t.commit !== current) ?? null;
}
