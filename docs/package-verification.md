# Package verification

The release workflow publishes the same retained tarball that passed the repository, package-policy, clean-consumer, browser, checksum, and integrity gates. It builds that bundle for the exact eligible `main` push and does not rebuild inside the npm-authorized job. Registry signatures and provenance are created by npm during publication and verified afterward, before the GitHub prerelease becomes public.

## Verify release state

Run the read-only release-state check after preparing a release locally or when diagnosing an automated preparation failure:

```sh
npm run release:verify
```

The check validates the public alpha version, manifest and lockfile agreement, changelog state, repository identity, source commit, and Git state. The workflow additionally requires an exact first-parent change limited to the three release-state files and validates live GitHub/npm collisions for the exact push SHA.

## Complete repository gate

```sh
npm ci --ignore-scripts
npx --no-install playwright install chromium
npm run check
```

The final `check:tarball` stage creates an npm tarball in a temporary directory, verifies its file allowlist and receipt, installs it into a clean consumer without lifecycle scripts, typechecks a generic `Calendar<TMetadata>` consumer that calls `setEvents()`, evaluates the root ESM entry, and resolves the stylesheet export.  Its packed-byte DOM check renders the installed module, replaces and refetches events, activates the replacement, and verifies teardown.

Intentional visual changes require a separate `npm run screenshots:update`, native-size review against [`DESIGN.md`](../DESIGN.md), and the normal screenshot check.  A release-only version change does not require recapturing unchanged scenes.

## Retain a local verification bundle

```sh
npm run package
```

The command creates an immutable versioned directory under `.artifacts/` containing exactly:

- The npm tarball.
- `package-verification.json` with package identity, source commit, toolchain, size, and digests.
- `sbom.spdx.json`.
- `SHA256SUMS`.
- The packaged `LICENSE`.

The command refuses to overwrite an existing version directory.  Increment the prerelease version before producing different bytes.  During an automated release, these files are attached to the draft GitHub prerelease before it becomes immutable.

The packaged SPDX document is canonicalized after npm validates and generates it.  Its namespace is derived from the package version and exact source commit, its creation timestamp is the source commit's committer time, and its object keys have a fixed order.  Repackaging the same clean commit therefore produces byte-identical `sbom.spdx.json` content instead of retaining npm's generated UUID and wall-clock timestamp.

## Inspect the package as a consumer

```sh
npm pack --dry-run --ignore-scripts
```

The public package contains only `README.md`, `LICENSE`, `package.json`, and the expected `dist/` modules, declarations, source maps, and stylesheet.  The supported imports are:

```ts
import { createCalendar } from "@tryagaindev/litefold-calendar";
import "@tryagaindev/litefold-calendar/styles.css";
```

No internal source or `dist/` subpath is a supported public entry point.

## Registry and release evidence

The publisher retries npm's eventually consistent reads and verifies the exact version, `alpha` dist-tag, acceptable `latest` state, registry integrity, provenance/signatures, clean installation, root import, and stylesheet import before publishing the GitHub prerelease. The immutable Pages example is a separately queued deployment for the same exact tag and commit.

An operator can independently inspect the final public identity without rebuilding it:

```sh
npm view @tryagaindev/litefold-calendar@alpha name version dist-tags dist.integrity repository --json
```

Confirm the npm package page shows provenance for the expected repository and workflow, and compare its integrity with `package-verification.json` attached to the GitHub prerelease.  `alpha` must point to that immutable version; `latest` must be absent or stable.  The workflow's clean consumer runs `npm audit signatures` after installing the exact version; running that command in the repository would verify the repository's development tree instead.  See the [release administration guide](release-administration.md#recovery-matrix) when a registry read is uncertain or conflicts with the retained bundle.
