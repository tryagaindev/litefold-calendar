# Alpha release administration and recovery

This guide is for repository and npm administrators. It covers one-time hosted setup, registry mutations, and failed-release recovery. Release operators should normally use the [alpha release operations runbook](release-operations.md).

The steady-state process is deliberately short: run **Prepare alpha release**, review and merge its three-file pull request, approve the protected npm environment, advance `latest` to the published alpha, and verify the automatic GitHub release and Pages deployment. The current-main dispatch documented below exists only to recover the unpublished `0.3.0-alpha.0` attempt and must be removed after that release succeeds.

## One-time hosted prerequisites

Verify these settings before enabling publication and after any owner, repository, workflow filename, environment, or package-ownership change.

### npm

- The public repository identity exactly matches `package.json#repository`.
- The intended maintainers control the `@tryagaindev` npm scope and `@tryagaindev/litefold-calendar`; maintainer accounts use two-factor authentication.
- [npm trusted publishing](https://docs.npmjs.com/trusted-publishers/) is bound to the exact GitHub owner, repository, workflow filename `publish-alpha.yml`, environment `npm`, and allowed `npm publish` action. The workflow must remain on a GitHub-hosted runner with `id-token: write`. Do not add a long-lived `NPM_TOKEN` secret.
- After trusted publishing works, set the package's publishing access to **Require two-factor authentication and disallow tokens**, and revoke legacy automation or granular publish tokens that the OIDC workflow replaced.

### GitHub repository and release

- The GitHub `npm` environment requires release-maintainer approval, prevents an initiator from approving their own deployment when more than one maintainer is available, and has a deployment-branch policy that allows `main` only.
- Required CI protects `main`.  A `v*` tag ruleset blocks deletion, force updates, and unauthorized creation while permitting the release automation to create an exact-SHA tag.
- [GitHub immutable releases](https://docs.github.com/en/enterprise-cloud@latest/code-security/concepts/supply-chain-security/immutable-releases) are enabled.  Release artifacts must be attached while the prerelease is still a draft because published immutable tags and assets cannot be replaced.
- Secret scanning, push protection, private vulnerability reporting, and review of workflow changes are enabled.

### GitHub Pages

- Pages uses **GitHub Actions** as its publishing source.
- The `github-pages` environment is protected independently from npm authority, and its deployment-branch policy allows `main` only.
- Direct and force pushes to the retained `pages-content` branch are restricted. Maintainers do not edit that branch by hand.
- Automatic and rollback Pages workflows share one non-canceling workflow-level concurrency group with the maximum built-in queue. This serializes retained-state validation, writes, packaging, and deployment across both workflows.

Repository files and tests describe these requirements but cannot prove that hosted settings are enabled.  Verify them in GitHub and npm rather than inferring them from a successful local check.

If the package has never existed, an authorized npm owner may need one human-authenticated bootstrap publication before trusted publishing can be configured. Treat that as a separately reviewed exception: use a dedicated bootstrap version, pass `--tag alpha` explicitly, record the action, and configure trusted publishing before the next release. Never consume the version already prepared for automation, and do not add a token to GitHub as a shortcut.

## Temporary alpha-as-latest policy

Until the first stable release, completed alpha releases require both `alpha` and `latest` to select the same exact prerelease. This intentionally makes unqualified npm installs resolve to alpha software. The stable-release process must replace this temporary invariant before its first publication.

Inspect live tags before release work. The queries are read-only; advancing `latest` mutates the public registry and requires an authenticated npm owner.

```sh
npm whoami --registry https://registry.npmjs.org/
npm view @tryagaindev/litefold-calendar dist-tags --json --registry https://registry.npmjs.org/
```

If `npm whoami` reports that authentication is absent, the npm owner runs this exact command and completes the browser and second-factor flow privately:

```sh
npm login --registry https://registry.npmjs.org/
```

Rerun `npm whoami` afterward. Never share the npm browser session, CLI authentication URL, OTP, or token with an assistant or automation.

If npm reports that the package does not exist, stop here and follow the bootstrap case above. Do not interpret a failed or malformed registry response as an empty tag set. The exact historical state `alpha=0.2.0-alpha.0` and `latest=0.1.0-alpha.0` is accepted only to transition the next release into the new invariant; later releases require the two predecessor tags to match.

Complete npm's second-factor flow if it is required for a registry mutation. Do not record an OTP in a command transcript, issue, or release note.

After trusted publishing has placed the exact candidate under `alpha`, confirm the immutable version exists and atomically advance `latest` to it:

```sh
npm view "@tryagaindev/litefold-calendar@EXACT_VERSION" name version --json --registry https://registry.npmjs.org/
npm dist-tag add @tryagaindev/litefold-calendar@EXACT_VERSION latest --registry https://registry.npmjs.org/
npm view @tryagaindev/litefold-calendar dist-tags --json --registry https://registry.npmjs.org/
```

Replace `EXACT_VERSION` with the workflow candidate. Both tags must select it before the workflow publishes the immutable GitHub prerelease. Do not remove `latest`, point it at an unpublished or different version, or give the publish-only OIDC identity general dist-tag administration authority. If the workflow's polling window expires, complete and verify this exact tag update, then rerun the failed jobs for the original release attempt.

## Historical tag exceptions

Two published prereleases predate the protected annotated-tag and immutable-release policy. Their lightweight tags are accepted only at these exact identities:

| Tag | Exact commit |
| --- | --- |
| `v0.1.0-alpha.0` | `17d8db664834d8e6e8ded8689df404827c11bfa3` |
| `v0.2.0-alpha.0` | `8250ac4da9ada72a2915b8f810be404667ab47da` |

Never move, recreate, annotate, or otherwise rewrite either historical tag to simulate current guarantees. No other lightweight release tag is permitted; every later version must satisfy the exact-SHA annotated-tag ruleset and immutable-release policy.

## Publication authority

The workflow deliberately separates source execution from publication authority:

| Phase | Source checkout or execution | Authority and output |
| --- | --- | --- |
| Classify and verify | Exact pushed `github.sha`, or the temporary recovery workflow's exact live `main` commit; full repository gate | Read-only repository access; retains the package bundle and release notes |
| Stage GitHub release | No checkout and no project-code execution | Repository write access; creates or validates the exact tag, draft prerelease, notes, and assets |
| Publish npm | No checkout, install, or candidate import | Protected `npm` environment and npm OIDC; publishes only the checksum-verified tarball under `alpha` |
| Synchronize npm channels | No workflow credential | An authenticated npm owner advances `latest` to the exact published alpha |
| Verify and finalize | Clean public-package consumer, then a source-free release job | Requires `alpha` and `latest` to match, verifies registry bytes/imports/signatures/provenance, publishes the immutable GitHub prerelease, then completes successfully so native `workflow_run` starts Pages |

`publish-alpha.yml` normally starts on pushes to `main`, but only a changed alpha version with an exact first-parent diff limited to `package.json`, `package-lock.json`, and `CHANGELOG.md` enters publication. The temporary `workflow_dispatch` recovery does not accept a ref or historical source selector: its input must repeat the exact current `main` commit, and the workflow independently requires that input, `github.sha`, the workflow definition commit, and freshly fetched `origin/main` all identify the same commit.

Release Pages start through the `workflow_run`-only `deploy-examples.yml` after successful completion of the publisher that verified npm and made the immutable prerelease public. It accepts the publisher's normal `push` event and this exact guarded `workflow_dispatch` recovery event; both paths supply the publisher's verified full head commit and neither accepts a release-ref input. Manual retained-main recovery is isolated in the `workflow_dispatch`-only `rollback-examples.yml`; it accepts a retained snapshot commit, never a release ref. Both Pages workflows use the same queued workflow-level lock, so one run owns retained-state validation through final deployment before the next begins. See [static example deployment](example-deployment.md) for both procedures.

The staging and finalization jobs intentionally have no checkout. Every GitHub CLI release mutation in those jobs names the repository explicitly; asset upload uses this shape:

```sh
gh release upload --repo "${GITHUB_REPOSITORY}" "${LFC_TAG}" "${LFC_BUNDLE_DIRECTORY}/${name}"
```

Do not add a checkout merely to give `gh` repository context. Keeping the write-capable jobs source-free is part of the authority boundary.

Reruns accept existing state only when identity and bytes match exactly:

- An npm version is complete only when registry integrity matches the retained tarball and both `alpha` and `latest` identify the exact version. A clean exact-version install and both supported imports must succeed with lifecycle scripts disabled. Signatures and SLSA provenance must bind the exact package bytes, repository, `refs/heads/main`, source commit, workflow, GitHub-hosted builder, and the actual publisher event: normally `push`, or the one guarded `workflow_dispatch` recovery.
- A tag, draft, published prerelease, or asset is reusable only at the same full commit with identical notes and bytes.
- A release Pages path is reusable only when its version, tag commit, manifest, and bytes match exactly.
- Authentication, network, malformed response, missing provenance, and ambiguous or conflicting public state abort the transition.

## Rerun procedure

A rerun of an existing run uses that run's original commit SHA, ref, and workflow definition. It can consume corrected hosted settings or registry state, but it cannot consume repository source or that workflow's changes merged later. Use this procedure only for a resolved transient infrastructure, authentication, or hosted-state failure. If package or source files must change, stop and follow the recovery matrix; prepare a greater alpha when required.

1. Open the original **Publish npm alpha** run for the release merge commit. Do not start a different workflow or manufacture another event.
2. Confirm the run's full commit SHA and candidate version match the retained bundle and any existing npm, tag, draft/release, or asset state.
3. Confirm recovery required no source or workflow change, then use **Re-run failed jobs** (or **Re-run all jobs** when the failed dependency chain requires it).
4. After completion, independently verify npm and GitHub identities, then verify the publisher-linked Pages run. If GitHub did not create that run after a successful publisher completion, review the current default-branch `deploy-examples.yml`, select **Re-run all jobs** on the original publisher, and validate the newly created Pages run independently. The publisher rerun retains its original identity, but the new downstream run uses the current Pages workflow definition while pinning release source and assembly tooling to the publisher SHA.

If the original run is no longer rerunnable, or any public identity cannot be proved to match, do not recreate the attempt from another commit. Use the recovery matrix and prepare a greater alpha where required.

## One-time current-main recovery for `0.3.0-alpha.0`

This temporary path fixes the publisher workflow without changing the candidate package. It is not a historical-commit dispatcher and is not a template for normal releases. Use it only for the already staged but still unpublished `0.3.0-alpha.0` attempt.

The reviewed recovery head is valid only when all of these invariants hold:

- npm has no `@tryagaindev/litefold-calendar@0.3.0-alpha.0` version;
- the existing GitHub object is unpublished draft release `379092928` for `v0.3.0-alpha.0`, its tag targets failed release commit `84fc9288bf6e8ab9678c6f0e4ade9add5846c72d`, and all five retained assets and release notes match the recorded evidence;
- `CHANGELOG.md`, `package.json`, and `package-lock.json` are byte-for-byte unchanged from the failed release commit;
- the two operational recovery commits together change only the workflows, workflow-policy tests, release guides, and deterministic wheel-burst test harness named in the workflow's operational allowlist;
- the rebuilt package tarball SHA-256 equals the retained failed-attempt digest `f35ec0caf6e1557bb7d8d6b80f8a3c207351c51e02832d387109eca80ae77894` committed in `publish-alpha.yml`; and
- the recovery head is the freshly fetched head of `main`, its parent is the exact audited recovery predecessor `4d97e280156c24b06d93cfe4167595df749d7b9d` pinned in both publisher and Pages workflows, that predecessor's parent is the failed release commit, and neither operational commit changes source or package state.

The operational allowlist is exactly:

- `.github/workflows/deploy-examples.yml`
- `.github/workflows/publish-alpha.yml`
- `docs/release-administration.md`
- `docs/release-operations.md`
- `docs/releasing.md`
- `scripts/tests/publish-alpha-policy.test.mjs`
- `scripts/tests/workflow-contracts.test.mjs`
- `tests/e2e/swipe-gestures.spec.js`

The wheel-burst change controls trusted CDP event timestamps so parallel test load cannot turn one intended rapid burst into multiple gestures; it does not alter runtime behavior. No source, build output, package manifest, lockfile, changelog, or other repository file may change across either recovery commit.

The verifier checks out immutable platform `github.sha` directly. The operator input is confirmation-only and must equal that SHA; it is never forwarded as a checkout ref. The earlier audited recovery predecessor remains pinned because the hosted CodeQL result required this direct trust-boundary expression after the predecessor was already on `main`.

Before deleting anything, independently record the draft release ID, tag target, release-note digest, asset names, and asset SHA-256 values. Query npm's exact version and require a definite not-found result; an authentication failure, network error, or malformed response is not proof of absence. Confirm that no published GitHub release or Pages release directory exists for the candidate.

Only after every check passes may an administrator delete the exact unpublished `v0.3.0-alpha.0` draft and its exact candidate tag so the corrected workflow can recreate them from the retained bytes. Do not delete either historical tag, any published release, or any unrelated draft. If a tag ruleset blocks deletion, the draft or tag identity differs, npm contains the version, Pages already contains the release, or any retained byte cannot be proved, stop and publish a greater alpha instead.

After the reviewed recovery head is the live `main` head:

1. Open **Actions** → **Publish npm alpha** → **Run workflow**.
2. Leave **Use workflow from** set to `main`.
3. Copy the full 40-character lowercase SHA of the current `main` head into **Current main commit**. This field confirms the live workflow commit; it cannot select another commit, branch, tag, or release.
4. Run the workflow and confirm classification, the complete repository gate, exact retained-tarball comparison, draft staging, and protected npm approval all use that same SHA.
5. Approve the `npm` environment and complete the ordinary `latest`, npm, GitHub release, and Pages checks in the operations runbook.

The provenance verifier accepts the actual event recorded by GitHub: `push` for normal releases or `workflow_dispatch` for this recovery. In either case, the statement, signing certificate, source digest, workflow digest, `refs/heads/main`, and current `main` commit must agree. A successful recovery publisher completion automatically starts the publisher-linked release Pages deployment.

After npm, the immutable GitHub prerelease, and Pages all verify, immediately remove the `workflow_dispatch` trigger, recovery constants and branches, and recovery-only tests and instructions in a reviewed cleanup pull request. That same-version `main` push must classify as ineligible and publish nothing. The next release then uses only the simple push-driven steady-state process.

## Recovery matrix

| State | Recovery |
| --- | --- |
| Failure before npm publication | Resolve only transient infrastructure, authentication, or hosted-state configuration, then rerun the original exact-push attempt. A matching staged tag, draft, and assets may be reused. The sole exception is the documented one-time current-main recovery for the still-unpublished `0.3.0-alpha.0`; otherwise, a workflow or source repair requires a greater alpha. |
| npm accepted identical verified bytes but the run ended afterward | Rerun the original publication attempt for that exact push so event identity, artifact, and provenance remain unchanged. The temporary dispatch is not valid after npm publication and never accepts a historical SHA. If the original attempt cannot be resumed safely, stop, deprecate the incomplete version when appropriate, and prepare a greater alpha. |
| npm accepted the candidate under `alpha`, but `latest` still selects the predecessor | Confirm the candidate's exact version and retained integrity, advance only `latest` to that candidate with an authenticated owner, then rerun the original failed jobs. |
| npm contains the version with different or unverifiable bytes | Stop.  Do not reuse the version.  Investigate, deprecate when appropriate, and prepare a greater alpha. |
| Tag, draft, or asset exists with matching identity | Rerun with the exact version and commit; the stage is idempotent. For the one-time `0.3.0-alpha.0` workflow repair only, follow the stricter evidence and exact-draft cleanup procedure above. |
| Tag, draft, or asset conflicts | Do not move, delete, or overwrite it as part of a rerun. The one-time recovery permits deletion only of the exact verified unpublished `v0.3.0-alpha.0` draft and tag; any conflict is a stop condition requiring a greater alpha. |
| Published npm alpha is defective | Deprecate the exact version with a replacement message and publish a greater alpha.  Avoid `npm unpublish` except for a genuine security/legal need allowed by npm policy. |
| Immutable GitHub prerelease is defective | Leave it intact and publish a corrected greater alpha. |
| Rolling `main` Pages preview is defective | Run **Roll back static examples** from `main` with **Snapshot ref** set to the exact 40-character lowercase `pages-content` commit documented by the deployment guide. This separate manual workflow is rollback-only. |
| Release Pages verification failed | For a transient or hosted-state failure, rerun the original publisher-linked **Deploy static examples** run. An existing rerun cannot consume later workflow changes. If no downstream run exists, review the current default-branch Pages workflow, select **Re-run all jobs** on the successful original publisher, and independently validate the newly created Pages run. If release source or assembly tooling must change, publish a corrected greater alpha. Never dispatch a release by ref or replace a release path with different bytes. |

Registry administration such as moving a dist-tag or deprecating a version requires an authenticated npm owner and is intentionally outside trusted publication. Before deprecating, replace every uppercase placeholder below and inspect both versions:

```sh
npm view "@tryagaindev/litefold-calendar@EXACT_VERSION" name version deprecated dist.integrity --json --registry https://registry.npmjs.org/
npm view "@tryagaindev/litefold-calendar@REPLACEMENT_VERSION" name version --json --registry https://registry.npmjs.org/
npm deprecate "@tryagaindev/litefold-calendar@EXACT_VERSION" "Use REPLACEMENT_VERSION instead." --registry https://registry.npmjs.org/
npm view "@tryagaindev/litefold-calendar@EXACT_VERSION" name version deprecated --json --registry https://registry.npmjs.org/
```

The `npm deprecate` command mutates public registry metadata. Record the incident and recovery in the relevant GitHub release or repository issue without exposing credentials or private vulnerability details.
