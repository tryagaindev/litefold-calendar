# Public alpha release process

This repository publishes `@tryagaindev/litefold-calendar` as a public npm prerelease.  Alpha versions use `0.x.y-alpha.N`, the npm `alpha` dist-tag, and a matching Git tag such as `v0.1.0-alpha.0`.  Never publish an alpha under `latest`.

## Release authority and prerequisites

Before the first public release, repository and npm administrators must confirm all of the following:

- The canonical GitHub repository is public and exactly matches the `repository.url` in `package.json`.
- The `@tryagaindev` npm scope and `@tryagaindev/litefold-calendar` package are controlled by the intended maintainers.
- npm maintainer accounts use two-factor authentication.
- The npm trusted publisher is bound to the exact GitHub owner, repository, workflow filename `publish-alpha.yml`, and `npm` environment, with only the `npm publish` action allowed.
- The GitHub `npm` environment is protected and may be approved only by release maintainers.
- `main` and `v*` tags are protected, required CI checks are enabled, and secret scanning, push protection, and private vulnerability reporting are enabled.

Trusted publishing is the normal release path and requires no long-lived npm token in GitHub.  npm requires a package to exist before a trusted publisher can be configured.  When the reserved name has never been published, an authorized maintainer must perform one initial public publish with human two-factor authentication, then configure the trusted publisher before subsequent releases.  Published versions are immutable: do not manually bootstrap the same version that the workflow is expected to publish.  Either use a disposable bootstrap prerelease and then increment the manifest, or treat the manual publish as the first alpha and increment before the first provenance-backed workflow release.  Do not add an `NPM_TOKEN` secret as a workaround.

After that bootstrap publish, npm 12 can create the exact binding from an authenticated maintainer workstation:

```sh
npm trust github @tryagaindev/litefold-calendar \
  --repo TryAgainDev/litefold-calendar \
  --file publish-alpha.yml \
  --env npm \
  --allow-publish
```

Review the resulting package settings on npmjs.com.  After the trusted publisher succeeds, set package publishing access to require two-factor authentication and disallow traditional tokens.  Do not grant `npm stage publish` unless the release model is deliberately changed and reviewed.

## Required toolchain

Use a current stable Node.js 24.x release and the exact npm version selected by `packageManager`:

```sh
node --version
npm --version
npm ci --ignore-scripts
npx playwright install --with-deps chromium
```

The repository accepts supported Node 24 patch releases, while npm, development dependencies, Playwright, and Chromium are exact-pinned.  Release receipts record the exact Node patch that produced the tarball.

## Prepare the release commit

1. Update `package.json` and `package-lock.json` to the next `0.x.y-alpha.N` version.
2. Move user-visible entries from `Unreleased` into a dated changelog section.
3. Update API documentation, examples, migration guidance, tests, and screenshots for every observable change.
4. Run the complete local gate from a clean checkout:

```sh
npm run screenshots:update
npm run check
```

Review every screenshot at native dimensions.  A visual change is incomplete until implementation, canonical PNGs, hashes, source fingerprint, references, and alt text agree.

The source commit used for a release must be on `main`, have no tracked or untracked changes, and contain no application-specific branding, private data, credentials, or generated release bundles.

## Create the GitHub prerelease

After the release commit passes CI:

```sh
git switch main
git pull --ff-only
git tag -s v0.1.0-alpha.0 -m "v0.1.0-alpha.0"
git push origin main
git push origin v0.1.0-alpha.0
```

Use the actual manifest version instead of the example above.  Create a GitHub **prerelease** from that protected tag.  Publishing the GitHub prerelease triggers `.github/workflows/publish-alpha.yml`.

## What the publish workflow does

The workflow separates untrusted project execution from npm publishing authority.

### Verify job

The first job has read-only repository permission and no npm OIDC authority.  It:

- Checks out the exact release tag without persisted Git credentials.
- Verifies the package name, public alpha version, repository metadata, publish policy, and tag/version match.
- Confirms the tagged commit remains contained in `origin/main`.
- Installs the lockfile with lifecycle scripts disabled and installs the pinned Chromium build.
- Runs `npm run check`, including static policy, unit tests, examples, browser/accessibility tests, screenshot validation, and clean tarball-consumer verification.
- Runs `npm run package` to create one immutable five-file bundle containing the tarball, checksums, verification receipt, SPDX SBOM, and MIT license.
- Uploads that exact bundle as a non-overwriting GitHub Actions artifact.

### Publish job

The second job waits for verification, enters the protected `npm` environment, and is the only job granted `id-token: write`.  It does not check out source code or install project dependencies.  It:

- Downloads the exact artifact created by the verify job.
- Requires exactly the five expected flat regular files.
- Rechecks SHA-256 values, release identity, source commit, toolchain receipt, packed manifest, public access, provenance policy, and alpha dist-tag.
- Publishes the verified tarball with `npm publish --access public --tag alpha --provenance --ignore-scripts` through npm trusted publishing.

The workflow is serialized across alpha releases so two versions cannot publish concurrently.

## Release example deployment

Publishing a GitHub release also triggers `.github/workflows/deploy-examples.yml`.  That workflow verifies the tagged source independently, retains the example under `releases/<package-version>/examples/`, and refuses to replace an existing version path with different bytes.  It uses the protected `github-pages` environment and has no npm publishing authority.  Conversely, `publish-alpha.yml` has no Pages authority.

Monitor the npm and Pages runs as separate release results.  The release demo must show the manifest version, tagged source commit, and **Immutable release** channel before linking to it.  See the [static example deployment guide](example-deployment.md) for repository setup, rollback of the rolling preview, and stale-deployment checks.

## Post-publish verification

After the workflow succeeds, verify the registry result from a clean environment:

```sh
npm view @tryagaindev/litefold-calendar@alpha name version dist-tags dist.integrity repository --json
npm pack @tryagaindev/litefold-calendar@alpha --ignore-scripts
npm install --save-exact @tryagaindev/litefold-calendar@0.2.0-alpha.0
npm audit signatures
```

Confirm that:

- The `alpha` dist-tag points to the intended version and `latest` was not changed.
- Registry integrity and package contents agree with the workflow receipt.
- npm displays provenance for the release.
- A clean ESM consumer can import the root module and `styles.css` export.
- The GitHub release links to the correct tag, changelog notes, and repository commit.

## Failed or withdrawn releases

Published npm versions are immutable.  Do not replace, recreate, or retag the same version after a failed validation or bad release.  Correct the source, increment `alpha.N`, and issue a new tag and prerelease.

When an already-published alpha should no longer be used, deprecate that exact version with a useful replacement message and publish a corrected version.  Avoid `npm unpublish` except where npm policy and a genuine security or legal need require it.

Use the [alpha release checklist](alpha-release-checklist.md) for the operator-facing sequence and [package verification](package-verification.md) for artifact details.
