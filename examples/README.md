# Examples

Each example is a small, framework-free recipe built against the package's public API. Start with **Basic JavaScript**, then choose the example that matches the integration problem you are solving.

## Choose an example

| Goal | Example |
| --- | --- |
| Render a static event array | [Basic JavaScript](basic/) |
| Integrate an async provider, typed metadata, actions, render hooks, state, and WebMCP | [Advanced TypeScript](advanced/) |
| Handle source, action, and render-hook failures | [Async errors](async-errors/) |
| Load the ESM package from an existing classic script | [Classic-script loader](classic-script/) |
| Replace a FullCalendar v6 `dayGridMonth` integration | [FullCalendar migration](fullcalendar-v6-migration/) |
| Keep server-rendered fallback content until the calendar is ready | [Progressive enhancement](progressive-enhancement/) |

## Run locally

From the repository root:

```sh
npm ci --ignore-scripts
npm run demo
```

Open the printed `/examples/` URL. `npm run demo` builds the package and all generated example assets before starting the local loopback HTTP server. After a successful `npm run build`, use `npm run serve:repository` to restart that server without rebuilding; `dist/` alone is not enough because the advanced bundle and deployment metadata are also generated.

The repository examples import files such as `../../dist/index.js` and `../../dist/styles.css`. Those paths deliberately exercise the package output that will be published. In an installed application, use package imports instead:

```js
import { createCalendar } from "@tryagaindev/litefold-calendar";
import "@tryagaindev/litefold-calendar/styles.css";
```

## Validate an example change

Run the smallest relevant check first, then the full repository check before release:

```sh
npm run typecheck:examples
npm run test:examples
npm run test:browser
```

- `typecheck:examples` builds the package, then verifies the advanced TypeScript example against the public declarations. The full example build also runs `checkJs` validation for the FullCalendar migration recipe.
- `test:examples` builds the package and runs deterministic JSDOM integration recipes.
- `test:browser` builds the package and covers real browser, keyboard, pointer, responsive, and accessibility behavior.
- `npm run check` runs the complete repository gate.

When `dist/` is already current, the corresponding `*:built` scripts skip the build. Packaging work should also run `npm run check:tarball` against a clean packed-package consumer.

Canonical screenshots support visual review, but supported-browser and assistive-technology checks still require manual testing.

## Add or change an example

- Keep the example dependency-free, deterministic, and safe to publish as source.
- Use public package APIs, documented CSS tokens, native HTML semantics, and sanitized fixture data.
- Treat unprefixed `data-*` attributes as application-owned selectors, not package output.
- Give each public option, method, hook, extension, or error path one clear example owner and focused executable coverage.
- Update the relevant API or integration guide, tests, and changelog with the example.

GitHub Pages hosts a rolling `main` preview and immutable release demos. See the [static deployment guide](../docs/example-deployment.md) for versioning, rollback, and deep-link behavior.
