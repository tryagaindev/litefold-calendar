# Alpha release administration and recovery

This guide is for repository and npm administrators. It covers one-time hosted setup, registry mutations, and failed-release recovery. Release operators should normally use the [alpha release operations runbook](release-operations.md).

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
| Verify and finalize | Clean public-package consumer, then a source-free release job | Requires `alpha` and `latest` to match, verifies registry bytes/imports/signatures/provenance, publishes the immutable GitHub prerelease, then completes successfully so native `workflow_run` starts Pages |

`publish-alpha.yml` starts on pushes to `main`, but only a changed alpha version with an exact first-parent diff limited to `package.json`, `package-lock.json`, and `CHANGELOG.md` enters publication. It always uses the push's `github.sha`; there is no operator-supplied historical SHA.

Release Pages start through the `workflow_run`-only `deploy-examples.yml` after successful completion of the publisher that verified npm and made the immutable prerelease public. The same-repository event supplies the exact publisher head commit; there is no release-ref input. Manual retained-main recovery is isolated in the `workflow_dispatch`-only `rollback-examples.yml`; it accepts a retained snapshot commit, never a release ref. Both workflows use the same queued workflow-level lock, so one run owns retained-state validation through final deployment before the next begins. See [static example deployment](example-deployment.md) for both procedures.

Reruns accept existing state only when identity and bytes match exactly:

- An npm version is complete only when registry integrity matches the retained tarball and both `alpha` and `latest` identify the exact version. A clean exact-version install and both supported imports must succeed with lifecycle scripts disabled. Signatures and SLSA provenance must bind the exact package bytes, repository, `refs/heads/main`, push commit, workflow, and GitHub-hosted builder.
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

## Forward repair before public release state exists

This exceptional path repairs a release commit already pushed to `main` when its workflow itself must change. It preserves the intended version without rewriting published history. Use it only when all of these statements are independently true:

- npm returns `E404` for the exact candidate version;
- the candidate's remote `v<version>` tag is absent;
- GitHub has no draft or published release for the candidate;
- no release asset or Pages release directory exists for the candidate;
- `origin/main` still points to the failed release commit, and no newer work must be preserved separately; and
- the failure happened before any public release identity was created.

If any statement is false or cannot be proved, stop. Do not move a tag, delete a draft, overwrite an asset, rewrite `main`, or reuse the version. Prepare a greater alpha instead.

The publisher requires the final release commit's first parent to contain the predecessor version and the final commit to change exactly `CHANGELOG.md`, `package-lock.json`, and `package.json`. Therefore this recovery is one atomic push containing two ordinary commits; do not squash them and do not force-push.

Before step 1, replace `0.3.0-alpha.0` in the checks below with the exact failed candidate. These are read-only. The npm command must return `E404`, both Git commands that search for candidate state must print nothing, and the two commit commands must print the same full SHA:

```sh
npm view "@tryagaindev/litefold-calendar@0.3.0-alpha.0" version --registry https://registry.npmjs.org/
git ls-remote --tags origin refs/tags/v0.3.0-alpha.0
git fetch origin refs/heads/main:refs/remotes/origin/main refs/heads/pages-content:refs/remotes/origin/pages-content
git rev-parse HEAD
git rev-parse origin/main
git ls-tree --name-only origin/pages-content "releases/0.3.0-alpha.0"
```

In GitHub, open **Releases**, search for `tag:v0.3.0-alpha.0`, then search for `draft:true tag:v0.3.0-alpha.0`; both searches must have no result. Open **Tags** and confirm the candidate is absent. A release result, draft, asset, tag, npm version, Pages directory, or mismatched commit is a stop condition.

1. Require a clean worktree and create a local backup branch at the failed commit. For the example candidate, use `git status --short` and require no output, then run `git branch backup/failed-v0.3.0-alpha.0`. Do not push or delete the backup until recovery completes.
2. Restore only the three release-state files from the failed commit's first parent:

   ```sh
   git restore --source=HEAD^ -- CHANGELOG.md package-lock.json package.json
   ```

