# Release administration and recovery

This guide is for maintainers who configure GitHub and npm release controls. The [nightly operations runbook](release-operations.md) owns the normal ordered procedure. This document owns environment setup, credential rotation, immutable-state recovery, and requirements for a future stable publisher.

## One-time hosted prerequisites

Verify hosted settings before enabling the nightly schedule and after changes to ownership, repository, workflow names, environments, package permissions, or policy. Repository tests check configuration contracts; they cannot prove that hosted controls are configured correctly. Record the verifier, UTC time, and sanitized evidence.

### GitHub organization

Require two-factor authentication and grant repository and organization administration only where needed. Keep default repository permission and `GITHUB_TOKEN` access minimal. Allow approved Actions pinned to full commit SHAs, review third-party access, and require expiration for credentials. Keep pull-request review authority separate from workflow write permissions.

### GitHub repository and release

- Protect `main` with reviewed pull requests, resolved conversations, linear history, deletion/force-push protection, and required CI. Require **Build, test, and verify package** and both **Qualify Firefox** jobs. Require code-owner and independent review where another eligible maintainer exists.
- Configure `npm-nightly` and `npm-nightly-tags` as separate main-only environments. Neither uses a required reviewer or wait timer: scheduled and manually requested nightlies must complete unattended. Review changes to those environments and their workflow paths.
- Keep `npm-nightly` free of registry tokens. Store the tag credential only in `npm-nightly-tags`.
- Protect `v*` tags against updates and deletion. Permit creation only for the narrowest available actor; GitHub Actions credentials identify an application, not a single workflow. Review every workflow with repository-write authority.
- Enable [GitHub immutable releases](https://docs.github.com/en/code-security/concepts/supply-chain-security/immutable-releases). Stage assets on the draft, then publish. Audit titles and notes against retained evidence because platform immutability protects tags and assets, not every metadata field.
- Keep dependency monitoring, code scanning, secret scanning, push protection, and private vulnerability reporting enabled where available. Resolve or disposition release-blocking findings.

### npm

npm supports multiple independent trusted-publisher configurations per package. They are additive: matching any configuration authorizes its permitted operation. Every configuration allows staging by default; direct publication requires a separate opt-in on that configuration. [npm's September 2026 publisher update](https://github.blog/changelog/2026-09-03-multiple-trusted-publishing-configurations-for-npm/)

Bind [npm trusted publishing](https://docs.npmjs.com/trusted-publishers/) to the exact owner `tryagaindev`, repository `litefold-calendar`, workflow filename `publish-nightly.yml`, and environment `npm-nightly`. **Enable direct publication for this nightly binding** so the workflow's `npm publish` completes without staged-release approval. Verify that setting explicitly; adding the binding with its staging-only default does not satisfy unattended delivery. The publisher uses a GitHub-hosted runner and receives `id-token: write`.

Adding the nightly binding does not revoke the alpha binding. Confirm no historical alpha publication is in flight, then remove the old alpha binding before enabling the nightly schedule. Preserve historical package versions, tags, releases, and evidence.

Maintain two-factor authentication for package maintainers and verify scope/package ownership. The isolated `latest` update requires a granular write token because the adopted npm workflow does not use OIDC for secondary dist-tag updates. This intentionally replaces the previous package setting that disallowed tokens. Select a publishing access policy that continues to require human 2FA while allowing the configured granular token; verify the effective policy in npm.

Create or delete tokens and change package access, maintainers, or trusted-publisher settings through a private interactive npm session with a 2FA challenge. A bypass-2FA token cannot perform those management operations. This applies to initial setup and subsequent credential rotations. [npm's July 2026 token-management change](https://github.blog/changelog/2026-07-31-restricting-npm-bypass-2fa-granular-access-tokens/)

Provision the credential privately through npm's [granular token settings](https://docs.npmjs.com/creating-and-viewing-access-tokens/):

1. Give it **Read and write (publish and stage)** access to **only** `@tryagaindev/litefold-calendar`. Do not grant the entire scope or organization-management permissions.
2. Enable the 2FA bypass needed for unattended package metadata writes. This grants broader package-write authority than dist-tags alone; keep it isolated even though the workflow uses it only for `npm dist-tag add`.
3. Set expiry to **30 days**. Store its exact UTC expiry as repository variable `NPM_NIGHTLY_TAG_TOKEN_EXPIRES_AT`, formatted `YYYY-MM-DDTHH:mm:ssZ`.
4. Store the value as environment secret `NPM_NIGHTLY_TAG_TOKEN` in `npm-nightly-tags`. Do not paste it into a task, source file, workflow input, or release note.
5. Verify environment branch restrictions and that only the final tag-writing step receives the credential. Tool installation and public registry validation run before that step.

Do not introduce the token into the OIDC publish job, source checkout, project scripts, package installation, or Pages. The workflow's temporary npm authentication file is removed after the tag command. Keep a private inventory of token owner, selected package, creation/expiry, and rotation verifier without storing the value there.

npm targets January 2027 for removing direct publication from bypass-2FA granular tokens. Package bytes in this workflow already publish through OIDC; the isolated token remains the secondary-dist-tag workaround tracked in [npm CLI issue 8547](https://github.com/npm/cli/issues/8547). Replace that workaround when supported OIDC tag updates are available. [Announced token publication change](https://github.blog/changelog/2026-07-31-restricting-npm-bypass-2fa-granular-access-tokens/)

### GitHub Pages

Use **GitHub Actions** as the Pages source. Keep `github-pages` separate from npm authority and main-only. Protect retained `pages-content` history against deletion and non-fast-forward writes; only the verified retained-state workflow advances it. Automatic deployment and manual rollback share the non-canceling Pages queue. See [example deployment](example-deployment.md).

## Publication authority

| Stage | Source execution and permissions |
| --- | --- |
| Classify and verify | Exact source checkout, read-only repository access, same-commit green CI, full gate, registry predecessor and prior Pages checks |
| Stage release | No checkout; repository write access to verified tag, draft, notes, and assets |
| Publish npm | No checkout; `npm-nightly` OIDC publishes only checksum-verified retained bytes |
| Synchronize channels | No checkout; `npm-nightly-tags` exposes the granular token only after candidate and stable-ownership checks |
| Verify and finalize | Clean public-package verification, then source-free GitHub finalization |
| Deploy Pages | Publisher-linked receipt verification; separate build, retained-state, and Pages permissions |

The workflow runs on schedule or manual dispatch from canonical `main`. A new publication requires current main and successful exact-source CI. Recovery of an already published candidate may use the original attempt after main advances only when its retained and public identities still match; this exception cannot authorize a fresh upload from old source.

The non-canceling `npm-nightly-<repository>` concurrency group covers publication, tags, and finalization. Any future stable workflow must use the same group with `queue: max` and `cancel-in-progress: false`. Source-free GitHub mutation commands provide the repository explicitly. Do not add a checkout to infer context.

<a id="temporary-alpha-channel-policy"></a>

## Nightly channel policy

Before a stable version exists, completed delivery requires `nightly` and `latest` to select the same nightly. Once any stable version exists, nightly automation must preserve stable ownership of `latest`. A missing or malformed registry response is never interpreted as an empty package or as proof that stable does not exist.

The historical `alpha` dist-tag, versions, protected tags, immutable releases, and release Pages stay frozen. The first nightly can use the completed alpha as its predecessor. It does not rewrite alpha metadata or republish an alpha.

## Tag-token rotation

Before stable exists, verification checks the expiry variable before public writes and emits a warning when seven days or fewer remain. A missing, malformed, or expired timestamp blocks publication. The variable is an operator-recorded fact; it does not independently prove that the token is valid or unrevoked.

1. In a private interactive npm session, complete the required 2FA challenge and create a replacement with the same package-only access and 30-day expiry.
2. Replace `npm-nightly-tags` secret `NPM_NIGHTLY_TAG_TOKEN` and repository variable `NPM_NIGHTLY_TAG_TOKEN_EXPIRES_AT` together. Verify the timestamp against npm.
3. Resume the original failed attempt if rotation repairs a transient authentication failure; otherwise let the next eligible nightly use it.
4. Verify the exact channel update, then revoke the old token through npm's interactive 2FA flow. Record rotation evidence without credential material.

If a token is compromised, revoke it immediately and investigate package versions and tags before resuming. Do not wait for the normal overlap. Once stable owns `latest`, the nightly tag-writing step no longer needs this token; retire it after confirming the stable workflow's separate authority.

## Rerun procedure

A rerun keeps the original run ID, creation time, source commit, workflow definition, and nightly version. `run_attempt` may increase; it does not change the package identity. Later source changes do not become part of that attempt.

1. Open the original **Publish npm nightly** run. Record failed and successful jobs and the exact version.
2. Compare its receipt, original source, retained tarball, checksum list, any draft/release, and public npm integrity. Classify the state using the matrix below.
3. Use **Re-run failed jobs** when upstream verification and retained evidence remain valid and a failed downstream step can resume them. If registry state changed because npm accepted the candidate, use **Re-run all jobs** to reclassify the existing candidate and validate its retained/public bytes before resuming.
4. Confirm that an existing publication is reused with identical bytes. Do not rebuild and republish the same version. Missing or expired evidence requires investigation, not a guessed reconstruction.
5. Verify package, channels, immutable release, and the exact publisher-linked Pages run after recovery.

A rerun can consume repaired hosted configuration or credentials. A source or publisher-code repair requires a new reviewed commit and new nightly identity. Do not rerun an old workflow expecting it to load a newer implementation.

## Recovery matrix

| Observed state | Required action |
| --- | --- |
| Source is unchanged and previous nightly completed through Pages | Verify the reported skip. No new version is expected. |
| Candidate was never published and has no partial public state | Repair transient infrastructure and rerun the original attempt only while its source remains current main, or leave it abandoned and start a new eligible current-main run. Each new run has a different version. |
| Candidate has a matching staged tag/draft/assets but no npm version, and its source remains current main | Preserve the stage and resume its exact attempt; do not collide with or overwrite the staged identity. |
| Candidate has a matching staged tag/draft/assets but no npm version, and main has advanced | Confirm no upload was accepted or remains pending. Preserve the abandoned staged identity and retained evidence, then start a new eligible current-main run with a new version. The old attempt cannot publish from stale source; do not move or overwrite its tag, draft, or assets. |
| npm accepted the upload but the exact version is not yet publicly readable | Treat it as pending, blocked, or ambiguous. Check registry status and private package-maintainer notifications. Do not reuse the version or publish another candidate to bypass uncertainty. |
| Exact npm version and integrity exist; channel synchronization or finalization failed | Restore transient credentials/configuration, then resume the original attempt with the retained bytes. Reclassify changed registry state through a full rerun when necessary. |
| Tag token is expired or revoked | Rotate the isolated token and expiry variable, verify package state, then resume the original affected attempt. |
| Stable version exists but `latest` selects a prerelease | Stop. Stable owns `latest`; investigate and use the approved stable recovery procedure. Nightly must not repair this by pointing `latest` to itself. |
| npm version, tag, draft, notes, assets, or receipt conflict | Stop and investigate. Do not overwrite, delete, or reuse the identity. A reviewed correction receives a new greater version. |
| Published package or example bytes are defective | Preserve immutable objects. Publish a corrected greater nightly and consider authorized deprecation of the defective version. |
| Publisher succeeded but its Pages run failed | Rerun the exact publisher-linked Pages run for a transient or hosted-state failure. A source or assembly-code correction needs a new reviewed version. |
| Successful publisher has no downstream Pages run | Verify the current Pages workflow, rerun the original publisher to emit its native completion event, and verify the new downstream run against the original receipt/source. |
| Rolling main preview needs to move backward | Use [rolling-preview rollback](example-deployment.md#roll-back-the-rolling-preview). It does not modify npm or any release snapshot. |
| Historical alpha requires investigation | Read the run's pinned source and retained schema-1 evidence under the historical policy. Preserve frozen public state; migration does not authorize republishing alpha or moving its tags. |

## Future stable release

Stable publication is not enabled by the nightly workflow. Before the first stable release, review and merge a stable workflow and validator changes implementing these requirements:

- Select an explicit stable SemVer through maintainer review. Update source manifest and root lockfile versions consistently, and promote reviewed `[Unreleased]` notes into the dated stable changelog entry.
- Require protected main, exact-source green CI, the full gate, and a separate stable publication environment with the intended human approval policy. Configure its exact npm trusted publisher binding; do not grant the nightly token stable-publication responsibility.
- Use the existing publication queue across stable and nightly jobs. Publish one verified retained bundle with matching SBOM, integrity, source, provenance, protected tag, and immutable release evidence.
- Publish stable under `latest` and verify it before allowing subsequent nightlies. From that first stable onward, nightly automation leaves `latest` under stable ownership even if a later nightly fails.
- Advance the development base beyond the stable series in a reviewed follow-up before the next nightly. Keep `nightly`, `alpha`, and every existing release snapshot intact.
- Define recovery before enabling dispatch: exact-byte resumption for a partial stable attempt, no version reuse or tag movement, corrected greater stable releases for defects, and receipt-bound release Pages verification.

These are prerequisites for a future stable implementation, not authorization or commands to publish stable now.

## Unsupported transitions

Separately review first-package bootstrap, staged publishing, owner/repository transfers, publication outside protected main, unpublishing, or any proposal to move/delete/replace immutable release state. Define exact identities, authority, evidence, credential boundaries, and recovery before changing the normal path.

Deprecation is a supported exceptional metadata action after authorization for the exact version and replacement message. It does not erase or replace a release.

## Exceptional registry metadata

An authorized npm package maintainer may deprecate a defective exact version after inspecting it and the selected replacement. Replace the uppercase placeholders before running:

```sh
npm view "@tryagaindev/litefold-calendar@EXACT_VERSION" name version deprecated dist.integrity --json --registry https://registry.npmjs.org/
npm view "@tryagaindev/litefold-calendar@REPLACEMENT_VERSION" name version --json --registry https://registry.npmjs.org/
npm deprecate "@tryagaindev/litefold-calendar@EXACT_VERSION" "Use REPLACEMENT_VERSION instead." --registry https://registry.npmjs.org/
npm view "@tryagaindev/litefold-calendar@EXACT_VERSION" name version deprecated --json --registry https://registry.npmjs.org/
```

Record the exact identities, reason, authorization, operator, UTC time, and readback. Existing authorization for ordinary nightly delivery does not include arbitrary deprecation. Keep private vulnerability details and credentials out of public metadata.

[Back to the documentation hub](README.md)
