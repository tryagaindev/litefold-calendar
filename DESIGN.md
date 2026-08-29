---
version: alpha
name: Litefold Calendar
description: A compact appointment-ledger design system for the package-owned month grid and selected-day agenda.
colors:
  primary: "#047857"
  on-primary: "#F4FFFB"
  on-surface: "#102A36"
  muted: "#405F68"
  background: "#F7FCFC"
  surface: "#E9F4F5"
  border: "#56737B"
  focus: "#4E46C7"
  selected-background: "#D4F4E5"
  selected-color: "#0A3B32"
  today-border: "#071E26"
  event-background: "#EFEEFF"
  event-color: "#262050"
  event-border: "#665CC3"
  event-accent: "#A52A78"
  warning-background: "#FFF7ED"
  warning-color: "#7C2D12"
  warning-border: "#C2410C"
  error-background: "#FEF2F2"
  error-color: "#7F1D1D"
  error-border: "#B91C1C"
  dark-primary: "#62E3A8"
  dark-on-primary: "#062A20"
  dark-on-surface: "#EAF7F7"
  dark-muted: "#A8C8CC"
  dark-background: "#061A23"
  dark-surface: "#0C2A34"
  dark-border: "#6E929A"
  dark-focus: "#C0B6FF"
  dark-selected-background: "#12483F"
  dark-selected-color: "#D5FFF1"
  dark-today-border: "#062A20"
  dark-event-background: "#282853"
  dark-event-color: "#F1EEFF"
  dark-event-border: "#A39AFF"
  dark-event-accent: "#FF88C8"
  dark-warning-background: "#431407"
  dark-warning-color: "#FFEDD5"
  dark-warning-border: "#FDBA74"
  dark-error-background: "#450A0A"
  dark-error-color: "#FEE2E2"
  dark-error-border: "#FCA5A5"
typography:
  body-md:
    fontFamily: 'system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif'
    fontSize: 1rem
    fontWeight: 400
    lineHeight: 1.5
    letterSpacing: 0em
  control-label:
    fontFamily: 'system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif'
    fontSize: 1rem
    fontWeight: 600
    lineHeight: 1.5
    letterSpacing: 0em
  month-title-lg:
    fontFamily: 'system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif'
    fontSize: 1.5rem
    fontWeight: 700
    lineHeight: 1.25
    letterSpacing: 0em
  month-title-compact:
    fontFamily: 'system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif'
    fontSize: 1.125rem
    fontWeight: 500
    lineHeight: 1.25
    letterSpacing: 0em
  picker-title:
    fontFamily: 'system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif'
    fontSize: 1.25em
    fontWeight: 700
    lineHeight: 1.25
    letterSpacing: 0em
  agenda-title:
    fontFamily: 'system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif'
    fontSize: 1.125em
    fontWeight: 700
    lineHeight: 1.3
    letterSpacing: 0em
  weekday-lg:
    fontFamily: 'system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif'
    fontSize: 0.875em
    fontWeight: 700
    lineHeight: 1.5
    letterSpacing: 0.025em
  weekday-md:
    fontFamily: 'system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif'
    fontSize: 0.75em
    fontWeight: 700
    lineHeight: 1.5
    letterSpacing: 0.025em
  weekday-compact:
    fontFamily: 'system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif'
    fontSize: 0.6875em
    fontWeight: 700
    lineHeight: 1.5
    letterSpacing: 0.025em
  grid-event:
    fontFamily: 'system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif'
    fontSize: 0.75em
    fontWeight: 400
    lineHeight: 1.5
    letterSpacing: 0em
rounded:
  none: 0rem
  md: 0.5rem
  full: 999rem
spacing:
  hairline: 1px
  event-accent-width: 0.0625rem
  micro: 0.125rem
  focus-ring: 0.1875rem
  xs: 0.25rem
  sm: 0.375rem
  md: 0.5rem
  control-inline: 0.625rem
  lg: 0.75rem
  xl: 1rem
  2xl: 1.5rem
  3xl: 2rem
