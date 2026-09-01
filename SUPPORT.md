# Support

Litefold Calendar is an open-source prerelease maintained on a best-effort basis. There is no guaranteed response time or private implementation support.

## Choose the right channel

- Start with the [README](README.md), [documentation hub](docs/README.md), [example coverage guide](examples/README.md), and [current release notes](CHANGELOG.md).
- Ask integration and usage questions with the [usage-question form](https://github.com/tryagaindev/litefold-calendar/issues/new?template=usage_question.yml).
- Report reproducible defects with the [bug-report form](https://github.com/tryagaindev/litefold-calendar/issues/new?template=bug_report.yml).
- Report keyboard, touch, pen, horizontal precision-scroll, zoom, contrast, or assistive-technology barriers with the [accessibility form](https://github.com/tryagaindev/litefold-calendar/issues/new?template=accessibility.yml).
- Propose a new capability or public-contract change with the [feature-request form](https://github.com/tryagaindev/litefold-calendar/issues/new?template=feature_request.yml).
- Report suspected vulnerabilities privately as described in [SECURITY.md](SECURITY.md). Do not disclose them in a public issue.
- Report conduct concerns privately as described in the [Code of Conduct](CODE_OF_CONDUCT.md). Never include conduct-report details in a public issue.

## What to include

For a usage question or defect, provide:

- The exact package version or source commit. Include the SHA-256 when testing a tarball or generated artifact.
- Browser and operating-system versions, input device, framework if any, and relevant assistive technology.
- A minimal dependency-free reproduction, relevant calendar configuration, and exact reproduction steps.
- Expected and actual behavior, including sanitized errors or announcements.

For pager reports, also describe the direction, configured bounds, whether the month changed, and whether `swipe` was enabled. Native momentum and snap timing may differ by platform.

For WebMCP reports, also include the browser version, host-agent version when applicable, embedding context and permission policy, the result of `typeof document.modelContext?.registerTool`, configured tool prefix, expected tool name, and whether registration, `get-events`, navigation, or teardown failed. Review the [WebMCP compatibility and testing guide](docs/webmcp.md#compatibility-and-testing) before filing an availability defect.

Never share tokens, credentials, private event data, raw production payloads, personal information, or unsanitized WebMCP results.

## Supported integrations

The project supports its documented JavaScript, TypeScript, CSS, accessibility, progressive-fallback, event-link, and extension contracts within the rolling [browser support window](docs/browser-support.md). WebMCP remains experimental and is supported only when the current API is actually exposed; it is not part of the core browser guarantee. Framework wrappers, application-specific behavior, server APIs, host-agent availability, and modified distributions remain the integrating application's responsibility.
