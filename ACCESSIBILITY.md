# Accessibility

litefold-calendar is designed to support integration into WCAG 2.2 AA conforming pages when used according to this guidance. WCAG conformance applies to complete pages and processes, not an isolated component. Applications remain responsible for surrounding structure, content, contrast overrides, focus transitions outside the calendar, and end-to-end assistive-technology testing.

## Interaction model

The month is one ARIA grid inside a programmatically focusable horizontal paging viewport. Each `gridcell` contains a full-cell native day button followed by a sibling summaries container; event and overflow actions are children of that container, so interactive elements are never nested. One in-range day is selected, exactly one day proxy in the entire grid has `tabindex="0"`, and every grid event/overflow action remains `tabindex="-1"`. The visual pull lanes on either side are `aria-hidden`, contain no days or actions, and are not additional month grids. Dates outside the calendar instance's inclusive `minDate` / `maxDate` bounds remain visible when they fill the six-week grid, but their day buttons are disabled and their event actions are suppressed.

| Key | Day-grid behavior |
|---|---|
| Arrow Left/Right | Move one logical day when the destination is in range, respecting direction |
| Arrow Up/Down | Move one week when the destination is in range |
| Home/End | Move to the current week's first/last day when that destination is in range |
| Page Up/Page Down | Move one month within the configured range and synchronize the focused/selected day |
| Shift+Page Up/Page Down | Move one year within the configured range and synchronize the focused/selected day |
| Enter/Space | Select the focused day and update the agenda |
| Shift+F10 | Invoke the optional day context action |
| F2 | From a day, focus its first visible event or overflow action; from an action, return to the day |
| Up/Down while in actions | Move between that cell's visible actions without wrapping |
| Escape while in actions | Return to the represented day |
| Tab while in actions | Exit the grid forward toward the agenda |
| Shift+Tab while in actions | Return to the represented day proxy |

Arrow and Home/End navigation moves focus but does not select; movement stops at the rendered six-week boundary or the configured date bounds. This prevents ordinary focus movement from rebuilding and announcing the agenda. Page Up/Down is the deliberate exception: when an in-range destination exists, it changes the displayed month or year and synchronizes focus, selection, and agenda so the new grid retains one visible selected cell, but it does not invoke `onDaySelect`. Enter, Space, or click is the day-selection action path and invokes `onDaySelect` only for an enabled, in-range day.

F2 enters the focused cell's visible actions without adding another Tab stop. Up and Down Arrow move through those actions without wrapping. Escape or F2 returns to the day; Shift+Tab also returns to the day, while Tab exits forward toward the agenda. The default localized grid instructions are: “Use arrow keys to move between dates and Enter or Space to select. Press F2 on a date to move to its visible event actions; use Up and Down Arrow between actions, and Escape or F2 to return.”

An event with a validated URL renders as a native anchor. Without a URL, activation or an eligible context command renders a native button. With neither, the representation is static. Direct event activation on either surface never selects the day or invokes `onDaySelect`. The selected-day agenda remains below the grid at every width and uses ordered-list markup. Grid overflow is a native action named from its date and hidden count; its default label is “View {count} more {eventLabel} for {date}”. It selects the represented date, resets agenda expansion, focuses the agenda heading, and does not invoke `onDaySelect`.

Replacing event input keeps package-owned focus on the same day or event occurrence when it still exists.  If a focused event disappears, focus returns to its owning day; focus outside the calendar is not moved.

`eventTimeDisplay` controls visual time exposure without removing information from assistive technology. For `"grid"`, `"agenda"`, and `"none"`, a suppressed surface still contains its native `<time datetime>` element with visually hidden localized text; the event action's accessible name and extension `timeText` keep the same time. Applications must not use this option to conceal a time from users who rely on assistive technology.

The presented month and year is a native button inside the configured `h1` through `h6`; a dedicated visible date span alone labels the grid. The button opens the default `popover="auto"` surface exposed as a dialog, synchronizes its labelled month and year controls, and focuses Month. A successful Jump accepts only an in-range month, while Cancel makes no date change; both paths close the popover and return focus to the month/year trigger. Invalid form input remains open for correction. Escape also dismisses the popover and restores trigger focus. Pointer/outside light-dismiss closes it without stealing focus from the user's new target. The package-owned labels are localized through `chooseMonthYear`, `jumpToMonthYear`, `month`, `year`, `jump`, and `cancel`.