components:
  calendar-shell:
    backgroundColor: "{colors.background}"
    textColor: "{colors.on-surface}"
    typography: "{typography.body-md}"
    rounded: "{rounded.md}"
  calendar-shell-dark:
    backgroundColor: "{colors.dark-background}"
    textColor: "{colors.dark-on-surface}"
    typography: "{typography.body-md}"
    rounded: "{rounded.md}"
  calendar-surface:
    backgroundColor: "{colors.surface}"
    textColor: "{colors.on-surface}"
    rounded: "{rounded.md}"
  calendar-surface-dark:
    backgroundColor: "{colors.dark-surface}"
    textColor: "{colors.dark-on-surface}"
    rounded: "{rounded.md}"
  calendar-surface-muted:
    backgroundColor: "{colors.surface}"
    textColor: "{colors.muted}"
  calendar-surface-muted-dark:
    backgroundColor: "{colors.dark-surface}"
    textColor: "{colors.dark-muted}"
  quiet-control:
    backgroundColor: "{colors.surface}"
    textColor: "{colors.on-surface}"
    rounded: "{rounded.md}"
  quiet-control-dark:
    backgroundColor: "{colors.dark-surface}"
    textColor: "{colors.dark-on-surface}"
    rounded: "{rounded.md}"
  today-control:
    backgroundColor: "{colors.background}"
    textColor: "{colors.on-surface}"
    typography: "{typography.control-label}"
    rounded: "{rounded.md}"
  today-control-dark:
    backgroundColor: "{colors.dark-background}"
    textColor: "{colors.dark-on-surface}"
    typography: "{typography.control-label}"
    rounded: "{rounded.md}"
  navigation-control-hover:
    backgroundColor: "{colors.selected-background}"
    textColor: "{colors.selected-color}"
  navigation-control-hover-dark:
    backgroundColor: "{colors.dark-selected-background}"
    textColor: "{colors.dark-selected-color}"
  primary-action:
    backgroundColor: "{colors.primary}"
    textColor: "{colors.on-primary}"
    rounded: "{rounded.md}"
  primary-action-dark:
    backgroundColor: "{colors.dark-primary}"
    textColor: "{colors.dark-on-primary}"
    rounded: "{rounded.md}"
  day-selected:
    backgroundColor: "{colors.selected-background}"
    textColor: "{colors.selected-color}"
  day-selected-dark:
    backgroundColor: "{colors.dark-selected-background}"
    textColor: "{colors.dark-selected-color}"
  today-badge:
    backgroundColor: "{colors.primary}"
    textColor: "{colors.on-primary}"
    rounded: "{rounded.full}"
  today-badge-dark:
    backgroundColor: "{colors.dark-primary}"
    textColor: "{colors.dark-on-primary}"
    rounded: "{rounded.full}"
  grid-event:
    backgroundColor: "{colors.event-background}"
    textColor: "{colors.event-color}"
    typography: "{typography.grid-event}"
    rounded: "{rounded.md}"
  grid-event-dark:
    backgroundColor: "{colors.dark-event-background}"
    textColor: "{colors.dark-event-color}"
    typography: "{typography.grid-event}"
    rounded: "{rounded.md}"
  agenda-event:
    backgroundColor: "{colors.event-background}"
    textColor: "{colors.event-color}"
    rounded: "{rounded.md}"
  agenda-event-dark:
    backgroundColor: "{colors.dark-event-background}"
    textColor: "{colors.dark-event-color}"
    rounded: "{rounded.md}"
  warning-panel:
    backgroundColor: "{colors.warning-background}"
    textColor: "{colors.warning-color}"
    rounded: "{rounded.md}"
  warning-panel-dark:
    backgroundColor: "{colors.dark-warning-background}"
    textColor: "{colors.dark-warning-color}"
    rounded: "{rounded.md}"
  error-panel:
    backgroundColor: "{colors.error-background}"
    textColor: "{colors.error-color}"
    rounded: "{rounded.md}"
  error-panel-dark:
    backgroundColor: "{colors.dark-error-background}"
    textColor: "{colors.dark-error-color}"
    rounded: "{rounded.md}"
  outer-border:
    backgroundColor: "{colors.border}"
    height: "{spacing.hairline}"
  outer-border-dark:
    backgroundColor: "{colors.dark-border}"
    height: "{spacing.hairline}"
  focus-indicator:
    backgroundColor: "{colors.focus}"
    size: "{spacing.focus-ring}"
  focus-indicator-dark:
    backgroundColor: "{colors.dark-focus}"
    size: "{spacing.focus-ring}"
  today-outline:
    backgroundColor: "{colors.today-border}"
    size: "{spacing.micro}"
  today-outline-dark:
    backgroundColor: "{colors.dark-today-border}"
    size: "{spacing.micro}"
  event-outline:
    backgroundColor: "{colors.event-border}"
    size: "{spacing.hairline}"
  event-outline-dark:
    backgroundColor: "{colors.dark-event-border}"
    size: "{spacing.hairline}"
  event-accent-rule:
    backgroundColor: "{colors.event-accent}"
    width: "{spacing.event-accent-width}"
  event-accent-rule-dark:
    backgroundColor: "{colors.dark-event-accent}"
    width: "{spacing.event-accent-width}"
  warning-accent-rule:
    backgroundColor: "{colors.warning-border}"
    width: "{spacing.sm}"
  warning-accent-rule-dark:
    backgroundColor: "{colors.dark-warning-border}"
    width: "{spacing.sm}"
  error-accent-rule:
    backgroundColor: "{colors.error-border}"
    width: "{spacing.sm}"
  error-accent-rule-dark:
    backgroundColor: "{colors.dark-error-border}"
    width: "{spacing.sm}"
