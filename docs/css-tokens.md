# CSS token contract

Import `@tryagaindev/litefold-calendar/styles.css` once. The stylesheet is scoped, contains no reset or remote asset, and declares its rules in `@layer lfc`.

## Stable surface

Only these selectors and the tokens in this document are public CSS API:

- `.litefold-calendar`
- `--lfc-*` custom properties listed below

Every other generated class, transient state class, data attribute, ID, pseudo-element, keyframe name, animation timing, scroll/snap position, pager lane, container name, layer detail, and DOM arrangement—including the title trigger and month/year popover—is private, even when its name starts with `lfc`. Do not query or override internal selectors. Use callbacks, extensions, and owned element references instead.

`--lfc-internal-*` properties are explicitly unsupported and may change in any release.

## Rendered root marker

`render()` adds `.litefold-calendar` and the presence-only `data-litefold-calendar` attribute to the host. The class is the supported styling root. The attribute is a stable JavaScript discovery marker, has no value contract, and must not be used as a styling hook. `destroy()` removes both markers.

## Tokens

Set token overrides directly on the rendered host. An application region may select its calendar hosts, for example with `.application-theme .litefold-calendar`, but declarations placed only on the ancestor do not override the package defaults declared on each host through inheritance. Normal cascade-layer and source-order rules determine which host declaration wins.

### Typography and layout

| Token | Default | Purpose |
|---|---|---|
| `--lfc-font-family` | `system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif` | Calendar font stack |
| `--lfc-font-size` | `1rem` | Base calendar text size |
| `--lfc-line-height` | `1.5` | Base line height |
| `--lfc-gap` | `0.75rem` | Core spacing unit |
| `--lfc-border-radius` | `0.5rem` | Panels and controls |
| `--lfc-control-min-size` | `2.75rem` | Minimum inline/block size of primary controls and desired compact event-action target |
| `--lfc-day-min-block-size` | `clamp(3.5rem, 13cqi, 7rem)` | Wide-layout day-cell block size; responsive compact rules may reduce it |
| `--lfc-compact-day-min-block-size` | `3.75rem` | Compact day-cell and day-button minimum; content and text scaling may make a row taller |
| `--lfc-day-padding` | `clamp(0.25rem, 1.5cqi, 0.75rem)` | Logical inset around day numbers and grid event actions |
| `--lfc-grid-event-gap` | `0.125rem` | Space between capped grid event and overflow actions |
| `--lfc-grid-event-font-size` | `0.75em` | Grid-summary text size relative to the calendar's inherited type size |
| `--lfc-grid-event-min-block-size` | `1.5rem` | Minimum grid-summary row or compact action target; do not reduce it below 24 CSS pixels |
| `--lfc-event-accent-width` | `0.0625rem` | Logical leading accent width shared by grid and agenda event representations |

### Surfaces

| Token | Light | Dark | Purpose |
|---|---|---|---|
| `--lfc-color` | `#102A36` | `#EAF7F7` | Primary text |
| `--lfc-muted-color` | `#405F68` | `#A8C8CC` | Secondary text |
| `--lfc-background` | `#F7FCFC` | `#061A23` | Component background |
| `--lfc-surface-background` | `#E9F4F5` | `#0C2A34` | Raised/day/event-list surface |
| `--lfc-border-color` | `#56737B` | `#6E929A` | Default separators and borders |

### Interaction

| Token | Light | Dark | Purpose |
|---|---|---|---|
| `--lfc-accent-color` | `#047857` | `#62E3A8` | Primary accent, selected-day outline/reveal edge, hover-day number border, and current-date number fill |
| `--lfc-accent-contrast-color` | `#F4FFFB` | `#062A20` | Text placed on the accent |
| `--lfc-focus-ring-color` | `#4E46C7` | `#C0B6FF` | Keyboard focus ring |
| `--lfc-selected-background` | `#D4F4E5` | `#12483F` | Selected-day surface/reveal fill and eligible control/day hover background |
| `--lfc-selected-color` | `#0A3B32` | `#D5FFF1` | Selected-day text and eligible control/day hover text |
| `--lfc-today-border-color` | `#071E26` | `#062A20` | Current-date number border |

On hover-capable devices, hovering an enabled, unselected, non-Today day previews the selected colors and accent border on its day-number circle without selecting the day or updating the agenda. Pointer press uses the same starting treatment. Direct activation of a different day within the displayed month uses these tokens for one continuous, presentation-only radial reveal painted in the day button's background layer. Its moving accent edge stays below selected, focus, and extension outlines, and the final gradient hands off to the matching settled fill without repainting those outlines. The settled selected surface is committed first and appears immediately when reduced motion is requested. Transient selectors, decorative layers, the keyframe, and its timing remain private; there is no public animation token.

### Events

