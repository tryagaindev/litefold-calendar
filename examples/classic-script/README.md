# Classic-script loader example

This example uses an external classic script:

```html
<script defer src="./main.js"></script>
```

The script uses standard `import()` to load the local litefold-calendar ESM build. It contains no static `import`, `export`, module-script tag, global package object, CDN, or runtime dependency. Import failures receive a persistent visible error because package-owned error handling cannot run before the package loads.

One event has a relative URL, so both grid and agenda representations are native links. The activation callback prevents navigation synchronously only to keep this standalone fixture on the page, and reports which surface was activated.

This is a classic-script entry point, not a legacy or non-ESM package build. It requires the same modern evergreen browser baseline as litefold-calendar. Do not add `nomodule`; serve the repository over HTTP with JavaScript MIME types and a Content Security Policy that permits the same-origin scripts. The language behavior is defined by the [ECMA-262 `import()` contract](https://tc39.es/ecma262/multipage/ecmascript-language-expressions.html#sec-import-calls).

Run `npm run demo` from the repository root, then choose **Classic-script loader** from the examples landing page.

The example's unprefixed `data-*` attributes are application-owned fixture selectors. They are not package output or public API.

Browse the source: [JavaScript loader](main.js), [HTML](index.html), and [shared example CSS](../example.css).

Next: read the [browser support policy](../../docs/browser-support.md) and [classic-script integration guidance](../../docs/integration-guide.md#classic-script-entry-point).