---

# Litefold Calendar Design System

## Overview

Litefold Calendar should feel like a well-kept appointment ledger translated into a compact software instrument: pale blue-green paper, dark teal ink, crisp ruled cells, one emerald action color, and violet event slips. It is calm and workmanlike rather than decorative. A user should be able to scan a month, locate today, distinguish the selected date, and move into one day's schedule without decoding a dashboard or entering a full scheduling product.

The audience is people working in portals, sidebars, dashboards, booking summaries, and personal or public schedules. Density is deliberate: the six-week month grid always remains visible, while the agenda carries the detail that narrow cells cannot. The interface should feel dependable under keyboard, touch, pen, pointer, zoom, long localization, right-to-left direction, dark mode, and operating-system contrast preferences.

This document is the canonical visual source for the package-owned `.litefold-calendar` surface. Its YAML values are normative; the prose explains their use. The [CSS token contract](docs/css-tokens.md) defines how applications consume these roles through `--lfc-*` custom properties. The [accessibility contract](ACCESSIBILITY.md) and [public API reference](docs/api.md) remain canonical for interaction, focus, ARIA, and lifecycle behavior. Application-owned example shells, dialogs, filters, and render-hook nodes may use their own design system, but a calendar embedded inside them must preserve the roles and interaction distinctions defined here. Canonical screenshots are release evidence governed by the [screenshot contract](docs/screenshots/README.md), not an independent source of design rules.

For implementation work, start with the relevant component section, then check the responsive model and the final guardrails. For application theming, use the public token map with the CSS token contract; do not copy private geometry from the package stylesheet. For interaction or semantic changes, follow the accessibility contract and API reference rather than inferring behavior from visual treatment.

## Colors

The light palette resembles clean ledger paper rather than pure white. The dark palette keeps the same semantic relationships instead of merely inverting the light values. `prefers-color-scheme: dark` selects the dark defaults; application overrides participate in the normal cascade.

### Core surfaces

