## Summary

<!-- Describe the user-visible outcome and why the change is needed. -->

## Related work

<!-- Link issues, discussions, or design decisions. Use "None" when not applicable. -->

## Verification

<!-- List focused checks, the final gate, and any browsers, devices, assistive technologies, or scenarios tested. -->

## Risk and compatibility

<!-- Describe affected public contracts, accessibility, security boundaries, package output, release workflows, or host integrations. Use "None" when not applicable. -->

## Checklist

- [ ] The change is focused, and I added regression coverage for changed behavior or explained why none is needed.
- [ ] I followed the [coding conventions](https://github.com/tryagaindev/litefold-calendar/blob/main/docs/code-style.md) and ran `npm run check` with the repository-selected Node.js and npm toolchain.
- [ ] When public behavior changed, I updated affected types, [documentation](https://github.com/tryagaindev/litefold-calendar/blob/main/docs/README.md), examples, migration guidance, and the [`Unreleased` changelog](https://github.com/tryagaindev/litefold-calendar/blob/main/CHANGELOG.md).
- [ ] When visual or interaction behavior changed, I reconciled it with the [design system](https://github.com/tryagaindev/litefold-calendar/blob/main/DESIGN.md), repeated affected [accessibility checks](https://github.com/tryagaindev/litefold-calendar/blob/main/ACCESSIBILITY.md), and updated [canonical screenshots](https://github.com/tryagaindev/litefold-calendar/blob/main/docs/screenshots/README.md) only when required.
- [ ] When WebMCP, untrusted input, or another security boundary changed, I followed the [WebMCP contract](https://github.com/tryagaindev/litefold-calendar/blob/main/docs/webmcp.md) and [security policy](https://github.com/tryagaindev/litefold-calendar/blob/main/SECURITY.md) as applicable.
- [ ] I added no prohibited dependency, install hook, remote asset, generated distribution, secret, private event data, or unrelated formatting change.
