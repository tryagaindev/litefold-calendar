# Alpha release checklist

Use this checklist for `@tryagaindev/litefold-calendar` public alpha releases.  Replace example versions with the exact manifest value.

## One-time setup

- [ ] Confirm the public GitHub slug is `TryAgainDev/litefold-calendar` or update every canonical repository reference before release.
- [ ] Confirm control of the `@tryagaindev` npm scope and package name.
- [ ] Ensure npm maintainer two-factor authentication is enabled.
- [ ] If the package has never existed, complete a one-time human-authenticated public bootstrap publish without consuming the version intended for the trusted-publishing workflow.
- [ ] Configure the npm trusted publisher for the exact owner, repository, workflow filename `publish-alpha.yml`, and GitHub environment `npm`; allow `npm publish` only.
- [ ] After trusted publishing is verified, require two-factor authentication and disallow traditional package-publishing tokens.
- [ ] Protect the GitHub `npm` environment with required maintainer approval.
- [ ] Confirm the `@TryAgainDev/maintainers` team exists and is accepted by CODEOWNERS.
- [ ] Protect `main` and `v*` tags; require CI; enable secret scanning, push protection, and private vulnerability reporting.

## Release content

- [ ] Set matching `package.json` and `package-lock.json` versions in `0.x.y-alpha.N` form.
- [ ] Confirm `private` is `false` and `publishConfig` requires public access, provenance, and the `alpha` tag.
- [ ] Move release notes from `Unreleased` into a dated changelog section.
- [ ] Update API docs, examples, migration guidance, and focused behavioral tests.
- [ ] Confirm the toolbar DOM and focus order is Previous, Next, month/year title, Today, then application toolbar content.
- [ ] Search the complete tracked tree for credentials, private data, application branding, and obsolete test references.
- [ ] Run `npm run screenshots:update`, review all six images, and run `npm run check:screenshots`.
- [ ] Verify the MIT license with `npm run check:license`.

## Local and pull-request verification

- [ ] Start from a clean checkout on current Node 24 and the manifest-pinned npm version.
- [ ] Run `npm ci --ignore-scripts`.
- [ ] Run `npx playwright install --with-deps chromium`.
- [ ] Run `npm run check` successfully.
- [ ] Confirm `git status --short` is empty before merge.
- [ ] Merge only after required GitHub checks pass.

## Publish

- [ ] Confirm the release commit is on `main`.
- [ ] Create the protected signed tag `v<manifest-version>` from that exact commit.
- [ ] Push `main` and the tag without force.
- [ ] Create and publish a GitHub prerelease from the exact tag.
- [ ] Approve the protected `npm` environment only after the verify job succeeds and identifies the expected commit and version.
- [ ] Confirm the publish job succeeds without an npm token secret.

## Registry and consumer verification

- [ ] Confirm the npm `alpha` dist-tag points to the new version and `latest` is unchanged.
- [ ] Confirm npm displays provenance linked to the expected GitHub repository and workflow.
- [ ] Compare registry integrity and package contents with the Actions verification receipt.
- [ ] Install the exact version into a clean ESM consumer and import both the root module and `styles.css`.
- [ ] Run `npm audit signatures` in the clean consumer and confirm the registry signature and provenance attestation verify.
- [ ] Review the published README, repository links, license, declarations, source maps, and dependency list on npm.
- [ ] Record any remaining accessibility, browser, or migration findings for the next alpha.
