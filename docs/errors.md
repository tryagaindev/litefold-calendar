# Error handling

Litefold Calendar separates failures into two paths:

- **Programmer errors** are invalid configuration, arguments, or lifecycle calls. They throw synchronously and must be caught at the application boundary that supplied the uncertain input.
- **Operational failures** happen after a rendered calendar starts work. The package presents current failures by default and sends them to `onError` when configured. Late or stale failures are diagnostic only and never change the current UI or state.

## Choose an integration path

| Goal | Use | Visible UI and announcements | Diagnostic sink |
|---|---|---|---|
| Use the built-in presentation without a callback | Omit `onError` | Litefold Calendar | Browser global error channel |
| Add telemetry while keeping the built-in presentation | Log in `onError`, then return `undefined` or `"default"` | Litefold Calendar | Configured `onError` only |
| Replace the built-in presentation | Synchronously render equivalent UI in `onError`, then return the exact string `"handled"` | Application | Configured `onError` only |
| Route announcements through a shared announcer | Configure `onAnnounce` separately | Visible UI is unchanged; application owns announcements | Unchanged |
| Observe presentation-safe state | `getState()` or `onStateChange` | Unchanged | Unchanged |

`onError` does not receive programmer errors thrown by construction or public method calls. Catch those separately.

## Package-owned presentation

Persistent status/error UI appears after the toolbar and before the grid. It does not auto-dismiss, steal focus, reveal raw failure details, or depend on color alone.

| Failure | Visible behavior | Announcement |
|---|---|---|
| Initial load or range-change source, validation, or limit failure | Error title, safe message, Retry | Assertive |
| Failed same-range refresh with retained events | Stale-data warning and Retry; prior events remain | Polite |
| Rejected current event/day action | Persistent action error | Assertive |
| Failed render hook | Partial-details warning; built-in UI remains | Polite |
| Context-availability predicate throws or returns an invalid value | Context action fails closed; one recoverable integration issue | Polite |
| Failed registered extension | The affected extension is quarantined; ordinary calendar state and UI remain unchanged; diagnostic `extension-failed` only | Silent |
| Fatal internal failure | Generic unavailable fallback | Assertive |
| Successful user-initiated Retry | Resolved issue is removed | Polite recovery message |
| Superseded request aborted by the package | No error | Silent |
| Late failure that can no longer enter active presentation | Diagnostic only; current state and UI remain unchanged | Silent |

While a Retry is pending, its button remains mounted and focused, updates in place, exposes `aria-disabled="true"`, and guards repeated activation. After a successful Retry hides that control, focus moves to the selected day button or, if that button is unavailable, the calendar heading.

The package creates empty live regions before they are needed and uses one announcement route for each message. Only a promise-like source result publishes `loading` and renders `aria-busy`; routine loading transitions are not repeatedly announced. A static array or provider-returned array proceeds directly to its terminal state with one full render and no busy interval. `Promise.resolve(events)`, an `async` provider, an already-fulfilled promise, and a custom thenable all retain the two-render asynchronous lifecycle.

An immediate provider throw or invalid direct array completes the operational-error pipeline before the initiating `render()`, navigation, `setEvents()`, or `refetchEvents()` call returns. Promise-like rejection follows the same presentation rules after settlement. For promise-like work, settlement handlers are attached before loading callbacks run, so synchronous callback reentrancy may safely supersede or destroy the pending generation without allowing a stale result to change state or DOM.

"No events" appears only after a successful empty source result. Loading, failed, invalid, and over-limit results never use the empty state.

## Handle programmer errors

| Code | Thrown when | Common examples |
|---|---|---|
| `invalid-configuration` | `createCalendar()` cannot validate and snapshot the host or options | Invalid/reversed date bounds, no renderable month, an explicit out-of-range `initialDate`, unsupported `eventTimeDisplay`, or an invalid `fallbackElement` |
| `invalid-argument` | A live public method receives invalid input | Invalid or out-of-range `gotoDate()` / `focusDate()` input, or a `setEvents()` value that cannot be read and snapshotted as an array or function |
| `invalid-state` | A method is called in an unsupported lifecycle state or cannot claim required DOM ownership | Live-only methods before `render()`, after `destroy()`, or after a fatal transition; `render()` after destroy, on a host owned by another instance, or with an unavailable integration node |

