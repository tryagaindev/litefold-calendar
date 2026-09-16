# Documentation

New to the package?  Start with [Getting started](getting-started.md).
Already rendering a calendar?  Follow [Remote data](remote-data.md) to connect
an API, filters, and refresh.  Use the tables below for a specific task.

## Package users

### Getting started

Evaluate fit, then follow the self-contained first-render tutorial.

| Goal | Canonical guide |
| --- | --- |
| Install and render a calendar | [Getting started](getting-started.md) |
| Decide whether the month-and-agenda model fits | [Features and scope](features.md) |
| Check browser and platform requirements | [Browser versions and platform requirements](browser-support.md#minimum-browser-versions) |
| Choose a runnable starting point | [Examples guide](../examples/README.md) |
| Get help, report a problem, or evaluate an upgrade | [Support policy](../SUPPORT.md) and [changelog](../CHANGELOG.md) |

### Everyday application integration

These JavaScript recipes build on your first render.

| Goal | Canonical guide |
| --- | --- |
| Fetch events, validate JSON, filter, and refresh after saving | [Remote-data walkthrough](remote-data.md) and [runnable example](../examples/remote-data/) |
| Make busy days recognizable in a sidebar or full-size calendar | [Choose event counts](integration-guide.md#choose-event-counts) |
| Open existing application dialogs from events or total counts | [Own the event chooser](integration-guide.md#own-the-event-chooser) |
| Understand default empty, failure, and Retry behavior | [Remote-data recovery](remote-data.md#4-keep-empty-and-error-states-distinct) |

### Integration and API

Use these references for exact contracts and optional customization.  The
[advanced API showcase](../examples/advanced/) demonstrates the complete surface;
it is not the recommended starting point for an ordinary integration.

| Goal | Canonical guide |
| --- | --- |
| Look up exports, signatures, defaults, dates, events, state, and lifecycle | [Public API reference](api.md) |
| Connect data, caching, filters, actions, hooks, and toolbar content | [Application integration guide](integration-guide.md) |
| Apply a theme or customize day, event, and overflow content | [Styling and customization](styling.md) |
| Configure optional package components | [First-party extensions](api.md#configure-first-party-extensions) |
| Add experimental browser site tools | [WebMCP site-tool integration](webmcp.md) |
| Handle failures, Retry, diagnostics, and presentation ownership | [Error handling](errors.md) |
| Look up exact token defaults and visual rules | [Design system](../DESIGN.md#public-css-token-map) |
| Add server-authored fallback content and meaningful links | [SEO and progressive enhancement](seo-and-progressive-enhancement.md) |
| Verify accessibility in the integrated application | [Accessibility](../ACCESSIBILITY.md) |
| Rewrite a FullCalendar v6 `dayGridMonth` source shape | [FullCalendar migration](fullcalendar-v6-migration.md) |

## Contributors

For repository changes, start with contribution policy and the command reference.

| Goal | Canonical guide |
| --- | --- |
| Set up the repository and submit a change | [Contributing](../CONTRIBUTING.md) |
| Run focused checks and the complete repository gate | [Contributor commands](../CONTRIBUTOR_COMMANDS.md) |
| Commit and push an already-scoped change | [Commit-and-push operation skill](../.agents/skills/commit-and-push/SKILL.md) |
| Submit and verify a contributor change | [Delivery checklist](../CONTRIBUTOR_COMMANDS.md#deliver-a-contributor-change) |
| Follow source conventions and dependency direction | [Code style](code-style.md) and [internal architecture](architecture.md) |
| Understand extension lifecycle implementation | [Extension architecture](architecture.md#extension-lifecycle-implementation) |
| Review the `setEvents()` decision or reproduce measurements | [Dynamic event update decision record](dynamic-event-updates-adr.md) |
| Browse, update, and verify canonical screenshots | [Screenshot contract](screenshots/README.md) |
| Verify a local package artifact | [Package verification](package-verification.md) |
| Review trust boundaries or report a vulnerability | [Security model](security-model.md) and [security policy](../SECURITY.md) |

## Maintainers

Publication and deployment are separate from contributing a change.

Each procedure names the additional platform permission it requires, such as
GitHub `Admin` access or npm package maintainer access.  Project maintainership
does not grant those permissions by itself.  Nightly and any future stable
publisher have separate [approval requirements](release-administration.md#publication-authority).

| Goal | Canonical guide |
| --- | --- |
| Coordinate nightly publication | [Release-to-npm operation skill](../.agents/skills/release-to-npm/SKILL.md) and [nightly operations](release-operations.md) |
| Verify package and release Pages completion | [Release verification](release-operations.md#6-verify-the-automatic-release-pages-deployment) |
| Review release policy and invariants | [Release policy](releasing.md) |
| Configure hosted controls or recover an exceptional release | [Release administration](release-administration.md) |
| Verify registry and release evidence | [Package verification](package-verification.md) |
| Operate rolling and immutable example deployments | [Static example deployment](example-deployment.md) |
| Review project governance | [Maintainers](../MAINTAINERS.md) and [Code of Conduct](../CODE_OF_CONDUCT.md) |

Operation skills route a task to these canonical documents; they do not replace the repository's policies or runbooks. Public behavior is defined by the package-user guides and generated TypeScript declarations. Private `lfc-*` DOM details are not integration APIs; use the documented options, callbacks, render hooks, extensions, and CSS tokens instead.