Previous, Next, Today, swipe, month/year jump, grid keyboard movement, day activation, and focus movement all honor the same inclusive bounds. Previous, Next, and Today remain in the normal Tab order and expose `aria-disabled="true"` when their action has no in-range destination; their guarded handlers make activation a no-op. Disabled filler-day buttons cannot receive focus or invoke day actions. Bounds do not shorten event-source requests: each rendered month still uses the complete 42-day provider range, including visible disabled dates outside the configured range.

The current date uses `aria-current="date"`; the chosen agenda date uses `aria-selected`. They are independent states and are not communicated by color or motion alone. Directly activating a different day in the displayed month commits selection, agenda, ARIA, and focus before any decorative feedback begins. With motion allowed, the whole-cell background moves from its resting color to the selected color while the date number scales from `0.92` to `1`. Selected, focus, and extension outlines remain visible throughout; reduced motion and other selection paths show the settled treatment immediately.

## Loading, errors, and announcements

- The calendar marks the affected region `aria-busy` during source work.
- Routine loading is not repeatedly announced.
- Accepted event replacement uses the same busy, silent-loading, and current/degraded source-failure routes as refetching; usable same-range content stays available when a replacement fails.
- Persistent package errors appear between the toolbar and grid.
- Failures that prevent continuation, and failed user-initiated actions requiring immediate attention, are assertive; degraded-data and partial-extension warnings are polite.
- The package does not move focus for ordinary asynchronous failures.
- Retry remains a native button and keeps a stable DOM position across attempts.
- Only one live region or configured external announcer speaks each message.
- Expected aborts and obsolete successful requests are silent.

Returning `"handled"` from `onError` explicitly transfers both visible and accessible error presentation to the application. See [Error handling](docs/errors.md) before using it.

## Responsive and direct-input behavior

The component uses CSS container queries rather than viewport width or JavaScript layout measurement. The component integration target is no persistent two-dimensional content scrolling at 320 CSS pixels of available inline size. The transient native horizontal movement used by the optional decorative pager is not a second content axis or an adjacent interactive view. Verify the complete page at a viewport width equivalent to 320 CSS pixels—for example, a 1,280-CSS-pixel viewport at 400% zoom. Automated and manual release verification covers component widths of 280, 320, 340, 360, 375, 390, 412, and 768 CSS pixels.

Wide layouts expose every capped event action. At `42rem` and below, the first actionable event remains a fully named native marker whose target stays at least 24 by 24 CSS pixels and grows with its day cell toward 44 by 44 CSS pixels; later grid actions are visually omitted unless focused. Titles, times, and overflow information remain available for agenda rows rendered within `agendaDomLimit`; visible/total progress reports any remaining events beyond that DOM cap.

Marker and leading slots allow visual overflow while text slots own clipping and ellipsis. Extensions may add noninteractive marker details without having them cut off, but they remain responsible for avoiding overlap with names, focus rings, and adjacent actions. Empty slots do not reserve space.

Static and interactive agenda rows align their marker or leading content, localized time, and title across the list. Details and trailing extension content follow the title in DOM order. Below `24rem`, the title and supporting content span the full row so long text retains usable reading space in both text directions.

At `20rem` and below, weekday headings switch from the locale's short visual label to its narrow visual label. Each `columnheader` retains the full localized weekday as its accessible name, so compact labels do not reduce the information exposed to assistive technology.

Toolbar controls remain in the same DOM and sequential-focus order at every width: Previous, Next, the interactive month title, Today, then application `toolbarEnd` content. At `42rem` and below, the four built-ins share the first compact row and application content occupies the next. At `20rem` and below, Previous/Next and the title form the first row, Today forms the second, and application content follows on the third. The month/year title never wraps; if an unusually long localized title cannot fit, only its visual presentation is clipped with an ellipsis while the canonical full DOM text, trigger `aria-label`, and grid accessible name remain intact. The compact presentation is `aria-hidden` and cannot duplicate the accessible label or live announcement. The stylesheet does not use `order`, reversed flow, or dense placement for interactive content. Container resizing changes only CSS layout and does not rerender, replace focused nodes, refetch events, or require focus restoration.

