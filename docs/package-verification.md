# Package verification

Use the same package bytes and public entry points that an npm consumer receives before creating an alpha release.

## Complete repository gate

```sh
npm ci --ignore-scripts
npx playwright install --with-deps chromium
npm run check
```

The final `check:tarball` stage builds an npm tarball in a temporary directory, verifies its file allowlist and receipts, installs it into a clean consumer project without lifecycle scripts, typechecks a consumer import, evaluates the root ESM entry, and resolves the stylesheet export.

## Retain a local verification bundle

```sh
npm run package
```

The command creates an immutable versioned directory under `.artifacts/` containing:

- The npm tarball.
- `package-verification.json` with package identity, source commit, toolchain, size, and digests.
- `sbom.spdx.json`.
- `SHA256SUMS`.
- The packaged `LICENSE`.

The command refuses to overwrite an existing version directory.  Increment the prerelease version before producing different bytes.

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

## Registry verification after publishing

After the workflow publishes an alpha:

```sh
npm view @tryagaindev/litefold-calendar@alpha name version dist-tags repository --json
npm install --save-exact @tryagaindev/litefold-calendar@0.1.0-alpha.0
npm audit signatures
```

Confirm the npm package page shows provenance, the source repository link is correct, the `alpha` dist-tag points to the intended immutable version, `npm audit signatures` verifies the registry signature and attestation, and a clean consumer can build using only the documented root and stylesheet exports.