These `LitefoldCalendarError` instances do not invoke `onError`, update `CalendarState.issues`, or render package error UI. Construction failure and a failed render-time host or integration-node claim leave `fallbackElement` unchanged.

An omitted `initialDate` is intentionally different from an invalid explicit value: the date returned by `now` is moved to the nearest in-range date in a renderable month. `getState()` is safe throughout the lifecycle, repeated live `render()` and repeated `destroy()` calls are idempotent, and `destroy()` before render is allowed and terminal.

Catch construction at application startup. Catch method calls when arguments or lifecycle ordering come from uncertain application state. `prev()`, `next()`, `today()`, `focusToday()`, and equivalent package-owned interactions stop or clamp at configured boundaries; only invalid or out-of-range `gotoDate()` / `focusDate()` targets throw. Boundary navigation controls remain focusable with `aria-disabled="true"`, while out-of-range day buttons are natively disabled. Selection bounds do not shrink the event provider's or `CalendarState.range`'s complete 42-day inclusive-start/exclusive-end range. See [date bounds and public method contracts](api.md#control-the-calendar-calendar) for the full behavior.

```ts
import {
	LitefoldCalendarError,
	type Calendar,
	type CalendarDateInput
} from "@tryagaindev/litefold-calendar";

function gotoApplicationDate(
	calendar: Calendar,
	date: CalendarDateInput,
	showApplicationError: (title: string, message: string) => void
): void {
	try {
		calendar.gotoDate(date);
	} catch (error: unknown) {
		if (!(error instanceof LitefoldCalendarError)) {
			throw error;
		}

		showApplicationError(error.userTitle, error.userMessage);
	}
}
```

Use the safe localized `userTitle` and `userMessage`, or application-authored text appropriate to the invalid control. Do not display the diagnostic `message`, `cause`, or stack.

Developer diagnostics identify the relevant option, callback, or event index where possible and describe the expected correction. For example, URL validation requires an HTTP(S) or relative URL, and the context-availability predicate must return a boolean synchronously. Diagnostics do not echo rejected event values. Event validation may expose a bounded `eventIndex`, but the resulting error and `CalendarIssue` never include the rejected event's title, URL, metadata, payload, or raw cause.

## Observe operational failures without taking over

Use `onError` for telemetry, logging, or application diagnostics. Its return value affects presentation only:

| Callback result | Current error accepted into state | Late or stale diagnostic |
|---|---|---|
| `undefined` or `"default"` | Keep package UI and announcement | No presentation exists to change |
| Exact string `"handled"` | Suppress package UI and announcement | No presentation exists to change |
| Any other value, including other truthy values | Keep package UI and announcement | No presentation exists to change |

Once `onError` is configured, it is the diagnostic sink for callbacks that return normally; returning `"default"` does not also call the global error channel. Log or forward the error before returning.

A consumer render-hook failure uses code `render-hook-failed`, phase `render`, and includes its `renderHookId`, hook, and applicable surface. It can enter the partial-render warning flow described above.

A registered extension failure follows the diagnostic-only route even when it occurs during render. The error uses code `extension-failed`, phase `integration`, and includes its `extensionId` and lifecycle `hook`; it does not enter `CalendarState.issues` or disable or degrade the ordinary calendar. For WebMCP registration, `extensionId` is `webmcp` and `hook` is `register`. Correct a name collision or host capability issue, then recreate the calendar if that extension is still required.

```ts
import { createCalendar } from "@tryagaindev/litefold-calendar";

const calendar = createCalendar(host, {
	events: loadEvents,
	onError(error) {
		console.error("Calendar operation failed", {
			code: error.code,
			phase: error.phase,
			recoverable: error.recoverable,
			stale: error.stale
		});

		return "default";
	}
});

calendar.render();
```

`cause` can contain private network or application data. Add it only inside a trusted diagnostic boundary; do not include it in default client telemetry.

The callback is synchronous so ownership is decided before presentation. A returned promise/thenable cannot suppress package UI. It is observed to prevent an unhandled rejection; when it settles, one `AggregateError` containing the original error plus the unsupported callback result or rejection is sent to the global error channel.

## Explicit application ownership

For a current error accepted into state, return the exact string `"handled"` only after synchronously committing persistent visible UI and scheduling an announcement through a live region that existed before the update. No other truthy value suppresses package UI.

`onError` also receives diagnostic-only failures. Do not show application UI just because the callback ran: ignore `stale` errors and explicitly select the error categories your application owns. The example below assumes the existing calendar setup already defines `host` and `loadEvents`. It owns current action failures and leaves source errors with the package because source ownership also requires a custom Retry and recovery flow.

```ts
import {
	createCalendar,
	type LitefoldCalendarError
} from "@tryagaindev/litefold-calendar";

const applicationAlert = document.querySelector<HTMLElement>("#my-application-alert");
const politeRegion = document.querySelector<HTMLElement>("#my-application-status");
const assertiveRegion = document.querySelector<HTMLElement>("#my-application-assertive");

function announceApplicationError(error: LitefoldCalendarError): boolean {
	const politeness = error.severity === "warning" ? "polite" : "assertive";
	const target = politeness === "assertive" ? assertiveRegion : politeRegion;
	const other = politeness === "assertive" ? politeRegion : assertiveRegion;
	if (target === null || other === null) {
		return false;
	}

	other.textContent = "";
	target.textContent = "";
	queueMicrotask(() => {
		target.textContent = `${error.userTitle}. ${error.userMessage}`;
	});
	return true;
}

const calendar = createCalendar(host, {
	events: loadEvents,
	onError(error) {
		if (error.stale || error.code !== "action-failed" ||
			applicationAlert === null || !announceApplicationError(error)) {
			return "default";
		}

		applicationAlert.replaceChildren();
		const heading = document.createElement("strong");
		heading.textContent = error.userTitle;
		const message = document.createElement("span");
		message.textContent = ` ${error.userMessage}`;
		applicationAlert.append(heading, message);
		applicationAlert.hidden = false;

		return "handled";
	},
	onStateChange(state) {
		const hasCurrentActionError = state.phase !== "unavailable" &&
			state.issues.some((issue) => issue.code === "action-failed");
		if (applicationAlert !== null && !hasCurrentActionError) {
			applicationAlert.hidden = true;
			applicationAlert.replaceChildren();
		}
	}
});

calendar.render();
```

The page must create the empty `#my-application-status` (`role="status"`, `aria-live="polite"`) and `#my-application-assertive` (`role="alert"`, `aria-live="assertive"`) regions before the calendar runs, with `aria-atomic="true"` on both. The helper clears both routes synchronously, then schedules the selected region's text update before returning `"handled"`. The visible `#my-application-alert` panel itself should not duplicate that announcement route. A handled warning uses the polite region; a blocking or action failure uses the assertive region. See the [runnable async-errors example](../examples/async-errors/) for source-error ownership with Retry and recovery.

When the application returns `"handled"` for a current error, the package still updates state and diagnostics, but it suppresses its visible panel and live announcement for that error. The application also owns retry/recovery presentation for the handed-off error.

If `onError` throws, the package falls back to its default UI and globally reports one `AggregateError` containing both failures.

## Centralized announcements

Use `onAnnounce` when the page already has one shared live-announcement service:

```ts
const calendar = createCalendar(host, {
	events: loadEvents,
	onAnnounce({ message, politeness }) {
		applicationAnnouncer.say(message, politeness);
	}
});
```

`onAnnounce` must complete synchronously. If it throws or returns a promise/thenable, the package reports `host-integration-failed` through `onError` or the global error channel and sends the original message through its internal live region instead.

The callback replaces only internal live announcements. Visible package UI remains unless `onError` separately returns `"handled"`.

Avoid echoing the same message from both callbacks. `onError` is for diagnostics/ownership; `onAnnounce` is the single alternative announcement route.

## Synchronous callback failures

`onError`, `onAnnounce`, `onStateChange`, and `isEventContextMenuAvailable` are synchronous integration points. Returning a promise does not defer the decision. Every returned thenable is observed so a later rejection does not become unhandled.

If `onStateChange` throws or returns a promise/thenable, the package records and presents `host-integration-failed` without recursively invoking the failed observer. The current immutable snapshot remains available through `getState()`.

`isEventContextMenuAvailable` is synchronous and must return a boolean. If it throws, returns a non-boolean, or returns a thenable, the affected occurrence fails closed and cannot invoke the application context action. The package observes a thenable rejection and reports one recoverable `host-integration-failed` issue rather than repeating a failure for every render. A linked event that is ineligible retains its native browser context menu.

## Error object

```ts
type CalendarErrorDisposition = "default" | "handled";

type CalendarErrorCode =
	| "invalid-configuration"
	| "invalid-argument"
	| "invalid-state"
	| "event-source-failed"
	| "event-data-invalid"
	| "event-limit-exceeded"
	| "extension-failed"
	| "render-hook-failed"
	| "action-failed"
	| "host-integration-failed"
	| "internal-error";
```

The [API reference contains the complete error declarations](api.md#handle-failures-litefoldcalendarerror). `LitefoldCalendarError` extends `Error` and provides immutable structured context:

- `code`, `phase`, and `severity`
- `recoverable` and `stale`
- safe localized `userTitle` and `userMessage`
- applicable request `range`
- diagnostic `message`
- optional event `eventIndex`
- optional method, callback, action, or lifecycle `hook`
- optional render-hook `renderHookId` and `surface`
- optional registered-extension `extensionId`
- original unknown `cause`

`recoverable` means the instance may remain usable or recover after a later valid operation. It does not promise that the failure has built-in Retry UI.

`cause` is for developer diagnostics and can contain sensitive application or network details. Do not display it. Package error presentation and sanitized `CalendarState` never include the raw cause or stack, rejected response/event data, application metadata, `extensionId`, or `renderHookId`.

## Global reporting

When `onError` is absent, the package reports developer-actionable failures through the browser-standard `reportError()` function. On a target without it, the package queues a thrown error so it reaches the global error channel rather than becoming a swallowed rejection.

Expected package-triggered `AbortError` failures are not errors and are neither shown nor reported. A non-abort failure from a superseded request or action is delivered through `onError`, or through the global channel when no handler exists, with `stale: true`. It does not enter `CalendarState.issues`, alter the current view, or produce package UI or announcements. Other failures delivered after their lifecycle can no longer accept presentation are also diagnostic-only without necessarily being marked stale.

Attach a global `error` listener only if your telemetry stack requires it. Do not call `preventDefault()` unless suppressing browser console reporting is intentional.

## Recovery guidance

- Source errors: keep source policy idempotent and make Retry safe to call repeatedly.
- Authentication/authorization failures: throw a diagnostic error, keep tokens and response bodies out of user text, and localize the generic load message through `messages` or application-owned presentation.
- Validation failures: fix the entire source snapshot. The package never displays the valid subset of an invalid response.
- Render-hook failures: recreate the calendar after replacing or removing the failed render-hook set. Quarantine is terminal for that render-hook set on the instance.
- Registered-extension failures: recreate the calendar after replacing or removing the extension. Quarantine is terminal for that extension instance.
- Fatal/internal failures: destroy and recreate after recording diagnostics. Do not manipulate private package DOM to force recovery.
- Application actions: return their promise. A fire-and-forget async action cannot be observed by the calendar.
- Progressive fallback: keep it independent of package error DOM and follow the [canonical lease and visibility lifecycle](api.md#application-integration-options); do not reimplement that lifecycle in application error presentation.

## Accessibility requirements for application ownership

An external handler must provide equivalent behavior:

- Persistent visible text, not a transient toast.
- An assertive announcement only when the failure prevents continuation or an initiated action failed in a way that requires immediate attention; polite announcements for degraded/partial states.
- Text or icon cues in addition to color.
- No focus theft for ordinary asynchronous errors.
- A native Retry button when retry is meaningful.
- Recovery that removes stale error text and announces success after a user-initiated Retry.
- Localized messages with layouts that tolerate text expansion.

These rules follow [WCAG 2.2 status-message requirements](https://www.w3.org/TR/WCAG22/#status-messages), WAI-ARIA [`alert`](https://www.w3.org/TR/wai-aria-1.2/#alert), [`status`](https://www.w3.org/TR/wai-aria-1.2/#status), and [`aria-busy`](https://www.w3.org/TR/wai-aria-1.2/#aria-busy) semantics, and the non-normative [ARIA Authoring Practices alert pattern](https://www.w3.org/WAI/ARIA/apg/patterns/alert/). Developer visibility uses WHATWG [`reportError()`](https://html.spec.whatwg.org/multipage/webappapis.html#runtime-script-errors), and original failures use standard [`Error.cause`](https://tc39.es/ecma262/multipage/fundamental-objects.html#sec-installerrorcause). User output follows [OWASP error-handling guidance](https://owasp.org/www-community/Improper_Error_Handling) by separating safe presentation from diagnostics.

Test the integrated application with its supported screen readers; ARIA alone is not proof of a usable announcement sequence.
