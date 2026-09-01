# Documentation

Choose the lane that matches the work you are doing. Each topic has one canonical guide so procedures and contracts can evolve without duplicated instructions.

The [examples guide](../examples/README.md) is the shared scenario index for
package users, contributors, and maintainers. It separates reusable application
recipes from contributor fixtures and maintainer deployment evidence.

## Package users

### Getting started

Use this lane to evaluate the package and reach a correct first render quickly.
It favors explicit assumptions, a short safe path, and clear next steps over
repository internals.

| Goal | Canonical guide |
| --- | --- |
| Install and render a calendar | [Install](../README.md#install), [first render](../README.md#first-render), and [basic example](../examples/basic/) |
| Decide whether the month-and-agenda model fits | [Features and alpha scope](features.md) |
| Check browser and platform requirements | [Browser support](browser-support.md) |
| Choose a runnable starting point | [Examples guide](../examples/README.md) |
| Get help, report a problem, or evaluate an upgrade | [Support policy](../SUPPORT.md) and [changelog](../CHANGELOG.md) |

### Integration and API

Use this lane when adapting application data, behavior, presentation, or an
existing integration. It favors precise public contracts, ownership, tradeoffs,
and failure behavior.

| Goal | Canonical guide |
| --- | --- |
| Look up exports, signatures, defaults, dates, events, state, and lifecycle | [Public API reference](api.md) |
| Connect data, caching, filters, actions, hooks, and toolbar content | [Application integration guide](integration-guide.md) |
| Understand day, event, overflow, hook, and color roles | [Calendar anatomy and color vocabulary](component-anatomy.md) |
| Configure optional package components | [First-party extensions](first-party-extensions.md) |
| Add experimental browser site tools | [WebMCP site-tool integration](webmcp.md) |
| Handle failures, Retry, diagnostics, and presentation ownership | [Error handling](errors.md) |
| Customize visual roles and stable CSS tokens | [Design system](../DESIGN.md) and [CSS token contract](css-tokens.md) |
| Add server-authored fallback content and meaningful links | [SEO and progressive enhancement](seo-and-progressive-enhancement.md) |
| Verify accessibility in the integrated application | [Accessibility](../ACCESSIBILITY.md) |
| Rewrite a FullCalendar v6 `dayGridMonth` source shape | [FullCalendar migration](fullcalendar-v6-migration.md) |

## Contributors

Use this lane for repository changes. It favors canonical ownership, companion
work, observable verification, and review evidence. Contributor policy lives in
`CONTRIBUTING.md`; copyable commands live in `CONTRIBUTOR_COMMANDS.md`.

| Goal | Canonical guide |
| --- | --- |
| Set up the repository and submit a change | [Contributing](../CONTRIBUTING.md) |
| Run focused checks and the complete repository gate | [Contributor commands](../CONTRIBUTOR_COMMANDS.md) |
| Commit and push an already-scoped change | [Commit-and-push operation skill](../.agents/skills/commit-and-push/SKILL.md) |
| Follow source conventions and dependency direction | [Code style](code-style.md) and [internal architecture](architecture.md) |
| Understand extension lifecycle implementation | [First-party extensions](first-party-extensions.md) |
| Review the `setEvents()` decision or reproduce measurements | [Dynamic event update decision record](dynamic-event-updates-adr.md) |
| Browse, update, and verify canonical screenshots | [Screenshot contract](screenshots/README.md) |
| Verify a local package artifact | [Package verification](package-verification.md) |
| Review trust boundaries or report a vulnerability | [Security model](security-model.md) and [security policy](../SECURITY.md) |

## Maintainers

Use this lane for protected publication, hosted controls, deployment, and
governance. It favors explicit authority, exact identities, irreversible
effects, stop rules, recovery, and private evidence. Making and pushing a
contributor change is separate from making a release.

Each procedure names the additional platform permission it requires, such as
GitHub `Admin` access, a required reviewer for the `npm` environment, or npm
package maintainer access. Project maintainership does not grant those
permissions by itself.

| Goal | Canonical guide |
| --- | --- |
| Coordinate an authorized npm alpha release | [Release-to-npm operation skill](../.agents/skills/release-to-npm/SKILL.md) and [release operations](release-operations.md) |
| Review release policy and invariants | [Release policy](releasing.md) |
| Configure hosted controls or recover an exceptional release | [Release administration](release-administration.md) |
| Verify registry and release evidence | [Package verification](package-verification.md) |
| Operate rolling and immutable example deployments | [Static example deployment](example-deployment.md) |
| Review project governance | [Maintainers](../MAINTAINERS.md) and [Code of Conduct](../CODE_OF_CONDUCT.md) |

Operation skills route a task to these canonical documents; they do not replace the repository's policies or runbooks. Public behavior is defined by the package-user guides and generated TypeScript declarations. Private `lfc-*` DOM details are not integration APIs; use the documented options, callbacks, render hooks, extensions, and CSS tokens instead.
