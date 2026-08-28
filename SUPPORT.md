# Support

litefold-calendar is an open-source prerelease maintained on a best-effort basis. There is no guaranteed response time or private implementation support.

## Get help

- Start with the [README](README.md), [documentation hub](docs/README.md), [example coverage guide](examples/README.md), and [current release notes](CHANGELOG.md).
- Use the [usage-question issue form](https://github.com/tryagaindev/litefold-calendar/issues/new?template=usage_question.yml) for integration and usage help.
- Use the bug issue form for reproducible defects.
- Use the accessibility issue form for keyboard, touch, pen, horizontal precision-scroll, zoom, contrast, or assistive-technology barriers.
- Use the feature request form for new capabilities and public-contract proposals.

Include the exact version from the manifest or artifact receipt, its SHA-256, browser and operating system, input device, a minimal dependency-free reproduction, relevant configuration, expected behavior, actual behavior, and sanitized error information. For pager reports, describe direction, configured bounds, whether the month committed, and whether `swipe` was enabled; native momentum and snap timing may differ by platform. Never share tokens, credentials, private event data, raw production payloads, or personal information.

For WebMCP reports, also include the browser or ChatGPT desktop build, workspace/model context when applicable, the result of `typeof document.modelContext?.registerTool`, configured tool prefix, expected tool name, and whether registration, `get-events`, navigation, or teardown failed. Sanitize tool results; event titles can be confidential. Use the [WebMCP compatibility and testing guide](docs/webmcp.md#compatibility-and-testing) before filing a browser-availability defect.

## Security

Suspected vulnerabilities must be reported privately under [SECURITY.md](SECURITY.md), not through the usage-question form or another public issue.

## Supported integrations

The project supports its documented JavaScript, TypeScript, CSS, accessibility, progressive-fallback, event-link, and extension contracts within the rolling [browser support window](docs/browser-support.md). WebMCP remains experimental and is supported only when the current API is actually exposed; it is not part of the core browser guarantee. Framework wrappers, application-specific behavior, server APIs, browser-agent rollout, and modified distributions remain the integrating application's responsibility.