- **Primary / `--lfc-accent-color`:** Emerald (`{colors.primary}` light, `{colors.dark-primary}` dark) is reserved for primary action, the Today badge, selected-day outline, and eligible hover/press previews.
- **On primary / `--lfc-accent-contrast-color`:** Near-white or deep green (`{colors.on-primary}`, `{colors.dark-on-primary}`) appears only on the primary fill.
- **Text / `--lfc-color`:** Deep teal ink and pale aqua ink (`{colors.on-surface}`, `{colors.dark-on-surface}`) carry core content.
- **Muted / `--lfc-muted-color`:** Slate teal (`{colors.muted}`, `{colors.dark-muted}`) carries secondary dates, times, overflow copy, and metadata. It must not be used to make required content look disabled.
- **Background / `--lfc-background`:** The calendar sheet (`{colors.background}`, `{colors.dark-background}`) is the root, toolbar, active-month day, and input surface.
- **Surface / `--lfc-surface-background`:** The adjacent sheet tone (`{colors.surface}`, `{colors.dark-surface}`) groups the agenda, outside-month days, and quiet controls.
- **Border / `--lfc-border-color`:** Teal-gray rules (`{colors.border}`, `{colors.dark-border}`) divide the shell, grid, controls, and panels. Internal grid rules are an 80% border/background mix so structure remains visible without dominating the dates.

### Interaction and state

- **Focus / `--lfc-focus-ring-color`:** Violet (`{colors.focus}`, `{colors.dark-focus}`) is reserved for keyboard focus. It must remain visibly distinct from selection and Today.
- **Selected / `--lfc-selected-background`, `--lfc-selected-color`:** Mint or deep green identifies the chosen agenda date and eligible hover/press previews. Selection is also outlined and exposed semantically; color alone never carries it.
- **Today / `--lfc-today-border-color`:** Today uses the primary fill with a separate dark or deep-green border. Today and selection are independent states.
- **Events / `--lfc-event-*`:** Lavender surfaces, dark-violet text, violet borders, and a magenta leading accent separate event content from calendar chrome. In dark mode these become deep indigo, pale lavender, light violet, and pink.
- **Warnings and errors / `--lfc-warning-*`, `--lfc-error-*`:** Warm amber is for degraded or partial states; red is for blocking and action failures. Both combine text, border, and icon treatment so hue is never the only visual signal.

Validated per-event `accentColor` values color only the built-in SVG marker. They do not tint event text, surfaces, borders, or the logical leading accent. Application-owned category palettes added through render hooks must also include visible text or another non-color cue whenever the distinction matters.

Forced-colors mode replaces authored roles with `Canvas`, `CanvasText`, `ButtonText`, `Highlight`, `HighlightText`, and `GrayText`. Increased-contrast mode uses current text color for structural rules and thickens focus and important event/status boundaries. Do not suppress those adaptations with `forced-color-adjust: none` for aesthetic reasons.

## Typography

The calendar uses the operating system's sans-serif stack. It downloads no font and inherits the user's text rendering, language, zoom, and base-size preferences. The public base values are `--lfc-font-family`, `--lfc-font-size: 1rem`, and unitless `--lfc-line-height: 1.5`; the root establishes weight 400 and zero tracking so an unrelated bold or tracked host context cannot distort the whole grid.

- **Month title:** Wide containers use `{typography.month-title-lg.fontSize}` at weight 700. At `42rem` and below the title switches to `{typography.month-title-compact.fontSize}` at weight 500. When interactive, a `0.0625em` underline with a `0.2em` offset identifies the month/year chooser without making it resemble a primary button.
- **Picker title:** `{typography.picker-title.fontSize}`, weight 700, and balanced wrapping establish the native non-modal popover dialog's only visual heading.
- **Control emphasis:** Weight 600 is reserved for the Today action and month/year field labels—stronger than body text, quieter than primary actions and headings.
- **Agenda title:** `{typography.agenda-title.fontSize}`, weight 700, line height 1.3, and balanced wrapping introduce the selected date's schedule.
- **Weekdays:** Uppercase, weight 700, and `0.025em` tracking create ledger-column labels. Their visual sizes are `{typography.weekday-lg.fontSize}` above `42rem`, `{typography.weekday-md.fontSize}` by default, and `{typography.weekday-compact.fontSize}` for the compact treatment.
- **Events and metadata:** Grid events use `{typography.grid-event.fontSize}` relative to the inherited base. Titles and actionable hints use weight 700; times and day numbers use tabular numerals. Long text wraps in agenda rows and status panels but ellipsizes inside constrained grid cells and the one-line month title.

