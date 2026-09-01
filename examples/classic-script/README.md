# Classic-script loader example

Use this pattern when an existing page has a classic JavaScript entry point but can still load the Litefold Calendar ESM package.

## Run it

Follow the shared [local run instructions](../README.md#run-locally), then choose **Load ESM from a classic script** from the examples landing page. Select August 4, 2026 and activate an event to confirm that the dynamically loaded calendar behaves like the module-script examples.

## How it works

In a deployed application, load the package stylesheet and the existing classic entry script from URLs owned by that application:

```html
<link rel="stylesheet" href="/assets/litefold-calendar/styles.css">
<script defer src="./main.js"></script>
```

`main.js` has no static `import` or `export`. Instead, it uses the standard `import()` expression with the deployed ESM entry URL:

```js
void import("/assets/litefold-calendar/index.js")
	.then(({ createCalendar }) => {
		//Create and render the calendar here.
	})
	.catch(reportStartupFailure);
```

The application build or deployment must copy the package's complete ESM output tree and stylesheet to those URLs while preserving relative module paths. Choose paths that match the application's asset pipeline; `/assets/litefold-calendar/` is only an illustrative deployment location.

The runnable repository fixture deliberately uses `../../dist/index.js` and `../../dist/styles.css` instead. Those are repository-only paths that test the package build output and should not be copied into application code. See the [canonical import mapping](../README.md#getting-started) for package-aware build tools.

`import()` resolves to the package module namespace; it does not create a global package object. The persistent alert in the page reports failures that occur before package-owned error handling is available.

The calendar itself receives a static event array. Once the module loads, `render()` completes its one terminal render synchronously without a loading phase or `aria-busy`.

This is an entry-point interoperability pattern, not a legacy or non-ESM build. It requires the same browsers as Litefold Calendar and must be served over HTTP with correct JavaScript MIME types. A Content Security Policy must permit the same-origin entry and module scripts; `nomodule` is not applicable.

The fixture event URL renders as a native link. Its callback prevents navigation only so this standalone demo can show which calendar surface activated the event. The `data-my-*` attributes are application-owned selectors; Litefold Calendar output uses the package namespaces.

Browse the [JavaScript loader](main.js), [HTML](index.html), [browser support policy](../../docs/browser-support.md), and [classic-script integration guidance](../../docs/integration-guide.md#classic-script-entry-point).
