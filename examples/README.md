# Examples

Use this page to choose, run, and validate the repository examples. Each recipe is framework-free and uses only published package surfaces.

## Choose by audience and scenario

| Audience | Scenario | Start here |
| --- | --- | --- |
| Package user — getting started | Render a static event array and handle activation | [Basic JavaScript](basic/) |
| Package user — getting started | Preserve useful server-rendered content until the calendar is ready | [Progressive enhancement](progressive-enhancement/) |
| Package user — getting started | Load the ESM build from an existing classic-script entry point | [Classic-script loader](classic-script/) |
| Package user — integration and API | Integrate a range-aware source, typed metadata, application controls, hooks, state, and WebMCP | [Advanced TypeScript](advanced/) |
| Package user — integration and API | Own source, action, and render-hook failure presentation | [Async errors](async-errors/) |
| Package user — integration and API | Rewrite a FullCalendar v6 `dayGridMonth` source shape | [FullCalendar v6 migration](fullcalendar-v6-migration/) |
| Contributor | Exercise public declarations, browser behavior, accessibility, and package output | [Contributor fixture and validation notes](#contributors) |
| Maintainer | Inspect generated deployment provenance and operate static snapshots | [Maintainer notes](#maintainers) |

## Package users

### Getting started

Start with [Basic JavaScript](basic/). Add [Progressive enhancement](progressive-enhancement/) when the page must remain useful without JavaScript or before the first usable snapshot. Use [Classic-script loader](classic-script/) only when an existing classic entry point cannot be converted to a module script.

To integrate the package rather than run this repository, begin with the root [installation](../README.md#install) and [first render](../README.md#first-render).

The examples use repository-relative files so they can test the exact build output. Installed applications use package imports instead:

| Repository fixture reference | Installed application reference |
| --- | --- |
| `../../dist/index.js` | `@tryagaindev/litefold-calendar` |
| `../../dist/styles.css` | `@tryagaindev/litefold-calendar/styles.css` |
| `../../dist/extensions/webmcp/index.js` | `@tryagaindev/litefold-calendar/extensions/webmcp` |

For example, an application processed by a package-aware build tool can use:

```js
import { createCalendar } from "@tryagaindev/litefold-calendar";
import "@tryagaindev/litefold-calendar/styles.css";
```

A browser cannot resolve those bare package specifiers without a build tool or import map. The [classic-script recipe](classic-script/) shows the deployed-URL form.

### Integration and API

Use [Advanced TypeScript](advanced/) for reusable integration patterns such as range loading, cancellation, typed metadata, render hooks, external controls, fallback ownership, and optional extensions. Use [Async errors](async-errors/) when deciding whether the package or application owns visible recovery UI. The [FullCalendar v6 migration](fullcalendar-v6-migration/) is a bounded adapter example for that source API shape, not a compatibility layer.

Exact public signatures, defaults, and timing belong in the [API reference](../docs/api.md). Application ownership and composition recipes belong in the [integration guide](../docs/integration-guide.md).

## Run locally

Use the repository-selected Node and npm toolchain described in [Set up the repository](../CONTRIBUTOR_COMMANDS.md#set-up-the-repository). From a fresh clone at the repository root:

```sh
npm ci --ignore-scripts
npm run demo
```

Open the printed `/examples/` URL. `npm run demo` builds the package and generated example assets, then starts a loopback HTTP server. After a successful `npm run build`, use `npm run serve:repository` to restart the server without rebuilding.

The build generates `examples/advanced/main.js` and `examples/metadata.json`. Both are ignored build output: do not edit or commit them. `metadata.json` records the package version, exact source commit when one can be proven, and deployment channel so a rendered example can identify its provenance.

## Contributors

Use the contributor command reference to [choose focused validation](../CONTRIBUTOR_COMMANDS.md#choose-focused-validation) while iterating. It routes example changes through public-declaration, `checkJs`, JSDOM, and real-browser coverage as applicable. Before submission, follow the [final gate](../CONTRIBUTOR_COMMANDS.md#run-the-final-gate), including its committed, clean-worktree prerequisite and packed-consumer checks.

The advanced recipe is deliberately exhaustive where it serves repository coverage: complete option, hook, and method inventories expose missing public-surface coverage during typechecking; boundary fixtures exercise range, overflow, and DOM limits; and `data-test-*` attributes provide repository synchronization probes. Consumer code should copy the documented integration patterns, not those coverage mechanics. Exact responsive geometry belongs in [DESIGN.md](../DESIGN.md).

When adding or changing an example:

- Keep it dependency-free, deterministic, and safe to publish as source.
- Use public package APIs, documented CSS tokens, native HTML semantics, and sanitized fixture data.
- Namespace application-owned classes, IDs, data attributes, CSS properties, and layers with `my-*`. Reserve `data-test-*` for repository probes.
- Give each public option, method, hook, extension, or failure path one clear example owner and focused executable coverage.
- Update the canonical API or integration documentation, relevant tests, and changelog with the example.

## Maintainers

`examples/metadata.json` is generated provenance, not configuration or a release record. Deployment tooling regenerates it from the package version, exact source commit, and channel; never edit or commit it.

GitHub Pages hosts a rolling `main` preview and immutable release snapshots. The
[static example deployment guide](../docs/example-deployment.md) owns deployment
prerequisites, verification, recovery, and rollback, including the specific
GitHub permissions required for each operation.
