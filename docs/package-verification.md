# Package verification

Use this guide to verify release state, run the same package gate as CI, or inspect a published package. The automated release builds one tarball for the exact eligible `main` push and retains it through publication; the npm-authorized job does not rebuild it. npm creates signatures and provenance during publication, and the workflow verifies both before making the GitHub prerelease public.

## Audience routes

- **Package users getting started** normally need only
  [installation](../README.md#install) and
  [first render](../README.md#first-render). They do not need repository release
  evidence.
- **Package users integrating the API** can inspect the
  [local package selection](#inspect-local-package-selection) and supported
  public entry points before integrating a candidate build.
- **Contributors** run the
  [canonical final-gate commands](../CONTRIBUTOR_COMMANDS.md#run-the-final-gate)
  and use [the package-evidence summary](#complete-repository-gate) to
  understand what its final stage proves.
- **Maintainers and release operators** own
  [release-state verification](#verify-release-state),
  [retained evidence](#retain-a-local-verification-bundle), and
  [registry and release evidence](#registry-and-release-evidence).

## Contributor prerequisites

Run repository commands from the repository root with:

- A Node version allowed by `package.json#devEngines.runtime.version` (currently Node 24.x).
- The exact npm version in `package.json#packageManager`.
- Dependencies installed with `npm ci --ignore-scripts`.
- Playwright Chromium installed before the complete browser gate.

`npm run check` ends with temporary release-tarball verification, and
`npm run package` creates retained release evidence. Both require a clean
tracked and untracked worktree. Use `package` only for an authorized release
evidence operation, not as an ordinary contributor gate.

Choose the narrowest command that answers your question:

| Audience and goal | Command | Scope |
| --- | --- | --- |
| Release operator: validate prepared version files | `npm run release:verify` | Local manifests, changelog, repository identity, commit, and local tag state |
| Contributor: run the complete repository gate used by CI | `npm run check` | Static checks, unit and browser tests, screenshots, build, and temporary tarball verification |
| Release operator: retain a local evidence bundle | `npm run package` | The verified tarball and its write-once release bundle under `.artifacts/` |
| Package user or contributor: preview local npm file selection | `npm pack --dry-run --ignore-scripts` | Local checkout contents only; it is not a substitute for `check:tarball` |

npm always includes the root `README.md`, but canonical PNGs remain outside the package's `files` allowlist. A dry run should therefore list `README.md` and no `docs/screenshots/**` entries. This keeps installed package size independent of the screenshot gallery; `check:screenshots` verifies the repository assets separately. Tarball checks cannot prove hosted README rendering, so the [release operations checklist](release-operations.md#6-verify-npm-and-the-github-prerelease) owns the npm package-page check.

## Verify release state

Run the read-only local release-state check after preparing a release or when diagnosing the preparation workflow:

```sh
npm run release:verify
```

The check validates that the package is configured as a public alpha, both lockfile version fields match, the changelog is release-ready, the Git origin is canonical, and a local tag (if present) resolves to the current commit. It does not query npm or GitHub. The publication workflow adds the remote collision checks and requires the release commit's first-parent diff to contain only `CHANGELOG.md`, `package-lock.json`, and `package.json`.

## Complete repository gate

Use the canonical [setup and final-gate commands](../CONTRIBUTOR_COMMANDS.md#run-the-final-gate).
This section describes the package evidence produced by that gate rather than
duplicating its command sequence.

The final `check:tarball` stage creates its tarball in a temporary directory. It verifies:

- The package file allowlist, archive metadata, checksums, SBOM, and receipt.
- Installation into a clean consumer with lifecycle scripts disabled and no runtime dependencies.
- TypeScript use of `Calendar<TMetadata>` and `setEvents()`.
- The root ESM entry, each documented first-party extension entry, and the stylesheet export.
- Packed-byte DOM interaction in an installed JSDOM consumer fixture, including
  replacement, refetch, activation, and teardown.

Hosted CI runs this complete repository gate in its selected environment and
adds platform-owned controls such as pull-request dependency review. A local
`npm run check` result is not evidence that those hosted controls ran.

Package policy also verifies the optional-extension boundary. The root module graph must not reach `dist/extensions/**` or WebMCP, while the documented WebMCP subpath must contain its JavaScript, declarations, and source maps. The clean consumer passes `webMcp` through `CalendarOptions.extensions` using only public imports. Optional entries must also evaluate under Node without reading DOM globals.

For intentional visual changes, follow the [screenshot update procedure](screenshots/README.md#update-captures) and review the images at native size against [`DESIGN.md`](../DESIGN.md). A release-only version change does not require recapturing unchanged scenes.

## Retain a local verification bundle

```sh
npm run package
```

From a clean worktree, the command creates a write-once directory named `.artifacts/tryagaindev-litefold-calendar-<version>/` containing exactly:

- The npm tarball.
- `package-verification.json` with package identity, source commit, toolchain, size, and digests.
- `sbom.spdx.json`.
- `SHA256SUMS`.
- The packaged `LICENSE`.

The command refuses to overwrite an existing version directory. Do not delete an existing bundle merely to produce different bytes for the same version; increment the prerelease version instead. During an automated release, these files are attached to the draft GitHub prerelease before it becomes immutable.

The SPDX document is canonicalized after npm generates and validates it. Its namespace uses the package version and exact source commit, its timestamp uses the commit's committer time, and its keys have a fixed order. With the pinned toolchain, the same clean commit therefore produces byte-identical `sbom.spdx.json` content.

## Inspect local package selection

```sh
npm pack --dry-run --ignore-scripts
```

Use the dry run for a quick, non-publishing view of files selected from the
current checkout. It does not inspect an installed registry version. The public
package must contain only `README.md`, `LICENSE`, `package.json`, and the
expected `dist/` modules, declarations, source maps, and stylesheet. The
supported imports are:

```ts
import { createCalendar } from "@tryagaindev/litefold-calendar";
import { webMcp } from "@tryagaindev/litefold-calendar/extensions/webmcp";
import "@tryagaindev/litefold-calendar/styles.css";
```

The root import is sufficient for a calendar without optional components. The WebMCP subpath is supported only when that component is selected; it is not re-exported from root. No internal source or `dist/` subpath is a supported public entry point.

Tree shaking and package contents answer different questions. The extension files remain in the one npm tarball, but an application that omits the extension subpath import leaves WebMCP outside its module graph so a bundler can omit those bytes. A runtime condition around a static import does not establish that exclusion. See the [first-party extension bundle contract](first-party-extensions.md#bundle-and-import-behavior).

## Registry and release evidence

The publisher retries npm's eventually consistent reads and verifies the exact version, matching `alpha` and `latest` dist-tags, registry integrity, provenance/signatures, clean installation, root import, documented extension import, and stylesheet import before publishing the GitHub prerelease. Successful publisher completion triggers the separately authorized immutable Pages deployment through a same-repository `workflow_run` event bound to the same exact commit.

Inspect an exact published version rather than relying only on movable dist-tags:

```sh
npm view "@tryagaindev/litefold-calendar@EXACT_VERSION" name version dist.integrity repository --json --registry https://registry.npmjs.org/
npm view @tryagaindev/litefold-calendar dist-tags --json --registry https://registry.npmjs.org/
```

Replace `EXACT_VERSION` with the release being checked. Confirm that:

- The returned name and version are exact.
- `dist.integrity` equals `npmIntegrity` in the GitHub prerelease's `package-verification.json`.
- Both `alpha` and `latest` point to that exact prerelease until the first stable release replaces the temporary channel policy.
- The npm package page shows provenance for the expected repository and `publish-alpha.yml` workflow.

The workflow installs the exact version into a clean consumer before running `npm audit signatures`. Running that command in the repository would verify the development dependency tree instead. If a registry read is unavailable, ambiguous, or inconsistent with the retained bundle, stop and use the [recovery matrix](release-administration.md#recovery-matrix).
