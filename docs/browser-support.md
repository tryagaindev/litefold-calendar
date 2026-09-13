# Browser support

Litefold Calendar targets **Baseline Widely available** across the library, examples, and published documentation site. The package has no runtime dependencies, global polyfills, or separate legacy build.

## Supported release window

The shared build target is Vite's `baseline-widely-available` preset. Vite fixes the preset's Baseline date for each major release; targets do not advance merely because another day passes. The repository resolves the preset through Vite's public API and uses its effective browser targets for JavaScript and CSS, without maintaining a separate browser-version list. See [Vite's target policy](https://vite.dev/config/build-options#build-target).

Baseline Widely available describes capabilities interoperable across the core browser set for at least 30 months. The support commitment uses the installed Vite preset's fixed window, so a current Baseline badge alone does not prove support in every resolved target. See [MDN's Baseline definition](https://developer.mozilla.org/en-US/docs/Glossary/Baseline/Compatibility).

Run `npm run browsers:report` to see the preset identifier, resolution date, resolved JavaScript/CSS targets, and the installed Vite and esbuild versions under `dataVersions`. Builds write the same evidence to `.cache/browser-targets.json`; release and screenshot evidence use the effective targets. Weekly Dependabot updates include Vite major updates, which require review and CI before they can change the supported window. The recorded resolution date is evidence of when the report was generated, not a rolling compatibility cutoff.

| Environment | Supported browsers |
| --- | --- |
| Desktop | Vite-preset targets for Google Chrome, Chromium-based Microsoft Edge, Mozilla Firefox, and Apple Safari on macOS |
| Mobile | Equivalent preset capabilities in Google Chrome on Android and Apple Safari on iOS or iPadOS |
| Embedded system webviews | Vendor-supported Android System WebView and `WKWebView` with equivalent required capabilities; verify the embedding environment separately |

Install available security and patch updates. Beta, Dev, Canary, Nightly, and Safari Technology Preview releases are useful for early testing but do not define the support target. Baseline is a feature-interoperability policy; it does not certify every webview, device, or assistive-technology combination.

This policy defines where the project accepts compatibility defects. Chromium and WebKit automation gates every release; Firefox is exercised locally for now. This temporary automation scope does not remove Firefox support. Dated browser, device, and assistive-technology results are tracked in the [accessibility test record](../ACCESSIBILITY.md#assistive-technology-record) and repeated when relevant behavior changes.

## Automated engine matrix

The hosted Playwright gate runs the end-to-end suite in Chromium (`Desktop Chrome`) and WebKit (`Desktop Safari`). The Firefox (`Desktop Firefox`) project is retained for local checks because its hosted automation has been unstable. Browser-neutral interaction, layout, accessibility-rule, and Playwright-computed ARIA scenarios remain expected to pass in all three engines. The WebKit project does not replace testing branded Safari on macOS, iOS, or iPadOS, and none of the projects substitutes for testing with an actual screen reader or inspecting a native platform accessibility tree.

A small capability-specific subset remains Chromium-only because it requires Playwright's Chrome DevTools Protocol session: trusted synthetic touch/pen injection and programmatic 400% browser zoom. Portable wheel, keyboard, disabled-pager, responsive, and accessibility outcomes continue to run in every engine. This protocol boundary is a test-tool limitation, not an exclusion from the support policy.

Use `npm run test:browser` for the complete local matrix or `npm run test:browser:chromium`, `npm run test:browser:firefox`, and `npm run test:browser:webkit` while diagnosing one engine. When `CI` is set, the Playwright configuration excludes Firefox; run local Firefox checks with `CI` unset. Optional repeated local qualification is described in the [contributor command reference](../CONTRIBUTOR_COMMANDS.md#run-the-final-gate). When running separate engine processes concurrently, follow the [concurrent browser-check guidance](../CONTRIBUTOR_COMMANDS.md#run-browser-checks-concurrently) so each process has its own port and output directory. The supported-browser, device, and assistive-technology matrix remains a required manual release activity according to the [accessibility testing policy](../ACCESSIBILITY.md#testing).

## Required platform

The package relies directly on these Baseline platform capabilities:

| Area | Required capabilities |
| --- | --- |
| JavaScript | ECMAScript modules, promises, `AbortController`, URL parsing, and `Intl` |
| DOM and input | Standard DOM, native semantic elements and modal dialogs, Pointer/Touch/Wheel Events, and native scrolling |
| CSS | Custom properties, Grid and Flexbox, Scroll Snap, logical and intrinsic sizing, cascade layers, forgiving `:is()` / `:where()` selectors, animations, and inline-size container queries and units |

The optional [classic-script recipe](integration-guide.md#classic-script-entry-point) also requires dynamic `import()`.

Capabilities outside the resolved preset require feature detection and a tested supported path. The displayed month/year button uses `popover="auto"` when available and a native modal `<dialog>` otherwise. Both provide labelled Month and Year controls, validation, Jump, Cancel, Escape, light dismissal, and focus restoration. The fallback uses native modality; other page controls remain inert until dismissal. It does not require `<input type="month">` or modify global APIs.

The palette uses `light-dark()` when available. Otherwise a small local controller mirrors the effective host `color-scheme` into the same CSS palette, observing system preference and live host/ancestor theme attributes. It does not rerender, refetch, reset picker input, or move focus. The default host scheme remains `light dark`; applications can set `color-scheme: light`, `dark`, or `inherit` on their host. Use `inherit` when an ancestor controls application themes. Removing the override resumes the automatic default. Application token overrides and forced-color/increased-contrast rules remain in the normal cascade.

Agenda columns share tracks with subgrid where supported; explicit per-row tracks provide the supported fallback. Browsers without `:has()` use wrapping agenda rows that retain optional markers, times, titles, and supporting content. Required count actions and compact toolbar layout do not depend on relational selectors. Where `:dir()` is unavailable, the same local controller reflects the effective host direction, including nested ancestor resets and live attribute changes, into package-owned styling state. None of these fallbacks measures layout or replaces controls. Balanced/pretty text wrapping, stable scrollbar gutters, and safe alignment are enhancements over ordinary wrapping, scrolling, and alignment.

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