3. Apply the reviewed workflow or source repair and add its user-visible or operationally significant notes under `CHANGELOG.md` `[Unreleased]`. Run the focused tests and `npm run check:static`, review every changed file, verify the protected Git identity, and commit the complete repair plus the restored predecessor release state as the carrier commit.
4. Regenerate the same candidate with the appropriate bump. For a failed `0.3.0-alpha.0` attempt whose restored predecessor is `0.2.x`, use:

   ```sh
   npm run release:prepare -- --bump preminor --dry-run
   npm run release:prepare -- --bump preminor
   npm run release:verify
   ```

5. Confirm the working-tree diff contains exactly `CHANGELOG.md`, `package-lock.json`, and `package.json`, review their contents, and commit them as `chore: release <version>`.
6. Run the complete `npm run check` gate from a clean worktree. Confirm the last commit changes exactly the three release-state files, its parent contains the predecessor version, and both new commits use the protected GitHub no-reply email.
7. Immediately before pushing, repeat every npm and GitHub collision check from the start of this procedure. The exact-version `npm view` must still return `E404`. In GitHub, repeat both release searches and the tag check; all must still have no result. Then run the commands below. They must all succeed and print no output. They prove that the reviewed `HEAD` is exactly two commits above the unchanged remote failure, the worktree is clean, both commits use Basi's protected address as author and committer, the remote candidate tag is absent, and `pages-content` still has no candidate release directory. Another operator must substitute their own candidate version and protected GitHub no-reply address.

   ```sh
   git fetch origin refs/heads/main:refs/remotes/origin/main refs/heads/pages-content:refs/remotes/origin/pages-content
   test "$(git rev-parse HEAD~2)" = "$(git rev-parse origin/main)"
   test "$(git rev-list --count origin/main..HEAD)" -eq 2
   test -z "$(git status --short)"
   test "$(git log -2 --format='%ae%n%ce' | sort -u)" = "6586019+redbasi@users.noreply.github.com"
   test -z "$(git ls-remote --tags origin refs/tags/v0.3.0-alpha.0)"
   test -z "$(git ls-tree --name-only origin/pages-content 'releases/0.3.0-alpha.0')"
   ```

   A failure means the remote moved, the wrong commit is checked out, the repair contains more or fewer than two commits, the tree is dirty, the Git identity is wrong, or public candidate state appeared. Stop and investigate; do not push.
8. Push the reviewed `HEAD` explicitly to remote `main` without force, then prove the remote ref equals that same commit:

   ```sh
   git push --atomic origin HEAD:refs/heads/main
   test "$(git rev-parse HEAD)" = "$(git ls-remote --heads origin refs/heads/main | awk 'NR == 1 { print $1 }')"
   ```

9. Treat the resulting publisher run as a fresh release attempt. Retain the local backup branch until npm, the immutable GitHub prerelease, and Pages all verify successfully.

This procedure is not valid after npm publication or any tag, draft, asset, or release identity exists. It is also not a way to change already-published package bytes.

## Recovery matrix

| State | Recovery |
| --- | --- |
| Failure before npm publication | Resolve only transient infrastructure, authentication, or hosted-state configuration, then rerun the original exact-push attempt. No npm version is public; a matching staged tag, draft, and assets may already exist and will be reused. If source or workflow files must change and every public identity is absent, follow [Forward repair before public release state exists](#forward-repair-before-public-release-state-exists). Otherwise prepare a greater alpha. |
| npm accepted identical verified bytes but the run ended afterward | Rerun the original publication attempt for that exact push so event identity, artifact, and provenance remain unchanged. There is no arbitrary historical-SHA dispatch. If the original attempt cannot be resumed safely, do not move `main` or substitute another event; stop, deprecate the incomplete version when appropriate, and prepare a greater alpha. |
| npm accepted the candidate under `alpha`, but `latest` still selects the predecessor | Confirm the candidate's exact version and retained integrity, advance only `latest` to that candidate with an authenticated owner, then rerun the original failed jobs. |
| npm contains the version with different or unverifiable bytes | Stop.  Do not reuse the version.  Investigate, deprecate when appropriate, and prepare a greater alpha. |
| Tag, draft, or asset exists with matching identity | Rerun with the exact version and commit; the stage is idempotent. |
| Tag, draft, or asset conflicts | Do not move, delete, or overwrite it as part of a rerun.  Investigate and prepare a greater alpha when the conflict represents public release state. |
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
