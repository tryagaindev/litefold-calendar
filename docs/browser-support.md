# Browser support

Litefold Calendar targets **Baseline Widely available** across the library, examples, and published documentation site. The package has no runtime dependencies, global polyfills, or separate legacy build.

## Minimum browser versions

The table below is generated from the same Vite resolver used by the package
build.  Both columns apply; use the newer minimum when they differ.  A dash means
the preset supplies no explicit target for that column, not a promise of support
in older versions.  Install current security and patch updates.

<!-- browser-targets:start -->
<!-- Generated from the shared browser target resolver; do not edit by hand. -->
Preset: `baseline-widely-available`.  Resolver: Vite `8.3.2`; esbuild `0.28.2`.

| Browser | JavaScript minimum | CSS minimum |
| --- | --- | --- |
| Google Chrome | 111 | 111 |
| Microsoft Edge (Chromium) | 111 | 111 |
| Mozilla Firefox | 114 | 114 |
| Safari on macOS | 16.4 | 16.4 |
| Safari on iOS / iPadOS | 16.4 | 16.4 |
<!-- browser-targets:end -->

These values describe **this source revision**, not every published version.
When evaluating a release, read this guide at that release's tag or source
commit; `main` follows development.  Branded browsers, mobile devices, webviews,
and assistive technologies still require the checks described below.

## Supported release window

The shared build target is Vite's `baseline-widely-available` preset. Vite fixes its Baseline date for each major release; targets do not change daily.

