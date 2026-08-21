# Examples and executable coverage

The examples are small integration recipes, not a parallel documentation site.  Each one owns a distinct task and imports the locally built `dist/` output so repository testing exercises the same public exports that consumers install.

## Choose an example

| Goal | Example |
| --- | --- |
| Render a calendar from a static event array | [Basic JavaScript](basic/) |
| Exercise the complete successful TypeScript surface | [Advanced TypeScript](advanced/) |
| Present provider, action, and extension failures | [Async errors](async-errors/) |
| Load the ESM package from a classic script entry point | [Classic-script loader](classic-script/) |
| Rewrite a common FullCalendar month view | [FullCalendar migration](fullcalendar-v6-migration/) |
| Coordinate server-authored fallback markup with client rendering | [Progressive enhancement](progressive-enhancement/) |

Start with the basic example.  Move to the advanced example only when the application needs asynchronous providers, bounds, extensions, custom toolbar content, actions, or state observation.  Failure behavior belongs in the async-errors example so the successful examples remain easy to follow.

## Why examples import `dist/`

Repository examples deliberately import `../../dist/index.js` and `../../dist/styles.css` instead of source files or a workspace alias.  This catches missing exports, stale declarations, bad relative specifiers, CSS packaging errors, and source/build divergence before publication.  `npm run build` creates the package output and generated example modules before any browser scenario runs.

Published documentation uses `@tryagaindev/litefold-calendar` package specifiers.  The relative `dist/` paths are repository-only test wiring and should not be copied into an installed application.

## Coverage methodology

The current methodology is sufficient for an alpha because it verifies examples at four different boundaries:

1. **Build and type boundary.** `npm run build` compiles the package, compiles the advanced TypeScript example, and checks the migration adapter as strict JavaScript.  Public declarations and example usage must agree.
2. **DOM behavior boundary.** `npm run test:examples:built` runs deterministic JSDOM smoke recipes against built output.  It covers rendering, navigation, provider supersession, actions, error recovery, extensions, progressive fallback ownership, the FullCalendar adapter, and teardown without depending on browser physics.
3. **Browser and accessibility boundary.** `npm run test:browser:built` uses pinned Chromium for real focus, keyboard, pointer, responsive, swipe, and automated accessibility behavior.
4. **Published-package boundary.** `npm run check:tarball` installs the packed tarball into a clean consumer, verifies imports and styles, compiles a strict TypeScript consumer, renders in JSDOM, activates an event, and destroys the instance.

Canonical screenshots provide visual review of six deterministic scenes, but they are not behavioral tests.  Manual supported-browser and assistive-technology checks remain necessary for release evidence that automation cannot provide.

This is an appropriate alpha matrix for a dependency-free browser library.  Framework-specific example projects and a large bundler matrix would add maintenance cost and can imply compatibility guarantees the package does not currently make.  Add a minimal Vite, webpack, framework-wrapper, or CDN-hosted consumer only when a reported integration issue or documented support commitment gives it a distinct contract to verify.  Do not create duplicate examples that differ only in application boilerplate.

## Run the examples

```sh
npm ci --ignore-scripts
npm run build
```

Serve the repository root over HTTP and open an example directory.  To run the executable coverage layers:

```sh
npm run typecheck:examples:built
npm run test:examples:built
npm run test:browser:built
npm run check:tarball
```

`npm run check` runs all of these with the repository policy, unit, documentation, lint, screenshot, and packaging gates.

## Adding or changing an example

Keep examples dependency-free, deterministic, and safe to publish as source.  Use sanitized fixture data, application-owned URLs, native semantics, and public package APIs only.  Do not reach into private `lfc-*` DOM structure except in repository tests that explicitly verify a documented behavior.

A new public option, method, extension hook, CSS token, error route, or migration claim must have one clear example owner and focused executable coverage.  Update this guide, the canonical API or integration document, affected tests, and the changelog in the same change.
