# Nightly release policy

This policy applies to public nightly snapshots of `@tryagaindev/litefold-calendar`. Maintainers use the [nightly operations runbook](release-operations.md) for commands and the [administration guide](release-administration.md) for hosted setup and recovery.

## Supported release state

The source development version is `0.6.0-nightly.0`. A publication receives a version shaped like `0.6.0-nightly.YYYYMMDDHHmmss.RUN_ID`, using the original workflow run's UTC creation time and numeric run ID. Rerunning that run preserves its version. A new source change requires a new run and version.

Nightlies snapshot reviewed `main` directly. They do not create daily version commits, release branches, or metadata pull requests. The source version and `[Unreleased]` changelog remain in the checkout; isolated package staging changes only the published manifest's version and stamps the SBOM with the same published identity.

A completed nightly must satisfy these invariants:

- The exact source commit passed CI and the publication gate, whose hosted browser checks run Chromium and WebKit. Firefox remains supported and is checked locally. New publication uses current canonical `main`.
- npm `nightly` selects the exact published snapshot. Nightly publication leaves `latest` at its verified preflight value, which remains the frozen historical `alpha` before stable exists. The first stable release will move `latest` to stable, and stable owns it permanently afterward.
- The protected `v<version>` tag resolves to the source commit. The GitHub release is a public immutable prerelease with the retained package, receipt, SBOM, license, and checksums.
- Receipt schema 2 binds the source version, published version, source commit, original workflow identity, and version-only manifest transformation. Retained evidence records package integrity, asset digests, toolchain, and resolved compatibility targets.
- Release Pages metadata identifies that same published version and source commit.
- Existing npm versions, release tags, assets, and immutable Pages paths are preserved. The historical `alpha` tag and all alpha releases remain frozen.

The source development base advances through a reviewed change when the next release series changes. The series must produce generated candidates newer than already published versions. The `nightly.0` development base is never itself a publication candidate.

## Publication authority

**Publish npm nightly** runs daily at **09:00 UTC** and through manual dispatch from `main`. An optional exact-source assertion protects a requested manual publication against a changed head. Scheduled execution can be delayed by the hosted scheduler; its version uses the actual original run creation time.

| Stage | Authority |
| --- | --- |
| Select and verify | Exact source checkout, read-only repository access, successful same-commit CI, fresh registry state, and the hosted publication gate |
| Stage GitHub release | No source checkout; narrowly scoped write permission for the verified tag, draft, notes, and assets |
| Publish npm | No source checkout; `npm-nightly` environment and OIDC publish only the retained tarball under `nightly` |
| Verify `latest` | Read-only registry checks confirm its preflight value is unchanged and, once stable exists, still selects stable |
| Verify and finalize | Fresh public-package verification followed by publication of the verified GitHub prerelease |
| Deploy release Pages | Native successful-publisher handoff, verified receipt, exact source, and separate Pages authority |

The `npm-nightly` environment restricts execution to `main` and runs without per-release human approval. Publication uses OIDC only and requires no npm token or tag-writing environment. This is an intentional unattended-delivery policy; code review and required checks protect the source and workflow. [Hosted setup](release-administration.md#one-time-hosted-prerequisites) records the required controls.

One non-canceling publication queue serializes all jobs through registry verification and release finalization. A future stable publisher must share that exact queue. Local artifacts and arbitrary refs do not confer publication authority.

## Readiness and completion

Implementation, documentation, examples, screenshots, accessibility evidence, and meaningful `[Unreleased]` notes must be merged before a nightly is requested. Phase commits receive their focused checks; the exact final source passes the full gate again before publication.

An unchanged source is skipped only after the previous nightly's registry state, immutable release, and release Pages are verified complete. A failed or partially published attempt is a recovery case, not evidence that nothing changed. The first nightly verifies the existing historical alpha predecessor without moving `alpha`.

A successful publisher run hands off Pages asynchronously. The operator records completion only after package integrity, provenance, protected tag, GitHub assets, and the publisher-linked Pages metadata agree. A green workflow alone is insufficient.

## Failure policy

Unavailable, malformed, ambiguous, or conflicting public state stops publication. Preserve the retained candidate and use the [recovery matrix](release-administration.md#recovery-matrix). Never overwrite a version, move a release tag, replace an asset, or substitute a rebuild for already published bytes.

A transient failure can resume the original exact run when its source, workflow, version, and retained bytes still match. A source or workflow correction requires a new reviewed commit and new nightly identity. Correct defective published content with a greater version; deprecation is a separately authorized metadata action.

## Operating documents

- [Nightly release operations](release-operations.md): ordered manual publication, completion checks, and release record.
- [Release administration](release-administration.md): environments, trusted publishing, recovery, and future stable requirements.
- [Package verification](package-verification.md): artifact and installed-package evidence, integrity, signatures, and provenance.
- [Static example deployment](example-deployment.md): rolling previews, immutable release snapshots, and preview rollback.
