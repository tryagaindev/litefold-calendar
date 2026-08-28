# Release a public alpha

This is the canonical operator path for `@tryagaindev/litefold-calendar`.  Alpha versions use `0.x.y-alpha.N`, npm's `alpha` dist-tag, and an immutable `v<version>` GitHub prerelease.  Stable publishing and npm's `latest` dist-tag are outside this process.

## Normal release path

### 1. Choose the version bump

In GitHub Actions, run **Prepare alpha release** from `main` and choose one option:

| Choice | Result |
| --- | --- |
| Continue alpha | Increment the current release line's `alpha.N` value |
| Next patch alpha | Increment the patch and start at `alpha.0` |
| Next minor alpha | Increment the minor and start at `alpha.0` |

The workflow validates the current release state, updates `package.json`, both root version fields in `package-lock.json`, and `CHANGELOG.md`, then creates `release/v<version>`.  It does not publish anything.  Open the compare link in the workflow summary to create the ordinary release pull request.

### 2. Review and merge the release pull request

Confirm the generated pull request changes only the two manifests and changelog, and that the promoted changelog section accurately describes the release.  The preparation workflow refuses empty or placeholder-only `Unreleased` notes, reused or decreasing versions, and partial manifest updates.

Merge only after the normal required checks pass.  Intentional visual changes must already be reconciled with [`DESIGN.md`](../DESIGN.md), regenerated with `npm run screenshots:update`, and reviewed at native dimensions.  Relevant interaction, semantic, focus, browser-support, or accessibility changes also require the risk-based manual evidence in the [accessibility guide](../ACCESSIBILITY.md#testing).

### 3. Approve npm publication

Merging the release pull request pushes its exact commit to `main` and starts **Publish npm alpha** directly. The workflow classifies ordinary pushes as non-release changes. For the eligible generated release commit, it checks out `github.sha`, runs the complete repository and package gate again, stages the draft release and immutable assets, and then pauses at the protected `npm` environment.

Review the version, exact source commit, changelog, and artifact identity before approval. The protected source-free job publishes only the retained verified tarball through npm trusted publishing; it does not check out or execute repository source.

Do not create or push a version tag, create a GitHub release, publish with npm locally, or deploy a release demo. The publisher creates the protected exact-SHA tag, verifies npm, and publishes the GitHub prerelease last. It then queues **Deploy static examples** as a separate release operation for that exact tag; Pages has its own authority and recovery path.

The npm publication summary must confirm all of these for the same version and commit:

- npm accepted the verified tarball and `alpha` resolves to that version.
- npm integrity, provenance/signatures, root import, and stylesheet import passed verification.
- `latest` is absent or points to a stable version.
- The protected tag and immutable GitHub prerelease identify the verified source commit and carry the release bundle.

Then confirm the separately queued **Deploy static examples** run succeeded and its dispatch input, `releases/<version>/examples/metadata.json`, and root `site-manifest.json` all identify the same version, full commit, and `release` channel before announcing the demo as complete.

## Local preparation and verification

The Actions workflow is the normal novice path.  Maintainers can preview or reproduce its release-state changes locally without committing, tagging, pushing, or publishing:

```sh
npm run release:prepare -- --bump prerelease --dry-run
npm run release:prepare -- --bump prerelease
npm run release:verify
```

Use `prepatch` or `preminor` instead of `prerelease` for the other two choices.  `release:prepare` validates the staged manifest and changelog bytes before atomically replacing the three files, and restores the originals if staging or replacement fails.  `release:verify` is read-only.  See [package verification](package-verification.md) for the complete quality gate and retained artifact contents.

## Failure handling

Do not work around a failed workflow with a local publish, force push, moved tag, replaced asset, or reused package version. Rerun the original exact-`push` publication attempt when its existing public state matches the verified artifacts. There is no manual arbitrary-commit publication path; conflicting or ambiguous state fails closed.

Published npm versions are immutable. If published bytes are defective, deprecate that exact version with upgrade guidance and prepare a greater alpha. If the exact run cannot be resumed safely after npm accepted the package, stop and follow the [release administration and recovery guide](release-administration.md); do not manufacture a different event identity for the same version.

## Operator checklist

- [ ] Run **Prepare alpha release** from `main` with the intended bump.
- [ ] Open the compare link and confirm the pull request changes only `package.json`, `package-lock.json`, and `CHANGELOG.md`.
- [ ] Confirm release notes and all affected design, screenshots, documentation, examples, tests, and risk-based accessibility evidence are complete.
- [ ] Merge only after required pull-request checks pass.
- [ ] Confirm **Publish npm alpha** selected the merge's exact `main` commit and expected version.
- [ ] Approve the protected `npm` environment after reviewing the release identity.
- [ ] Confirm matching npm, protected tag, immutable GitHub prerelease, and separately deployed Pages identities.
- [ ] On any failure or uncertain public state, stop and use the documented recovery path.
