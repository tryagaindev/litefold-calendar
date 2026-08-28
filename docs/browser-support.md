# Browser support

litefold-calendar targets current standards-based browsers. The support window rolls forward with browser stable releases; it is not tied to fixed version numbers in the package.

## Supported release window

The current and immediately previous stable major versions of these browsers are supported:

- Google Chrome on desktop.
- Microsoft Edge on desktop, using the Chromium engine.
- Mozilla Firefox on desktop.
- Apple Safari on macOS.
- Google Chrome on Android.
- Apple Safari on iOS and iPadOS.
- Android System WebView on supported Android releases.
- `WKWebView` on supported iOS and iPadOS releases.

“Current” means the stable major release generally available when a defect is evaluated. Beta, Dev, Canary, Nightly, and Safari Technology Preview releases are useful for early testing but are not supported releases. Patch updates within a supported major should be installed before reporting a defect.

The policy defines the environments in which the project accepts compatibility defects. Automated coverage gates every release. Dated manual browser and assistive-technology evidence is risk-based: repeat affected combinations after relevant behavior or support changes, and complete the supported baseline before stable promotion. Results are tracked in the [accessibility test record](../ACCESSIBILITY.md#assistive-technology-record).

## Required platform

The package relies directly on modern browser capabilities, including:

- ECMAScript modules for the package entry point. The optional classic-script integration recipe additionally uses dynamic `import()`.
- Standard DOM, native anchors/buttons/lists/time elements, the Popover API, Pointer, Touch, and Wheel Events, native scrolling, `ResizeObserver`, `AbortController`, promises, URL parsing, and `Intl` formatting.
- CSS custom properties and animations, Grid and subgrid, Scroll Snap, intrinsic and logical sizing, logical properties, cascade layers, `:where()`, `:has()`, and inline-size container queries and units.

The displayed month/year button opens a package-owned `popover="auto"` surface with native form controls. The package uses no custom month-input widget and does not require browser support for `<input type="month">`. Locale first-day resolution accepts either the `Intl.Locale#getWeekInfo()` method or `Intl.Locale#weekInfo` accessor exposed by the platform and degrades to Sunday only when neither yields a usable `firstDay`. `fallbackElement` coordinates application-authored no-JavaScript content until usable calendar data commits. The package does not download compatibility code or alter global browser APIs.

Responsive behavior is entirely CSS-driven from the calendar container. There is no JavaScript viewport fallback for browsers without container-query support, and applications must not add one by measuring package internals or moving package-owned nodes. In supported browsers, resizing a mounted host changes computed layout without rerendering or refetching calendar data.

When `swipe` is enabled, the month grid normally sits in a native horizontal scroll-snap viewport. A browser/input stack that maps touch, pen, or horizontal precision scrolling to native horizontal scrolling can pull toward decorative Previous/Next lanes; ordinary vertical scrolling and pinch zoom remain available. Settle detection listens for native `scrollend` and maintains a bounded 120ms-after-last-scroll idle fallback, so paging does not depend on `scrollend` or the limited-availability Scroll Snap Events API. Native Previous/Next buttons, Page Up/Down commands, the month/year picker, and public navigation methods remain the functional fallbacks when a device or user agent does not produce a qualifying horizontal gesture.

User agents and operating systems own native scroll momentum, touch slop, rubber-banding, overscroll, and snap timing. Exact motion is intentionally not normalized or guaranteed across supported browsers. With reduced motion requested, CSS scroll snapping is disabled. Direct tracking and any platform momentum remain native; after scrolling settles, the package resolves the destination and recenters by direct scroll-position assignment without authored smooth scrolling. Compatibility reports should focus on observable calendar semantics—direction, boundary enforcement, at-most-one-month commits, focus/state consistency, and recovery to the current snap point—rather than pixel-identical physics.

Pinned-Chromium automation validates the managed interaction model, including trusted touch pull/snap outcomes, browser-generated horizontal-wheel paging, and that trusted pen pointer events are neither prevented nor captured. It does not establish real stylus scrolling or physical precision-device momentum; those outcomes require supported-device manual evidence whenever affected. Automation also covers compact targets and density, CSS-only container transitions, DOM/focus-order alignment, RTL, forced colors, normal and reduced selection feedback, reflow, and the generic no-JavaScript fallback. Dated manual evidence remains the authority for claims about real user-agent combinations; it is repeated when relevant behavior changes rather than for every unrelated alpha.

## Experimental WebMCP availability

WebMCP is not a required platform capability and is outside the rolling browser-support commitment above. Its current `document.modelContext` API is experimental, selectively enabled, and may be unavailable in an otherwise supported browser. The `webMcp` option is default-off and preserves the complete ordinary calendar when that API is absent.

Use exact feature detection rather than browser-name or version inference. The dated browser positions, origin trials, ChatGPT desktop limitations, and verification procedure belong to the [WebMCP site-tool guide](webmcp.md#compatibility-and-testing).

## Not supported

The project does not support:

- Internet Explorer.
- Microsoft Edge Legacy using EdgeHTML.
- Third-party in-app browsers or browser components that modify their underlying engine, inject incompatible scripts, or cannot reproduce a defect in the corresponding supported browser or system webview.
- Unlisted, niche, or obscure browsers, even when they share an engine with a supported browser.
- Browsers outside the rolling two-major-version window.
- Polyfill-dependent operation, a legacy JavaScript build, CommonJS, `nomodule`, or transpilation performed by this package.

An unsupported browser may happen to work, but compatibility is not tested or guaranteed there. Applications may transpile their own code, but modifying or wrapping the distributed package does not expand the project's support commitment.

## Reporting compatibility defects

Include the exact litefold-calendar version, browser version, operating-system version, available calendar width, input device and gesture type when relevant, and a minimal reproduction. Verify the problem with the package's unmodified ESM and CSS exports in a supported stable browser before filing it. See the [support policy](../SUPPORT.md) for reporting routes.

[Back to the documentation hub](README.md)
