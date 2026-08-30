# Alpha release administration and recovery

This guide is for repository and npm administrators. It covers one-time hosted setup, registry mutations, and failed-release recovery. Release operators should normally use the [alpha release operations runbook](release-operations.md).

The steady-state process is deliberately short: run **Prepare alpha release**, review and merge its three-file pull request, approve the protected npm environment, advance `latest` to the published alpha, and verify the automatic GitHub release and Pages deployment. Publication starts only from the resulting push to `main`.

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

If npm reports that the package does not exist, stop here and follow the bootstrap case above. Do not interpret a failed or malformed registry response as an empty tag set. Before preparing another alpha, the existing `alpha` and `latest` tags must select the same completed prerelease.

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
| `v0.1.0-alpha.0` | `53cf1fbb5f4176929c3105030a62e1d0c235b54f` |
| `v0.2.0-alpha.0` | `8250ac4da9ada72a2915b8f810be404667ab47da` |

Never move, recreate, annotate, or otherwise rewrite either historical tag to simulate current guarantees. No other lightweight release tag is permitted; every later version must satisfy the exact-SHA annotated-tag ruleset and immutable-release policy.

## Publication authority

The workflow deliberately separates source execution from publication authority:

| Phase | Source checkout or execution | Authority and output |
| --- | --- | --- |
| Classify and verify | Exact pushed `github.sha`; full repository gate | Read-only repository access; retains the package bundle and release notes |
| Stage GitHub release | No checkout and no project-code execution | Repository write access; creates or validates the exact tag, draft prerelease, notes, and assets |
| Publish npm | No checkout, candidate/project install, candidate import, or project-code execution | Protected `npm` environment and npm OIDC; publishes only the checksum-verified tarball under `alpha` |
| Synchronize npm channels | No workflow credential | An authenticated npm owner advances `latest` to the exact published alpha |
| Verify and finalize | Clean public-package consumer, then a source-free release job | Requires `alpha` and `latest` to match, verifies registry bytes/imports/signatures/provenance, publishes the immutable GitHub prerelease, then completes successfully so native `workflow_run` starts Pages |

`publish-alpha.yml` starts only on pushes to `main`, and only a changed alpha version with an exact first-parent diff limited to `package.json`, `package-lock.json`, and `CHANGELOG.md` enters publication. There is no manual, arbitrary-ref, or historical-commit publication path.

Release Pages start through the `workflow_run`-only `deploy-examples.yml` after successful completion of the push-triggered publisher that verified npm and made the immutable prerelease public. The publisher supplies its verified full head commit; Pages accepts no release-ref input. Manual retained-main recovery is isolated in the `workflow_dispatch`-only `rollback-examples.yml`; it accepts a retained snapshot commit, never a release ref. Both Pages workflows use the same queued workflow-level lock, so one run owns retained-state validation through final deployment before the next begins. See [static example deployment](example-deployment.md) for both procedures.

The staging and finalization jobs intentionally have no checkout. Every GitHub CLI release mutation in those jobs names the repository explicitly; asset upload uses this shape:

```sh
gh release upload --repo "${GITHUB_REPOSITORY}" "${LFC_TAG}" "${LFC_BUNDLE_DIRECTORY}/${name}"
```

Do not add a checkout merely to give `gh` repository context. Keeping the write-capable jobs source-free is part of the authority boundary.

Reruns accept existing state only when identity and bytes match exactly:

- An npm version is complete only when registry integrity matches the retained tarball and both `alpha` and `latest` identify the exact version. A clean exact-version install and both supported imports must succeed with lifecycle scripts disabled. Signatures and SLSA provenance must bind the exact package bytes, repository, `refs/heads/main`, source commit, workflow, GitHub-hosted builder, and the `push` publisher event.
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

## Recovery matrix

| State | Recovery |
| --- | --- |
| Failure before npm publication | Resolve only transient infrastructure, authentication, or hosted-state configuration, then rerun the original exact-push attempt. A matching staged tag, draft, and assets may be reused. If source or workflow files must change, prepare a greater alpha. |
| npm accepted identical verified bytes but the run ended afterward | Rerun the original publication attempt for that exact push so event identity, artifact, and provenance remain unchanged. If the original attempt cannot be resumed safely, stop, deprecate the incomplete version when appropriate, and prepare a greater alpha. |
| npm accepted the candidate under `alpha`, but `latest` still selects the predecessor | Confirm the candidate's exact version and retained integrity, advance only `latest` to that candidate with an authenticated owner, then rerun the original failed jobs. |
| npm contains the version with different or unverifiable bytes | Stop.  Do not reuse the version.  Investigate, deprecate when appropriate, and prepare a greater alpha. |
| Tag, draft, or asset exists with matching identity | Rerun the original exact-push attempt; the stage is idempotent. |
| Tag, draft, or asset conflicts | Do not move, delete, or overwrite it as part of a rerun. Stop, investigate, and prepare a greater alpha. |
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
