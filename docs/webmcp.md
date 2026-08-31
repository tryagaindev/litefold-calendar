# WebMCP site-tool integration

WebMCP is an experimental browser JavaScript API for exposing structured **site tools** to a compatible user agent. It is not a network transport, a remote MCP server, or a replacement for the calendar's visible interface. The current Web Machine Learning Community Group report is a proposal rather than a W3C Standard or Standards Track specification.

Litefold Calendar's integration is an explicit optional first-party extension. A calendar configured with that extension registers two imperative tools while the instance is rendered and removes them when the instance is destroyed. Applications that do not import the WebMCP subpath keep its implementation outside their import graph. Browsers without the API continue to receive the complete ordinary calendar experience.

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

`webMcp()` validates and snapshots its options synchronously, then returns an opaque reusable `CalendarExtension`. Omit that value from `extensions` when policy disables the integration. Omit the subpath import itself when a build must remove WebMCP code; a runtime condition around a static import controls activation but does not guarantee bundle removal. Enabling the extension on an unsupported browser is a progressive no-op.

With no options, `webMcp()` uses `"litefold-calendar"` as `toolNamePrefix`. A supplied prefix must contain 1 through 117 ASCII letters, digits, `_`, `.`, or `-`. This keeps the longer derived `-get-events` name within WebMCP's 128-character limit. Use a stable name for the calendar's role in the page, not a random or counter-based identifier. Supply distinct explicit prefixes whenever multiple calendars share one document because the tool registry is document-wide. Changing a prefix changes both public tool names, so treat it as an application compatibility contract.

The extension feature-detects `document.modelContext.registerTool`, not the deprecated navigator-scoped predecessor. Browser support must not decide whether exposing calendar data is authorized. If an application needs to explain availability in its own UI, use a guarded feature test that compiles before experimental DOM declarations ship and fails closed on hostile accessors:

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

Treat cursors as opaque and short-lived. Do not inspect or construct them, combine them with `date`, or persist them across calendar recreation. Each cursor is bound to one calendar instance, visible range, range-or-date scope, next offset, and exact usable event snapshot. It remains valid while a same-range refresh or replacement is pending or fails and retained data stays authoritative. A successful refresh or `setEvents()` replacement commit, visible-range navigation, or recreation returns `pagination-stale`; restart with `{}` or `{ date }`.

Litefold Calendar validates continuations against the current snapshot instead of retaining old event payloads. Stale pagination therefore cannot restore superseded or newly unauthorized data.

When `date` is omitted, the tool returns every unique source event whose date span intersects at least one allowed date in that visible range. A multi-day event appears once in this range scope, even when it spans several visible days. Events that fall only on grid dates disabled by `minDate` or `maxDate`, and events entirely outside `state.range`, are excluded. Required source IDs deduplicate occurrences of the same source event across dates while preserving distinct events whose presentation-safe fields happen to match; IDs are never returned. In each result event, `end` is exclusive and is `null` when the source omitted it. The successful result uses `date: null` to identify this range scope; `null` is not accepted as an input value, so omit the property instead.

Grid density, overflow, agenda paging, and agenda DOM limits affect presentation but do not remove otherwise eligible source events from `get-events`. Applications must enforce authorization and intentional visibility in the event source itself rather than treating a visual rendering limit as a privacy filter.

When `date` is supplied, the tool returns events intersecting that allowed date, including multi-day events. An allowed date with no matching events returns a successful empty page. A disabled date inside the rendered grid is likewise excluded rather than disclosing events outside the configured bounds. A date outside `state.range` fails without loading another range.

A current or retained usable snapshot returns `ok: true`, the numeric total, and the bounded page. While the current visible range has no loaded snapshot, it instead returns `ok: false` with error code `date-not-loaded`; an unavailable calendar with no usable snapshot returns `calendar-unavailable`. It never presents an unloaded range as an empty schedule. `navigate` is not read-only and returns no event content: it uses the same bounds, source cancellation, validation, failure, and stale-result rules as the public navigation methods, and waits for its own resulting source generation before returning. A destination load that ends unavailable also returns `calendar-unavailable`.

Each navigation load is classified by its source value. A configured static array or an array returned directly by a provider commits its terminal state synchronously with one full render and no `loading` state or `aria-busy`. Any PromiseLike—including `Promise.resolve(...)`, an `async` function result, or a custom thenable—uses a loading render followed by a terminal render. Litefold Calendar invokes a provider before loading callbacks run and attaches PromiseLike handlers before those callbacks; `onStateChange` runs before the corresponding DOM replacement. The tool still waits for its own generation and returns the committed result in either case.

Every handled failure is a stable `{ ok: false, error: { code, message }, state }` envelope. Raw causes are never returned.

| Code | Meaning |
| --- | --- |
| `invalid-input` | The input is malformed, has an extra or symbol field, combines `date` with `cursor`, contains a malformed or unsupported cursor, or explicitly targets a date outside configured or renderable bounds. Previous/next at a boundary and Today outside the configured bounds are successful no-ops with `changed: false`. |
| `date-outside-visible-range` | `get-events` requested a date outside the current 42-day range, or the calendar has no visible range. The tool does not fetch or navigate to satisfy the read. |
| `date-not-loaded` | The current visible range has no current or retained usable snapshot yet. |
| `calendar-unavailable` | The instance is torn down or fatal, has no usable snapshot, or could not load the requested navigation destination. |
| `navigation-superseded` | A later WebMCP or ordinary calendar navigation became authoritative before this navigation settled. |
| `pagination-stale` | A well-formed continuation belongs to another instance, range, scope, or event snapshot, or names a page that cannot exist. Restart `get-events` without a cursor. |

