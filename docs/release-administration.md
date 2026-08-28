# Alpha release administration and recovery

This guide owns hosted setup, registry administration, and exceptional recovery.  Most contributors need only the [three-step release process](releasing.md#normal-release-path).

## One-time hosted prerequisites

Repository and npm administrators must verify these settings before enabling the automated publisher and after any owner, repository, workflow filename, environment, or package-ownership change:

- The public repository identity exactly matches `package.json#repository`.
- The intended maintainers control the `@tryagaindev` npm scope and `@tryagaindev/litefold-calendar`; maintainer accounts use two-factor authentication.
- [npm trusted publishing](https://docs.npmjs.com/trusted-publishers/) is bound to the exact GitHub owner, repository, workflow filename `publish-alpha.yml`, environment `npm`, and `npm publish` permission.  Do not add a long-lived `NPM_TOKEN` secret.
- The GitHub `npm` environment requires release-maintainer approval, prevents an initiator from approving their own deployment when more than one maintainer is available, and has a deployment-branch policy that allows `main` only.
- Required CI protects `main`.  A `v*` tag ruleset blocks deletion, force updates, and unauthorized creation while permitting the release automation to create an exact-SHA tag.
- [GitHub immutable releases](https://docs.github.com/en/enterprise-cloud@latest/code-security/concepts/supply-chain-security/immutable-releases) are enabled.  Release artifacts must be attached while the prerelease is still a draft because published immutable tags and assets cannot be replaced.
- Pages uses **GitHub Actions** as its source.  The `github-pages` environment is protected independently from npm authority, its deployment-branch policy allows `main` only, and direct or force pushes to the retained `pages-content` branch are restricted.
- Secret scanning, push protection, private vulnerability reporting, and review of workflow changes are enabled.

Repository files and tests describe these requirements but cannot prove that hosted settings are enabled.  Verify them in GitHub and npm rather than inferring them from a successful local check.

If the package has never existed, an authorized npm owner may need one human-authenticated bootstrap publication before trusted publishing can be configured.  Pass `--tag alpha` explicitly, never consume the version intended for automation, and do not add a token to GitHub as a shortcut.

## Required npm dist-tag cleanup

Before enabling the protected publisher, inspect the live tags from an authenticated npm-owner workstation:

```sh
npm view @tryagaindev/litefold-calendar dist-tags --json
```

If and only if `latest` points to a prerelease, remove that tag as a separately authorized registry-administration action:

```sh
npm dist-tag rm @tryagaindev/litefold-calendar latest
npm view @tryagaindev/litefold-calendar dist-tags --json
```

The expected result is that `alpha` points to the intended current alpha and `latest` is absent or points to a stable version.  The publish-only OIDC identity must not receive dist-tag administration authority.  This repository does not claim that the cleanup has already happened.

## Historical tag exception

`v0.1.0-alpha.0` predates the protected automated-tag and immutable-release policy.  Its historical tag shape or remote identity must not be changed to simulate the new guarantees.  Treat it as a documented pre-immutability exception; every future version must satisfy the exact-SHA tag ruleset and immutable-release policy.

## Publication authority

`publish-alpha.yml` runs directly for each `main` push and cheaply classifies ordinary commits. Only an exact first-parent release-state change limited to `package.json`, `package-lock.json`, and `CHANGELOG.md` enters publication. The normal preparation flow creates `release/v<version>`, but the classifier does not rely on a branch name. The workflow uses the push's exact `github.sha`, reruns the complete gate, creates the retained package bundle, and never substitutes the current branch tip or an operator-supplied historical SHA.

The protected npm job is source-free and is the only job with npm OIDC authority. It checks out no repository source, executes no project code, and publishes only the checksum-verified five-file bundle: tarball, `LICENSE`, `SHA256SUMS`, `package-verification.json`, and `sbom.spdx.json`. Clean installation, supported imports, registry signatures, and provenance are checked afterward without npm publishing or repository-write authority.

The publisher creates or reuses only a matching protected exact-SHA tag and draft prerelease. Release notes and asset names/digests are revalidated immediately before the draft becomes public and immutable. Conflicting tags, releases, assets, registry bytes, or provenance fail closed.

The GitHub prerelease is published after npm verification. Release Pages are then queued through `deploy-examples.yml` as a separate `release` operation for the exact tag. That workflow owns Pages build, retained-state, and deployment authority; `publish-alpha.yml` does not. Rolling previews and rollback use the same separately protected Pages workflow. See [static example deployment](example-deployment.md) for its path and recovery contract.

Reruns accept existing state only when identity and bytes match exactly:

- An npm version is complete only when registry integrity matches the retained tarball, `alpha` identifies the exact version, and `latest` is absent or stable. A clean exact-version install and both supported imports must succeed with lifecycle scripts disabled. Signatures and SLSA provenance must bind the exact package bytes, repository, `refs/heads/main`, push commit, workflow, and GitHub-hosted builder.
- A tag, draft, published prerelease, or asset is reusable only at the same full commit with identical notes and bytes.
- A release Pages path is reusable only when its version, tag commit, manifest, and bytes match exactly.
- Authentication, network, malformed response, missing provenance, and ambiguous or conflicting public state abort the transition.

## Recovery matrix

| State | Recovery |
| --- | --- |
| Failure before npm publication | Fix only non-public configuration or transient infrastructure, then rerun the original exact-`push` publication attempt. Nothing public needs replacement. If source must change, prepare a greater alpha instead. |
| npm accepted identical verified bytes but the run ended afterward | Rerun the original publication attempt for that exact push so event identity, artifact, and provenance remain unchanged. There is no arbitrary historical-SHA dispatch. If the original attempt cannot be resumed safely, do not move `main` or substitute another event; stop, deprecate the incomplete version when appropriate, and prepare a greater alpha. |
| npm contains the version with different or unverifiable bytes | Stop.  Do not reuse the version.  Investigate, deprecate when appropriate, and prepare a greater alpha. |
| Tag, draft, or asset exists with matching identity | Rerun with the exact version and commit; the stage is idempotent. |
| Tag, draft, or asset conflicts | Do not move, delete, or overwrite it as part of a rerun.  Investigate and prepare a greater alpha when the conflict represents public release state. |
| Published npm alpha is defective | Deprecate the exact version with a replacement message and publish a greater alpha.  Avoid `npm unpublish` except for a genuine security/legal need allowed by npm policy. |
| Immutable GitHub prerelease is defective | Leave it intact and publish a corrected greater alpha. |
| Rolling `main` Pages preview is defective | Run **Deploy static examples** with **Operation** set to **rollback** and **Snapshot ref** set to the exact 40-character lowercase `pages-content` commit documented by the deployment guide. |
| Release Pages verification failed | Rerun **Deploy static examples** with **Operation** set to **release** and **Release ref** set to the exact protected `v<version>` tag. Never replace a release path with different bytes. |

Registry administration such as removing a dist-tag or deprecating a version requires an authenticated npm owner and is intentionally outside trusted publication:

```sh
npm deprecate @tryagaindev/litefold-calendar@<exact-version> "Use <replacement-version> instead."
```

Record the incident and recovery in the relevant GitHub release or repository issue without exposing credentials or private vulnerability details.
