# Browser support

Litefold Calendar targets current standards-based browsers and ships no polyfills or legacy build. The support window rolls forward with stable browser releases instead of being pinned to package-specific version numbers.

## Supported release window

The current and immediately previous stable major versions are supported:

| Environment | Supported browsers |
| --- | --- |
| Desktop | Google Chrome, Chromium-based Microsoft Edge, Mozilla Firefox, and Apple Safari on macOS |
| Mobile | Google Chrome on Android and Apple Safari on iOS or iPadOS |
| Embedded system webviews | Android System WebView and `WKWebView` on vendor-supported Android, iOS, and iPadOS releases |

“Current” means the stable major release generally available when a defect is evaluated. Beta, Dev, Canary, Nightly, and Safari Technology Preview releases are useful for early testing but are not supported releases. Patch updates within a supported major should be installed before reporting a defect.

This policy defines where the project accepts compatibility defects. Automated coverage gates every release; dated browser, device, and assistive-technology results are tracked in the [accessibility test record](../ACCESSIBILITY.md#assistive-technology-record) and repeated when relevant behavior changes.

## Required platform

The package relies directly on these modern platform capabilities:

| Area | Required capabilities |
| --- | --- |
| JavaScript | ECMAScript modules, promises, `AbortController`, URL parsing, and `Intl` |
| DOM and input | Standard DOM, native semantic elements, the Popover API, Pointer/Touch/Wheel Events, native scrolling, and `ResizeObserver` |
| CSS | Custom properties, Grid and subgrid, Scroll Snap, logical and intrinsic sizing, cascade layers, `:where()`, `:has()`, animations, and inline-size container queries and units |

The optional [classic-script recipe](integration-guide.md#classic-script-entry-point) also requires dynamic `import()`.

The displayed month/year button opens a package-owned `popover="auto"` with native form controls; it does not require `<input type="month">`. Locale-derived week starts use either `Intl.Locale#getWeekInfo()` or `Intl.Locale#weekInfo` and fall back to Sunday only when neither returns a usable `firstDay`. The package does not download compatibility code or modify global browser APIs.

### Responsive layout

Responsive behavior is CSS-driven from the calendar container. Applications must provide a host border box at least **320 CSS pixels wide**; narrower containers receive best-effort degradation and are not a supported layout target. There is no JavaScript fallback for missing container-query support. In supported browsers, resizing the host changes layout without rerendering, refetching, or moving focus.

### Direct-input paging

With `swipe` enabled, touch, pen, or horizontal precision scrolling can pull the current grid toward a decorative Previous or Next lane. Vertical scrolling and pinch zoom remain available. The package does not require `scrollend` support, and Previous/Next, Page Up/Down, the month/year picker, and public navigation methods remain available when a device does not produce a qualifying horizontal gesture.

Scroll momentum, touch slop, overscroll, rubber-banding, and snap timing belong to the browser and operating system. Compatibility is defined by observable behavior—direction, bounds, at-most-one-month commits, focus/state consistency, and recovery to the current snap point—not pixel-identical motion. Under reduced motion, authored scroll snapping is disabled and recentering remains a direct position assignment without smooth scrolling.

See the [direct-input accessibility contract](../ACCESSIBILITY.md#responsive-and-direct-input-behavior) and its [verification matrix](../ACCESSIBILITY.md#testing) for device-level expectations.

## Experimental WebMCP availability

WebMCP is not a required platform capability and is outside the rolling browser-support commitment above. Its `document.modelContext` API is experimental, selectively enabled, and may be unavailable in an otherwise supported browser.

WebMCP is an optional extension imported from `@tryagaindev/litefold-calendar/extensions/webmcp`. Omitting `webMcp()` from `CalendarOptions.extensions` leaves it inactive; configuring it in a browser without the API produces a progressive no-op. In both cases, the ordinary calendar remains available.

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

Include the exact Litefold Calendar version, browser version, operating-system version, available calendar width, input device and gesture type when relevant, and a minimal reproduction. Verify the problem with the package's unmodified ESM and CSS exports in a supported stable browser before filing it. See the [support policy](../SUPPORT.md) for reporting routes.

[Back to the documentation hub](README.md)