Canceling an execution rejects it with `AbortError` and stops waiting. A usable caller-provided `ToolExecuteCallbackOptions.signal` is authoritative. As a defensive interoperability fallback, an omitted or malformed execution-options value uses the extension lifecycle signal instead, so destroy or fatal teardown still cancels the operation. Cancellation does not undo navigation that already committed. Teardown also aborts any pending navigation wait, including teardown that occurs synchronously inside the navigation call before a waiter can be installed.

Neither tool activates an event, selects an application command, follows a link, invokes `onDaySelect`, invokes an event or context-action callback, edits data, or bypasses application authorization. Ordinary state observation and event-source lifecycle callbacks still run for a committed navigation, just as they do for the equivalent public method. Tool results omit event identifiers, URLs, metadata, raw errors, and render-hook content. They expose only the bounded normalized fields required to understand the visible schedule.

Litefold Calendar supports only imperative top-level registration through `document.modelContext.registerTool`. It does not use the deprecated navigator-scoped predecessor, declarative tools, cross-origin `exposedTo`, consumer APIs such as `getTools()` or `executeTool()`, or a WebMCP polyfill.

The [public API reference](api.md#webmcp-extension) owns the exported factory and option shape. The [first-party extension guide](first-party-extensions.md) owns composition and bundle behavior. The [application integration guide](integration-guide.md#webmcp-site-tools) shows how to assign prefixes in a page that may host more than one calendar.

## Lifecycle and fallback

Extension activation begins only after a calendar successfully claims and initially renders its host. With a direct initial array, WebMCP activates after the synchronous terminal render and receives one queued delivery of that terminal state. With an initial PromiseLike, it activates after the loading render; that loading state is not replayed, and the extension receives the later terminal state. The two registration calls are sequential because WebMCP has no atomic batch API, and both share the extension lifetime `AbortSignal`. Destroying the instance aborts that signal, removes both registrations, and leaves lifecycle guards so a stale tool cannot act through the destroyed calendar. An observed registration rejection also aborts the shared signal, rolling back both registrations where the host honors it. WebMCP provides no registration timeout, so Litefold Calendar cannot make a never-settling `registerTool()` call atomic or time it out.

Tool-name conflicts fail closed without replacing another site's or calendar instance's registration. A registration rejection is reported through `onError` as diagnostic-only `extension-failed` with `extensionId: "webmcp"`, `hook: "register"`, and phase `integration`, or through the global error channel when no observer exists. It does not add an issue to `CalendarState` or disable the UI. Keep prefixes unique and recreate the calendar with a corrected prefix rather than manipulating `document.modelContext` behind the package.

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

Compatibility snapshot checked **2026-08-28**:

- The [WebMCP Community Group report](https://webmachinelearning.github.io/webmcp/) defines the current `document.modelContext` API. It is experimental and may change.
- [Chrome's WebMCP guidance](https://developer.chrome.com/docs/ai/webmcp) documents an origin trial beginning in version 149 and an experimental flag for local development. Chrome also requires an origin-isolated document and gates WebMCP with the `tools` Permissions Policy, which defaults to `self`. [Microsoft Edge's separate origin trial](https://developer.microsoft.com/en-us/microsoft-edge/origin-trials/trials/0b76fe60-b266-458e-a285-04e375c0c31a) is active through November 17, 2026. Treat these as trial availability rather than a browser-support guarantee and feature-detect in every browser.
- The [ChatGPT WebMCP documentation](https://learn.chatgpt.com/docs/webmcp) describes site-tool availability in ChatGPT desktop's built-in browser. Current support is for top-level imperative tools; declarative form tools and iframe tools are not supported. Availability can also depend on rollout, workspace policy, and selected model.

Do not make WebMCP a required browser capability or infer availability from the browser brand alone. Use the guarded feature test above.

To exercise a deployed page, use one of these experimental routes:

- Open the top-level page in ChatGPT desktop's built-in browser under a workspace and model where site tools are available, then ask ChatGPT or Codex to read or navigate the named calendar. Do not put the calendar in an iframe.
- Enroll the application origin in the Chrome or Edge trial, or follow Chrome's linked local-testing guidance to enable its experimental flag. For Chrome, also satisfy its origin-isolation and Permissions Policy requirements. Reload the page and confirm the exact feature test returns `true` before expecting registrations.

For application verification:

1. Verify the ordinary calendar still works when the extension is omitted and when `document.modelContext` is absent.
2. With a controlled model-context fixture, verify unique tool names, registration, first-page and cursor requests, rejected malformed input, execution with omitted callback options, caller-signal precedence, and cleanup after `destroy()`.
3. Confirm `get-events` never changes calendar state, exposes no IDs, URLs, metadata, old snapshot data, or raw errors, and returns `pagination-stale` after its bound snapshot changes.
4. Confirm `navigate` changes only the requested calendar view, preserves normal loading and error UI, never invokes application activation callbacks, and aborts pending execution on teardown.
5. Exercise the deployed page in an enabled ChatGPT desktop browser or origin trial; an experimental flag is not the package's general compatibility baseline.

Package contributors can find exhaustive edge-case coverage in [`calendar-webmcp.test.ts`](../tests/calendar-webmcp.test.ts), [`calendar-webmcp-cursors.test.ts`](../tests/calendar-webmcp-cursors.test.ts), and the [browser smoke test](../tests/e2e/webmcp.spec.js).

[Back to the documentation hub](README.md)
