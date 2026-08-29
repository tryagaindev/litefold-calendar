# Static example deployment

This guide is for maintainers operating the GitHub Pages developer demo. Contributors do not deploy examples manually: successful CI updates the rolling `main` preview, and the alpha publisher queues immutable release snapshots.

## URL and identity contract

| Channel | Path below the Pages root | Update rule |
| --- | --- | --- |
| Rolling main preview | `main/examples/` | Replaced after successful CI for the exact `main` commit, or restored from retained deployment history |
| Immutable release | `releases/<package-version>/examples/` | Added by a separate release operation for the exact protected package tag; different bytes can never replace it |

The Pages root selects the greatest SemVer release in `site-manifest.json` for its primary **Run** action. If no valid release exists, it falls back to the rolling preview and an `@alpha` install command. Release pages always show an exact version.

Each landing page and recipe identifies its channel, package version, full source commit, and commit-pinned source links. Static navigation remains useful when JavaScript is disabled or metadata cannot be loaded. Browser enhancement reads only validated same-origin metadata with `no-store`.

All deployed assets are repository-owned and same-origin. The demo has no analytics, trackers, CDNs, or third-party runtime assets.

## Operations at a glance

| Operation | Trigger | Maintainer action |
| --- | --- | --- |
| Update rolling preview | Successful `CI` run for a push to `main` | None; inspect the resulting **Deploy static examples** run |
| Add release snapshot | Queued by **Publish npm alpha** after npm and GitHub release verification | None normally; wait for and verify the separate Pages run |
| Retry release snapshot | Manual **Deploy static examples** dispatch from `main` | Set **Operation** to `release` and **Release ref** to the exact protected `v<version>` tag; leave **Snapshot ref** empty |
| Restore rolling preview | Manual **Deploy static examples** dispatch from `main` | Set **Operation** to `rollback` and **Snapshot ref** to an exact retained commit; leave **Release ref** empty |

There is no manual rolling-preview operation. To move a preview forward after a rollback, let CI succeed for a later `main` commit that descends from the restored source commit.

## Repository setup

Before the first deployment, a repository administrator must:

1. Configure Pages to use **GitHub Actions** as its source.
2. Protect the `github-pages` environment independently from `npm` and allow deployments from `main` only.
3. Allow the workflow token to create and maintain `pages-content` while restricting direct and force pushes to that branch.
4. Keep `main`, `v*` tags, workflow files, and environment-rule changes under review.

The first successful deployment creates `pages-content`. It is retained deployment state, not a legacy Pages source branch. Never edit its `main/`, `releases/`, or `site-manifest.json` paths by hand.

These settings are hosted state and cannot be proved by repository tests. Recheck them after relevant repository, workflow, environment, or ownership changes.

## Build and authority boundaries

`deploy-examples.yml` is the only Pages owner. It deploys verified rolling `main` previews and exposes two explicit operations: `release` adds an immutable snapshot for an exact protected `v<version>` tag, while `rollback` restores an exact retained `main/` snapshot.

After npm verification and publication of the immutable GitHub prerelease, `publish-alpha.yml` queues **Operation** `release` with the exact tag as **Release ref**. npm/GitHub publication has no Pages authority, and a Pages failure does not make an already-published package version replaceable. A maintainer may retry the same release operation only when retained and requested identities and bytes match exactly.

Before a Pages snapshot can be retained, repository tooling:

- Generates `examples/metadata.json` from the package version, exact source commit, and channel.
- Copies only the browser runtime files from `dist/` and `examples/`.
- Injects the self-only Content Security Policy and developer provenance navigation into every staged page.
- Rejects direct literal remote scripts, stylesheets, media, module imports, workers, sockets, beacons, and fetch targets.
- Reads retained `pages-content` history and refuses deletion or byte-different replacement of an existing release directory.
- Validates retained `main` metadata and accepts a new rolling preview only when its source commit is equal to or descended from the currently retained preview commit.

The source-executing build stage has read-only repository permission and no npm or Pages deployment authority. The retained-snapshot job has narrowly scoped repository write permission; its credential-stripped, unprivileged child runs only the pinned assembler, not application build code. Final deployments share one repository-wide lock, confirm that the packaged snapshot is still the retained branch head, and then enter the protected `github-pages` environment with only Pages and Pages-OIDC authority. Pages jobs have no npm publication authority.

## Verify a deployment

Do not verify from the root page alone; it may legitimately select a different release than the channel being checked.

For a rolling preview:

- Confirm the latest successful deployment run corresponds to the expected successful `CI` run and source commit.
- Open `main/examples/metadata.json` and compare its full commit with that run.
- Open `main/examples/` and one directly linked recipe; confirm both show **Rolling main preview** and the same provenance.

For a release:

- Confirm the Pages run used **Operation** `release` and the exact protected `v<version>` **Release ref**.
- Confirm `releases/<version>/examples/metadata.json` reports the exact version, `release` channel, and the full commit from `package-verification.json` and the protected tag.
- Confirm `site-manifest.json` maps that version to the same immutable directory.
- Open the release landing page and one recipe deep link; confirm the visible provenance and source links match.

A rolling mismatch is expected only during an intentional rollback or while a newer deployment is completing. Any other missing or inconsistent identity requires investigation.

## Roll back the rolling preview

A rollback restores exact retained `main/` bytes.  It does not rebuild an old source revision, rewrite an immutable release, remove a later release directory, or change npm.

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

3. Open **Deploy static examples** from `main`, choose **Operation** `rollback`, set **Snapshot ref** to that same 40-character commit, and leave **Release ref** empty.
4. Wait for every job to succeed. Confirm that `main/` contains the selected retained bytes, the trusted root shell is restamped, the manifest's `main` entry matches the restored metadata, and all `releases/<version>/` directories remain unchanged.
5. Repeat the rolling-preview checks in [Verify a deployment](#verify-a-deployment).

The restored preview is deliberately behind repository `main`; its visible source commit distinguishes an intentional rollback from an unexplained stale deployment. Move forward through a later CI-approved descendant commit, never by editing retained state.

An automatic deployment never moves the retained preview backward or onto divergent history. The explicit `rollback` operation is the sole backward path; after rollback, automatic deployment may move forward only along ancestry from that restored source commit.

## Recover an inconsistent release deployment

If release metadata or a deep link is missing, first compare the Pages run input, protected tag, GitHub prerelease, package receipt, retained `pages-content` state, and live site. Do not copy files into `pages-content` or edit the site manually.

Retry **Deploy static examples** from `main` with **Operation** `release` and the exact protected tag only when all existing identities and bytes match. The workflow accepts an identical retry and rejects a byte-different replacement. If the published example itself must change, publish a greater package version.

## Verification

`npm run check` is the complete repository gate. Tooling covers metadata and manifest validation, release ordering, static fallbacks, commit-pinned links, asset filtering, remote-resource rejection, CSP, retained-path immutability, idempotent retries, monotonic preview ancestry, workflow permissions, concurrency, and rollback selection. Browser tests cover all six example routes plus keyboard/focus behavior, narrow full-SHA reflow, dark mode, forced colors, reduced motion, and automated accessibility rules.

[Back to the documentation hub](README.md)
