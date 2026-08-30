# Documentation

Start with the [project README](../README.md) for installation and a first render. Use this index when you need a specific integration, behavior, or maintenance contract. Consumers should use **Evaluate and start** or **Integrate**; contributors and maintainers should use **Contribute and maintain**.

## Evaluate and start

| Goal | Canonical guide |
| --- | --- |
| Decide whether the focused month-and-agenda model fits | [Features and alpha scope](features.md) |
| Install and render a first calendar | [README quick start](../README.md#quick-start) and [basic JavaScript example](../examples/basic/) |
| Find a runnable scenario | [Examples and executable coverage](../examples/) |
| Rewrite a FullCalendar v6 `dayGridMonth` integration | [FullCalendar migration](fullcalendar-v6-migration.md) |

## Integrate

| Goal | Canonical guide |
| --- | --- |
| Look up exports, signatures, defaults, dates, events, methods, state, or lifecycle | [Public API reference](api.md) |
| Adapt application data, caching, filters, actions, render hooks, and toolbar content | [Application integration guide](integration-guide.md) |
| Identify day, event, overflow, render-hook, and color roles | [Calendar anatomy and color vocabulary](component-anatomy.md) |
| Choose and configure a tree-shakeable optional component | [First-party extensions](first-party-extensions.md) |
| Opt a calendar into experimental browser site tools | [WebMCP site-tool integration](webmcp.md) |
| Handle loading, failure, Retry, and presentation ownership | [Error handling](errors.md) |
| Apply stable CSS tokens, cascade layers, and CSP-safe overrides | [CSS token contract](css-tokens.md) and [design system](../DESIGN.md) |
| Add a no-JavaScript fallback and meaningful event links | [SEO and progressive enhancement](seo-and-progressive-enhancement.md) |
| Verify keyboard, direct input, zoom, contrast, and assistive technology | [Accessibility](../ACCESSIBILITY.md) |
| Check supported browsers and platform fallbacks | [Browser support](browser-support.md) |
| Get usage help or report a problem | [Support policy](../SUPPORT.md) |

## Contribute and maintain

| Goal | Canonical guide |
| --- | --- |
| Set up development, run common commands, and submit a change | [Contributing](../CONTRIBUTING.md), [contributor commands](../CONTRIBUTOR_COMMANDS.md), and [coding conventions](code-style.md) |
| Understand extension lifecycle order or author a package-owned optional component | [First-party extensions](first-party-extensions.md) |
| Understand dependency direction and source/render order | [Internal architecture](architecture.md) |
| Reproduce root-import, render, source-update, DOM-operation, and output-size measurements | [Measurement protocol](dynamic-event-updates-adr.md#measurement-protocol) |
| Review the `setEvents()` decision and lifecycle tradeoffs | [Dynamic event update decision record](dynamic-event-updates-adr.md) |
| Review trust boundaries and report a vulnerability | [Security model](security-model.md) and [security policy](../SECURITY.md) |
| Reproduce the six canonical images | [Screenshot contract](screenshots/README.md) |
| Verify package artifacts as a consumer | [Package verification](package-verification.md) |
| Follow the alpha release steps as an operator | [Alpha release operations runbook](release-operations.md) |
| Understand alpha release policy and design | [Release process](releasing.md) |
| Configure publishing or recover an exceptional release | [Release administration](release-administration.md) |
| Audit GitHub organization, repository, ruleset, environment, and security controls | [Release administration hosted prerequisites](release-administration.md#one-time-hosted-prerequisites) |
| Operate rolling and immutable example deployments | [Static example deployment](example-deployment.md) |
| Review project changes and governance | [Changelog](../CHANGELOG.md), [maintainers](../MAINTAINERS.md), and [Code of Conduct](../CODE_OF_CONDUCT.md) |

Public behavior is defined by these guides and the generated TypeScript declarations. Private `lfc-*` DOM details are not integration APIs; use the documented options, callbacks, render hooks, extensions, and CSS tokens instead.
