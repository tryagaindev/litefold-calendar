# Static example deployment

GitHub Pages is the package's developer demo.  It leads with a runnable basic example, exact-version installation, minimal setup code, task-oriented examples, API/integration documentation, and commit-pinned source.  Deployment and supply-chain rationale remains in this guide rather than in the demo UI.

## URL and identity contract

| Channel | Path below the Pages root | Update rule |
| --- | --- | --- |
| Rolling main preview | `main/examples/` | Replaced after successful CI for the exact `main` commit, or restored from retained deployment history |
| Immutable release | `releases/<package-version>/examples/` | Added by a separate release operation for the exact protected package tag; different bytes can never replace it |

The Pages root selects the greatest SemVer release from `site-manifest.json` and makes that immutable basic example the primary Run action.  When no valid release exists, it falls back to the rolling `main` preview and an `@alpha` installation command.  Release installation uses the exact manifest version.

Snapshot assembly stamps the root shell from the final retained manifest, including the selected Run routes, exact installation command, release history, channel, full commit, and commit-pinned source links.  Those links and identities remain correct when JavaScript is disabled or the manifest request fails.  In the browser, a same-origin, `no-store` manifest request refreshes the already-valid shell only after the complete response passes validation.

The examples landing page likewise provides useful static recipe navigation before JavaScript runs, then requests its same-origin metadata with `no-store` to add exact provenance and commit-pinned repository links.  A missing or malformed metadata file must not break the recipe cards.  Copy controls use a polite status region and select the command for manual copying when the Clipboard API is unavailable.

Every example landing page and directly opened recipe identifies its package version, full source commit, and either **Rolling main preview** or **Immutable release**.  Deep links provide developer navigation back to the examples plus commit-pinned recipe source, API, and integration guidance.  All deployed assets remain repository-owned and same-origin; the site has no analytics, trackers, CDNs, or third-party runtime assets.

## Build and authority boundaries

`deploy-examples.yml` is the only Pages owner. It deploys verified rolling `main` previews and exposes two explicit operations: `release` adds an immutable snapshot for an exact protected `v<version>` tag, while `rollback` restores an exact retained `main/` snapshot.

After npm and the GitHub prerelease are complete, `publish-alpha.yml` queues the Pages workflow with **Operation** `release` and the exact tag as **Release ref**. This handoff is intentionally separate: npm/GitHub publication does not receive Pages authority, and a Pages failure does not make an already-published npm version replaceable. A maintainer may rerun the same release operation when the retained and requested bytes match exactly.

Before a Pages snapshot can be retained, repository tooling:

- Generates `examples/metadata.json` from the package version, exact source commit, and channel.
- Copies only the browser runtime files from `dist/` and `examples/`.
- Injects the self-only Content Security Policy and developer provenance navigation into every staged page.
- Rejects direct literal remote scripts, stylesheets, media, module imports, workers, sockets, beacons, and fetch targets.
- Reads retained `pages-content` history and refuses deletion or byte-different replacement of an existing release directory.
- Validates retained `main` metadata and accepts a new rolling preview only when its source commit is equal to or descended from the currently retained preview commit.

The source-executing build stage has read-only repository permission and no npm or Pages deployment authority. The retained-snapshot job has narrowly scoped repository write permission. Its credential-stripped, unprivileged child runs only the repository's pinned deployment assembler; it does not run application build code. Final deployments queue in order behind one repository-wide lock so overlapping preview, release, and rollback operations cannot displace a retained snapshot before it is considered. Each final job confirms that its packaged snapshot is still the retained branch head, then enters the independently protected `github-pages` environment with only Pages and Pages-OIDC authority. Pages jobs have no npm token or publishing authority.

## Repository setup

Repository administrators must configure Pages to use **GitHub Actions** as its source and protect the `github-pages` environment independently from `npm`.  Set the deployment-branch policy on both protected environments to allow `main` only, preventing a manual workflow dispatch from another ref from entering either environment.  Allow the workflow token to maintain `pages-content`, restrict direct and force pushes to that branch, and keep `main`, `v*` tags, workflow files, and environment rules under review.

The workflow creates `pages-content` on its first successful deployment.  It is retained deployment state, not a legacy Pages source.  Do not edit `main/`, `releases/`, or `site-manifest.json` by hand.

These are external settings; repository checks cannot prove that they are enabled. Verify them before the first release and after relevant repository or ownership changes.

## Roll back the rolling preview

A rollback restores exact retained `main/` bytes.  It does not rebuild an old source revision, rewrite an immutable release, remove a later release directory, or change npm.

1. Fetch the retained history and find the snapshot whose `main/` metadata names the desired source commit:

   ```sh
   git fetch origin pages-content
   git log --oneline origin/pages-content -- main/
   git show <snapshot-commit>:main/examples/metadata.json
   ```

2. Open **Deploy static examples**, choose **Operation** `rollback`, and set **Snapshot ref** to that full 40-character lowercase `pages-content` commit. Leave **Release ref** empty.
3. Confirm the workflow restores only `main/`, updates the root manifest to that preview identity, and leaves every `releases/<version>/` directory byte-for-byte unchanged.
4. Check the live `main/examples/metadata.json` and a representative deep link.

The restored preview is deliberately behind repository `main`; its visible source commit distinguishes an intentional rollback from an unexplained stale deployment.  Move forward by deploying a later CI-approved `main` commit, not by editing retained state.

An automatic deployment never moves the retained preview backward or onto divergent history. The explicit `rollback` operation is the sole backward path; after rollback, automatic deployment may move forward only along ancestry from that restored source commit.

## Detect stale or inconsistent deployments

For the rolling preview, compare the live `main/examples/metadata.json` commit with the exact commit reported by the latest successful preview deployment.  A mismatch is expected only during an intentional rollback or while a newer deployment is still completing.

For a release, confirm all of the following:

- `releases/<version>/examples/metadata.json` reports that exact version and the `release` channel.
- Its full commit equals the package verification receipt and protected `v<version>` tag.
- The root `site-manifest.json` points that version to the same immutable directory.
- The representative recipe deep link loads and exposes the same provenance.
- The successful Pages run's release-ref input and the live metadata agree with the published package version, protected tag, and commit.

If identity is missing or inconsistent, do not copy files into `pages-content` or edit the site manually. Rerun **Deploy static examples** with **Operation** `release` and **Release ref** set to the exact protected tag only when retained and public bytes match. A byte-different rerun fails closed; corrected behavior requires a greater package version.

## Verification

Tooling tests cover metadata validation, SemVer release ordering, release-only static fallback and fetch failure, `main` fallback, missing metadata, copy fallback, commit-pinned links, runtime-file filtering, remote-resource rejection, CSP, retained release paths, idempotent snapshots, byte-different overwrite rejection, push-safe CI concurrency, monotonic preview ancestry, workflow permissions, and rollback selection.  Browser coverage exercises all six routes, keyboard/focus behavior, full-SHA reflow at 320 CSS pixels, dark mode, forced colors, reduced motion, and automated accessibility rules.  `npm run check` remains the complete repository gate.

[Back to the documentation hub](README.md)
