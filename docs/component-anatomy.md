# Calendar anatomy and color vocabulary

Use this guide when an API name such as *marker*, *leading*, *badge*, or
*overflow* needs a visual definition. The names below match the public render
contexts; they are not names for private CSS selectors.

[![Annotated wide and compact calendar cells showing day, event, and overflow anatomy](assets/calendar-anatomy.svg)](assets/calendar-anatomy.svg)

The diagram is a schematic. Responsive CSS can reflow or visually hide parts,
but it does not change their public names or ownership.

## Calendar surface

| Name | Meaning | Public ownership |
| --- | --- | --- |
| Month title | The localized displayed month and year. Its native trigger opens the month-and-year picker. | Litefold Calendar owns the label, trigger, and picker; `headingLevel` chooses the native heading level. |
| Selected day | The gridcell whose date drives the agenda directly below the grid. | Read `isSelected` in day render contexts and use documented selection callbacks or methods; the package owns selection semantics and focus. |
| Selected-day agenda | The ordered event list for the selected date. | Event hooks receive `surface: "agenda"` for its rows. Litefold Calendar owns list ordering, disclosure, empty/loading states, and focus transfer. |

The month-title trigger contains stable full and abbreviated visual text. At exactly a `24rem` calendar content width and above, CSS exposes the full month and numeric year; below it, CSS exposes the locale's `month: "short", year: "numeric"` form. The abbreviated text is `aria-hidden`, while the trigger name, grid name, and live text remain complete. Decorative pager lanes use the same visible formatting boundary and are entirely `aria-hidden`. These descendants and their container-query state remain private; applications must not measure or rewrite them.

## Day cell

A day cell has two main areas:

```text
day cell (`elements.cell`)
├─ day button (`elements.button`)
│  ├─ day number (`elements.number`)
│  └─ day badge slot (`elements.badge`)
└─ summaries area (`elements.summaries`)
   ├─ event summaries
   └─ event-overflow visual or action, when needed
```

| Name | Meaning | Public customization |
| --- | --- | --- |
| Day cell | The ARIA gridcell for one civil date. | Inspect through `CalendarDayElements.cell`; do not make an out-of-range cell interactive. |
| Day button | The native control that selects the date. | Inspect through `elements.button`. Selection behavior remains package-owned. |
| Day number | The localized number inside a native `<time>` element. | Inspect through `elements.number`. Today is shown by styling this number; it is not the day badge slot. |
| Day badge slot | Optional decorative content beside the day number on wide layouts. It is hidden at compact widths. | Return content from `renderDayBadge`; inspect its container through `elements.badge`. |
| Summaries area | Package-owned placement for the complete event-summary and overflow stack. | Inspect through `elements.summaries`; choose its vertical alignment with `gridEventPlacement`. Customize events and overflow through their specific hooks instead of moving this container. |

The date number and badge remain at the top of the cell. `gridEventPlacement`
aligns the summaries area at the top, center, or bottom of the available space at
every width; the default is top. Center and bottom safely fall back toward the
top when the stack cannot fit. `weekRowSizing` controls whether the six week
tracks share the tallest intrinsic height or size independently; it does not
change this DOM structure.

The phrase **day badge** means the `renderDayBadge` slot. Use **Today
indicator** for the circular treatment applied to today's day number, and use
**event marker** for the visual attached to an event. These are three different
parts.

## Event representation

Grid summaries and agenda rows expose the same event parts in the same logical
DOM order:

```text
event root (`elements.root`)
├─ leading group (`elements.leading`)
│  ├─ marker container (`elements.marker`)
│  └─ content returned by `renderEventLeading`
├─ time (`elements.time`)
├─ title (`elements.title`)
├─ details slot (`elements.details`)
└─ trailing slot (`elements.trailing`)
```

The marker is inside the leading group; it is not a peer of the leading group.
CSS may place these parts on different rows or hide them visually at compact
widths, but their logical order remains stable.

| Name | Meaning | Public customization |
| --- | --- | --- |
| Root | The complete event representation. | `elements.root` is always present. |
| Action | The native event anchor or button. | `elements.action` is the same node as the root when the occurrence is actionable, and `null` when it is static. Use `surface` rather than assuming an element type. |
| Leading group | Everything before the built-in time and title. | `renderEventLeading` adds content after the marker within this group. `elements.leading` exposes the stable outer container. |
| Marker | The small built-in SVG circle, consumer replacement, or an intentionally empty marker container. | `renderEventMarker` replaces the built-in marker or suppresses it with `null`; `elements.marker` is the stable container, not necessarily the marker node itself. |
| Time | The localized event time in a native `<time>` element. | Inspect `elements.time` and `timeText`; configure its visual exposure with `eventTimeDisplay`. |
| Title | The normalized event title. | Inspect `elements.title`. There is no title-replacement hook. |
| Details | Optional content immediately after the title in logical order. | Return content from `renderEventDetails`; inspect its container through `elements.details`. |
| Trailing | Optional content after all other event content. | Return content from `renderEventTrailing`; inspect its container through `elements.trailing`. |

