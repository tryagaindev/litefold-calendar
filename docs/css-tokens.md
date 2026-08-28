# CSS token contract

Import `@tryagaindev/litefold-calendar/styles.css` once. The stylesheet is scoped, contains no reset or remote asset, and declares its rules in `@layer lfc`.

[DESIGN.md](../DESIGN.md) is canonical for public token names, semantic roles, exact light and dark defaults, typography, spacing, responsive composition, and component states. This document owns the application mechanics: stable hooks, host-marker behavior, cascade and layer usage, responsive integration boundaries, and CSP.

## Stable surface

Only these styling hooks are public:

- `.litefold-calendar`
- The `--lfc-*` custom properties in the [DESIGN.md token map](../DESIGN.md#public-css-token-map)

Every generated descendant selector, transient state class, data attribute, ID, pseudo-element, keyframe name, pager lane, container name, and layer implementation detail is private as a styling or query hook, even when its name starts with `lfc`. Do not target those identifiers. Their observable visual behavior is owned by [DESIGN.md](../DESIGN.md); interaction, DOM, focus, and accessibility semantics are owned by the [accessibility contract](../ACCESSIBILITY.md) and [public API reference](api.md). Use public options, callbacks, extensions, and owned element references instead.

`--lfc-internal-*` properties are explicitly unsupported and may change in any release.

## Rendered root marker

`render()` adds `.litefold-calendar` and the presence-only `data-litefold-calendar` attribute to the host. The class is the supported styling root. The attribute is a stable JavaScript discovery marker, has no value contract, and must not be used as a styling hook. `destroy()` removes both markers.

## Apply token overrides

Set overrides directly on the rendered host. Package defaults are declared on that host, so custom properties set only on an ancestor do not replace them through inheritance. Normal cascade-layer and source-order rules determine which host declaration wins.

Declare an application layer after importing the package. This safe baseline maps non-color roles and leaves Litefold's adaptive light, dark, and forced-colors palette intact:

```css
@import "@tryagaindev/litefold-calendar/styles.css";

@layer application {
	.schedule-theme .litefold-calendar {
		--lfc-font-family: var(--app-font-family, system-ui, sans-serif);
		--lfc-border-radius: var(--app-control-radius, 0.5rem);
	}
}
```

Map color tokens only when the application already provides a complete semantic calendar palette whose variables adapt in light, dark, and forced-colors modes. In that case, map every corresponding role from the [public token map](../DESIGN.md#public-css-token-map) without fixed light-only fallbacks, for example `--lfc-color: var(--app-calendar-color)`. If that precondition is not met, leave Litefold's color tokens unset.

If the build does not resolve CSS `@import`, import the package stylesheet from JavaScript and load application CSS after it:

```ts
import "@tryagaindev/litefold-calendar/styles.css";
import "./calendar-theme.css";
```

Application-prefixed variables are not package API. A validated event `accentColor` is also not a token override: it colors only the built-in marker. See the [`accentColor` API contract](api.md#define-events-calendareventinput-and-calendarevent) and [event color guidance](../DESIGN.md#events-and-agenda).

## Theme obligations

Token combinations are not validated at runtime. An integrating application must preserve the distinctions, contrast, sizing, reflow, direction, motion, and operating-system preference behavior in the [DESIGN.md guardrails](../DESIGN.md#dos-and-donts) and [accessibility integration responsibilities](../ACCESSIBILITY.md#integration-responsibilities).

In particular, do not reduce `--lfc-control-min-size` or `--lfc-grid-event-min-block-size` below the documented target-size floor. Long fonts, large text, translations, extension content, and application toolbar content may require larger layout values.

## Direction and responsive integration

Set `dir="rtl"` on the calendar or an ancestor. The stylesheet uses logical properties and inherits direction, including the Previous/Next pager mapping. Do not reverse private flex/grid structures, pull lanes, or scroll positions with physical overrides.

Give the host the width it should consume and let the package's inline-size container queries apply the [responsive model](../DESIGN.md#responsive-model). Do not add viewport listeners, `ResizeObserver`, layout measurement, responsive option changes, DOM movement, or private display overrides. Container resizing changes presentation without refetching events, replacing owned nodes, or moving focus.

The native pager viewport, decorative lanes, snap distances, scrollbar treatment, and user-agent scroll physics have no public styling contract. Use `swipe: false` when an integration must disable that navigation route rather than restyling private pager internals.

## Content Security Policy

Core runtime output creates no `style` attributes, so it supports an enforced `style-src-attr 'none'` policy. A validated per-event color is written only to the package-owned SVG marker's `fill` presentation attribute. Load the package stylesheet and token overrides from files permitted by `style-src-elem`; for a same-origin deployment that may be `style-src-elem 'self'`. If a bundler injects CSS through a `<style>` element, configure an appropriate nonce or hash instead of weakening attribute policy.

Calling `element.style.setProperty()` produces inline style state and falls outside the core no-style-attribute profile. Prefer a finite palette of application-owned classes when strict attribute policy is required.

This guarantee covers package core output only. Extension nodes, icon factories, `toolbarEnd` content, application callbacks, and application build tooling can add their own CSP requirements. Test the complete application under its enforced policy. The relevant directives are defined by [CSP Level 3 `style-src-elem` and `style-src-attr`](https://www.w3.org/TR/CSP3/#directive-style-src-elem).