| Token | Light | Dark | Purpose |
|---|---|---|---|
| `--lfc-event-background` | `#EFEEFF` | `#282853` | Default agenda event background |
| `--lfc-event-color` | `#262050` | `#F1EEFF` | Default event text |
| `--lfc-event-border-color` | `#665CC3` | `#A39AFF` | Default event outline border |
| `--lfc-event-accent-color` | `#A52A78` | `#FF88C8` | Built-in marker fallback and logical leading event accent |

An event's validated `accentColor` colors only its built-in SVG marker. It does not override a token and does not select text, background, border, or leading-accent colors. When `accentColor` is absent or invalid, the marker uses `--lfc-event-accent-color`; the logical leading accent remains token-driven through `--lfc-event-accent-color` and `--lfc-event-accent-width`.

For richer marker content, one extension may define the singleton `renderEventMarker` hook. It can replace the built-in SVG with a detached, noninteractive node or suppress it with `null`; `CalendarEventElements.marker` exposes the owned marker container to mount hooks. Once the built-in SVG is replaced or suppressed, `accentColor` has no package-owned marker to color on that event representation. The hook does not expand the stable CSS selector or token surface.

### Warnings and errors

| Token | Light | Dark | Purpose |
|---|---|---|---|
| `--lfc-warning-background` | `#FFF7ED` | `#431407` | Degraded/partial warning background |
| `--lfc-warning-color` | `#7C2D12` | `#FFEDD5` | Warning text |
| `--lfc-warning-border-color` | `#C2410C` | `#FDBA74` | Warning border/icon |
| `--lfc-error-background` | `#FEF2F2` | `#450A0A` | Blocking/action error background |
| `--lfc-error-color` | `#7F1D1D` | `#FEE2E2` | Error text |
| `--lfc-error-border-color` | `#B91C1C` | `#FCA5A5` | Error border/icon |

Dark defaults apply under `prefers-color-scheme: dark`. Explicit application token values continue to participate in the normal cascade.

## Override example

Declare an application layer after importing the package and target the host itself with an application class or a region-qualified `.litefold-calendar` selector. A named layer makes cascade ownership explicit without depending on selector specificity.

```css
@import "@tryagaindev/litefold-calendar/styles.css";

@layer application {
	.schedule-theme .litefold-calendar {
		--lfc-font-family: system-ui, sans-serif;
		--lfc-accent-color: #2457D6;
		--lfc-accent-contrast-color: #FFFFFF;
		--lfc-focus-ring-color: #123B92;
		--lfc-selected-background: #DCE7FF;
		--lfc-selected-color: #102B61;
		--lfc-border-radius: 0.375rem;
		--lfc-control-min-size: 2.75rem;
	}
}
```

Here, `.schedule-theme` is an application-owned region and `.litefold-calendar` is the rendered host receiving the token declarations. A direct `.litefold-calendar` rule or a compound host selector such as `.schedule-calendar.litefold-calendar` is also valid.

If your build does not support CSS `@import` resolution, import the package stylesheet from JavaScript and keep overrides in a stylesheet loaded after it:

```ts
import "@tryagaindev/litefold-calendar/styles.css";
import "./calendar-theme.css";
```

## Content Security Policy

Core runtime output creates no `style` attributes, so it supports an enforced `style-src-attr 'none'` policy. A validated per-event color is written only to the package-owned SVG marker's `fill` presentation attribute. Load the package stylesheet and token overrides from files permitted by `style-src-elem`; for a same-origin deployment that may be `style-src-elem 'self'`. If a bundler injects CSS through a `<style>` element, configure an appropriate nonce or hash instead of weakening attribute policy.

Define token overrides in a stylesheet as shown above. Calling `element.style.setProperty()` produces inline style state and falls outside this repository's no-style-attribute integration profile; do not rely on CSSOM mutation to theme a strict-CSP integration. If an application deliberately uses a validated dynamic custom property for an application-owned event surface, that inline style and its policy implications remain outside the package guarantee. Prefer a finite palette of extension-owned classes when strict attribute policy is required.

