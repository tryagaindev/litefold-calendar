## Summary

<!-- Describe the user-visible outcome and why the change is needed. -->

## Related work

<!-- Link issues, discussions, or design decisions. Use "None" when not applicable. -->

## Verification

<!-- List commands, browsers, devices, assistive technologies, and scenarios tested. -->

## Risk and compatibility

<!-- Call out public TypeScript/CSS changes, WebMCP schemas or disclosure, mobile/accessibility effects, security boundaries, package output, publication, or host-integration effects. -->

## Checklist

- [ ] I kept the change focused and added or updated regression tests.
- [ ] I followed the repository [coding conventions](../docs/code-style.md), including documentation version references.
- [ ] I ran `npm run check:design` and reconciled observable visual changes with [`DESIGN.md`](../DESIGN.md); any intentional exception is already documented by its canonical owner.
- [ ] Lint, typecheck, unit tests, package/example builds, built-output smoke tests, pinned-Chromium checks, and package verification pass locally on the repository-declared Node.js 24 toolchain.
- [ ] I added no runtime, peer, optional, bundled, install-hook, remote-asset, or CDN dependency.
- [ ] I considered hostile input, failure paths, stale asynchronous work, and teardown where relevant.
- [ ] I kept any WebMCP change explicit, bounded, safe to unregister, compatible with unsupported browsers, and free of IDs, URLs, metadata, diagnostics, or application-action exposure.
- [ ] I considered the managed F2 grid model, native anchors/buttons, touch, narrow widths, zoom, RTL, reduced motion, forced colors, and screen readers where relevant.
- [ ] I updated types, tests, documentation, migration guidance, examples, all affected PNG screenshots/manifest entries, and `CHANGELOG.md` together for observable changes.
- [ ] I did not publish, tag, create a GitHub release, or edit retained Pages state from this pull request; release authority remains in the protected workflows.
- [ ] I did not include generated distributions, secrets, private event data, or unrelated formatting changes.
- [ ] I reviewed [`SECURITY.md`](../SECURITY.md) and followed the [Code of Conduct](../CODE_OF_CONDUCT.md).
