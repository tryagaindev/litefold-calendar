# Static example deployment

Use this guide to operate the GitHub Pages developer demo. Contributors validate
example changes through the [examples contributor lane](../examples/README.md#contributors);
they do not deploy them manually. Successful CI updates the rolling `main`
preview. Successful nightly publication triggers immutable release snapshots.

## URL and identity contract

| Channel | Path below the Pages root | Update rule |
| --- | --- | --- |
| Rolling main preview | `main/examples/` | Replaced after successful CI for the exact `main` commit, or restored from retained deployment history |
| Immutable release | `releases/<package-version>/examples/` | Added by a separate release operation for the exact protected package tag; different bytes can never replace it |

The Pages root selects the greatest SemVer release in `site-manifest.json` for
its primary **Run** action. If no valid release exists, it falls back to the
rolling preview and an `@nightly` install command. Release pages always show an
exact version.

Site selection is independent of npm dist-tags. After a stable publication, a
newer nightly may still be the greatest displayed release while npm `latest`
remains stable.

Each landing page and recipe identifies its channel, package version, full source commit, and commit-pinned source links. Static navigation remains useful when JavaScript is disabled or metadata cannot be loaded. Browser enhancement reads only validated same-origin metadata with `no-store`.

All deployed assets are repository-owned and same-origin. The demo has no analytics, trackers, CDNs, or third-party runtime assets.

## Operations at a glance

| Operation | Trigger | Maintainer or operator action |
| --- | --- | --- |
| Update rolling preview | Successful `CI` run for a push to `main` | None; inspect the resulting **Deploy static examples** run |
| Add release snapshot | Successful **Publish npm nightly** completion after npm and GitHub release verification | None; verify the publisher-linked **Deploy static examples** run |
| Retry release snapshot | Rerun the original publisher-linked **Deploy static examples** run only after a transient or hosted-state failure | Do not dispatch a release or supply a ref; if no downstream run exists, rerun the original publisher |
| Restore rolling preview | Manual **Roll back static examples** dispatch from `main` | Set **Snapshot ref** to an exact retained commit |

The separately scoped manual workflow is rollback-only. **Deploy static examples** has no manual trigger, and **Roll back static examples** has no release operation. To move a preview forward after a rollback, let CI succeed for a later `main` commit that descends from the restored source commit.

## Repository setup

Before the first deployment, a maintainer with GitHub `Admin` access to the
repository must:

1. Configure Pages to use **GitHub Actions** as its source.
2. Protect the `github-pages` environment independently from `npm-nightly` and allow deployments from `main` only.
3. Allow the workflow token to create and maintain `pages-content` while restricting direct and force pushes to that branch.
4. Keep `main`, `v*` tags, workflow files, and environment-rule changes under review.

The first successful deployment creates `pages-content`. It is retained deployment state, not a legacy Pages source branch. Never edit its `main/`, `releases/`, or `site-manifest.json` paths by hand.

These settings are hosted state and cannot be proved by repository tests. Recheck them after relevant repository, workflow, environment, or ownership changes.

## Build and authority boundaries

Pages operations have separate trust boundaries:

| Workflow | Accepted trigger and source |
| --- | --- |
| `deploy-examples.yml` | `workflow_run` only. Successful same-repository `CI` or **Publish npm nightly** completion supplies the exact verified source commit for the rolling or release channel. |
| `rollback-examples.yml` | `workflow_dispatch` only. Restores an exact retained `main/` snapshot. |

Nightly runs are scheduled or manually dispatched from `main`. CI-linked
previews still require a push to `main`. Neither Pages workflow accepts a manual
release ref.

The publication-to-Pages handoff follows this sequence:

1. The publisher verifies npm and publishes the immutable GitHub prerelease.
2. Successful completion of `publish-nightly.yml` triggers Pages through GitHub's
   native `workflow_run` event. The publisher does not wait for Pages.
3. The operator verifies the downstream run before recording delivery complete.
   The next nightly preflight also checks the preceding release Pages.

Before building the release channel, Pages verifies:

- The canonical workflow name-and-path pair and the same-repository
  scheduled/manual publisher.
- The full source commit, protected tag, immutable prerelease, and receipt asset
  digest.
- The nightly version derived from the original publisher run's UTC creation
  time and run ID, with that version and commit checked against receipt schema 2.

The source manifest's development base is expected to differ from the published
version. A first-parent version change is not a nightly prerequisite.

npm/GitHub publication grants no Pages authority. A Pages failure does not make
an already-published package version replaceable.

Before an automatic Pages snapshot can be retained, repository tooling:

- Generates `examples/metadata.json` as deployment provenance from the exact source commit and channel. Release builds use the published version established by the publisher receipt; rolling previews use the source development version. The file is ignored build output; never edit or commit it.
- Copies only the browser runtime files from `dist/` and `examples/`.
- Injects the current self-only Content Security Policy, including `worker-src 'none'`, and developer provenance navigation into every newly staged page.
- Rejects direct literal remote scripts, stylesheets, media, module imports, workers, sockets, beacons, and fetch targets.
- Reads retained `pages-content` history and refuses deletion or byte-different replacement of an existing release directory.
- Accepts only the exact current policy or the exact previous `worker-src 'self'` policy on retained HTML, preserving historical bytes while rejecting every other policy variation.
- Validates retained `main` metadata and accepts a new rolling preview only when its source commit is equal to or descended from the currently retained preview commit.

The automatic build stage executes source with read-only repository permission.
It has no npm or Pages deployment authority.

The retained-snapshot job checks out the same exact upstream head commit and
runs the assembler from that revision. It does not use tooling from a newer
default-branch commit. The job has narrowly scoped repository write permission.
Its credential-stripped, unprivileged child runs only the pinned assembler, not
application build code.

Manual rollback transfers no producer-composed site artifact. Its writer:

1. Authenticates the current `pages-content` head and selected retained ancestor.
2. Extracts the selected commit's exact `main/` bytes and preserves the current
   retained releases and root shell.
3. Runs the trusted default-branch assembler as a credential-stripped,
   unprivileged child.

The assembler requires one recognized exact Content Security Policy before
runtime resources and rejects remote root runtime assets. Exact reruns, older
release backfills, and rollbacks may preserve the previous `worker-src 'self'`
policy. A normal descendant `main` deployment or newer release upgrades the root
shell to `worker-src 'none'`.

A missing, renderer-incompatible, or unknown-policy retained shell fails closed
when it cannot be safely replaced. Do not substitute raw repository shell files.

Both Pages workflows share one workflow-level `static-examples-deploy-<repository>`
concurrency group with `queue: max` and `cancel-in-progress: false`. The lock covers
retained-state validation and writes, packaging, the final retained-head check,
and deployment. A run may wait behind earlier Pages work; do not cancel or bypass
the queue.

The deployment job then enters the protected `github-pages` environment with
only Pages and Pages-OIDC authority. Pages jobs have no npm publication authority.

## Verify a deployment

Do not verify from the root page alone; it may legitimately select a different release than the channel being checked.

For a rolling preview:

- Confirm the latest successful deployment run corresponds to the expected successful `CI` run and source commit.
- Open `main/examples/metadata.json` and compare its full commit with that run.
- Open `main/examples/` and one directly linked recipe; confirm both show **Rolling main preview** and the same provenance.

For a release:

- Confirm the Pages run was triggered by the successful **Publish npm nightly** run and used that run's exact full head commit. Do not confuse it with the CI-linked rolling-main run that may have the same commit.
- Confirm the retained receipt's `version`, `sourceCommit`, original publisher run identity, and digest match the immutable release asset. For nightly receipts, also verify `sourceVersion` and the version-only manifest transformation.
- Confirm `releases/<version>/examples/metadata.json` reports the published version, `release` channel, and the full commit from `package-verification.json` and the protected tag. A nightly deployment must not accidentally use the source `nightly.0` development base as its directory or displayed version.
- Confirm `site-manifest.json` maps that version to the same immutable directory. Existing alpha and nightly directories remain intact.
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
4. Wait for **Reconstruct and restore the exact retained main snapshot**,
   **Package retained Pages snapshot**, and **Deploy retained static examples**
   to succeed. Waiting behind an automatic Pages run is expected. The writer
   reconstructs the site from authenticated Git objects; it does not download a
   producer-composed rollback site.

   Confirm that:

   - `main/` contains the selected retained bytes.
   - The current retained root shell and its CSP remain in place.
   - The manifest's `main` entry matches the restored metadata.
   - All `releases/<version>/` directories remain unchanged.

   A retained-head or shell-policy failure is a stop condition. Rerun the entire
   workflow after the active deployment or reviewed shell migration completes.
5. Repeat the rolling-preview checks in [Verify a deployment](#verify-a-deployment).

The restored preview is deliberately behind repository `main`; its visible source commit distinguishes an intentional rollback from an unexplained stale deployment. Move forward through a later CI-approved descendant commit, never by editing retained state.

An automatic deployment never moves the retained preview backward or onto divergent history. The rollback-only manual dispatch is the sole backward path; after rollback, a queued automatic deployment may legitimately move forward again, but only along ancestry from that restored source commit. Always verify the rollback run and live site before treating the preview as restored, including after a no-op rollback.

## Recover an inconsistent release deployment

If release metadata or a deep link is missing, first compare the upstream publisher run and head SHA, protected tag, GitHub prerelease, package receipt, retained `pages-content` state, and live site. Do not copy files into `pages-content` or edit the site manually.

Choose recovery from the observed state:

| State | Action | Source and workflow used |
| --- | --- | --- |
| The publisher-linked Pages run exists; all identities and bytes match; the failure was transient or caused by hosted state | Rerun that original **Deploy static examples** run. | Original commit SHA, ref, and workflow definition. The rerun cannot consume later changes. |
| GitHub never created the downstream Pages run | Review the current default-branch `deploy-examples.yml`. Select **Re-run all jobs** on the successful original **Publish npm nightly** run, then validate the new downstream run independently. | The publisher retains its original identity. The new downstream run uses the current Pages workflow definition, but release source and assembly tooling remain pinned to the publisher SHA. |
| Release source, assembly tooling, or published example bytes must change | Stop and publish a greater package version. | A new reviewed release identity. |

Never use **Roll back static examples** for a release.

## Verification

`npm run check` is the complete repository gate. Its tooling checks cover:

- Metadata, manifest validation, release ordering, static fallbacks, and
  commit-pinned links.
- Asset filtering, remote-resource rejection, and exact CSP enforcement.
- Retained-path immutability, idempotent retries, and monotonic preview ancestry.
- Workflow permissions, the shared workflow-level queue, authenticated
  writer-side rollback reconstruction, and rollback selection.

Browser tests run in Chromium and WebKit in hosted CI. The local matrix also
includes Firefox. They cover every published example route, keyboard and focus
behavior, narrow full-SHA reflow, dark mode, forced colors, reduced motion,
automated accessibility rules, Playwright-computed ARIA structure, and live-region
behavior.

[Back to the documentation hub](README.md)
