# Release a public alpha

This is the day-to-day release path for `@tryagaindev/litefold-calendar`. Alpha versions use `0.x.y-alpha.N`, npm's `alpha` dist-tag, and an immutable `v<version>` GitHub prerelease. Until the first stable release, `latest` intentionally selects the same alpha, so an unqualified npm install receives prerelease software. The stable-release process must replace that temporary channel rule before publishing a stable version.

Operators should follow the checkbox-driven [alpha release operations runbook](release-operations.md). This guide defines the policy and workflow design behind those steps.

The process is intentionally simple: prepare the release pull request, merge it, approve trusted publication, advance the temporary `latest` tag, and verify the automatic GitHub release and Pages deployment. The merge push is the only publication trigger.

Repository or npm administrators must complete the [hosted prerequisites](release-administration.md#one-time-hosted-prerequisites) first. A release operator needs permission to run Actions, open and merge the prepared release pull request, and coordinate approval for the protected `npm` environment. A separate authorized reviewer should be available when the environment prohibits self-approval.

Before starting, make sure `CHANGELOG.md` has meaningful `Unreleased` notes and all implementation, documentation, test, accessibility, and screenshot work for the release is already on `main`. The preparation workflow changes release metadata only; it does not collect unfinished work from another branch.

## Normal release path

### 1. Choose the version bump

In GitHub Actions, open **Prepare alpha release**, choose **Run workflow**, select `main`, and choose one bump:

| Choice | Result |
| --- | --- |
| Continue alpha | Increment the current release line's `alpha.N` value |
| Next patch alpha | Increment the patch and start at `alpha.0` |
| Next minor alpha | Increment the minor and start at `alpha.0` |

The workflow validates the current state, updates `package.json`, both root version fields in `package-lock.json`, promotes `Unreleased` notes in `CHANGELOG.md`, and creates `release/v<version>`. It does not open a pull request or publish anything. When the run succeeds, use its summary link to open the prefilled pull request.

### 2. Review and merge the release pull request

Confirm that the pull request changes only `package.json`, `package-lock.json`, and `CHANGELOG.md`, and that the dated changelog section describes the intended release. The preparation workflow rejects empty or placeholder-only notes, reused or decreasing versions, and partial manifest updates.

Merge only after the required checks pass. Intentional visual changes must already be reconciled with [`DESIGN.md`](../DESIGN.md), regenerated through the [screenshot procedure](screenshots/README.md#update-captures), and reviewed at native dimensions. Interaction, semantic, focus, browser-support, or accessibility changes also require the risk-based manual evidence in the [accessibility guide](../ACCESSIBILITY.md#testing).

### 3. Review and approve npm publication

Merging pushes the release commit to `main` and starts **Publish npm alpha**. Ordinary `main` pushes are classified and exit without publishing. An eligible release commit must have a changed version and a first-parent diff containing exactly the three release-state files.

Before the protected `npm` job is approved, the workflow reruns `npm run check`, creates the five-file evidence bundle, and stages the exact tag, draft prerelease, notes, and assets. Confirm the workflow run header names the expected `main` commit, wait for **Stage exact tag, draft, and release assets**, and review the draft release for the expected version, full source commit, changelog, and five uploaded asset names. GitHub's automatic source-code archives are excluded from that asset count. Then approve the `npm` environment; the final run summary is written only after registry verification and finalization.

The approved job is source-free: it downloads and checksum-verifies the retained bundle, then publishes only that tarball through npm trusted publishing under `alpha`. It does not check out or execute repository source. The source-free GitHub release jobs pass `--repo` explicitly to GitHub CLI; they must not gain a checkout merely to infer repository context.

When the publish job reports that npm accepted the version, an authenticated npm owner must atomically advance `latest` to the exact candidate while registry verification polls:

```sh
npm dist-tag add @tryagaindev/litefold-calendar@EXACT_VERSION latest --registry https://registry.npmjs.org/
```

Replace `EXACT_VERSION` with the workflow's candidate and never enter or record another person's OTP. Trusted publishing intentionally has no general dist-tag authority. If the verification window expires first, confirm both tags, then rerun the failed jobs for the original release attempt.

Do not create or push a version tag, create a GitHub release, publish with npm locally, or deploy the release demo yourself during the normal path. The workflow owns those transitions.

### 4. Verify the published identities

After approval, **Publish npm alpha** verifies npm and then makes the GitHub prerelease public. Its successful completion triggers **Deploy static examples** through GitHub's native `workflow_run` event. A started Pages run is not proof of a completed deployment; open the publisher-linked run and wait for it to succeed.

Confirm all of these identify the same version and full commit:

- npm accepted the verified tarball and both `alpha` and `latest` resolve to that version.
- npm integrity, signatures/provenance, clean installation, root import, extension import, and stylesheet import passed.
- The protected tag and immutable GitHub prerelease identify the verified source commit and carry the release bundle.
- The publisher-linked Pages run used the same full head commit and produced the `release` channel. A CI-linked run for the same commit is the separate rolling `main` channel.
- `releases/<version>/examples/metadata.json` and the root `site-manifest.json` report the version, full commit, and `release` channel.

See [package verification](package-verification.md#registry-and-release-evidence) for independent registry checks and [static example deployment](example-deployment.md#verify-a-deployment) for Pages checks.

## Local preparation and verification

The Actions workflow above is the normal path. Maintainers can preview the release-state transformation locally. Start from the repository root with a clean worktree and the canonical `origin`; the non-dry-run command intentionally leaves exactly three modified files.

```sh
npm run release:prepare -- --bump prerelease --dry-run
npm run release:prepare -- --bump prerelease
npm run release:verify
```

Use `prepatch` or `preminor` instead of `prerelease` for the other two choices. `release:prepare` validates staged bytes before atomically replacing the three files and restores the originals if replacement fails. `release:verify` is read-only and allows those expected local changes; it does not query hosted services. Review `git diff` after the command. This local path does not create a branch, pull request, tag, release, or publication.

## Historical release tags

The lightweight tags `v0.1.0-alpha.0` at `53cf1fbb5f4176929c3105030a62e1d0c235b54f` and `v0.2.0-alpha.0` at `8250ac4da9ada72a2915b8f810be404667ab47da` are exact pre-policy exceptions. Never move, recreate, or annotate them. No other lightweight release tag is permitted.

## Failure handling

Do not work around a failed workflow with a local publish, force push, unrelated tag movement, replaced asset, or reused package version. The one expected registry-administration action is advancing `latest` to the exact already-published candidate. A rerun of **Publish npm alpha** keeps that run's original commit SHA, ref, and publisher workflow definition, so use it only after resolving a transient infrastructure, authentication, or hosted-state configuration failure without changing repository source or the publisher workflow. Open the run for the original release merge commit and confirm its SHA and version before rerunning. If source or publisher workflow files must change, stop and use administration recovery; prepare a greater alpha when required. There is no arbitrary or historical-commit publication path.

Only rerun when existing npm, tag, draft/release, assets, and Pages state are absent or match the retained bytes exactly. Conflicting or ambiguous state fails closed. Published npm versions are immutable: if bytes are defective, deprecate that version with upgrade guidance and prepare a greater alpha. Use the [recovery matrix](release-administration.md#recovery-matrix) for the exact failure stage.

## Operator checklist

Use the [operations runbook](release-operations.md) for exact UI steps, evidence fields, stop rules, and recovery decisions.

- [ ] Run **Prepare alpha release** from `main` with the intended bump.
- [ ] Open the compare link and confirm the pull request changes only `package.json`, `package-lock.json`, and `CHANGELOG.md`.
- [ ] Confirm release notes and all affected design, screenshots, documentation, examples, tests, and risk-based accessibility evidence are complete.
- [ ] Merge only after required pull-request checks pass.
- [ ] Confirm **Publish npm alpha** selected the merge's exact `main` commit and expected version.
- [ ] Review the retained bundle and staged draft, then approve the protected `npm` environment.
- [ ] After npm publishes `alpha`, advance `latest` to that exact version with an authenticated owner account.
- [ ] Confirm matching npm, protected tag, immutable GitHub prerelease, and completed Pages identities.
- [ ] On any failure or uncertain public state, stop and use the documented recovery path.
