# Accessibility

Litefold Calendar is designed to support integration into WCAG 2.2 AA conforming pages when used according to this guidance. WCAG conformance applies to complete pages and processes, not an isolated component. Applications remain responsible for surrounding structure, content, contrast overrides, focus transitions outside the calendar, and end-to-end assistive-technology testing.

Package users can start with [Integration responsibilities](#integration-responsibilities) and run the relevant scenarios under [Testing](#testing). Contributors changing package interaction, semantics, layout, or announcements must also preserve the detailed contracts in the preceding sections.

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
| Context Menu / Shift+F10 | Invoke the optional context action for the focused day or eligible focused event action |
| F2 | From a day, focus its first visible event or overflow action; from an action, return to the day |
| Up/Down while in actions | Move between that cell's visible actions without wrapping |
| Escape while in actions | Return to the represented day |
| Tab while in actions | Exit the grid forward toward the agenda |
| Shift+Tab while in actions | Return to the represented day proxy |

Arrow and Home/End navigation moves focus but does not select; movement stops at the rendered six-week boundary or the configured date bounds. This prevents ordinary focus movement from rebuilding and announcing the agenda. Page Up/Down is the deliberate exception: when an in-range destination exists, it changes the displayed month or year and synchronizes focus, selection, and agenda so the new grid retains one visible selected cell, but it does not invoke `onDaySelect`. Enter, Space, or click is the day-selection action path and invokes `onDaySelect` only for an enabled, in-range day.

F2 enters the focused cell's visible actions without adding another Tab stop. Up and Down Arrow move through those actions without wrapping. Escape or F2 returns to the day; Shift+Tab also returns to the day, while Tab exits forward toward the agenda. Context Menu or Shift+F10 invokes the optional day context action from a focused day, or the optional event context action from an eligible focused grid or agenda event action. The default localized grid instructions are: “Use arrow keys to move between dates and Enter or Space to select. Press F2 on a date to move to its visible event actions; use Up and Down Arrow between actions, and Escape or F2 to return.”

Event representation follows native semantics:

- An event with a validated URL is a native anchor.
- An event without a URL is a native button when it has an activation or eligible context command.
- An event with neither is static.

Direct event activation on either surface never selects the day or invokes `onDaySelect`. The selected-day agenda remains below the grid at every width and uses ordered-list markup.

Grid overflow is a native action named from its date and hidden count; its default label is “View {count} more {eventLabel} for {date}”. `renderEventOverflow` may replace its pre-rendered compact and wide visual content, but each custom slot is `aria-hidden` and noninteractive. The native button, accessible label, activation, and agenda-focus transfer remain package-owned; `context.text` retains the package-formatted fallback value even when custom content replaces that fallback visually. Activating overflow selects the represented date, resets agenda expansion, focuses the agenda heading, and does not invoke `onDaySelect`.

Replacing event input keeps package-owned focus on the same day or event occurrence when it still exists. If a focused event disappears, focus returns to its owning day; focus outside the calendar is not moved.

`eventTimeDisplay` controls visual time exposure without removing information from assistive technology. For `"grid"`, `"agenda"`, and `"none"`, a suppressed surface still contains its native `<time datetime>` element with visually hidden localized text; the event action's accessible name and render-hook `timeText` keep the same time. Applications must not use this option to conceal a time from users who rely on assistive technology.

The presented month and year is a native button inside the configured `h1` through `h6`; a dedicated visible date span alone labels the grid. The button opens the default `popover="auto"` surface exposed as a dialog, synchronizes its labelled month and year controls, and focuses Month. A successful Jump accepts only an in-range month, while Cancel makes no date change; both paths close the popover and return focus to the month/year trigger. Invalid form input remains open for correction. Escape also dismisses the popover and restores trigger focus. Pointer/outside light-dismiss closes it without stealing focus from the user's new target. The package-owned labels are localized through `chooseMonthYear`, `jumpToMonthYear`, `month`, `year`, `jump`, and `cancel`.

Previous, Next, Today, swipe, month/year jump, grid keyboard movement, day activation, and focus movement all honor the same inclusive bounds. Previous, Next, and Today remain in the normal Tab order and expose `aria-disabled="true"` when their action has no in-range destination; their guarded handlers make activation a no-op. Disabled filler-day buttons cannot receive focus or invoke day actions. Bounds do not shorten event-source requests: each rendered month still uses the complete 42-day provider range, including visible disabled dates outside the configured range.

The current date uses `aria-current="date"`; the chosen agenda date uses `aria-selected`. They are independent states and are not communicated by color or motion alone. Directly activating a different day in the displayed month commits selection, agenda, ARIA, and focus before any decorative feedback begins. The [canonical day-state and motion treatment](DESIGN.md#month-grid-and-day-states) keeps selection and focus outlines visible throughout; reduced motion and other selection paths show the settled treatment immediately.

Optional WebMCP navigation uses the same programmatic navigation paths and never replaces the visible interface. It must not invoke day or event activation callbacks, move the user's current DOM focus, create a second interaction model, or suppress visible loading and error states. The [WebMCP guide](docs/webmcp.md) owns its experimental compatibility and privacy contract.

## Loading, errors, and announcements

- The calendar marks the host and grid `aria-busy` only when a source invocation returns a PromiseLike. A direct static array, array-returning provider, or immediate failure commits its terminal state without a busy phase.
- Routine loading is not repeatedly announced.
- Accepted event replacement and refetching follow each result's shape. PromiseLike work uses the silent busy/loading route; direct results commit immediately. Usable same-range content stays available when a replacement fails.
- Persistent package errors appear between the toolbar and grid.
- Failures that prevent continuation, and failed user-initiated actions requiring immediate attention, are assertive; degraded-data and render-hook warnings are polite. Registered-extension failures are diagnostic-only and silent.
- The package does not move focus for ordinary asynchronous failures.
- Retry remains a native button and keeps a stable DOM position across attempts.
- Only one live region or configured external announcer speaks each message.
- Expected aborts and obsolete successful requests are silent.

Returning `"handled"` from `onError` explicitly transfers both visible and accessible error presentation to the application. See [Error handling](docs/errors.md) before using it.

## Responsive and direct-input behavior

Responsive breakpoints, visual composition, and the supported design floor are canonical in the [responsive design](DESIGN.md#responsive-model). Layout uses CSS container queries rather than viewport width or JavaScript measurement. At the supported floor, reflow must not introduce persistent two-dimensional content scrolling; narrower containers are robustness targets rather than design claims. The pager's transient native horizontal movement is direct input, not a second content axis or adjacent interactive view. Verify the complete page at 400% zoom with the calendar host at the supported design floor.

At every width, the first actionable event retains its complete accessible name; visually hidden later actions remain reachable through managed action navigation; and agenda rows retain titles, times, overflow details, and visible/total progress. Compact day counts are decorative, pointer-transparent, unfocusable, and excluded from action order. Pointer activation selects the day. If the overflow button carries the compact count, including when `maxGridEventsPerDay` is `0`, it remains one native action with package-owned naming and focus transfer. Neither presentation replaces the exact total in the day button's accessible name or changes F2, Arrow, Escape, Tab, pointer, or agenda behavior. Render-hook marker and leading content must remain noninteractive and must not obscure names, focus indicators, or adjacent actions.

Static and interactive agenda rows keep marker or leading content, localized time, title, details, and trailing content in that DOM order. Their [visual alignment and narrow reflow](DESIGN.md#events-and-agenda) preserve usable reading space in both text directions.

The [compact visual treatment](DESIGN.md#responsive-model) may switch from short to narrow weekday labels. Each `columnheader` retains the full localized weekday as its accessible name, so compact labels do not reduce the information exposed to assistive technology.

Toolbar controls remain in the same DOM and sequential-focus order at every width: Previous, Next, the interactive month title, Today, then application `toolbarEnd` content. The [responsive composition](DESIGN.md#responsive-model) changes rows without visual reordering. If a localized title cannot fit, only its visual presentation ellipsizes; the canonical full DOM text, trigger `aria-label`, and grid accessible name remain intact. The compact presentation is `aria-hidden` and cannot duplicate the accessible label or live announcement. Container resizing changes only CSS layout and does not rerender, replace focused nodes, refetch events, rerun render hooks, re-enter extension lifecycle, or require focus restoration.

Applications must preserve the target-size obligations defined by the [responsive design](DESIGN.md#responsive-model) when overriding public size tokens.

Horizontal paging is an enhancement, never the only navigation method. With `swipe` enabled, touch, pen, and horizontal precision-scroll input use a native scroll-snap viewport to pull the one current grid toward a decorative Previous or Next lane. The following guarantees apply:

- A settled qualifying pull changes at most one month, recenters the same viewport, and never exposes a second interactive grid or prefetches an adjacent event range.
- Vertical page scrolling and pinch zoom remain available. Scroll momentum, overscroll, rubber-banding, and snap timing are user-agent and operating-system behavior rather than package guarantees.
- With reduced motion requested, CSS scroll snapping is disabled. User-controlled tracking and platform momentum remain native; after scrolling settles, the package resolves the destination and recenters by direct scroll-position assignment.
- The visual lanes are hidden from assistive technology, and the paging viewport is absent from the normal Tab sequence. Focus remains governed by the toolbar and managed grid controls.
- Previous/Next buttons remain keyboard reachable when paging is disabled, unsupported by an input device, or stopped at a configured boundary.

## Integration responsibilities

Applications must:

- Give the calendar host a meaningful surrounding heading or region label in the page context.
- Preserve visible focus indicators and sufficient text, control, focus-ring, selected-state, warning, and error contrast when overriding tokens.
- Provide useful event titles. Do not rely on `accentColor` to convey category, status, or urgency.
- Add visible type/status text through event render-hook nodes when the distinction matters. Use the non-null `elements.action` anchor/button supplied to `eventDidMount` to provide a matching accessible name when needed. Decorative day badges, compact event-overflow cues, and static visual summaries cannot be the only status channel.
- Keep render-hook output concise and noninteractive; nested controls do not belong inside event actions.
- Return action promises so the package can surface rejection.
- Keep `onAnnounce`, `onStateChange`, and `isEventContextMenuAvailable` synchronous. The availability predicate must return a boolean; a throw, non-boolean, or thenable fails closed and reports one recoverable integration issue.
- Keep localized messages clear and distinct, and test long translations and bidirectional text.
- Use `dir` on an appropriate ancestor; do not force physical left/right CSS overrides into the component.
- Test toolbar content supplied through `toolbarEnd`, including tab order, wrapping, names, and error states.
- Do not override or script private pager/toolbar descendants, scroll positions, snap points, or transient attributes; test the public controls, state, callbacks, and visible behavior instead.
- Test the month/year popover, constrained controls, disabled days, and trigger focus restoration with pointer, keyboard, and assistive technology.
- Provide equivalent persistent UI and announcements if `onError` returns `"handled"`.
- Re-run accessibility checks after overriding CSS or inserting render-hook content.

## Visual preferences

The distributed stylesheet supports:

- `prefers-reduced-motion: reduce`
- forced-colors/high-contrast environments
- increased contrast where supported
- inherited text direction
- browser text resizing and zoom

The [DESIGN.md motion treatment](DESIGN.md#pager-direction-and-motion) is presentation-only and never delays state, focus, agenda updates, or callbacks. Under `prefers-reduced-motion: reduce`, selection appears settled immediately; paging follows the [canonical reduced-motion behavior above](#responsive-and-direct-input-behavior). The package does not disable zoom, inject global styles, or download fonts/icons. Application overrides must not remove focus outlines without an equally visible replacement.

## Testing

Automated unit/DOM and pinned-Chromium checks cover semantics, native links/buttons, F2/Escape/Tab behavior, focus retention, compact and wide event-overflow customization, compact layout, RTL, reflow, normal and reduced selection feedback, native pager semantics and fallbacks, optional WebMCP navigation without focus or callback side effects, forced colors, error announcements, hostile content, and automated accessibility rules. These checks gate every release.

Manual browser and assistive-technology evidence is risk-based. Repeat the affected procedure and matrix rows when a change can alter interaction, semantics, accessible names, focus, announcements, responsive behavior, visual preferences, browser support, or the surrounding developer demo. An unrelated alpha can reuse still-applicable dated evidence. Complete the full supported matrix before stable promotion and after a support-policy change that invalidates the prior baseline. Automated results are necessary but not sufficient for claims about real browser/assistive-technology combinations.

Manual test procedure (run the affected groups for a focused change and all groups for a full baseline):

1. **Keyboard and grid actions**
   - Navigate into and out of the grid using only the keyboard.
   - Confirm focus and selection remain distinct while arrowing between days and stop at configured bounds.
   - Enter actions with F2, move with Up/Down, invoke eligible day and event context actions with Context Menu and Shift+F10, return with Escape/F2/Shift+Tab, and exit forward with Tab.
2. **Picker and bounds**
   - Open the month/year popover, exercise Jump, Cancel, Escape, and pointer light-dismiss, and confirm the documented focus behavior.
   - Confirm out-of-range filler days are disabled, expose no event representation, and cannot invoke a day or event action.
3. **Selection, events, and replacement**
   - Select a different in-range day with pointer and keyboard activation. Confirm state, focus, and agenda update before the optional whole-cell color and date-number feedback, and confirm selection and focus outlines remain continuously visible through its final frame and cleanup. Repeat with reduced motion and confirm the settled state appears immediately.
   - Activate linked and callback-driven events directly from the grid without selecting the day, exercise overflow focus transfer, then reach the ordered agenda and repeat.
   - For zero-, one-, and multiple-event days, confirm the compact cue is absent for zero and one, reports signed additional occurrences when paired with a primary marker, reports the unsigned total in one centered block when standalone, and remains decorative while the day button announces the exact total. Confirm `maxGridEventsPerDay: 0` keeps the compact fallback inside one package-owned overflow action without changing F2, Arrow, Escape, Tab, pointer, or agenda behavior.
   - Replace event input while a grid and agenda event owns focus. Confirm an existing occurrence keeps focus, a removed occurrence falls back to its day, and external focus is left alone.
4. **Direct-input paging**
   - With touch, pen, and a horizontal precision-scrolling device, confirm taps still select, vertical scrolling and pinch zoom remain available, an uncommitted or boundary pull recenters without selecting a day, and a committed LTR or RTL pull changes exactly one month.
   - Confirm decorative lanes are absent from the accessibility tree, Tab does not enter the paging viewport, no adjacent provider request occurs before commit, Previous/Next remain usable, and `swipe: false` disables only the pull route.
   - Repeat with reduced motion. Direct tracking must remain available, CSS snap settling must be absent, and the terminal commit or recenter must use no authored interpolation.
5. **Failures and announcements**
	- Navigate, refetch, and replace events with a direct array result. Confirm one terminal render, no `loading` state, and no `aria-busy`. Repeat with a controlled PromiseLike and confirm one busy/loading render followed by one terminal render that clears busy.
   - Trigger an initial source failure, retained-data refresh failure, action rejection, render-hook failure, Retry failure, successful Retry, and registered-extension failure.
   - Confirm each presented message is spoken once with suitable urgency and no unexpected focus jump. Confirm the registered-extension failure reaches diagnostics only, with no visible status or announcement.
6. **Responsive layout and visual preferences**
   - Repeat the preceding tasks at 320, 340, 360, 375, 390, 412, and 768 CSS pixels of component width; test LTR and RTL, light and dark color schemes, increased contrast, forced colors, reduced motion, 200% text size, 400% zoom, and portrait orientation as applicable.
   - Run 280 CSS pixels separately as a best-effort robustness stress check.
   - Confirm the month/year title stays on one line without horizontal overflow and retains its complete accessible text when visually ellipsized.
   - Follow the [responsive visual checks](DESIGN.md#dos-and-donts) for custom marker and count geometry. In this accessibility pass, confirm compact cues remain decorative, complete accessible names and managed action order are unchanged, pointer activation reaches the documented target, and responsive reflow introduces no persistent two-dimensional scrolling.
7. **Application integration**
   - Repeat affected tasks with application toolbar, progressive fallback, and render-hook content enabled.
8. **WebMCP, when enabled**
   - Invoke each site tool through a controlled model-context fixture. Confirm read-only access does not change state; navigation preserves DOM focus, visible loading/error behavior, and callback boundaries; and teardown leaves no callable registration.

### Developer-demo verification

When a change affects the Pages developer hub, verify its skip link, heading order, sequential keyboard navigation, visible focus, copy success and manual-selection fallback, status announcement, responsive reflow, dark mode, forced colors, and reduced motion across every affected route. Record only checks that were performed in the pull request or private release evidence. Browser automation, accessibility-tree inspection, and automated rules do not establish screen-reader speech; use the assistive-technology matrix below for those claims.

### Assistive-technology record

Maintainers responsible for a release record actual results when a relevant change invalidates a row and before stable promotion. Do not infer a pass from an empty row or apply stale evidence to changed behavior.

| Platform | Browser and assistive technology | Version | Date | Result | Notes |
|---|---|---|---|---|---|
| Windows | Firefox + NVDA | Not yet recorded | — | Pending | Required baseline before stable promotion |
| Windows | Chrome or Edge + NVDA or Narrator | Not yet recorded | — | Pending | Required baseline before stable promotion |
| macOS | Safari + VoiceOver | Not yet recorded | — | Pending | Required desktop baseline before stable promotion |
| iOS | Safari + VoiceOver | Not yet recorded | — | Pending | Required mobile baseline before stable promotion |
| Android | Chrome + TalkBack | Not yet recorded | — | Pending | Required baseline before stable promotion |

## Standards basis

The implementation is based on:

- [WCAG 2.2](https://www.w3.org/TR/WCAG22/), including focus, reflow, target size, use of color, and status messages.
- [WAI-ARIA 1.2 grid semantics](https://www.w3.org/TR/wai-aria-1.2/#grid).
- The non-normative [ARIA Authoring Practices grid pattern](https://www.w3.org/WAI/ARIA/apg/patterns/grid/).
- The non-normative [ARIA Authoring Practices date-picker example](https://www.w3.org/WAI/ARIA/apg/patterns/dialog-modal/examples/datepicker-dialog/) for the calendar-specific Page Up/Down keyboard conventions.
- The non-normative [ARIA Authoring Practices alert pattern](https://www.w3.org/WAI/ARIA/apg/patterns/alert/) for urgent, focus-independent notifications.
- ARIA [`alert`](https://www.w3.org/TR/wai-aria-1.2/#alert), [`status`](https://www.w3.org/TR/wai-aria-1.2/#status), and [`aria-busy`](https://www.w3.org/TR/wai-aria-1.2/#aria-busy) contracts.

Report accessibility defects through the repository issue form. Report an issue privately when it could expose confidential calendar data or enable a security impact.
