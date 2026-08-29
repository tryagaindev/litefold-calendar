# Alpha release administration and recovery

This guide is for repository and npm administrators. It covers one-time hosted setup, registry mutations, and failed-release recovery. Release operators should normally use the [four-step release process](releasing.md#normal-release-path).

## One-time hosted prerequisites

Verify these settings before enabling publication and after any owner, repository, workflow filename, environment, or package-ownership change.

### npm

- The public repository identity exactly matches `package.json#repository`.
- The intended maintainers control the `@tryagaindev` npm scope and `@tryagaindev/litefold-calendar`; maintainer accounts use two-factor authentication.
- [npm trusted publishing](https://docs.npmjs.com/trusted-publishers/) is bound to the exact GitHub owner, repository, workflow filename `publish-alpha.yml`, environment `npm`, and allowed `npm publish` action. The workflow must remain on a GitHub-hosted runner with `id-token: write`. Do not add a long-lived `NPM_TOKEN` secret.

### GitHub repository and release

- The GitHub `npm` environment requires release-maintainer approval, prevents an initiator from approving their own deployment when more than one maintainer is available, and has a deployment-branch policy that allows `main` only.
- Required CI protects `main`.  A `v*` tag ruleset blocks deletion, force updates, and unauthorized creation while permitting the release automation to create an exact-SHA tag.
- [GitHub immutable releases](https://docs.github.com/en/enterprise-cloud@latest/code-security/concepts/supply-chain-security/immutable-releases) are enabled.  Release artifacts must be attached while the prerelease is still a draft because published immutable tags and assets cannot be replaced.
- Secret scanning, push protection, private vulnerability reporting, and review of workflow changes are enabled.

### GitHub Pages

- Pages uses **GitHub Actions** as its publishing source.
- The `github-pages` environment is protected independently from npm authority, and its deployment-branch policy allows `main` only.
- Direct and force pushes to the retained `pages-content` branch are restricted. Maintainers do not edit that branch by hand.

Repository files and tests describe these requirements but cannot prove that hosted settings are enabled.  Verify them in GitHub and npm rather than inferring them from a successful local check.

If the package has never existed, an authorized npm owner may need one human-authenticated bootstrap publication before trusted publishing can be configured. Treat that as a separately reviewed exception: use a dedicated bootstrap version, pass `--tag alpha` explicitly, record the action, and configure trusted publishing before the next release. Never consume the version already prepared for automation, and do not add a token to GitHub as a shortcut.

## Temporary alpha-as-latest policy

Until the first stable release, completed alpha releases require both `alpha` and `latest` to select the same exact prerelease. This intentionally makes unqualified npm installs resolve to alpha software. The stable-release process must replace this temporary invariant before its first publication.

Inspect live tags before release work. The queries are read-only; advancing `latest` mutates the public registry and requires an authenticated npm owner.

```sh
npm whoami --registry https://registry.npmjs.org/
npm view @tryagaindev/litefold-calendar dist-tags --json --registry https://registry.npmjs.org/
```

If npm reports that the package does not exist, stop here and follow the bootstrap case above. Do not interpret a failed or malformed registry response as an empty tag set. The exact historical state `alpha=0.2.0-alpha.0` and `latest=0.1.0-alpha.0` is accepted only to transition the next release into the new invariant; later releases require the two predecessor tags to match.

Complete npm's second-factor flow if it is required for a registry mutation. Do not record an OTP in a command transcript, issue, or release note.

After trusted publishing has placed the exact candidate under `alpha`, confirm the immutable version exists and atomically advance `latest` to it:

```sh
npm view "@tryagaindev/litefold-calendar@EXACT_VERSION" name version --json --registry https://registry.npmjs.org/
npm dist-tag add @tryagaindev/litefold-calendar@EXACT_VERSION latest --registry https://registry.npmjs.org/
npm view @tryagaindev/litefold-calendar dist-tags --json --registry https://registry.npmjs.org/
```

Replace `EXACT_VERSION` with the workflow candidate. Both tags must select it before the workflow publishes the immutable GitHub prerelease. Do not remove `latest`, point it at an unpublished or different version, or give the publish-only OIDC identity general dist-tag administration authority. If the workflow's polling window expires, complete and verify this exact tag update, then rerun the failed jobs for the original release attempt.

## Historical tag exception

`v0.1.0-alpha.0` predates the protected automated-tag and immutable-release policy.  Its historical tag shape or remote identity must not be changed to simulate the new guarantees.  Treat it as a documented pre-immutability exception; every future version must satisfy the exact-SHA tag ruleset and immutable-release policy.

## Publication authority

The workflow deliberately separates source execution from publication authority:

| Phase | Source checkout or execution | Authority and output |
| --- | --- | --- |
| Classify and verify | Exact pushed `github.sha`; full repository gate | Read-only repository access; retains the package bundle and release notes |
| Stage GitHub release | No checkout and no project-code execution | Repository write access; creates or validates the exact tag, draft prerelease, notes, and assets |
| Publish npm | No checkout, install, or candidate import | Protected `npm` environment and npm OIDC; publishes only the checksum-verified tarball under `alpha` |
| Synchronize npm channels | No workflow credential | An authenticated npm owner advances `latest` to the exact published alpha |
| Verify and finalize | Clean public-package consumer, then a source-free release job | Requires `alpha` and `latest` to match, verifies registry bytes/imports/signatures/provenance, publishes the immutable GitHub prerelease, then queues Pages |

`publish-alpha.yml` starts on pushes to `main`, but only a changed alpha version with an exact first-parent diff limited to `package.json`, `package-lock.json`, and `CHANGELOG.md` enters publication. It always uses the push's `github.sha`; there is no operator-supplied historical SHA.

Release Pages are queued through `deploy-examples.yml` only after npm verification and the public immutable prerelease. That workflow separately owns Pages build, retained state, rollback, and deployment authority. See [static example deployment](example-deployment.md) for its operating procedure.

Reruns accept existing state only when identity and bytes match exactly:

- An npm version is complete only when registry integrity matches the retained tarball and both `alpha` and `latest` identify the exact version. A clean exact-version install and both supported imports must succeed with lifecycle scripts disabled. Signatures and SLSA provenance must bind the exact package bytes, repository, `refs/heads/main`, push commit, workflow, and GitHub-hosted builder.
- A tag, draft, published prerelease, or asset is reusable only at the same full commit with identical notes and bytes.
- A release Pages path is reusable only when its version, tag commit, manifest, and bytes match exactly.
- Authentication, network, malformed response, missing provenance, and ambiguous or conflicting public state abort the transition.

## Rerun procedure

1. Open the original **Publish npm alpha** run for the release merge commit. Do not start a different workflow or manufacture another event.
2. Confirm the run's full commit SHA and candidate version match the retained bundle and any existing npm, tag, draft/release, or asset state.
3. Use **Re-run failed jobs** (or **Re-run all jobs** when the failed dependency chain requires it).
4. After completion, independently verify npm and GitHub identities, then verify the separately queued Pages run.

If the original run is no longer rerunnable, or any public identity cannot be proved to match, do not recreate the attempt from another commit. Use the recovery matrix and prepare a greater alpha where required.

## Recovery matrix

| State | Recovery |
| --- | --- |
| Failure before npm publication | Fix only non-public configuration or transient infrastructure, then rerun the original exact-push attempt. No npm version is public; a matching staged tag, draft, and assets may already exist and will be reused. If source must change, prepare a greater alpha instead. |
| npm accepted identical verified bytes but the run ended afterward | Rerun the original publication attempt for that exact push so event identity, artifact, and provenance remain unchanged. There is no arbitrary historical-SHA dispatch. If the original attempt cannot be resumed safely, do not move `main` or substitute another event; stop, deprecate the incomplete version when appropriate, and prepare a greater alpha. |
| npm accepted the candidate under `alpha`, but `latest` still selects the predecessor | Confirm the candidate's exact version and retained integrity, advance only `latest` to that candidate with an authenticated owner, then rerun the original failed jobs. |
| npm contains the version with different or unverifiable bytes | Stop.  Do not reuse the version.  Investigate, deprecate when appropriate, and prepare a greater alpha. |
| Tag, draft, or asset exists with matching identity | Rerun with the exact version and commit; the stage is idempotent. |
| Tag, draft, or asset conflicts | Do not move, delete, or overwrite it as part of a rerun.  Investigate and prepare a greater alpha when the conflict represents public release state. |
| Published npm alpha is defective | Deprecate the exact version with a replacement message and publish a greater alpha.  Avoid `npm unpublish` except for a genuine security/legal need allowed by npm policy. |
| Immutable GitHub prerelease is defective | Leave it intact and publish a corrected greater alpha. |
| Rolling `main` Pages preview is defective | Run **Deploy static examples** with **Operation** set to **rollback** and **Snapshot ref** set to the exact 40-character lowercase `pages-content` commit documented by the deployment guide. |
| Release Pages verification failed | Rerun **Deploy static examples** with **Operation** set to **release** and **Release ref** set to the exact protected `v<version>` tag. Never replace a release path with different bytes. |

Registry administration such as moving a dist-tag or deprecating a version requires an authenticated npm owner and is intentionally outside trusted publication. Before deprecating, replace every uppercase placeholder below and inspect both versions:

```sh
npm view "@tryagaindev/litefold-calendar@EXACT_VERSION" name version deprecated dist.integrity --json --registry https://registry.npmjs.org/
npm view "@tryagaindev/litefold-calendar@REPLACEMENT_VERSION" name version --json --registry https://registry.npmjs.org/
npm deprecate "@tryagaindev/litefold-calendar@EXACT_VERSION" "Use REPLACEMENT_VERSION instead." --registry https://registry.npmjs.org/
npm view "@tryagaindev/litefold-calendar@EXACT_VERSION" name version deprecated --json --registry https://registry.npmjs.org/
```

The `npm deprecate` command mutates public registry metadata. Record the incident and recovery in the relevant GitHub release or repository issue without exposing credentials or private vulnerability details.
