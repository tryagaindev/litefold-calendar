# Static example deployment

This guide is for maintainers operating the GitHub Pages developer demo. Contributors validate example changes through the [examples contributor lane](../examples/README.md#contributors) and do not deploy them manually: successful CI updates the rolling `main` preview, and successful alpha publication triggers immutable release snapshots.

## URL and identity contract

| Channel | Path below the Pages root | Update rule |
| --- | --- | --- |
| Rolling main preview | `main/examples/` | Replaced after successful CI for the exact `main` commit, or restored from retained deployment history |
| Immutable release | `releases/<package-version>/examples/` | Added by a separate release operation for the exact protected package tag; different bytes can never replace it |

The Pages root selects the greatest SemVer release in `site-manifest.json` for its primary **Run** action. If no valid release exists, it falls back to the rolling preview and an `@alpha` install command. Release pages always show an exact version.

Each landing page and recipe identifies its channel, package version, full source commit, and commit-pinned source links. Static navigation remains useful when JavaScript is disabled or metadata cannot be loaded. Browser enhancement reads only validated same-origin metadata with `no-store`.

All deployed assets are repository-owned and same-origin. The demo has no analytics, trackers, CDNs, or third-party runtime assets.

## Operations at a glance

| Operation | Trigger | Maintainer or operator action |
| --- | --- | --- |
| Update rolling preview | Successful `CI` run for a push to `main` | None; inspect the resulting **Deploy static examples** run |
| Add release snapshot | Successful **Publish npm alpha** completion after npm and GitHub release verification | None; verify the publisher-linked **Deploy static examples** run |
| Retry release snapshot | Rerun the original publisher-linked **Deploy static examples** run only after a transient or hosted-state failure | Do not dispatch a release or supply a ref; if no downstream run exists, rerun the original publisher |
| Restore rolling preview | Manual **Roll back static examples** dispatch from `main` | Set **Snapshot ref** to an exact retained commit |

The separately scoped manual workflow is rollback-only. **Deploy static examples** has no manual trigger, and **Roll back static examples** has no release operation. To move a preview forward after a rollback, let CI succeed for a later `main` commit that descends from the restored source commit.

## Repository setup

Before the first deployment, a maintainer with GitHub `Admin` access to the
repository must:

1. Configure Pages to use **GitHub Actions** as its source.
2. Protect the `github-pages` environment independently from `npm` and allow deployments from `main` only.
3. Allow the workflow token to create and maintain `pages-content` while restricting direct and force pushes to that branch.
4. Keep `main`, `v*` tags, workflow files, and environment-rule changes under review.

The first successful deployment creates `pages-content`. It is retained deployment state, not a legacy Pages source branch. Never edit its `main/`, `releases/`, or `site-manifest.json` paths by hand.

These settings are hosted state and cannot be proved by repository tests. Recheck them after relevant repository, workflow, environment, or ownership changes.

## Build and authority boundaries

Pages operations are split by trust boundary. `deploy-examples.yml` is `workflow_run`-only: successful same-repository `CI` and **Publish npm alpha** completions supply an exact `main` head commit for rolling and release channels. `rollback-examples.yml` is `workflow_dispatch`-only and can restore an exact retained `main/` snapshot. Neither workflow accepts a manual release ref.

After npm verification and publication of the immutable GitHub prerelease, successful completion of `publish-alpha.yml` triggers Pages through GitHub's native `workflow_run` event. Pages verifies the canonical workflow name-and-path pair, same-repository push, full head commit, first-parent version change, protected tag, immutable prerelease, and main ancestry before building the release channel. npm/GitHub publication has no Pages authority, and a Pages failure does not make an already-published package version replaceable.

Before an automatic Pages snapshot can be retained, repository tooling:

- Generates `examples/metadata.json` as deployment provenance from the package version, exact source commit, and channel. The file is ignored build output; never edit or commit it.
- Copies only the browser runtime files from `dist/` and `examples/`.
- Injects the self-only Content Security Policy and developer provenance navigation into every staged page.
- Rejects direct literal remote scripts, stylesheets, media, module imports, workers, sockets, beacons, and fetch targets.
- Reads retained `pages-content` history and refuses deletion or byte-different replacement of an existing release directory.
- Validates retained `main` metadata and accepts a new rolling preview only when its source commit is equal to or descended from the currently retained preview commit.

The source-executing automatic build stage has read-only repository permission and no npm or Pages deployment authority. The retained-snapshot job checks out the same exact upstream head commit and runs the assembler from that revision; it does not use tooling from a newer default-branch commit. It has narrowly scoped repository write permission, and its credential-stripped, unprivileged child runs only that pinned assembler, not application build code.

Manual rollback transfers no producer-composed site artifact. Its writer authenticates the current `pages-content` head and selected retained ancestor, extracts the selected commit's exact `main/` bytes, preserves the current retained releases and root shell, and runs the trusted default-branch assembler as a credential-stripped unprivileged child. The assembler requires the root shell's one exact Content Security Policy before runtime resources and rejects remote root runtime assets. A missing, incompatible, or policy-invalid retained shell fails closed; do not substitute raw repository shell files. First let a normal descendant `main` deployment migrate the retained shell, verify it, and then retry rollback.

Both Pages workflows share one workflow-level `static-examples-deploy-<repository>` concurrency group with `queue: max` and `cancel-in-progress: false`. The lock covers retained-state validation and writes, packaging, the final retained-head check, and deployment. A run may wait behind earlier Pages work; do not cancel or bypass the queue. The deployment job then enters the protected `github-pages` environment with only Pages and Pages-OIDC authority. Pages jobs have no npm publication authority.

## Verify a deployment

Do not verify from the root page alone; it may legitimately select a different release than the channel being checked.

For a rolling preview:

- Confirm the latest successful deployment run corresponds to the expected successful `CI` run and source commit.
- Open `main/examples/metadata.json` and compare its full commit with that run.
- Open `main/examples/` and one directly linked recipe; confirm both show **Rolling main preview** and the same provenance.

For a release:

- Confirm the Pages run was triggered by the successful **Publish npm alpha** run and used that run's exact full head commit. Do not confuse it with the CI-linked rolling-main run that may have the same commit.
- Confirm `releases/<version>/examples/metadata.json` reports the exact version, `release` channel, and the full commit from `package-verification.json` and the protected tag.
- Confirm `site-manifest.json` maps that version to the same immutable directory.
- Open the release landing page and one recipe deep link; confirm the visible provenance and source links match.

A rolling mismatch is expected only during an intentional rollback or while a newer deployment is completing. Any other missing or inconsistent identity requires investigation.

## Roll back the rolling preview

A rollback restores exact retained `main/` bytes. It does not rebuild an old source revision, restore the selected commit's historical root shell, rewrite an immutable release, remove a later release directory, or change npm. The root shell intentionally remains the current retained shell and is restamped for the selected historical `main/` metadata.

1. Fetch the retained history and list full snapshot commits that changed `main/`:

   ```sh
   git fetch origin refs/heads/pages-content:refs/remotes/origin/pages-content
   git log --format='%H %s' origin/pages-content -- main/
   ```

2. Inspect a candidate before dispatching. Replace `SNAPSHOT_COMMIT` in both commands with a full lowercase commit from the previous command:

   ```sh
   git merge-base --is-ancestor SNAPSHOT_COMMIT origin/pages-content
   git show SNAPSHOT_COMMIT:main/examples/metadata.json
   ```

   The first command must exit successfully. Confirm that the metadata names the exact source commit and version you intend to restore.

3. Open **Roll back static examples** from `main`, select **Run workflow**, and set **Snapshot ref** to that same 40-character commit. Do not use **Deploy static examples**; it has no manual trigger.
4. The workflow may wait behind an automatic Pages run; that is expected. Wait for **Reconstruct and restore the exact retained main snapshot**, **Package retained Pages snapshot**, and **Deploy retained static examples** to succeed. The writer reconstructs the site from authenticated Git objects and does not download a producer-composed rollback site. Confirm that `main/` contains the selected retained bytes, the current retained root shell and its CSP remain in place, the manifest's `main` entry matches the restored metadata, and all `releases/<version>/` directories remain unchanged. A retained-head or shell-policy failure is a stop condition: rerun the entire workflow after the active deployment or reviewed shell migration completes.
5. Repeat the rolling-preview checks in [Verify a deployment](#verify-a-deployment).

The restored preview is deliberately behind repository `main`; its visible source commit distinguishes an intentional rollback from an unexplained stale deployment. Move forward through a later CI-approved descendant commit, never by editing retained state.

An automatic deployment never moves the retained preview backward or onto divergent history. The rollback-only manual dispatch is the sole backward path; after rollback, a queued automatic deployment may legitimately move forward again, but only along ancestry from that restored source commit. Always verify the rollback run and live site before treating the preview as restored, including after a no-op rollback.

## Recover an inconsistent release deployment

If release metadata or a deep link is missing, first compare the upstream publisher run and head SHA, protected tag, GitHub prerelease, package receipt, retained `pages-content` state, and live site. Do not copy files into `pages-content` or edit the site manually.

Rerun the original publisher-linked **Deploy static examples** run only when all existing identities and bytes match and the failure was transient or caused by hosted state. That rerun keeps the original commit SHA, ref, and workflow definition; it cannot consume later changes. If GitHub never created the downstream run, review the current default-branch `deploy-examples.yml`, then select **Re-run all jobs** on the successful original **Publish npm alpha** run. The publisher retains its original identity, while the new downstream run uses the current Pages workflow definition and still pins release source and assembly tooling to the publisher SHA. Validate that new run independently. Never use **Roll back static examples** for a release. If release source, assembly tooling, or published example bytes must change, stop and publish a greater package version.

## Verification

`npm run check` is the complete repository gate. Tooling covers metadata and manifest validation, release ordering, static fallbacks, commit-pinned links, asset filtering, remote-resource rejection, exact CSP enforcement, retained-path immutability, idempotent retries, monotonic preview ancestry, workflow permissions, shared workflow-level queuing, authenticated writer-side rollback reconstruction, and rollback selection. Browser tests cover every published example route plus keyboard/focus behavior, narrow full-SHA reflow, dark mode, forced colors, reduced motion, and automated accessibility rules.

[Back to the documentation hub](README.md)
