# WebMCP site-tool integration

WebMCP is an experimental browser JavaScript API for exposing structured **site tools** to a compatible user agent. It is not a network transport, a remote MCP server, or a replacement for the calendar's visible interface. The current Web Machine Learning Community Group report is a proposal rather than a W3C Standard or Standards Track specification.

In Litefold Calendar, WebMCP is an optional first-party extension that you must enable explicitly.
A calendar with the extension registers two imperative tools while rendered and
removes them when destroyed. Applications that do not import the WebMCP subpath
keep its implementation outside their import graph. Browsers without the API
still receive the complete ordinary calendar experience.

## Enable site tools

Make the opt-in decision in application or server policy, then configure the extension through its explicit subpath. Do not use browser support as the authorization decision. The following snippet assumes `host` and the authorized `events` array or provider are already set up for the ordinary calendar:

```js
import { createCalendar } from "@tryagaindev/litefold-calendar";
import { webMcp } from "@tryagaindev/litefold-calendar/extensions/webmcp";

const myWebMcpEnabled = host.dataset.myWebMcpEnabled === "true";

const calendar = createCalendar(host, {
	events,
	extensions: myWebMcpEnabled
		? [webMcp({ toolNamePrefix: "my-schedule" })]
		: []
});

calendar.render();
```

`webMcp()` validates and snapshots its options synchronously, then returns an
opaque reusable `CalendarExtension`.

- When policy disables the integration, omit that value from `extensions`.
- When a build must exclude WebMCP code, omit the subpath import itself.
  A runtime condition around a static import controls activation but does not
  guarantee bundle removal.
- On an unsupported browser, enabling the extension is a progressive no-op.

With no options, `webMcp()` uses `"litefold-calendar"` as `toolNamePrefix`.
A supplied prefix must contain 1 through 117 ASCII letters, digits, `_`, `.`, or
`-`. This keeps the longer derived `-get-events` name within WebMCP's
128-character limit.

Use a stable name for the calendar's role in the page, not a random or
counter-based identifier. The tool registry is document-wide, so calendars in
the same document need distinct explicit prefixes. Changing a prefix changes
both public tool names; treat it as an application compatibility contract.

The extension feature-detects only `document.modelContext.registerTool`.
Browser support must not decide whether exposing calendar data is authorized.
If an application needs to explain availability in its own UI, use a guarded
feature test that compiles before experimental DOM declarations ship and fails
closed on hostile accessors:

```ts
function hasWebMcpSupport(document: Document): boolean {
	try {
		const modelContext: unknown = Reflect.get(document, "modelContext");
		return typeof modelContext === "object" && modelContext !== null &&
			typeof Reflect.get(modelContext, "registerTool") === "function";
	} catch {
		return false;
	}
}
```

## Registered tools

For a prefix of `my-schedule`, Litefold Calendar registers `my-schedule-get-events` and `my-schedule-navigate`.

| Tool | Access and side effects | Input | Result |
| --- | --- | --- | --- |
| `<prefix>-get-events` | Read-only | For a first page, `{}` or exactly `{ date }` with a strict date. For a continuation, exactly `{ cursor }` using the opaque string returned by the preceding page. | `{ ok: true, date, offset, totalEvents, nextCursor, events, state }`, where `date` is the requested string or `null` for range scope, `nextCursor` is an opaque string or `null`, and `events` contains at most 10 `{ title, start, end, isAllDay }` objects, or the failure envelope below |
| `<prefix>-navigate` | Changes visible calendar state and may invoke the configured event source | Exactly `{ target: "date", date }` or `{ target: "today" | "previous-month" | "next-month" }` | `{ ok: true, changed, state }`, where `changed` means the selected civil date changed—not merely that navigation was attempted—or the failure envelope below |

