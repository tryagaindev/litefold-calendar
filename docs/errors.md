# Error handling

litefold-calendar owns presentation for current operational errors by default while an instance owns a rendered host. Invalid configuration, public arguments, and lifecycle ordering are programmer errors that throw synchronously instead. Applications can observe current and diagnostic-only late or stale runtime failures without accidentally hiding active errors and can explicitly opt into full presentation ownership when needed.

## Default behavior

Persistent status/error UI appears after the toolbar and before the grid. It does not auto-dismiss, steal focus, reveal raw failure details, or depend on color alone.

| Failure | Visible behavior | Announcement |
|---|---|---|
| Initial/current-range source, validation, or limit failure | Error title, safe message, Retry | Assertive |
| Failed same-range refresh with retained events | Stale-data warning and Retry; prior events remain | Polite |
| Rejected current event/day action | Persistent action error | Assertive |
| Failed extension hook | Partial-details warning; built-in UI remains | Polite |
| Failed or invalid context-availability predicate | Context action fails closed; one recoverable integration issue | Polite |
| Fatal internal failure | Generic unavailable fallback | Assertive |
| Successful user-initiated Retry | Resolved issue is removed | Polite recovery message |
| Superseded request aborted by the package | No error | Silent |
| Late failure that can no longer enter active presentation | Diagnostic only; current state and UI remain unchanged | Silent |

Retry remains in the document while retrying, exposes `aria-disabled="true"`, guards repeated activation, and updates in place. Focus stays on the initiating control. After recovery, focus moves only if that control was removed; the selected day or calendar heading is the fallback.

The package creates empty live regions before they are needed and uses one announcement route for each message. Loading is represented by `aria-busy`; routine loading transitions are not repeatedly announced.

“No events” is rendered only after a successful empty source result. It is never used as a substitute for loading, failure, invalid data, or an over-limit response.

## Handle programmer errors

Invalid host/options throw `invalid-configuration` before generated DOM is committed. Invalid or reversed `minDate` / `maxDate` values, a range with no renderable month, an explicitly supplied `initialDate` that is out of range or unrenderable, an unsupported `eventTimeDisplay` value, or a structurally invalid/cross-document/host-descendant `fallbackElement` are configuration errors; an omitted `initialDate` instead resolves the date produced by `now` to the nearest in-range date in a renderable month. Invalid date arguments and out-of-range `gotoDate()` / `focusDate()` targets throw `invalid-argument`; `setEvents()` also uses `invalid-argument` when its top-level value cannot be inspected and snapshotted as an array or function. Navigation, refetch, and event-replacement methods that require a live rendered instance throw `invalid-state` before `render()`, after `destroy()`, or after a fatal unavailable transition; `render()` also throws `invalid-state` when called after destroy, against an already-owned host, or when it cannot claim an already leased/unavailable integration node. `getState()` remains safe throughout the lifecycle, repeated live `render()` and repeated `destroy()` calls are idempotent, and `destroy()` before render is allowed. These synchronous `LitefoldCalendarError` instances do not invoke `onError`, update `CalendarState.issues`, or render package error UI. Construction failure and a failed host claim leave the fallback unchanged.

Catch construction at the application bootstrap boundary. Catch method calls when their arguments or lifecycle ordering come from uncertain application state. Package-owned Previous, Next, Today, swipe, keyboard, day-button, and month-and-year picker interaction never turns a configured boundary into an error: it quietly stops or clamps. Boundary navigation controls remain focusable with `aria-disabled="true"` and guarded no-op activation; out-of-range day buttons are natively disabled. Partial boundary months remain usable. These inclusive selection bounds do not clip an event provider's or `CalendarState.range`'s complete 42-day inclusive-start/exclusive-end range.

```ts
try {
	calendar.gotoDate(applicationDate);
} catch (error: unknown) {
	if (!(error instanceof LitefoldCalendarError)) {
		throw error;
	}

	showApplicationError(error.userTitle, error.userMessage);
}
```

Use the safe localized `userTitle` and `userMessage`, or application-authored text appropriate to the invalid control. Do not display the diagnostic `message`, `cause`, or stack.

Developer diagnostics identify the exact option or event field and the expected correction—for example, a synchronous availability predicate or an HTTP(S)/relative URL—without echoing event values. Event validation may expose a bounded `eventIndex` for trusted diagnostics, but never copies the title, URL, metadata, payload, or raw cause into package DOM or sanitized state.

## Observe operational failures without taking over

Use `onError` for telemetry, logging, or application diagnostics. For a current error accepted into state, returning nothing—or returning `"default"`—keeps the package UI and live announcement. A stale diagnostic is still delivered to this callback, but it has no package presentation to preserve or suppress.