Day controls and the compact actionable marker keep at least a 24 by 24 CSS-pixel target at the narrowest supported container and target 44 by 44 at 320 pixels and above where layout permits. Applications must not override `--lfc-control-min-size` below those constraints.

Horizontal paging is an enhancement, never the only navigation method. With `swipe` enabled, touch, pen, and horizontal precision-scroll input use a native scroll-snap viewport to pull the one current grid toward a decorative Previous or Next lane. A settled qualifying pull changes at most one month, recenters the same viewport, and never exposes a second interactive grid or prefetches an adjacent event range. Vertical page scrolling and pinch zoom remain available. Scroll momentum, overscroll, rubber-banding, and snap timing are user-agent and operating-system behavior rather than a package guarantee. With reduced motion requested, CSS scroll snapping is disabled; user-controlled tracking and any platform momentum remain native, then the package resolves the destination and recenters by direct scroll-position assignment after scrolling settles. The visual lanes are hidden from assistive technology, and the paging viewport is absent from the normal Tab sequence; focus remains governed by the native toolbar and managed grid controls. Previous/Next buttons remain keyboard reachable, including when paging is disabled, unsupported by an input device, or stopped at a configured boundary.

## Integration responsibilities

Applications must:

- Give the calendar host a meaningful surrounding heading or region label in the page context.
- Preserve visible focus indicators and sufficient text, control, focus-ring, selected-state, warning, and error contrast when overriding tokens.
- Provide useful event titles. Do not rely on `accentColor` to convey category, status, or urgency.
- Add visible type/status text through event extension nodes when the distinction matters. Use the non-null `elements.action` anchor/button supplied to `eventDidMount` to provide a matching accessible name when needed. Decorative day badges and static visual summaries cannot be the only status channel.
- Keep extension render output concise and noninteractive; nested controls do not belong inside event actions.
- Return action promises so the package can surface rejection.
- Keep `onAnnounce`, `onStateChange`, and `isEventContextMenuAvailable` synchronous. The availability predicate must return a boolean; a throw, non-boolean, or thenable fails closed and reports one recoverable integration issue.
- Keep localized messages clear and distinct, and test long translations and bidirectional text.
- Use `dir` on an appropriate ancestor; do not force physical left/right CSS overrides into the component.
- Test toolbar content supplied through `toolbarEnd`, including tab order, wrapping, names, and error states.
- Do not override or script private pager/toolbar descendants, scroll positions, snap points, or transient attributes; test the public controls, state, callbacks, and visible behavior instead.
- Test the month/year popover, constrained controls, disabled days, and trigger focus restoration with pointer, keyboard, and assistive technology.
- Provide equivalent persistent UI and announcements if `onError` returns `"handled"`.
- Re-run accessibility checks after overriding CSS or inserting extension content.

## Visual preferences

The distributed stylesheet supports:

- `prefers-reduced-motion: reduce`
- forced-colors/high-contrast environments
- increased contrast where supported
- inherited text direction
- browser text resizing and zoom

The selection feedback is presentation-only and exists only under `prefers-reduced-motion: no-preference`. It does not delay state, focus, agenda updates, or callbacks. Under `prefers-reduced-motion: reduce`, the pre-rendered settled selection appears immediately without the background-color or date-number animation. For paging, the stylesheet disables scroll snapping under reduced motion. Direct tracking and any platform momentum remain native; after scrolling settles, destination resolution and recentering use direct scroll-position assignment with no authored animation. The package does not disable zoom, inject global styles, or download fonts/icons. Application overrides should retain token fallbacks and must not remove focus outlines without an equally visible replacement.

## Testing

Automated unit/DOM and pinned-Chromium checks cover semantics, native links/buttons, F2/Escape/Tab behavior, focus retention, compact layout, RTL, reflow, normal and reduced selection feedback, native pager semantics and fallbacks, forced colors, error announcements, hostile content, and automated accessibility rules. The manual matrix below remains required before alpha promotion. Until those rows contain dated results, the repository makes no browser/assistive-technology pass claim and no WCAG conformance claim. Automated results are necessary but not sufficient.

Manual test procedure:

