# Unreleased release notes

Each PR that changes what Paul or the testers see adds one file here, named `<issue>-<slug>.md` (for example `99-card-sounds.md`; the PR's number isn't known before it opens). Open PRs then never conflict on `docs/release-notes.md`.

The file is the entry without its date or PR number: a `# ` title line, then the four sections, in plain words for Paul and the testers:

```markdown
# Card sounds for 14 much-played cards

### What changed

- ...

### Fixed

- Nothing.

### Testing notes

- ...

### Known issues

- None known.
```

When Paul deploys, `pnpm release-notes` moves every file here that is on `main` into `docs/release-notes.md` as `## #<PR> <title> (<merge date>)`, newest merge first, reading the PR number and the date from the merge commit, and removes the files, through a PR that merges itself once `ci` passes.

CI fails a PR that changes `apps/` or `packages/` without a file here. A PR testers can't see (docs, tools, CI) takes the `no-release-notes` label instead; re-run the Release notes job after adding it.
