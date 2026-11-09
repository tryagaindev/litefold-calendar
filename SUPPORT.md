# Support

Litefold Calendar is an open-source prerelease maintained on a best-effort basis. There is no guaranteed response time or private implementation support.

## Choose the right channel

- Start with the [README](README.md), [documentation hub](docs/README.md), [example coverage guide](examples/README.md), and [current release notes](CHANGELOG.md).
- Ask how to set up or use the calendar with the [usage-question form](https://github.com/tryagaindev/litefold-calendar/issues/new?template=usage_question.yml).
- Report bugs you can reproduce with the [bug-report form](https://github.com/tryagaindev/litefold-calendar/issues/new?template=bug_report.yml).
- Report barriers with keyboard, touch, pen, zoom, contrast, or assistive technology through the [accessibility form](https://github.com/tryagaindev/litefold-calendar/issues/new?template=accessibility.yml). Include horizontal precision-scroll problems, such as sideways trackpad scrolling.
- Propose a new feature or a change to a public contract with the [feature-request form](https://github.com/tryagaindev/litefold-calendar/issues/new?template=feature_request.yml).
- Report suspected vulnerabilities privately as described in [SECURITY.md](SECURITY.md). Do not disclose them in a public issue.
- Report conduct concerns privately as described in the [Code of Conduct](CODE_OF_CONDUCT.md). Never include conduct-report details in a public issue.

## What to include

For a usage question or bug report, provide:

- The exact package version or source commit. If you tested a tarball or generated artifact, include its SHA-256 hash.
- Browser and operating-system versions.
- Your input device, framework if any, and relevant assistive technology. Examples include a trackpad and a screen reader.
- A small, dependency-free example, the relevant calendar settings, and exact steps to reproduce the problem.
- What you expected and what happened, including sanitized errors or announcements.

Sanitized output has private details removed. For example, replace a private event title with a made-up title such as "Sample event".

For pager reports, also state the paging direction and configured date bounds. Say whether the month changed and whether `swipe` was enabled. Native momentum and snap timing may differ by platform.

For WebMCP reports, also include:

- The browser version and, when applicable, the host-agent version.
- The embedding context: where the page runs, such as its own tab or an iframe.
- The permission policy: the browser-feature rules set by the page or its iframe. Report the relevant setting, or say "none set" if there is none.
- The result of `typeof document.modelContext?.registerTool`.
- The configured tool prefix and expected tool name.
- Which stage failed: registration, `get-events`, navigation, or teardown.

Review the [WebMCP compatibility and testing guide](docs/webmcp.md#compatibility-and-testing) before reporting that WebMCP is unavailable.

Never share tokens, credentials, private event data, raw production payloads, personal information, or unsanitized WebMCP results.

## Supported integrations

The project supports its documented JavaScript, TypeScript, and CSS contracts within the rolling [browser support window](docs/browser-support.md). The same scope covers accessibility, progressive fallback, event links, and extensions.

WebMCP remains experimental. Support requires the current API to be exposed to the page. It is not part of the core browser guarantee.

Your application remains responsible for framework wrappers, application-specific behavior, server APIs, host-agent availability, and modified distributions.
