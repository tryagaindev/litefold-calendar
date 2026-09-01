# Public alpha release policy

This policy applies to maintainer-authorized public alpha releases of
`@tryagaindev/litefold-calendar`. Release operators follow the
[alpha release operations runbook](release-operations.md); this document owns
the supported release invariants, not commands or UI steps.

The current procedure supports versions shaped like `0.x.y-alpha.N`. A stable
release, first publication, channel-policy replacement, or other unsupported
transition requires the separately reviewed procedure defined by
[release administration](release-administration.md#unsupported-transitions).

## Supported release state

A completed alpha release must satisfy all of these invariants:

- `package.json`, both root version fields in `package-lock.json`, and the
  promoted `CHANGELOG.md` heading identify the same exact alpha.
- Until a reviewed stable-release procedure replaces the temporary rule, npm
  `alpha` and `latest` select that same exact alpha.
- The protected `v<version>` tag resolves to the verified release commit.
- The GitHub release is a public prerelease whose tag and uploaded assets are
  platform-immutable. Its title and notes match retained evidence at
  publication and remain protected by project policy and access control because
  the platform still permits editing them.
- Release Pages metadata identifies the same version and full source commit.
- Existing public versions, tags, release assets, and immutable deployment paths
  are never overwritten or repurposed.

Any compatibility allowance needed to validate an existing release object
belongs in executable validation and focused tests. It does not relax the
requirements for a new release.

## Publication authority

The hosted preparation workflow creates a release-state branch containing only
`CHANGELOG.md`, `package-lock.json`, and `package.json`; it does not publish
or create the pull request.

The reviewed pull request must pass required checks and be squash-merged. The
merge push to canonical `main` is the only publication trigger. Publication is
eligible only when the pushed alpha version changes and its first-parent diff
contains exactly those three release-state files.

Release authority remains separated:

- Repository verification executes against the exact pushed commit and retains
  one candidate bundle.
- Source-free GitHub release jobs stage and finalize only the verified identity
  and bytes.
- The protected npm environment publishes that retained tarball through trusted
  publishing, without a long-lived registry token.
- An authenticated npm package maintainer performs any required channel synchronization in a
  private shell.
- A successful exact publisher run is the authority for the automatic release
  Pages handoff.

A local checkout, locally produced artifact, manual tag, arbitrary ref, or
deployment shortcut is not publication authority.

## Readiness and completion

Before preparation, all intended implementation, documentation, examples,
tests, design decisions, accessibility evidence, security dispositions, and
meaningful `Unreleased` notes must already be merged to `main`. Release
preparation changes metadata only.

A release is complete only when the private release record proves that the same
candidate version, full commit, tarball integrity, npm channels, provenance,
protected tag, immutable GitHub prerelease, retained asset digests, publisher
run, release Pages run, and deployment metadata all agree.

## Failure policy

Stop when hosted or public state is unavailable, malformed, ambiguous, or
conflicting. Do not work around a failed transition with local publication,
force-pushing, tag movement, asset replacement, version reuse, or a different
source commit.

The original exact attempt may be rerun only when the
[recovery matrix](release-administration.md#recovery-matrix) permits it and
source, workflow, artifact, and public identities remain unchanged. A source or
workflow correction, unverifiable public object, or defective published
artifact requires the documented greater-version or exceptional administrative
path.

## Operating documents

- [Alpha release operations](release-operations.md) owns the normal ordered
  procedure, exact commands, stop rules, and private release record.
- [Release administration](release-administration.md) owns hosted controls,
  unsupported transitions, exceptional mutations, reruns, and recovery.
- [Package verification](package-verification.md) owns artifact, installed
  package, registry, signature, and provenance evidence.
- [Static example deployment](example-deployment.md) owns Pages verification
  and rolling-preview rollback.
