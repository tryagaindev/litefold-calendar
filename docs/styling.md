# Styling and customization

Start with host-level CSS tokens for a theme.  Use the anatomy and color key
below to choose the right part, then add render hooks only for content the
built-in options cannot express.  This guide covers application customization;
[DESIGN.md](../DESIGN.md#public-css-token-map) defines the exact token names,
defaults, and visual rules.

## Apply token overrides

Add an application-owned class to the host before creating the calendar:

```html
<div data-my-calendar class="my-calendar-theme"></div>
```

For a build tool that resolves CSS package imports, load the package stylesheet
once and declare the application layer afterward:

```css
@import "@tryagaindev/litefold-calendar/styles.css";

@layer my.calendar {
	.litefold-calendar.my-calendar-theme {
		--lfc-font-family: var(--my-font-family, system-ui, sans-serif);
		--lfc-border-radius: var(--my-control-radius, 0.5rem);
	}
}
```

`render()` adds `.litefold-calendar`, so the selector starts matching without
another application class change.  Set overrides on this host: package defaults
are declared there, so values set only on an ancestor do not replace them through
inheritance.  If your application declares a global layer order, place `lfc`
before your override layer.  The package stylesheet is scoped, uses `@layer lfc`,
and includes no reset or remote assets.

Alternatively, import CSS from JavaScript and load your theme afterward.  In
that setup, omit the CSS `@import` above to avoid importing the package twice:

```js
import "@tryagaindev/litefold-calendar/styles.css";
import "./calendar-theme.css";
```

The example changes non-color roles and preserves the adaptive package palette.
Leave color tokens unset unless your application supplies a complete semantic
palette that adapts to light, dark, and forced-colors modes.  When it does, map
the corresponding roles from the [token reference](../DESIGN.md#public-css-token-map),
for example `--lfc-color: var(--my-calendar-color)`, without fixed light-only
fallbacks.  `--my-*` variables are application placeholders, not package API.

## Calendar anatomy

[![Annotated wide and compact calendar cells showing day, event, and overflow anatomy](assets/calendar-anatomy.svg)](assets/calendar-anatomy.svg)

This schematic names the public parts in wide summaries and compact count
presentation.  It is not a map of supported CSS selectors or private nesting.
Use the typed element references supplied to hooks rather than searching the DOM.

### Calendar surface

| Part | Purpose and customization |
| --- | --- |
| Month title | Localized displayed month and year; its native button opens the month/year picker.  `headingLevel` chooses its heading level.  Package CSS adjusts the visual label at narrow widths while keeping the accessible name complete. |
| Selected day | The cell whose date drives the agenda.  Read `isSelected` in day contexts; use selection callbacks or navigation methods for behavior. |
| Selected-day agenda | The ordered list below the grid.  Event hooks receive `surface: "agenda"`; the package owns ordering, disclosure, loading/empty states, and focus transfer. |

### Day cell

| Part | Public element or hook |
| --- | --- |
| Day cell | `elements.cell`, the ARIA gridcell for one civil date.  Do not make an out-of-range cell interactive. |
| Day button | `elements.button`, the native date-selection control. |
| Day number | `elements.number`, the localized date inside a native `<time>` element.  Today's rounded treatment is the **Today indicator**, not a badge. |
| Day badge | `elements.badge`; return decorative content from `renderDayBadge`.  This slot sits beside the date on wide layouts and is hidden in compact layouts. |
| Summaries area | `elements.summaries`, containing event representations and overflow.  Customize its contents through event/overflow hooks rather than moving this container. |

`gridEventPlacement` aligns the event/overflow stack below the top-aligned date.
`weekRowSizing` chooses equal or independently content-sized weeks.  Use those
options rather than rearranging cells; exact sizing and responsive behavior are
in the [layout reference](../DESIGN.md#responsive-model).

### Event representation

Grid summaries and agenda rows expose the same parts in logical reading order:
leading group, time, title, details, then trailing content.  The marker belongs
inside the leading group, before any content added by `renderEventLeading`.

| Part | Public element or hook |
| --- | --- |
| Root and action | `elements.root` is always present.  `elements.action` is that same node when it is an anchor/button, or `null` for static content.  Use `surface` and the supplied references rather than assuming an element type. |
| Leading group | `elements.leading`; `renderEventLeading` adds content after the marker. |
| Event marker | `elements.marker` is the container.  `renderEventMarker` replaces the built-in SVG circle, or suppresses it with `null`; the container remains. |
| Time | `elements.time` is a native `<time>` element.  `eventTimeDisplay` controls visual exposure; `timeText` remains available to hooks and hidden times remain accessible. |
| Title | `elements.title` contains the normalized title.  There is no title-replacement hook. |
| Details | `elements.details`; add content with `renderEventDetails`. |
| Trailing content | `elements.trailing`; add content with `renderEventTrailing`. |

### Event overflow

Overflow is day-level presentation, separate from an event or day badge.
`gridEventDisplay` chooses individual summaries or total counts for compact and
wide containers.  Compact days with multiple events show a total-count button
by default; wide days show capped summaries plus overflow when needed.

| Presentation | Hook context and behavior |
| --- | --- |
| Compact or wide total count | `display: "count"`; `elements.action` is the shared native count/overflow button.  Compact text is a localized total; wide text includes the event noun. |
| Compact additional-event cue | `display: "overflow"`, `variant: "compact"`; usually a passive `+N` beside the primary event.  Without a primary marker it shows the total.  `elements.action` is `null` unless overflow itself is the primary control, such as with `maxGridEventsPerDay: 0`. |
| Wide additional-event action | `display: "overflow"`, `variant: "wide"`; the native button presents the remaining count, such as “3 more”. |

Use `renderEventOverflow` for decorative content inside the visual slot, and
`onEventOverflowActivate` to open an application-owned chooser.  These are
different tasks: a visual hook does not take over activation or focus.
The [chooser recipe](integration-guide.md#own-the-event-chooser) shows synchronous
cancellation and focus restoration.

Contexts expose `elements.root`, `elements.content`, `elements.action`,
`variant`, `display`, the counts, and package-formatted `text`.  Count contexts
use `visibleEventCount: 0` and `overflowCount: eventCount`.  Returning `null`
retains built-in content for an actionable variant; only a passive cue can be
suppressed.  The [overflow API](api.md#customize-rendering-calendarrenderhooks)
defines all fields and return rules.  Container CSS chooses among the variants
already rendered; resizing does not rerun the hook.

## Three color roles that sound similar

| Role | Public name | Effect |
| --- | --- | --- |
| **Event marker color** | Per-event `CalendarEventInput.accentColor` | A validated `#RRGGBB` fill for that event's built-in SVG marker only.  An invalid or omitted value uses the fallback; it does not tint the event surface, text, border, or leading rule. |
| **Primary interface color** | `--lfc-accent-color` | Calendar-wide primary UI treatment, including the Today indicator, selected-day outline, and primary month-picker action. |
| **Event leading-rule color** | `--lfc-event-accent-color` | Calendar-wide logical-start border on event summaries and agenda rows; also the built-in marker fallback. |

`accentColor` is an event field, not a top-level option or CSS token.  Replacing
or suppressing the marker through `renderEventMarker` means it no longer colors
a visible package marker.  Include text, shape, or another non-color cue when a
category, status, or urgency matters.

## Add custom content

Use the narrowest hook in the anatomy tables.  Return detached, noninteractive
nodes for visual slots; never nest controls inside native event actions.
`renderEventMarker` and `renderEventOverflow` each have one configured owner;
other content hooks compose in configured order.  Use `dayDidMount` or
`eventDidMount` to observe or carefully decorate supplied elements and return
synchronous cleanup for every mutation or external resource.

For a finite event palette, apply application-owned classes to hook output
instead of copying feed values into CSS.  The
[metadata-driven recipe](integration-guide.md#add-metadata-driven-visuals-without-private-selectors)
provides complete code; the [render-hook reference](api.md#customize-rendering-calendarrenderhooks)
defines accepted nodes, protected elements, lifecycle, and failure handling.

## Public styling boundary

Only `.litefold-calendar` and the properties in the
[public token map](../DESIGN.md#public-css-token-map) are styling hooks.
`render()` also adds the presence-only `data-litefold-calendar` discovery marker;
it is for JavaScript discovery, has no value contract, and is not a styling hook.
`destroy()` removes both root markers.

Generated descendant classes, attributes, IDs, private wrappers, pseudo-elements,
keyframes, pager lanes, container names, and `--lfc-internal-*` properties are not
integration APIs.  Use the documented layer ordering above, not private layer
internals.  Do not remove, reparent, or replace package-owned elements.  Keep
application mutations on the supplied hook elements within their documented
contract and undo them during cleanup.

## Theme and responsive checks

Set `dir="rtl"` on the host or an ancestor; logical CSS and navigation inherit
it.  Provide the [minimum supported host width](../DESIGN.md#responsive-model),
then let container queries handle layout.  Narrower hosts receive best-effort
degradation.  Do not measure widths, move package DOM, or switch options to
reproduce responsive states.  Resizing does not refetch, replace controls, or
move focus.  Use `swipe: false` to disable paging instead of styling private snap
positions, lanes, or scrolling behavior.

Token combinations are not validated at runtime.  Preserve contrast, visible
focus, target sizes, reflow, text direction, reduced motion, and system
preferences.  Do not lower `--lfc-control-min-size` or
`--lfc-grid-event-min-block-size` below the documented target floor.  Increase
those tokens when custom compact content needs more space: normal package-owned
roots then grow together.  Oversized content remains visible but is outside the
equal-sizing guarantee; focus-only later summaries remain intrinsic.

Test long translations, large text, custom fonts, toolbar content, and hooks.
Use the [design guardrails](../DESIGN.md#dos-and-donts) and
[accessibility responsibilities](../ACCESSIBILITY.md#integration-responsibilities)
for the complete integrated-page checks.

## Content Security Policy

Core output creates no `style` attributes and supports `style-src-attr 'none'`.
The validated event marker color is written to the SVG marker's `fill`
presentation attribute.  Load stylesheets and theme files from sources permitted
by `style-src-elem`; a same-origin deployment may use `style-src-elem 'self'`.
If a bundler injects `<style>` elements, configure a suitable nonce or hash
rather than weakening attribute policy.

Calling `element.style.setProperty()` creates inline style state outside this
profile.  Prefer finite application-owned classes for strict attribute policies.
Hooks, icons, toolbar nodes, extensions, callbacks, and build tooling may add
requirements of their own, so test the whole application under the enforced
policy.  See the [CSP directive definitions](https://www.w3.org/TR/CSP3/#directive-style-src-elem).