```ts
const calendar = createCalendar(host, {
	events: loadEvents,
	onError(error) {
		telemetry.capture({
			code: error.code,
			phase: error.phase,
			recoverable: error.recoverable,
			cause: error.cause
		});

		return "default";
	}
});
```

The callback is synchronous so ownership is decided before presentation. A returned promise/thenable is unsupported, cannot suppress package UI, and is observed so a later rejection does not become unhandled. The original error and integration failure are reported together through one `AggregateError` on the global error channel.

## Explicit application ownership

For a current error accepted into state, return the exact string `"handled"` only after synchronously committing persistent visible UI and scheduling an announcement through a live region that existed before the update. No other truthy value suppresses package UI. Returning a disposition for a stale diagnostic has no presentation effect because stale work never enters the issue-presentation pipeline.

```ts
const applicationAlert = document.querySelector<HTMLElement>("#application-alert");
const politeRegion = document.querySelector<HTMLElement>("#application-status");
const assertiveRegion = document.querySelector<HTMLElement>("#application-assertive");

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
		if (applicationAlert === null || !announceApplicationError(error)) {
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
	}
});
```

The page must create the empty `#application-status` (`role="status"`) and `#application-assertive` (`role="alert"`) regions before the calendar runs. The visible `#application-alert` panel itself should not duplicate that announcement route. A handled warning uses the polite region; a blocking or action failure uses the assertive region.

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

`onAnnounce` is synchronous and must complete its handoff before returning. A thrown error or returned promise/thenable is a `host-integration-failed` error. The package observes that failure through `onError` or the global error channel and sends the original message through its internal live region instead. It also observes a returned promise's rejection so the application does not create an unhandled rejection.

The callback replaces only internal live announcements. Visible package UI remains unless `onError` separately returns `"handled"`.

Avoid echoing the same message from both callbacks. `onError` is for diagnostics/ownership; `onAnnounce` is the single alternative announcement route.

## State observation failures

`onStateChange` is also synchronous. If it throws or returns a promise/thenable, the package records and presents a `host-integration-failed` issue through the normal error path without recursively invoking the failed observer. The current immutable snapshot remains available through `getState()`. A returned promise is observed to prevent an unhandled rejection, but its eventual fulfillment does not make the asynchronous observer supported.

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
	| "action-failed"
	| "host-integration-failed"
	| "internal-error";
```

`LitefoldCalendarError` extends `Error` and provides immutable structured context:

- `code`, `phase`, and `severity`
- `recoverable` and `stale`
- safe localized `userTitle` and `userMessage`
- applicable request `range`
- diagnostic `message`
- optional event `eventIndex`
- optional extension `extensionId`, `hook`, and `surface`
- original unknown `cause`

`recoverable` means the instance may remain usable or recover after a later valid operation. It does not promise that the failure has built-in Retry UI.

`cause` is for developer diagnostics and can contain sensitive application or network details. Do not display it. The package never copies the cause, stack, URL, response payload, metadata, or extension ID into user-facing DOM or sanitized `CalendarState`.

## Global reporting

When `onError` is absent, the package reports developer-actionable failures through the browser-standard `reportError()` function. On a target without it, the package queues a thrown error so it reaches the global error channel rather than becoming a swallowed rejection.

Expected package-triggered `AbortError` failures are not errors and are neither shown nor reported. A non-abort failure from a superseded request or action is delivered through `onError`, or through the global channel when no handler exists, with `stale: true`. It does not enter `CalendarState.issues`, alter the current view, or produce package UI or announcements. Other failures delivered after their lifecycle can no longer accept presentation are also diagnostic-only without necessarily being marked stale.

Attach a global `error` listener only if your telemetry stack requires it. Do not call `preventDefault()` unless suppressing browser console reporting is intentional.

## Recovery guidance

- Source errors: keep source policy idempotent and make Retry safe to call repeatedly.
- Authentication/authorization failures: return or throw a safe application error; keep private response details in telemetry.
- Validation failures: fix the entire source snapshot. The package never displays the valid subset of an invalid response.
- Extension failures: recreate the calendar after replacing or removing the extension. Quarantine is terminal for that extension instance.
- Fatal/internal failures: destroy and recreate after recording diagnostics. Do not manipulate private package DOM to force recovery.
- Application actions: return their promise. A fire-and-forget async action cannot be observed by the calendar.
- Progressive fallback: keep it independent of package error DOM. Initial loading leaves it unchanged; usable data hides it; retained-data degradation keeps it hidden; unavailable/fatal state with no usable snapshot and destroy restore its original hidden state while the package still manages the current value; retry success hides it again. Package writes are skipped while an application `hidden` mutation differs from the package's last value, and destroy preserves that differing value.

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
