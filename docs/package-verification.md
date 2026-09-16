# Package verification

Use this guide to verify release state, run the same package gate as CI, or inspect a published package. The automated release builds one tarball for the exact green `main` snapshot and retains it through publication; the npm-authorized job does not rebuild it. npm creates signatures and provenance during publication, and the workflow verifies both before making the GitHub prerelease public.

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
- Playwright Chromium, Firefox, and WebKit installed before the complete local browser gate; hosted CI and publication install and run Chromium and WebKit only.

`npm run check` ends with temporary release-tarball verification, and
`npm run package` creates retained release evidence. Both require a clean
tracked and untracked worktree. Use `package` only for an authorized release
evidence operation, not as an ordinary contributor gate.

Choose the narrowest command that answers your question:

| Audience and goal | Command | Scope |
| --- | --- | --- |
| Release operator: validate the snapshot plan | `npm run release:verify -- --plan PATH` | Immutable run identity, source manifest, exact commit, and clean source |
| Contributor: run the complete local repository gate | `npm run check` | Static checks, unit and browser tests, screenshots, build, and temporary tarball verification |
| Release operator: retain a nightly evidence bundle | `npm run package:nightly -- --plan PATH` | The stamped tarball and its write-once release bundle under `.artifacts/` |
| Package user or contributor: preview local npm file selection | `npm pack --dry-run --ignore-scripts` | Local checkout contents only; it is not a substitute for `check:tarball` |

npm always includes the root `README.md`, but canonical PNGs remain outside the package's `files` allowlist. A dry run should therefore list `README.md` and no `docs/screenshots/**` entries. This keeps installed package size independent of the screenshot gallery; `check:screenshots` verifies the repository assets separately. Tarball checks cannot prove hosted README rendering, so the [release operations checklist](release-operations.md#6-verify-npm-and-the-github-prerelease) owns the npm package-page check.

## Verify release state

Nightly publication creates a plan from the workflow run's original creation time,
run ID, event, exact source SHA, and `x.y.z-nightly.0` source version. An artifact
version such as `0.6.0-nightly.20260912090000.123456789` is derived from those
immutable inputs. Reruns retain the original identity.

```sh
npm run release:verify -- --plan PATH
```

Replace `PATH` with the retained nightly plan. This read-only command validates
its schema and derived identity, the manifest's public nightly policy, exact
`HEAD`, and a clean tracked and untracked worktree. It does not query GitHub or
npm. The workflow separately verifies a successful canonical `main` CI run,
fresh registry state, predecessor completion, and current source eligibility.
No release-only source commit or metadata pull request is needed.

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

Hosted CI runs the same gate command with Chromium and WebKit; the local browser
matrix also includes Firefox. Hosted CI adds platform-owned controls such as
pull-request dependency review. A local `npm run check` result is not evidence
that those hosted controls ran.

Package policy also verifies the optional-extension boundary. The root module graph must not reach `dist/extensions/**` or WebMCP, while the documented WebMCP subpath must contain its JavaScript, declarations, and source maps. The clean consumer passes `webMcp` through `CalendarOptions.extensions` using only public imports. Optional entries must also evaluate under Node without reading DOM globals.

For intentional visual changes, follow the [screenshot update procedure](screenshots/README.md#update-captures) and review the images at native size against [`DESIGN.md`](../DESIGN.md). A release-only version change does not require recapturing unchanged scenes.

## Retain a local verification bundle

```sh
npm run package:nightly -- --plan PATH
```

From a clean worktree, the command creates a write-once directory named `.artifacts/tryagaindev-litefold-calendar-<version>/` containing exactly:

- The npm tarball.
- `package-verification.json` with package identity, source commit, toolchain, size, and digests.
- `sbom.spdx.json`.
- `SHA256SUMS`.
- The packaged `LICENSE`.

The command refuses to overwrite an existing version directory. The source
checkout keeps its development version; staging changes only the package
manifest version before packing. The nightly receipt uses schema 2 and retains
`sourceVersion`, the validated `nightly` plan, `manifestTransform: "version-only"`,
and SHA-256 digests of the source and published manifests. `browserTargets`
retains Vite's `baseline-widely-available` preset, versioned `effectiveQuery`,
`resolvedAt`, locked Vite/esbuild `dataVersions`, selected `browsers`, and the
JavaScript/CSS targets returned by Vite's public configuration resolver.
`browserTargetsSha256` hashes its JSON serialization. The receipt records the
original run's UTC creation date, including on reruns; target versions come from
the locked Vite preset. The SBOM and tarball
use the derived published version. `npm run package` retains the ordinary source
version bundle for an explicitly requested local evidence operation.

Do not delete an existing bundle to produce different bytes for the same
version. Recover an interrupted workflow using the original run and retained
bundle plus notes. The workflow restores its earliest complete artifact pair,
checks archive digests, receipt identity and checksums, and bypasses rebuilding.
Missing or expired evidence with staged or published state stops recovery.
A source correction requires a new reviewed identity. During an automated
release, these files are attached to the draft GitHub prerelease before it
becomes immutable.

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

Tree shaking and package contents answer different questions. The extension files remain in the one npm tarball, but an application that omits the extension subpath import leaves WebMCP outside its module graph so a bundler can omit those bytes. A runtime condition around a static import does not establish that exclusion. See the [first-party extension bundle contract](api.md#extension-imports-and-bundles).

## Registry and release evidence

The publisher uses npm trusted publishing through GitHub Actions OIDC, without
an npm token, and publishes under `nightly`. It retries npm's eventually
consistent reads and verifies the exact version, `nightly` tag, registry
integrity, provenance/signatures, clean installation, public imports, and
stylesheet before publishing the GitHub prerelease. The registry verification job
also checks that `latest` remains unchanged from preflight. Before stable exists,
`latest` must select the frozen historical `alpha`; once stable exists,
verification requires stable ownership of `latest`.

Successful publisher completion triggers the separately authorized immutable
Pages deployment through a same-repository `workflow_run`. Pages verifies the
published receipt against the exact source SHA, original run identity, generated
version, and GitHub asset digest before building that release directory. The
publisher does not wait for Pages; operators verify both completed workflows.

Inspect an exact published version rather than relying only on movable dist-tags:

```sh
npm view "@tryagaindev/litefold-calendar@EXACT_VERSION" name version dist.integrity repository --json --registry https://registry.npmjs.org/
npm view @tryagaindev/litefold-calendar dist-tags --json --registry https://registry.npmjs.org/
```

Replace `EXACT_VERSION` with the release being checked. Confirm that:

- The returned name and version are exact.
- `dist.integrity` equals `npmIntegrity` in the GitHub prerelease's `package-verification.json`.
- `nightly` selects that exact version. `latest` matches its preflight value; once stable exists, it selects a stable version. Historical `alpha` has not moved.
- The npm package page shows provenance for the expected repository and `publish-nightly.yml` workflow.

The workflow installs the exact version into a clean consumer before running `npm audit signatures`. Running that command in the repository would verify the development dependency tree instead. If a registry read is unavailable, ambiguous, or inconsistent with the retained bundle, stop and use the [recovery matrix](release-administration.md#recovery-matrix).
