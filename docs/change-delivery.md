# Deliver a change from local development to production

This checklist is for contributors and maintainers taking a reviewed change through
the nightly channel. Start with the [contributor commands](../CONTRIBUTOR_COMMANDS.md)
for toolchain setup and the [release operations](release-operations.md) for the
current publication procedure. Each document owns its commands; this checklist
connects the stages without duplicating the release runbook.

## Prepare the change

- [ ] Fetch the canonical upstream and work on a feature branch based on the intended
  source. Preserve unrelated local changes, prototypes, stashes, and existing commits.
- [ ] Define the user-visible outcome and the relevant API, accessibility, browser,
  package, and documentation contracts before editing.
- [ ] Make focused changes and run the affected tests. For a phased change, keep each
  phase reviewable and record what was checked before committing it.
- [ ] Update the authoritative documentation, executable examples, and `Unreleased`
  changelog notes that explain changed behavior.
- [ ] For responsive changes, check the calendar container independently of browser
  viewport width. Follow the [browser policy](browser-support.md) and
  [accessibility contract](../ACCESSIBILITY.md).

## Review screenshots and commit

- [ ] Run screenshot preparation after source and build inputs settle. Review the
  generated before/after gallery using the [screenshot procedure](screenshots/README.md).
  An unchanged image can still need refreshed source evidence; a changed image needs
  visual review. CI never accepts new reference images automatically.
- [ ] Stage only the intended paths or hunks. Review the staged patch, generated
  evidence, file list, and whitespace checks.
- [ ] Create a focused Conventional Commit. Inspect the resulting commit and remaining
  working-tree state rather than assuming the index was unchanged by hooks.
- [ ] Once the intended changes are committed, run the complete clean-tree
  `npm run check` gate. Fix failures in a new focused commit before pushing.

The [commit-and-push skill](../.agents/skills/commit-and-push/SKILL.md) supports these
Git stages. A commit or push alone does not start publication.

## Review and merge

- [ ] Push the feature branch and submit a pull request describing the final behavior,
  compatibility changes, tests, and any remaining limitations.
- [ ] Resolve required review and the **Build, test, and verify package** CI result,
  including its Chromium and WebKit checks. Record affected Firefox checks locally;
  Firefox has no required hosted status.
  A test passing only after a retry is a failure of the gate.
- [ ] Merge through the protected branch workflow. Record the resulting full source SHA.
- [ ] Confirm the required CI results refer to that exact merged source, not a previous
  pull-request head or an earlier successful run.

## Publish and verify nightly

- [ ] Follow [release operations](release-operations.md) to dispatch the nightly
  workflow on canonical `main`, or identify its scheduled run.
- [ ] Record the source SHA, workflow run, generated version, artifact integrity, and
  immutable release identity. A started workflow is not a completed publication.
- [ ] Verify the `nightly` npm dist-tag and confirm `latest` still selects its
  recorded preflight version. Once stable exists, that unchanged version must be
  stable. Nightly publication uses OIDC only and does not update `latest`.
- [ ] Verify the exact published package, provenance, release assets, and installed
  consumer behavior through the [package verification procedure](package-verification.md).
- [ ] Wait for the separate release Pages deployment and verify its version and source
  metadata. The publisher cannot wait inside itself for its own completion-triggered
  Pages workflow.
- [ ] Confirm an unchanged-source dispatch reports a verified skip rather than creating
  another version. Classify partial results using the
  [release recovery guidance](release-administration.md) before retrying.

The [release-to-npm skill](../.agents/skills/release-to-npm/SKILL.md) coordinates this
stage and respects authorization already supplied for the requested release work.

## Prepare a future stable release

Stable publication is a separate maintainer operation. Use the
[release policy](releasing.md), [operations runbook](release-operations.md), and
[administration guide](release-administration.md) to establish the supported procedure
before dispatching it.

- [ ] Choose and review an explicit stable version, API compatibility expectations,
  migration guidance, and changelog promotion in a release pull request.
- [ ] Verify the protected stable npm environment, trusted publisher, and reviewer
  requirements. Nightly's unattended environment does not authorize stable publication.
- [ ] Serialize stable and nightly publication through the same release concurrency
  boundary so a nightly cannot race the transition of `latest`.
- [ ] Publish and verify the stable package and its versioned site before declaring the
  transition complete. Keep the nightly channel independently available.
- [ ] Confirm `latest` selects the verified stable version and subsequent nightlies
  never move it. Retain immutable historical alpha and nightly artifacts.
- [ ] Follow the documented recovery procedure for any partial result. Never overwrite
  a published version or move an immutable version tag to repair a release.

The first stable release is not implied by completing this checklist for a nightly.

[Back to the documentation hub](README.md)