`get-events` is annotated read-only and marks its returned event content as untrusted because titles originate in application data. It reads only the current or retained loaded snapshot and never fetches or navigates. `totalEvents` counts the complete filtered result before paging, and `state.range` supplies the inclusive-start/exclusive-end bounds of the loaded 42-day range.

### Paginate `get-events`

The page size is fixed at 10:

1. Start range paging with `{}`, or day paging with `{ date: "2026-08-06" }`. The first result has `offset: 0`.
2. When `nextCursor` is a string, request the next page with `{ cursor: result.nextCursor }` and no other property.
3. Stop when `nextCursor` is `null`.

Treat cursors as opaque and short-lived. Do not inspect or construct them,
combine them with `date`, or persist them across calendar recreation. Each cursor
is bound to one calendar instance, visible range, range-or-date scope, next
offset, and exact usable event snapshot.

#### When cursors expire

| Change since the preceding page | Cursor behavior |
| --- | --- |
| A same-range refresh or replacement is pending or fails, and retained data stays authoritative | The cursor remains valid. |
| A successful refresh or `setEvents()` replacement commits | The cursor returns `pagination-stale`. |
| Visible-range navigation or calendar recreation | The cursor returns `pagination-stale`. |

After `pagination-stale`, restart with `{}` or `{ date }`.

Litefold Calendar validates continuations against the current snapshot instead of retaining old event payloads. Stale pagination therefore cannot restore superseded or newly unauthorized data.

### Choose range or date scope

Omit `date` to query the visible range. The result includes every unique source
event whose date span intersects at least one allowed date in that range:

- A multi-day event appears once, even when it spans several visible days.
- Events are excluded if they fall only on dates disabled by `minDate` or
  `maxDate`, or entirely outside `state.range`.
- Required source IDs deduplicate occurrences of the same source event across
  dates. Distinct events remain distinct even when their presentation-safe fields
  match. IDs are never returned.
- Each result event's `end` is exclusive. It is `null` when the source omitted it.

A successful range result uses `date: null`. This is an output value only:
`null` is not accepted as input, so omit the property to request range scope.

Grid density, overflow, agenda paging, and agenda DOM limits affect presentation but do not remove otherwise eligible source events from `get-events`. Applications must enforce authorization and intentional visibility in the event source itself rather than treating a visual rendering limit as a privacy filter.

When `date` is supplied, the tool returns events intersecting that allowed date, including multi-day events. An allowed date with no matching events returns a successful empty page. A disabled date inside the rendered grid is likewise excluded rather than disclosing events outside the configured bounds. A date outside `state.range` fails without loading another range.

### Distinguish empty data from unavailable data

| Snapshot available for the current visible range | Result |
| --- | --- |
| Current or retained usable snapshot | `ok: true`, the numeric total, and the bounded page |
| No current or retained loaded snapshot yet | `ok: false` with `date-not-loaded` |
| Unavailable calendar with no usable snapshot | `ok: false` with `calendar-unavailable` |

An unloaded range is never presented as an empty schedule.

### Navigate to another range

`navigate` changes calendar state and returns no event content. It uses the same
bounds, source cancellation, validation, failure, and stale-result rules as the
public navigation methods. It waits for its own resulting source generation
before returning. A destination load that ends unavailable returns
`calendar-unavailable`.