Use `rem` for base and component typography and `em` only when a detail must scale with its containing text. Do not introduce a brand font, display face, italic styling, or large promotional type into package-owned UI.

## Layout

The component is a full-width named inline-size container. It has one toolbar, one status area, one horizontally pageable viewport containing one live seven-column by six-row month grid, and one selected-day agenda directly below the grid. The agenda never moves beside or over the month. The package does not create a second interactive grid for paging.

The spacing rhythm is built from the YAML scale: `0.125rem`, `0.25rem`, `0.375rem`, `0.5rem`, `0.625rem`, `0.75rem`, `1rem`, `1.5rem`, and `2rem`. The main layout values are:

| Role | Value |
|---|---|
| Core gap | `--lfc-gap: 0.75rem` |
| Controls | `0.375rem` block padding, `0.625rem` inline padding, `2.75rem` minimum size |
| Grid events | `0.125rem` block padding, `0.25rem` inline padding, `1.5rem` minimum block size |
| Wide day rows | `--lfc-day-min-block-size: clamp(3.5rem, 13cqi, 7rem)` |
| Compact day rows | `--lfc-compact-day-min-block-size: 3.75rem` |
| Day padding | `--lfc-day-padding: clamp(0.25rem, 1.5cqi, 0.75rem)` |

Package layout uses logical properties. Use `rem` for component layout and target size, `em` for type-relative details, and `cqi` for fluid container-relative sizing. Pixel-unit exceptions are deliberate one-CSS-pixel hairlines, the canonical `1px` / `-1px` visually hidden sentinel, and the `318px` content-box threshold that distinguishes the 320 CSS-pixel host design floor from sub-floor layouts. Each exception is constrained and documented by the repository's CSS conventions.

Status copy, empty/overflow messaging, and other readable explanatory text stop at `80ch`; the calendar should not stretch prose to fill a wide grid.

### Responsive model

The minimum supported design width is a **320 CSS-pixel calendar host border box**. Layout behavior below 320 CSS pixels is best-effort graceful degradation and robustness hardening, not a supported design target.

- **Above `42rem`:** Toolbar content stays on the primary row, weekday labels use the wide size, and every capped event action consumes the available day-cell width. A native grid-overflow action shows its localized package content or render-hook-supplied wide visual content without changing the action itself.
- **At or below `42rem`:** Built-in navigation occupies the first row and application `toolbarEnd` content the second. Gaps and margins contract. Day badges disappear. The first actionable grid event uses a marker-only presentation inside a 24–44 CSS-pixel action target; later actions are visually hidden unless focused. A day with more than one total event occurrence shows the compact multiple-event cue unless its overflow action is already the compact-primary control. Full event information remains in the agenda.
- **Below `24rem`:** Agenda title and supporting event content span the row beneath marker and time so long text keeps useful measure.
- **At or below `20rem`:** Previous/Next and the compact month title occupy the first row, Today the second, and application content the third. Picker fields stack, the status panel becomes one column, and narrow weekday labels replace short labels without changing their full accessible names.