1. Navigate into and out of the grid using only the keyboard.
2. Confirm focus and selection remain distinct while arrowing between days and stop at configured bounds; enter actions with F2, move with Up/Down, return with Escape/F2/Shift+Tab, and exit forward with Tab.
3. Open the month/year popover from its title button, exercise Jump, Cancel, Escape, and pointer light-dismiss, and confirm the documented focus behavior.
4. Confirm out-of-range filler days are disabled, expose no event representation, and cannot invoke a day or event action.
5. Select a different in-range day with pointer and keyboard activation; confirm state, focus, and agenda update before the optional whole-cell color and date-number feedback, and confirm selected, focus, and extension outlines remain continuously visible through its final frame and cleanup. Repeat with reduced motion and confirm the settled state appears immediately. Activate linked and callback-driven events directly from the grid without selecting the day, exercise overflow focus transfer, then reach the ordered agenda and repeat. Replace event input while a grid and agenda event owns focus; confirm an existing occurrence keeps focus, a removed occurrence falls back to its day, and external focus is left alone.
6. With touch, pen, and a horizontal precision-scrolling device, confirm taps still select; vertical scrolling and pinch zoom remain available; an uncommitted or boundary pull returns to center without selecting a day; and a committed LTR or RTL pull changes exactly one month. Confirm the decorative lanes are absent from the accessibility tree, focus does not enter the paging viewport through Tab, no adjacent provider request occurs before commit, Previous/Next remain usable, and `swipe: false` disables only the pull route. Repeat with reduced motion and confirm direct tracking remains available, CSS snap settling is absent, and the terminal commit or recenter uses no authored interpolation.
7. Trigger an initial source failure, retained-data refresh failure, action rejection, extension failure, Retry failure, and successful Retry.
8. Confirm each message is spoken once with suitable urgency and no unexpected focus jump.
9. Verify the same tasks at 280, 320, 340, 360, 375, 390, 412, and 768 CSS pixels of component width; repeat in LTR and RTL, light and dark color schemes, increased contrast, forced colors, reduced motion, 200% text size, 400% zoom, and portrait orientation as applicable. Confirm the month/year title remains on one line without horizontal overflow and retains its complete accessible text when visually ellipsized.
10. Repeat with application toolbar, progressive fallback, and extension content enabled.

### Assistive-technology record

The release maintainer records actual results here before promoting an alpha artifact. Do not infer a pass from an empty row.

| Platform | Browser and assistive technology | Version | Date | Result | Notes |
|---|---|---|---|---|---|
| Windows | Firefox + NVDA | Not yet recorded | — | Pending | Required before alpha promotion |
| Windows | Chrome or Edge + NVDA or Narrator | Not yet recorded | — | Pending | Required before alpha promotion |
| macOS | Safari + VoiceOver | Not yet recorded | — | Pending | Desktop result required before alpha promotion |
| iOS | Safari + VoiceOver | Not yet recorded | — | Pending | Mobile result required before alpha promotion |
| Android | Chrome + TalkBack | Not yet recorded | — | Pending | Required before alpha promotion |

## Standards basis

The implementation is based on:

- [WCAG 2.2](https://www.w3.org/TR/WCAG22/), including focus, reflow, target size, use of color, and status messages.
- [WAI-ARIA 1.2 grid semantics](https://www.w3.org/TR/wai-aria-1.2/#grid).
- The non-normative [ARIA Authoring Practices grid pattern](https://www.w3.org/WAI/ARIA/apg/patterns/grid/).
- The non-normative [ARIA Authoring Practices date-picker example](https://www.w3.org/WAI/ARIA/apg/patterns/dialog-modal/examples/datepicker-dialog/) for the calendar-specific Page Up/Down keyboard conventions.
- The non-normative [ARIA Authoring Practices alert pattern](https://www.w3.org/WAI/ARIA/apg/patterns/alert/) for urgent, focus-independent notifications.
- ARIA [`alert`](https://www.w3.org/TR/wai-aria-1.2/#alert), [`status`](https://www.w3.org/TR/wai-aria-1.2/#status), and [`aria-busy`](https://www.w3.org/TR/wai-aria-1.2/#aria-busy) contracts.

Report accessibility defects through the repository issue form. Report an issue privately when it could expose confidential calendar data or enable a security impact.