The build resolves the preset through Vite's public API and uses those targets for JavaScript and CSS. The repository does not maintain a separate browser-version list. See [Vite's target policy](https://vite.dev/config/build-options#build-target).

Baseline Widely available describes features that have worked across the core browser set for at least 30 months. This package uses the installed Vite preset's fixed window. A current Baseline badge alone does not prove support in every resolved target. See [MDN's Baseline definition](https://developer.mozilla.org/en-US/docs/Glossary/Baseline/Compatibility).

The generated table makes the resolved versions readable without cloning the repository.  Builds, screenshots, and release receipts retain the same target evidence.  Reviewed Vite dependency updates can change the support window; a report's resolution date is not a rolling compatibility cutoff.  Contributors can [refresh and check the generated table](../CONTRIBUTOR_COMMANDS.md#refresh-browser-documentation).

| Environment | Supported browsers |
| --- | --- |
| Desktop | Vite-preset targets for Google Chrome, Chromium-based Microsoft Edge, Mozilla Firefox, and Apple Safari on macOS |
| Mobile | Equivalent preset capabilities in Google Chrome on Android and Apple Safari on iOS or iPadOS |
| Embedded system webviews | Vendor-supported Android System WebView and `WKWebView` with equivalent required capabilities; verify the embedding environment separately |

Install available security and patch updates. Beta, Dev, Canary, Nightly, and Safari Technology Preview releases are useful for early testing but do not define the support target. Baseline is a feature-interoperability policy; it does not certify every webview, device, or assistive-technology combination.

This policy defines where the project accepts compatibility defects. Chromium and WebKit automation gates every release; Firefox is exercised locally for now. This temporary automation scope does not remove Firefox support. Dated browser, device, and assistive-technology results are tracked in the [accessibility test record](../ACCESSIBILITY.md#assistive-technology-record) and repeated when relevant behavior changes.

## Automated engine matrix

The hosted Playwright gate runs the end-to-end suite in Chromium (`Desktop Chrome`) and WebKit (`Desktop Safari`). Firefox (`Desktop Firefox`) runs locally because its hosted automation has been unstable.

Browser-neutral interaction, layout, accessibility-rule, and Playwright-computed ARIA scenarios must still pass in all three engines. WebKit automation does not replace testing branded Safari on macOS, iOS, or iPadOS. Automation also does not replace testing with an actual screen reader or inspecting a native platform accessibility tree.

A small capability-specific subset remains Chromium-only because it requires Playwright's Chrome DevTools Protocol session: trusted synthetic touch/pen injection and programmatic 400% browser zoom. Portable wheel, keyboard, disabled-pager, responsive, and accessibility outcomes continue to run in every engine. This protocol boundary is a test-tool limitation, not an exclusion from the support policy.

Choose the check for your task:

- Run `npm run test:browser` for the complete local matrix.
- Use `npm run test:browser:chromium`, `npm run test:browser:firefox`, or `npm run test:browser:webkit` to diagnose one engine.
- Unset `CI` for local Firefox checks; the Playwright configuration excludes Firefox when `CI` is set.
- For Firefox inside a Windows OS sandbox, follow the [explicit opt-in launch guidance](../CONTRIBUTOR_COMMANDS.md#run-firefox-inside-a-windows-os-sandbox).
- See the [contributor command reference](../CONTRIBUTOR_COMMANDS.md#run-the-final-gate) for optional repeated local qualification.
- Give concurrent engine processes separate ports and output directories, as described in [concurrent browser checks](../CONTRIBUTOR_COMMANDS.md#run-browser-checks-concurrently).

The [accessibility testing policy](../ACCESSIBILITY.md#testing) also requires manual release checks across the supported browsers, devices, and assistive technologies.

## Required platform

The package relies directly on these Baseline platform capabilities:

| Area | Required capabilities |
| --- | --- |
| JavaScript | ECMAScript modules, promises, `AbortController`, URL parsing, and `Intl` |
| DOM and input | Standard DOM, native semantic elements and modal dialogs, Pointer/Touch/Wheel Events, and native scrolling |
| CSS | Custom properties, Grid and Flexbox, Scroll Snap, logical and intrinsic sizing, cascade layers, forgiving `:is()` / `:where()` selectors, animations, and inline-size container queries and units |

The optional [classic-script recipe](integration-guide.md#classic-script-entry-point) also requires dynamic `import()`.

Capabilities outside the resolved preset require feature detection and a tested supported path.

The displayed month/year button uses `popover="auto"` when available and a native modal `<dialog>` otherwise. Both provide labelled Month and Year controls, validation, Jump, Cancel, Escape, light dismissal, and focus restoration. The dialog keeps other page controls inert until dismissal. It does not require `<input type="month">` or modify global APIs.

The palette uses `light-dark()` when available. Otherwise a small local controller applies the effective host `color-scheme` to the same CSS palette. It observes system preference and live theme attributes on the host and its ancestors. It does not rerender, refetch, reset picker input, or move focus.

The default host scheme is `light dark`. Applications can set `color-scheme: light`, `dark`, or `inherit` on their host. Use `inherit` when an ancestor controls application themes; remove the override to resume the automatic default. Application token overrides and forced-color/increased-contrast rules remain in the normal cascade.

Other layout and direction features have these fallbacks:

- Agenda columns use subgrid where supported, or explicit tracks for each row otherwise.
- Without `:has()`, agenda rows wrap while retaining optional markers, times, titles, and supporting content. Required count actions and compact toolbar layout do not depend on relational selectors.
- Without `:dir()`, the same local controller applies the effective host direction to package-owned styling state. It handles nested ancestor resets and live attribute changes.

None of these fallbacks measures layout or replaces controls. Balanced/pretty text wrapping, stable scrollbar gutters, and safe alignment enhance ordinary wrapping, scrolling, and alignment.

Locale-derived week starts use either `Intl.Locale#getWeekInfo()` or `Intl.Locale#weekInfo` and fall back to Sunday only when neither returns a usable `firstDay`.

`ResizeObserver` is an optional direct-input enhancement. When available, it clears an in-progress paging gesture after the viewport resizes. Without it, the ordinary calendar and its toolbar, keyboard, picker, and public navigation routes remain available.

### Responsive layout

Responsive behavior is CSS-driven from the calendar container. Applications must meet the [minimum supported host width](../DESIGN.md#responsive-model); containers below that floor receive best-effort degradation and are not a supported layout target. There is no JavaScript fallback for missing container-query support. In supported browsers, resizing the host changes layout without rerendering, refetching, or moving focus.

Browser tests cover nested component containers, preserved interaction observers, and forced fallback paths. They disable unsupported selectors and declarations in the loaded CSS as well as JavaScript feature detection, so current-engine parsing cannot silently conceal an untested fallback.

### Direct-input paging

With `swipe` enabled, touch, pen, or horizontal precision scrolling can pull the current grid toward a decorative Previous or Next lane. Vertical scrolling and pinch zoom remain available. The package does not require `scrollend` support, and Previous/Next, Page Up/Down, the month/year picker, and public navigation methods remain available when a device does not produce a qualifying horizontal gesture.

Scroll momentum, touch slop, overscroll, rubber-banding, and snap timing belong to the browser and operating system. Compatibility is defined by observable behavior—direction, bounds, at-most-one-month commits, focus/state consistency, and recovery to the current snap point—not pixel-identical motion. Under reduced motion, authored scroll snapping is disabled and recentering remains a direct position assignment without smooth scrolling.

See the [direct-input accessibility contract](../ACCESSIBILITY.md#responsive-and-direct-input-behavior) and its [verification matrix](../ACCESSIBILITY.md#testing) for device-level expectations.

## Experimental WebMCP availability

WebMCP is not a required platform capability and is outside the Baseline support commitment above. Its `document.modelContext` API is experimental, selectively enabled, and may be unavailable in an otherwise supported browser.

WebMCP is an optional extension imported from `@tryagaindev/litefold-calendar/extensions/webmcp`. Omitting `webMcp()` from `CalendarOptions.extensions` leaves it inactive; configuring it in a browser without the API produces a progressive no-op. In both cases, the ordinary calendar remains available.

Use exact feature detection rather than browser-name or version inference. When WebMCP availability depends on an embedding host or browser policy, follow the [WebMCP compatibility and testing procedure](webmcp.md#compatibility-and-testing).

## Not supported

The project does not support:

- Browsers outside the installed Vite preset's resolved target.
- Browser components outside the supported table, including in-app browsers
  that modify their engine, inject incompatible scripts, or cannot reproduce a
  defect in the corresponding supported browser or system webview.
- Polyfill-dependent operation, a separate legacy JavaScript build, CommonJS, or `nomodule`. The package build transforms syntax for the resolved targets but cannot supply missing platform APIs.

An unsupported browser may happen to work, but compatibility is not tested or guaranteed there. Applications may transpile their own code, but modifying or wrapping the distributed package does not expand the project's support commitment.

## Reporting compatibility defects

Include the exact Litefold Calendar version, browser version, operating-system version, available calendar width, input device and gesture type when relevant, and a minimal reproduction. Verify the problem with the package's unmodified ESM and CSS exports in a supported stable browser before filing it. See the [support policy](../SUPPORT.md) for reporting routes.

[Back to the documentation hub](README.md)