Responsive changes are CSS container-query-only and must not depend on viewport-category JavaScript or visual reordering. Crossing the `42rem` boundary changes only the visibility of the already-rendered compact cue and wide overflow-content slots; it does not rerun render hooks, measure content, or replace interactive nodes. The canonical DOM, interaction, and focus-order invariants are defined by [responsive and direct-input behavior](ACCESSIBILITY.md#responsive-and-direct-input-behavior). Visually, the agenda remains below the grid, and the interface must reflow without persistent two-dimensional content scrolling in a 320 CSS-pixel calendar host border box and remain usable at 200% text size and 400% page zoom.

Interactive day and compact event targets never fall below 24 by 24 CSS pixels and grow toward 44 by 44 when cell geometry permits. `--lfc-control-min-size` governs the control target, while `--lfc-grid-event-min-block-size` supplies the compact event action's block-axis floor; neither may be overridden so its target falls below that obligation. Long fonts, translations, render-hook content, and toolbar content may make tracks taller; never clip them to preserve a screenshot.

## Elevation & Depth

Core Litefold is flat. Hierarchy comes from adjacent cool-toned surfaces, one-CSS-pixel rules, inset outlines, and the browser top layer—not floating cards or ornamental depth. The root, grid, agenda, status panel, controls, and month/year picker use borders rather than drop shadows. Event hover uses a restrained inset rule; selected and focused days use outlines that remain visible throughout feedback.

The month/year picker uses the native popover top layer with a backdrop mixed from 20% current ink and transparency. It does not gain a drop shadow, blur, glass treatment, gradient, or simulated window chrome. Application-owned example dialogs may use their application's elevation system and are outside the package visual contract.

## Shapes

The default shape is a modest `0.5rem` radius for the outer shell, grid, agenda, status panels, controls, inputs, and picker. The shape should read as softened technical equipment, not a pill-heavy consumer interface.

- Day cells remain rectangular so seven columns read as a single ruled ledger.
- Grid and agenda event slips use the same public radius as their containing panels; the tighter scale comes from their smaller height and padding rather than a one-off corner value.
- Day-number badges are circular. Previous/Next remain quiet rectangular controls with the system radius rather than introducing a second pill treatment.
- Focus and selection use outlines, not shape changes.
- Borders are generally one-CSS-pixel hairlines. Increased-contrast mode thickens the boundaries that carry state.
- Built-in navigation icons are simple directional glyphs; the default event accent is a small filled SVG circle. No icon font, remote image, mascot, ornament, or decorative illustration belongs in core.

## Components

### Calendar shell and toolbar

The shell owns isolation, color scheme, typography, border, radius, and inline-size containment. The toolbar is compact chrome, not a page header. Its visual composition remains Previous, Next, month/year title, Today, then application content at every width; the canonical DOM and focus sequence is defined by the [interaction model](ACCESSIBILITY.md#interaction-model).

Previous/Next are transparent glyph controls with the standard component radius. Today is a quiet bordered control on the calendar background. The interactive month title is centered and underlined. Eligible quiet controls preview the selected surface on hover-capable devices and use the same treatment on press. Disabled controls use `0.65` opacity without erasing their label; their operability and focus semantics follow the [interaction model](ACCESSIBILITY.md#interaction-model).

### Month/year picker

Use the native non-modal `popover="auto"` surface, native Month `<select>`, native Year `<input>`, a filled primary Show month action, and a quiet Cancel action. The picker is at most `24rem` wide, scrolls within the dynamic viewport when necessary, and stacks its fields only at the smallest container. Opening, validation, dismissal, and focus behavior are canonical in the [built-in month-and-year jump](docs/api.md#built-in-month-and-year-jump) and [interaction model](ACCESSIBILITY.md#interaction-model).

### Month grid and day states

The grid is always seven equal logical columns and six week rows. Outside-month days use the surface tone and muted ink. Out-of-range days remain visible at `0.55` opacity but disabled and expose no event action. Day numbers align to the logical end on wide layouts and center in compact layouts.

Today is a primary-filled circular number with its own border. Selection colors the whole cell and adds an inset primary outline. Keyboard focus uses the violet ring and takes visual precedence over the selected outline. Hover and press preview the selected palette only on eligible, unselected, non-Today day-number circles; selection and agenda behavior follow the [interaction model](ACCESSIBILITY.md#interaction-model).

### Events and agenda

Grid events are compact lavender slips with a violet outline, magenta logical-leading rule, preserved marker slot, and ellipsized text slots. At compact widths the first action uses a marker-only presentation within the full compact target. A separate day-level cue uses a three-layer fan of staggered, partially overlapping event slips filled with the event background and outlined in the event-border color to communicate plurality without an exact number. It sits on the marker's physical right side with clearance for noninteractive status decoration and centers in the summaries layer when no compact primary marker exists. When the native overflow action becomes the compact-primary control, the fan is hidden so the visible localized overflow count is not duplicated. Accessible naming and focus behavior follow the [interaction model](ACCESSIBILITY.md#interaction-model).

Wide grid overflow remains an explicit native count/action rather than silently dropping events. A render hook may replace only its non-compact visual content; the canonical localized text remains in the button, and compact-primary or focused overflow actions continue to show it. Custom content cannot replace the action, accessible label, target geometry, or agenda-focus behavior.

The agenda is a rounded surface panel immediately below the grid. Its ordered event rows reuse the event palette and visually align leading content, localized time, title, supporting details, and application trailing content. The canonical action and render-hook semantics are defined by the [interaction model](ACCESSIBILITY.md#interaction-model) and [render-hook API](docs/api.md#customize-rendering-calendarrenderhooks).

### Status and recovery

Persistent warnings and errors appear between the toolbar and grid, using a semantic surface/text/border trio, a strong logical-leading rule, an icon, clear copy, and optional Retry in a stable position. Warning means usable data may be stale or partial; error means the action or initial view cannot continue normally. Error ownership, announcement, focus, and recovery behavior are canonical in [Error handling](docs/errors.md).

### Pager, direction, and motion

Horizontal paging is a native scroll-snap enhancement around the one live grid. Adjacent lanes are decorative, use a mix of 72% selected surface and the calendar background, and contain only direction plus the adjacent month label. They are not event surfaces and are absent from the accessibility tree. Previous/Next buttons remain the universal fallback.

Directional layout uses logical properties and inherited `dir`; glyphs and pager mapping mirror for RTL without visual reordering. Hover rules run only when hover is available. Quiet-control and event hover feedback uses a `120ms` ease-out transition. Direct day-number press feedback is immediate, with its transition disabled, so pointer or touch contact hands off cleanly to selection feedback. Selection feedback is brief and mechanical: a `160ms` whole-cell color reveal and `140ms` date-number confirmation from `0.92` to `1`, also using ease-out. State, focus, ARIA, and callback ordering are canonical in the [public API reference](docs/api.md) and [accessibility contract](ACCESSIBILITY.md); presentation never delays them. Under reduced motion the settled state appears immediately and authored scroll snapping is disabled.

### Private intrinsic geometry

These values keep the built-in pieces proportionate but are not public token promises:

- Navigation prefers a `32rem` basis.
- The picker year track has a `7rem` minimum and `0.65fr` share.
- Agenda titles use a `10rem` flex basis.
- Each pager lane is `min(6rem, 25cqi)`.
- Navigation glyphs occupy `1.25em`, status icons `1.5rem`, event markers `0.75em`, and compact markers `0.375rem`.

Applications must not target private descendants to alter these values.

### Public CSS token map

The following package custom properties are the stable bridge from an application design system to this design. The [CSS token contract](docs/css-tokens.md) defines application, cascade, root-marker, and CSP mechanics. Only `.litefold-calendar` and these documented `--lfc-*` properties are public styling API; generated descendants, transient attributes, keyframes, pager internals, container names, and `--lfc-internal-*` properties remain private.

| Public token | Canonical role or value |
|---|---|
| `--lfc-font-family` | `{typography.body-md.fontFamily}` |
| `--lfc-font-size` | `{typography.body-md.fontSize}` |
| `--lfc-line-height` | `{typography.body-md.lineHeight}` |
| `--lfc-gap` | `{spacing.lg}` |
| `--lfc-border-radius` | `{rounded.md}` |
| `--lfc-control-min-size` | `2.75rem` |
| `--lfc-day-min-block-size` | `clamp(3.5rem, 13cqi, 7rem)` |
| `--lfc-compact-day-min-block-size` | `3.75rem` |
| `--lfc-day-padding` | `clamp(0.25rem, 1.5cqi, 0.75rem)` |
| `--lfc-grid-event-gap` | `{spacing.micro}` |
| `--lfc-grid-event-font-size` | `0.75em` |
| `--lfc-grid-event-min-block-size` | `1.5rem` |
| `--lfc-event-accent-width` | `{spacing.event-accent-width}` |
| `--lfc-color` | `{colors.on-surface}` / `{colors.dark-on-surface}` |
| `--lfc-muted-color` | `{colors.muted}` / `{colors.dark-muted}` |
| `--lfc-background` | `{colors.background}` / `{colors.dark-background}` |
| `--lfc-surface-background` | `{colors.surface}` / `{colors.dark-surface}` |
| `--lfc-border-color` | `{colors.border}` / `{colors.dark-border}` |
| `--lfc-accent-color` | `{colors.primary}` / `{colors.dark-primary}` |
| `--lfc-accent-contrast-color` | `{colors.on-primary}` / `{colors.dark-on-primary}` |
| `--lfc-focus-ring-color` | `{colors.focus}` / `{colors.dark-focus}` |
| `--lfc-selected-background` | `{colors.selected-background}` / `{colors.dark-selected-background}` |
| `--lfc-selected-color` | `{colors.selected-color}` / `{colors.dark-selected-color}` |
| `--lfc-today-border-color` | `{colors.today-border}` / `{colors.dark-today-border}` |
| `--lfc-event-background` | `{colors.event-background}` / `{colors.dark-event-background}` |
| `--lfc-event-color` | `{colors.event-color}` / `{colors.dark-event-color}` |
| `--lfc-event-border-color` | `{colors.event-border}` / `{colors.dark-event-border}` |
| `--lfc-event-accent-color` | `{colors.event-accent}` / `{colors.dark-event-accent}` |
| `--lfc-warning-background` | `{colors.warning-background}` / `{colors.dark-warning-background}` |
| `--lfc-warning-color` | `{colors.warning-color}` / `{colors.dark-warning-color}` |
| `--lfc-warning-border-color` | `{colors.warning-border}` / `{colors.dark-warning-border}` |
| `--lfc-error-background` | `{colors.error-background}` / `{colors.dark-error-background}` |
| `--lfc-error-color` | `{colors.error-color}` / `{colors.dark-error-color}` |
| `--lfc-error-border-color` | `{colors.error-border}` / `{colors.dark-error-border}` |

## Do's and Don'ts

- **Do** preserve the appointment-ledger character: cool paper, dark ink, crisp rules, scarce emerald interaction, and lavender event slips.
- **Do** keep Today, selection, focus, hover, disabled, warning, and error visually and semantically distinct in light, dark, increased-contrast, and forced-colors modes.
- **Do** keep one live 42-day grid with the selected-day agenda directly below it at every width.
- **Do** use native buttons, links, form controls, popover behavior, scrolling, and system typography wherever the browser already supplies the required semantics.
- **Do** test theme overrides at narrow widths, 200% text size, 400% zoom, RTL, reduced motion, increased contrast, and forced colors. Include a generic `1.25rem` custom event marker with a noninteractive inline-end satellite to verify that the compact fan stays separate and causes no horizontal overflow.
- **Don't** add shadows, gradients, glass, glow, illustration, remote assets, icon fonts, or promotional display typography to package-owned UI.
- **Don't** use primary green as general decoration or violet focus color for selection; their scarcity preserves state clarity.
- **Don't** hide event meaning, warning/error meaning, selection, or Today through color alone.
- **Don't** add viewport-driven layout JavaScript, responsive DOM movement, visual reordering, or a side-by-side agenda.
- **Don't** shrink public sizing tokens below the 24 CSS-pixel target floor, clip long agenda content, or remove a visible focus outline.
- **Don't** style generated `.lfc-*` descendants, `data-lfc-*` state, pager internals, or `--lfc-internal-*` values from an application.
- **Don't** treat application-owned example shells, dialogs, filters, or render-hook palettes as new package defaults.
