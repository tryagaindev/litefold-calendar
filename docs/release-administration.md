# Alpha release administration and recovery

This guide is for maintainers who manage GitHub and npm release controls. It owns
hosted controls, unsupported transitions, exceptional registry actions, reruns,
and the recovery matrix. Release operators use the
[alpha release operations runbook](release-operations.md) for the normal ordered
procedure and exact channel command.

## One-time hosted prerequisites

Verify these settings before enabling publication and after any owner,
repository, workflow filename, environment, package-ownership, or hosted-policy
change.

### GitHub organization

- Require two-factor authentication for members and outside collaborators.
  Grant organization-owner access only where it is needed for policy management
  and account recovery.
- Keep base repository permission at **None** and grant repository access
  explicitly.
- Permit only approved GitHub-owned Actions and reusable workflows, require full
  commit-SHA pinning, keep the default `GITHUB_TOKEN` read-only, and prevent
  workflows from creating or approving pull requests.
- Restrict classic personal access tokens, require approval and expiration for
  fine-grained tokens, and review OAuth application access.

### npm

- Confirm the public repository identity exactly matches
  `package.json#repository`.
- Confirm that only the intended accounts can administer the `@tryagaindev`
  scope or maintain the package, and require two-factor authentication for those
  accounts.
- Bind [npm trusted publishing](https://docs.npmjs.com/trusted-publishers/) to
  the exact GitHub owner, repository, `publish-alpha.yml` workflow, `npm`
  environment, and the **npm publish** allowed action only. Keep the job on a
  GitHub-hosted runner with `id-token: write`.
- Disallow long-lived publication tokens. Once trusted publishing is active,
  require two-factor authentication and disallow tokens for direct package
  publication.

### GitHub repository and release

- Protect the `npm` environment with required reviewers, block administrator
  bypass, and restrict it to `main`. When multiple eligible people can serve as
  required reviewers, prevent self-review and require an independent approval.
  While the project has one maintainer, do not enable prevent self-review when it
  would deadlock publication; record that hosted decision.
- Protect `main` with pull requests, the current **Build, test, and verify
  package** check, resolved conversations, CodeQL merge protection, linear
  history, and blocks on deletion and force pushes. Require independent approval
  and code-owner review whenever another eligible maintainer is available.
- Protect `v*` tags with a repository ruleset that blocks updates and deletion
  and grants creation to the narrowest available actor. The workflow creates
  and verifies an exact-SHA tag, but its `GITHUB_TOKEN` identifies the installed
  GitHub Actions application rather than one specific workflow. Treat the tag
  ruleset as defense in depth, keep unrelated workflows from receiving tag-write
  authority, and verify the effective bypass actors directly.
- Enable only squash merging, using the pull-request title and description.
- Enable
  [GitHub immutable releases](https://docs.github.com/en/code-security/concepts/supply-chain-security/immutable-releases).
  Attach artifacts while the prerelease is a draft because published tags and
  assets cannot be replaced. Release titles and notes remain editable on the
  platform; restrict write access and audit them against retained evidence.
- Enable dependency graph, Dependabot alerts and security updates, CodeQL,
  provider-pattern secret scanning, push protection, and private vulnerability
  reporting. Verify every repository-level feature directly; an organization
  default is not evidence that the repository still has the intended setting.

### GitHub Pages

- Use **GitHub Actions** as the Pages source.
- Protect the `github-pages` environment independently from npm authority,
  block administrator bypass, and restrict deployment to `main`.
- Protect the retained `pages-content` branch from deletion and
  non-fast-forward updates. Only the verified retained-state workflow advances
  it.
- Keep automatic and rollback Pages workflows in the same non-canceling,
  maximum-queue workflow-level concurrency group.

Repository files and tests describe these requirements but cannot prove hosted
settings. Verify them in GitHub and npm, then record the verifier, UTC time, and
sanitized evidence in the private release record.

## Publication authority

The workflow separates source execution from public write authority:

| Phase | Source execution | Authority and output |
| --- | --- | --- |
| Classify and verify | Exact pushed commit; complete repository gate | Read-only repository access; retains the package bundle and release notes |
| Stage GitHub release | No checkout or project-code execution | Repository write access; creates or validates the exact tag, draft prerelease, notes, and assets |
| Publish npm | No checkout or candidate-code execution | Protected `npm` environment and npm OIDC; publishes only the checksum-verified tarball under `alpha` |
| Synchronize npm channels | No workflow credential | An authenticated npm package maintainer advances `latest` to the exact verified alpha |
| Verify and finalize | Clean public-package consumer, then a source-free release job | Verifies registry identity, imports, signatures, provenance, tag, release, and retained bytes before the native Pages handoff |

`publish-alpha.yml` starts only on pushes to `main`. Only a changed alpha
version whose first-parent diff is limited to `package.json`,
`package-lock.json`, and `CHANGELOG.md` enters publication. There is no
manual, arbitrary-ref, or non-current-commit publication path.

Release Pages start only through the successful publisher's native
`workflow_run` handoff. Manual rolling-preview recovery remains isolated in
`rollback-examples.yml`. See
[static example deployment](example-deployment.md) for that authority boundary.

Source-free release jobs name the repository explicitly for every GitHub CLI
mutation. Do not add a checkout merely to infer repository context.

## Temporary alpha channel policy

Until a reviewed stable-release procedure replaces it, a completed alpha release
requires npm `alpha` and `latest` to select the same exact prerelease.
Registry reads must be fresh and well-formed; a missing package, failed response,
or malformed response is not an empty tag set.

The npm package maintainer performs authentication and channel mutation privately. Automation
must never receive the browser session, authentication URL, password, token,
one-time code, or recovery code. Follow
[the operations channel step](release-operations.md#5-advance-the-temporary-npm-latest-tag)
for the sole normal command sequence.

## Unsupported transitions

Stop and design a separately reviewed procedure before any of these transitions:

- the package's first public publication or trusted-publisher bootstrap;
- the first stable release;
- replacing the temporary `alpha`/`latest` channel policy;
- changing the trusted publisher's allowed action or adopting npm staged
  publishing;
- unpublishing a version;
- moving, recreating, deleting, or replacing an immutable tag, release, asset,
  or release Pages path; or
- publishing from a ref or commit outside the protected normal path.

The new procedure must define authorization, exact identities, audit evidence,
credential boundaries, rollback or irreversibility, workflow changes, and
independent verification before execution. Do not consume a candidate already
prepared for the normal automated path.

Deprecating a defective published version is a supported exceptional metadata
action only when an authorized npm package maintainer has verified the exact version,
replacement guidance, and private release record. Use the dedicated section
below. Rolling `main` Pages rollback is also supported, but only through the
[deployment rollback procedure](example-deployment.md#roll-back-the-rolling-preview).

## Rerun procedure

A rerun uses the original run's commit, ref, and workflow definition. It may
consume corrected transient infrastructure, authentication, or hosted
configuration, but it cannot consume source or publisher-workflow changes merged
later.

1. Open the original **Publish npm alpha** run for the recorded release commit.
2. Confirm its full commit, version, retained bundle, and any npm, tag, draft,
   release, notes, or asset state match exactly.
3. Confirm no source or publisher-workflow bytes changed to enable recovery.
4. Select the rerun scope from the recorded job state:
   - Use **Re-run failed jobs** when publication did not occur, or when the
     `publish` job succeeded and only registry verification, release
     finalization, or the native downstream handoff failed.
   - Use **Re-run all jobs** when npm accepted the candidate but the `publish`
     job itself failed. The `verify` job must rebuild the registry snapshot
     before `publish` can safely recognize the existing candidate.
   - Also use **Re-run all jobs** when a missing native downstream event must be
     emitted again.
5. Independently verify npm, GitHub, and the publisher-linked Pages run after
   completion.

A newly emitted Pages run uses the current default-branch Pages workflow while
pinning release source and assembly tooling to the publisher commit. Review that
workflow and validate the new run independently. If the original run is no longer
rerunnable or any identity cannot be proved, do not recreate the attempt from a
different commit.

## Recovery matrix

| Observed state | Required action |
| --- | --- |
| Preparation reports an existing release branch or pull request | Record the branch head and pull request, then compare their exact three-file state, base commit, candidate, and review status with the requested preparation. Resume only an exact still-valid match. Otherwise preserve any unrelated work; after explicit authorization, a maintainer with the required GitHub access records the old head, closes the stale pull request, removes only the stale unmerged release branch, and reruns preparation from current `main`. |
| Failure before npm publication | Resolve only a transient infrastructure, authentication, or hosted-configuration problem, then rerun the original exact attempt. Matching staged state may be reused. If source or publisher-workflow bytes must change, prepare a greater alpha. |
| npm accepts the upload but the version remains unavailable after registry polling | Treat the version as pending or blocked by publish-time review. Do not republish, reuse the version, or prepare a replacement while registry state is ambiguous. Check npm status and private npm package maintainer notifications; appeal a block through npm when offered. Once the exact expected integrity is publicly readable, rerun the original attempt. |
| npm accepted identical verified bytes but the run ended afterward | If the `publish` job failed after npm accepted the candidate, use **Re-run all jobs** so `verify` rebuilds the registry snapshot before `publish` recognizes the existing candidate. If `publish` succeeded and only a downstream job failed, use **Re-run failed jobs**. Preserve the original event identity, artifact, and provenance. If exact resumption cannot be proved, stop and prepare a greater alpha; deprecate the incomplete version when appropriate. |
| npm accepted the candidate under `alpha`, but `latest` selects another version | Confirm candidate identity and retained integrity, perform the operations runbook's exact channel step, then rerun the original failed jobs. |
| npm contains the version with different or unverifiable bytes | Stop. Do not reuse or overwrite the version. Investigate, deprecate when appropriate, and prepare a greater alpha. |
| Tag, draft, release, notes, or assets exist with matching identity and bytes | Rerun the original exact attempt; the matching stage is idempotently reusable. |
| Tag, draft, release, notes, or assets conflict or cannot be proved | Stop. Do not move, delete, replace, or reuse them. Investigate and prepare a greater alpha. |
| Published package or immutable prerelease is defective | Preserve immutable state, deprecate the package version when appropriate, and publish a corrected greater alpha. |
| Publisher-linked release Pages run failed | Rerun that exact Pages run only for a transient or hosted-state problem. If release source or assembly tooling must change, publish a corrected greater alpha. |
| No publisher-linked release Pages run exists | Confirm the original publisher succeeded, review the current Pages workflow, rerun all jobs on the original publisher, and validate the newly emitted Pages run against the recorded release commit. |
| Rolling `main` Pages preview must move backward | Use **Roll back static examples** with the exact retained snapshot commit defined by the deployment guide. Never use it to create or replace release Pages. |

Authentication, network, malformed responses, missing provenance, and ambiguous
or conflicting public state fail closed.

## Exceptional registry metadata

An authenticated npm package maintainer may deprecate an exact defective version after a
replacement has been selected. Replace every uppercase placeholder and inspect
both versions before mutating registry metadata:

```sh
npm view "@tryagaindev/litefold-calendar@EXACT_VERSION" name version deprecated dist.integrity --json --registry https://registry.npmjs.org/
npm view "@tryagaindev/litefold-calendar@REPLACEMENT_VERSION" name version --json --registry https://registry.npmjs.org/
npm deprecate "@tryagaindev/litefold-calendar@EXACT_VERSION" "Use REPLACEMENT_VERSION instead." --registry https://registry.npmjs.org/
npm view "@tryagaindev/litefold-calendar@EXACT_VERSION" name version deprecated --json --registry https://registry.npmjs.org/
```

The mutation requires explicit authorization immediately before
`npm deprecate`. Record the exact identities, reason, npm package maintainer who
performed the action, UTC time, command result, and sanitized recovery evidence
in the private release record. Public
communication follows the normal changelog, advisory, or release-note decision;
do not expose credentials or private vulnerability details.