The built-in marker is decorative. If `renderEventMarker` replaces or suppresses
it, the event's `accentColor` no longer controls a visible package marker.
Application content that communicates category, state, or urgency must include
text, a shape, or another non-color cue.

## Event overflow

**Event overflow** is the umbrella term for the day-level presentation used
when the cell cannot show every event summary. It is separate from an individual
event representation and from the day badge.

| Variant | What users see | Action ownership |
| --- | --- | --- |
| Compact overflow cue | A social-style count such as `+3`, paired with the compact primary event marker/action, or an unsigned total such as `4` when no marker is visible. | Usually passive with `elements.action === null`. When the overflow button itself is the compact primary control, such as with `maxGridEventsPerDay: 0`, `elements.action` is that native button. |
| Wide overflow action | Localized text such as `3 more` after the visible grid summaries. | Always presented inside the native overflow button exposed as `elements.action`. |

Both applicable variants are created during a render. Container CSS chooses
which one is visible; resizing does not rerun `renderEventOverflow`. In compact
layout with equal week rows, package-owned, normally visible primary-event,
count, and compact-primary overflow roots use one common full slot. Paired roots
may share a row or stack while retaining that size. Content-sized weeks keep
compact roots intrinsic, and later event summaries exposed only on focus remain
intrinsic in either mode. A markerless total or action-backed fallback uses one
centered block. The configured `gridEventPlacement` moves the complete summaries
area, not either compact block independently.

Every overflow context exposes:

- `elements.root`: the package-owned root for that visual variant.
- `elements.content`: the slot containing built-in or returned visual content.
- `elements.action`: the native overflow button, or `null` for a passive compact
  cue.
- `variant`: `"compact"` or `"wide"`; use this instead of measuring the viewport.
- `eventCount`, `visibleEventCount`, and `overflowCount`: authoritative counts.
- `text`: the package-formatted visual fallback for that variant.

Return a detached, noninteractive node from `renderEventOverflow` to customize
the content. The package retains placement, target geometry, accessible naming,
activation, and focus behavior. Fit compact output within its assigned slot, or
increase `--lfc-control-min-size` and `--lfc-grid-event-min-block-size` so normal
package-owned roots grow together. Oversized output remains unclipped but opts
out of equal visual sizing.

## Three color roles that sound similar

The public names retain *accent* for compatibility, but the following terms are
clearer in prose:

| Recommended term | Public name | Scope and effect |
| --- | --- | --- |
| **Event marker color** | Per-event `CalendarEventInput.accentColor` | A validated `#RRGGBB` fill for that event's built-in SVG marker only. It does not tint the event surface, text, border, or leading rule. An invalid or omitted value uses the marker fallback. |
| **Primary interface color** | `--lfc-accent-color` | A calendar-wide CSS token used for primary UI treatment, including the Today number, selected-day outline, and primary month-picker action. It is not a per-event color. |
| **Event leading-rule color** | `--lfc-event-accent-color` | A calendar-wide CSS token for the logical-start border on event summaries and agenda rows. It also supplies the built-in marker fallback when an event has no valid `accentColor`. |

`accentColor` is an event input field, not a top-level `CalendarOptions` value or
a CSS-token override. Prefer the full terms above instead of saying only
*accent* when more than one role could be meant.

## Hook map

| Goal | Public hook or option |
| --- | --- |
| Color the built-in marker for one event | `CalendarEventInput.accentColor` |
| Replace or suppress the event marker | `renderEventMarker` |
| Add content before event time and title | `renderEventLeading` |
| Add content immediately after the title | `renderEventDetails` |
| Add content after all other event content | `renderEventTrailing` |
| Add a decorative day badge | `renderDayBadge` |
| Replace compact and wide overflow visuals | `renderEventOverflow`, branching on `context.variant` |
| Observe or carefully decorate a live day or event representation | `dayDidMount` or `eventDidMount`, with synchronous cleanup |

`renderEventMarker` and `renderEventOverflow` are singleton presentation hooks:
only one configured hook set can own each of them. Other content hooks compose in
configured order.

## Public boundary

The diagram describes public concepts, not a selector or nesting contract. Use
the typed `elements` references supplied to hooks, `surface` and `variant`
discriminants, application-owned classes on returned nodes, the
`.litefold-calendar` host class, and documented `--lfc-*` tokens.

Do not query or style generated descendant classes, data attributes, IDs, or
private layout wrappers. Do not remove, reparent, or replace package-owned
elements. Return detached nodes through content hooks and let mount hooks clean
up every mutation they make.

Continue with the [render-hook API](api.md#customize-rendering-calendarrenderhooks)
for exact inputs and fallback behavior, the
[integration recipe](integration-guide.md#add-metadata-driven-visuals-without-private-selectors)
for complete code, the [CSS token contract](css-tokens.md) for host-wide styling,
and the [design system](../DESIGN.md#events-and-agenda) for canonical visual
roles.
