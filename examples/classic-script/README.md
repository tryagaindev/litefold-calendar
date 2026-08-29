# Classic-script loader example

Use this pattern when an existing page has a classic JavaScript entry point but can still load the litefold-calendar ESM package.

## Run it

From the repository root, run `npm run demo`, then choose **Load ESM from a classic script** from the examples landing page. Select August 4, 2026 and activate an event to confirm that the dynamically loaded calendar behaves like the module-script examples.

## How it works

The page loads one deferred classic script:

```html
<script defer src="./main.js"></script>
```

`main.js` has no static `import` or `export`. Instead, it uses the standard `import()` expression available to classic scripts:

```js
void import("../../dist/index.js")
	.then(({ createCalendar }) => {
		//Create and render the calendar here.
	})
	.catch(reportStartupFailure);
```

`import()` resolves to the package module namespace; it does not create a global package object. The persistent alert in the page reports failures that occur before package-owned error handling is available.

This is an entry-point interoperability pattern, not a legacy or non-ESM build. It requires the same browsers as litefold-calendar and must be served over HTTP with correct JavaScript MIME types. A Content Security Policy must permit the same-origin entry and module scripts; `nomodule` is not applicable.

The fixture event URL renders as a native link. Its callback prevents navigation only so this standalone demo can show which calendar surface activated the event. Unprefixed `data-*` attributes are application-owned selectors, not package output.

Browse the [JavaScript loader](main.js), [HTML](index.html), [browser support policy](../../docs/browser-support.md), and [classic-script integration guidance](../../docs/integration-guide.md#classic-script-entry-point).