This guarantee covers package core output only. Extension nodes, including `renderEventMarker` output, icon factories, `toolbarEnd` content, application callbacks, and application build tooling can add their own CSP requirements. Replacing the marker does not weaken the core no-style-attribute guarantee, but the application remains responsible for the returned node. Test the complete application under its enforced policy in every supported browser. The relevant directives are defined by [CSP Level 3 `style-src-elem` and `style-src-attr`](https://www.w3.org/TR/CSP3/#directive-style-src-attr).

## Theme obligations

Token combinations are not independently validated at runtime. The integrating application must preserve:

- WCAG 2.2 AA text and non-text contrast.
- A focus ring visible against every surface it crosses.
- A selected state distinguishable from Today and hover.
- Error and warning meaning through text/icon treatment, not color alone.
- At least 24 by 24 CSS-pixel day and compact event-action targets at the minimum supported width.
- Compact event targets that grow toward 44 by 44 CSS pixels when their day-cell geometry permits.
- Readability in forced-colors and increased-contrast modes.
- Layout at 200% text size, plus complete-page reflow at a viewport width equivalent to 320 CSS pixels (for example, 1,280 CSS pixels at 400% zoom).

Do not set `--lfc-control-min-size` below the accessibility constraints. It is also the desired compact event-action size, while `--lfc-grid-event-min-block-size` remains the event action's block-axis floor. Keep `--lfc-day-min-block-size`, `--lfc-compact-day-min-block-size`, `--lfc-day-padding`, `--lfc-grid-event-min-block-size`, and `--lfc-grid-event-gap` large enough for focus rings, localized labels, and the 24 by 24 compact action floor. Long fonts, large text, and application toolbar content can require larger values.

## Direction and responsive behavior

Set `dir="rtl"` on the calendar or an ancestor. The stylesheet uses logical properties and inherits direction, including the Previous/Next pager mapping. Do not reverse private flex/grid structures, pull lanes, or scroll positions with physical overrides.

Responsive changes are CSS-only and container-based. Give the host the actual width it should consume; do not emulate breakpoints with viewport listeners, layout measurement, DOM reparenting, or private display-rule overrides. Crossing a container threshold changes computed layout without rebuilding the calendar, refetching events, replacing owned nodes, or moving focus. The agenda remains below the month at every supported width.

In wider containers, every event action up to the configured cell cap consumes the full day-cell width to delay truncation. Marker and leading slots remain visible while clipping and ellipsis apply only to textual slots, so extension markers and their visual satellites are not cut off. Empty event slots do not reserve layout space. Static and interactive agenda rows share content-sized marker/leading and localized-time columns plus a flexible title/content column. Details and trailing extension content follow below the title in DOM order. Below `24rem`, the title, details, and trailing content span the full row while leading content and time remain on the first row. The layout uses logical placement for RTL.

At `42rem` and below, `--lfc-compact-day-min-block-size` controls both the day grid track and day-button minimum, even when an application supplies a taller wide-layout `--lfc-day-min-block-size`. `--lfc-day-padding` continues to inset the day number and compact event content. The first actionable grid event becomes a fully named native marker whose target stays at least 24 by 24 CSS pixels and grows with its cell toward `--lfc-control-min-size`; later actions are visually omitted unless focused. Event content stays in agenda rows rendered within `agendaDomLimit`, with visible/total progress for any remainder; compact rules never make an action unnamed or remove its keyboard focus treatment.

Toolbar controls retain one DOM and sequential-focus order at every width: Previous, Next, interactive title, Today, then application `toolbarEnd` content. At `42rem` and below, the built-ins share the first intrinsic-grid row and `toolbarEnd` spans the second. At `20rem` and below, Previous/Next and title occupy the first row, Today the second, and `toolbarEnd` the third. On narrow widths the visible month/year title switches to a complete locale-formatted abbreviated label. That visual alternative is `aria-hidden`; one canonical full DOM string continues to provide the trigger context and grid accessible name. The layout does not use `order`, reversed flow, dense placement, or breakpoint JavaScript. Narrow weekday labels also appear at `20rem` and below. Compact grid rules do not hide or shrink agenda content, and the package-owned popover remains in the browser top layer.

The native pull/snap viewport, decorative lanes, snap distances, scrollbar treatment, and user-agent scroll physics have no public token contract. Do not expose or restyle them through private selectors; use `swipe: false` when the integration must disable that navigation route. The current grid still consumes the documented day and event tokens; decorative lanes never create a second 42-day grid or event surface for those tokens to style.

Package layout dimensions use `rem`; type-relative details use `em`; fluid component sizing uses container-query units such as `cqi`. Deliberate `1px` hairlines and the canonical `1px` / `-1px` visually hidden sentinel are the only pixel-unit exceptions in package CSS.

## Host token bridge

An application can map its existing design tokens without forking package CSS:

```css
.litefold-calendar {
	--lfc-font-family: var(--app-font-family, system-ui, sans-serif);
	--lfc-color: var(--app-body-color, #202124);
	--lfc-muted-color: var(--app-muted-color, #5F6368);
	--lfc-background: var(--app-page-background, #FFFFFF);
	--lfc-surface-background: var(--app-surface-background, #FFFFFF);
	--lfc-border-color: var(--app-border-color, #C7CBD1);
	--lfc-accent-color: var(--app-primary-color, #2457D6);
	--lfc-focus-ring-color: var(--app-focus-color, #123B92);
}
```

Keep this bridge in application-owned CSS. Application-prefixed variables are not package API.
