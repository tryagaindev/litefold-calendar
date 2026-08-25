# Static example deployment

The repository deploys the verified examples to GitHub Pages without changing the npm release path.  The Pages index makes current development easy to inspect while keeping every published release demo at a version-specific URL.

## URL and identity contract

| Channel | Path below the Pages root | Update rule |
| --- | --- | --- |
| Rolling main preview | `main/examples/` | Replaced after a verified push to `main`, or restored from retained deployment history |
| Immutable release | `releases/<package-version>/examples/` | Created from the matching published GitHub release tag; different bytes can never replace it |

The Pages root reads `site-manifest.json` and links to both channels.  Each examples landing page reads its same-origin `metadata.json`.  Every directly opened example also receives a static deployment-details region during staging.  All three surfaces show the package version, full source commit, and either **Rolling main preview** or **Immutable release**.

`main` is intentionally mutable and may include unreleased behavior.  A release URL is the version-specific demonstration.  It is not proof that npm publishing succeeded: the Pages and npm workflows are independent, and operators must verify each result separately.

## Build and authority boundaries

`.github/workflows/deploy-examples.yml` runs the complete repository gate before staging a deployment.  The read-only build job:

- Generates `examples/metadata.json` from the package version, checked-out commit, and deployment channel.
- Copies only browser runtime files from `dist/` and `examples/`.
- Injects visible deployment identity into deep-linked examples.
- Statically rejects direct literal remote scripts, stylesheets, media, module imports, workers, sockets, beacons, and fetch targets.
- Injects a restrictive self-only Content Security Policy into every staged page so the browser blocks remote runtime requests that static inspection does not identify.
- Reads the retained `pages-content` branch and assembles a complete candidate containing the rolling preview and every prior release.
- Refuses a release when its version path already contains different bytes.

The next job has repository write permission but does not execute project code.  It validates the complete artifact, commits it to `pages-content`, and preserves that branch as auditable deployment state.  A final job enters the protected `github-pages` environment and receives only `pages: write` and Pages OIDC authority.

The npm workflow uses the separate protected `npm` environment and npm trusted-publishing identity.  The Pages workflow contains no npm token, registry command, or publish permission; the npm publish job has no Pages authority.  Do not combine the environments or add npm publication to the Pages workflow.

All deployed assets are repository-owned and same-origin.  The site includes no analytics, trackers, CDNs, or third-party runtime assets.

## Repository setup

Repository administrators must configure Pages to use **GitHub Actions** as its source and protect the `github-pages` environment independently from `npm`.  Allow the workflow token to maintain `pages-content`, restrict direct or force pushes to that branch, and keep `main`, release tags, workflow files, and environment rules under review.

The workflow creates `pages-content` on its first successful deployment.  Do not select that branch as the legacy Pages source; it is retained state for the Actions deployment.  Do not edit `main/`, `releases/`, or `site-manifest.json` by hand.

## Roll back the rolling preview

A rollback restores the exact `main/` bytes from a prior `pages-content` commit.  It does not rebuild an old source revision, rewrite an immutable release, or remove later release directories.

1. Fetch the deployment branch and identify the snapshot whose `main/` metadata names the intended source commit:

   ```sh
   git fetch origin pages-content
   git log --oneline origin/pages-content -- main/
   git show <snapshot-commit>:main/examples/metadata.json
   ```

2. Run **Deploy static examples** manually and enter that full lowercase `pages-content` commit as `snapshot_ref`.
3. Confirm the workflow created a new `pages-content` commit, deployed it through `github-pages`, and left every `releases/<version>/` directory unchanged.
4. Check the live `main/examples/metadata.json` and a deep-linked example before treating the rollback as complete.

The restored preview is deliberately behind repository `main`; its visible source commit distinguishes an intentional rollback from an unexplained stale deployment.  Move forward by rerunning the successful workflow for the desired current `main` commit, not by editing deployment state.

## Detect stale or inconsistent deployments

For the rolling preview, compare the live `main/examples/metadata.json` commit with the commit from the most recent successful `main` deployment run and with `git rev-parse origin/main`.  A mismatch is expected only during an intentional rollback or while a newer run is still in progress.

For a release, confirm all of the following:

- `releases/<version>/examples/metadata.json` reports that exact version and the `release` channel.
- Its commit equals `git rev-list -n 1 v<version>`.
- The root `site-manifest.json` points that version to the same immutable directory.
- The Pages workflow for the GitHub release succeeded independently of the npm workflow.

If identity is missing or inconsistent, do not copy files into `pages-content`.  Inspect the failed run, correct source or workflow configuration, and rerun the exact event.  An exact release rerun is a no-op; a byte-different rerun fails before deployment.  Publish a corrected package version when release behavior itself is wrong.

## Verification

`npm run test:tooling` covers metadata validation, runtime-file filtering, direct remote-resource rejection, staged Content Security Policy, deep-link deployment identity, retained release paths, exact release reruns, byte-different overwrite rejection, workflow permissions, and rollback selection.  `npm run check` remains the release and deployment gate.