Navigation uses the normal public navigation and event-source lifecycle, then
returns the state committed by its own generation. See the
[API lifecycle contract](api.md#source-timing-and-renders) for exact
source timing and callback order.

### Handle tool failures and cancellation

Every handled failure is a stable `{ ok: false, error: { code, message }, state }` envelope. Raw causes are never returned.

| Code | Meaning |
| --- | --- |
| `invalid-input` | The input is malformed, has an extra or symbol field, combines `date` with `cursor`, contains a malformed or unsupported cursor, or explicitly targets a date outside configured or renderable bounds. Previous/next at a boundary and Today outside the configured bounds are successful no-ops with `changed: false`. |
| `date-outside-visible-range` | `get-events` requested a date outside the current 42-day range, or the calendar has no visible range. The tool does not fetch or navigate to satisfy the read. |
| `date-not-loaded` | The current visible range has no current or retained usable snapshot yet. |
| `calendar-unavailable` | The instance is torn down or fatal, has no usable snapshot, or could not load the requested navigation destination. |
| `navigation-superseded` | A later WebMCP or ordinary calendar navigation became authoritative before this navigation settled. |
| `pagination-stale` | A well-formed continuation belongs to another instance, range, scope, or event snapshot, or names a page that cannot exist. Restart `get-events` without a cursor. |

Canceling an execution rejects it with `AbortError` and stops waiting. A usable
caller-provided `ToolExecuteCallbackOptions.signal` is authoritative. If execution
options are omitted or malformed, the extension lifecycle signal provides a
defensive interoperability fallback. Destroy or fatal teardown can therefore
still cancel the operation.

Cancellation does not undo navigation that already committed. Teardown also
aborts a pending navigation wait. This includes teardown that occurs
synchronously inside the navigation call, before a waiter can be installed.

Neither tool activates an event, selects an application command, follows a link, invokes `onDaySelect`, invokes an event or context-action callback, edits data, or bypasses application authorization. Ordinary state observation and event-source lifecycle callbacks still run for a committed navigation, just as they do for the equivalent public method. Tool results omit event identifiers, URLs, metadata, raw errors, and render-hook content. They expose only the bounded normalized fields required to understand the visible schedule.

Litefold Calendar supports imperative registration through
`document.modelContext.registerTool`. It does not provide declarative tools,
cross-origin exposure configuration, consumer-side tool execution APIs, or a
WebMCP polyfill.

See the [public API reference](api.md#webmcp-extension) for the exported factory
and options, and the [extension API](api.md#configure-first-party-extensions) for
composition and bundle behavior. The
[application integration guide](integration-guide.md#webmcp-site-tools) shows how
to assign prefixes when a page may host more than one calendar.

## Lifecycle and fallback

Extension activation begins only after the calendar successfully claims and
initially renders its host.

| Initial source result | WebMCP activation and state delivery |
| --- | --- |
| Direct array | Activates after the synchronous terminal render, then receives one queued delivery of that terminal state. |
| PromiseLike | Activates after the loading render. That loading state is not replayed; the extension receives the later terminal state. |

The two registration calls run sequentially because WebMCP has no atomic batch
API. Both share the extension lifetime `AbortSignal`.

- Destroying the instance aborts that signal and removes both registrations.
  Lifecycle guards prevent a stale tool from acting through the destroyed calendar.
- An observed registration rejection also aborts the shared signal. This rolls
  back both registrations where the host honors it.
- WebMCP provides no registration timeout. Litefold Calendar cannot make a
  never-settling `registerTool()` call atomic or time it out.

Tool-name conflicts fail closed. They never replace another site's or calendar
instance's registration.

A registration rejection is diagnostic only. It is reported through `onError`
with code `extension-failed`, `extensionId: "webmcp"`, `hook: "register"`, and phase
`integration`. If no observer exists, it uses the global error channel. It does
not add an issue to `CalendarState` or disable the UI.

Keep prefixes unique. To correct a prefix, recreate the calendar instead of
manipulating `document.modelContext` behind the package.

The ordinary UI remains authoritative and usable at all times. Unsupported WebMCP environments, registration failures, tool invocation failures, or an agent choosing not to use a tool must not remove navigation controls, alter keyboard behavior, hide errors, or suppress progressive fallback content.

## Privacy and security

Enabling site tools creates an additional structured disclosure path from the signed-in document to the configured browser agent and its provider. Before opting in, confirm that this recipient is allowed to receive every event in the allowed portion of the loaded 42-day range, including each returned title plus raw normalized `start`, `end`, and `isAllDay` value. Same-origin controls which document registers the tools; it does not guarantee where an agent or model processes returned data. `eventTimeDisplay` controls visual presentation only; choosing `"grid"`, `"agenda"`, or `"none"` does not remove start/end civil values from `get-events`.

- Apply the same authentication, authorization, tenant isolation, and event-source filtering used for the visible calendar. WebMCP grants no new server permission.
- Treat every tool argument as untrusted. Litefold Calendar revalidates dates, opaque cursor fields and snapshot binding, navigation targets, lifecycle state, and configured bounds instead of trusting the agent.
- Treat returned event titles as untrusted content even though Litefold Calendar supplies structured JSON rather than executable markup.
- Do not place secrets or sensitive application payloads in event titles. Metadata, URLs, identifiers, diagnostic causes, and render-hook content are deliberately excluded from tool results.
- Remember that navigation can fetch another permitted month through the configured event source. Keep source requests bounded, abort-aware, authorization-aware, and safe to repeat.
- A pending or failed same-range refresh deliberately retains the last usable snapshot and its cursors. If an authorization change requires immediate revocation, destroy and recreate the calendar with the newly authorized source—and omit the extension until that policy permits disclosure—instead of relying on a failed refresh to remove old data.
- Preserve the visible interface and normal review path for consequential application actions. Litefold Calendar's tools intentionally provide no create, edit, delete, link-following, or callback-activation operation.

The repository [security model](security-model.md) covers the model/tool trust boundary and residual risks. Report a realistic disclosure, stale-registration, collision, validation, or authorization bypass privately under the [security policy](../SECURITY.md).

## Compatibility and testing

WebMCP is experimental, and availability belongs to the target browser or host
policy rather than this package:

| Observed situation | Integration response |
| --- | --- |
| `document.modelContext.registerTool` is absent, inaccessible, or policy-blocked | Treat the extension as an unavailable no-op and keep the ordinary calendar path complete. |
| The feature test succeeds | Verify registration, tool execution, and teardown in that exact host; API presence alone is not disclosure authorization. |
| The calendar is embedded | Verify the target host's current iframe, origin-isolation, and `tools` Permissions Policy before relying on exposure. Do not infer support from the top-level browser. |
| The integration is production-bound | Recheck the [WebMCP Community Group report](https://webmachinelearning.github.io/webmcp/) and the target implementation's current requirements, such as [Chrome's WebMCP guidance](https://developer.chrome.com/docs/ai/webmcp). |

Do not make WebMCP a required browser capability or infer availability from a
browser brand, release number, workspace, or model. Use the guarded feature
test above.

To exercise a deployed page, open it in the exact target host and context,
satisfy that host's current origin and policy requirements, then confirm the
feature test returns `true` before expecting registrations. Repeat the
unavailable-host path as a first-class test.

For application verification:

1. Verify the ordinary calendar still works when the extension is omitted and when `document.modelContext` is absent.
2. With a controlled model-context fixture, verify unique tool names, registration, first-page and cursor requests, rejected malformed input, execution with omitted callback options, caller-signal precedence, and cleanup after `destroy()`.
3. Confirm `get-events` never changes calendar state, exposes no IDs, URLs, metadata, old snapshot data, or raw errors, and returns `pagination-stale` after its bound snapshot changes.
4. Confirm `navigate` changes only the requested calendar view, preserves normal loading and error UI, never invokes application activation callbacks, and aborts pending execution on teardown.
5. Exercise the deployed page in the exact enabled host and embedded or
   top-level context the application will use; local experimental settings are
   not the package's general compatibility baseline.

Package contributors can find exhaustive edge-case coverage in [`calendar-webmcp.test.ts`](../tests/calendar-webmcp.test.ts), [`calendar-webmcp-cursors.test.ts`](../tests/calendar-webmcp-cursors.test.ts), and the [browser smoke test](../tests/e2e/webmcp.spec.js).

[Back to the documentation hub](README.md)
