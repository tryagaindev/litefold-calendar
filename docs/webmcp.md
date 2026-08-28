# WebMCP site-tool integration

WebMCP is an experimental browser JavaScript API for exposing structured **site tools** to a compatible user agent. It is not a network transport, a remote MCP server, or a replacement for the calendar's visible interface. The current Web Machine Learning Community Group report is a proposal rather than a W3C Standard or Standards Track specification.

Litefold's integration is explicit and off by default. An enabled calendar registers two imperative tools while the instance is rendered, and removes them when the instance is destroyed. Browsers without the API continue to receive the complete ordinary calendar experience.

## Enable site tools

Make the opt-in decision in application or server policy, then give each enabled calendar a stable, application-owned prefix. For example, a server-rendered data attribute can control the additional disclosure path without changing the ordinary calendar:

```js
import { createCalendar } from "@tryagaindev/litefold-calendar";

const webMcpEnabled = host.dataset.webMcpEnabled === "true";

const calendar = createCalendar(host, {
	events,
	webMcp: webMcpEnabled
		? { toolNamePrefix: "team-schedule" }
		: false
});

calendar.render();
```

The package feature-detects `document.modelContext.registerTool`, not the deprecated navigator-scoped predecessor. Omit `webMcp`, or set it to `false` when policy disables the integration; `true` is intentionally rejected because every enabled instance needs an explicit name. Enabling the option on an unsupported browser is a progressive no-op. An application that needs to explain browser availability in its own UI may use `typeof document.modelContext?.registerTool === "function"`; browser support must not decide whether exposing calendar data is authorized.

`toolNamePrefix` must contain 1 through 117 ASCII letters, digits, `_`, `.`, or `-`. This keeps the longer derived `-get-events` name within WebMCP's 128-character limit. Use a stable name for the calendar's role in the page, not a random or counter-based identifier. Each enabled instance needs a distinct prefix because the tool registry is document-wide. Treat names as an application compatibility contract: changing a prefix changes both registered tool names.

## Registered tools

For a prefix of `team-schedule`, Litefold registers `team-schedule-get-events` and `team-schedule-navigate`.

| Tool | Access and side effects | Input | Result |
| --- | --- | --- | --- |
| `<prefix>-get-events` | Read-only | An object with optional strict `date` and optional nonnegative integer `offset` (defaults to `0`); no other fields. Omit `date` for the current visible range or supply it to filter one day. | `{ ok: true, dataAvailable, date, offset, totalEvents, nextOffset, events, state }`, where `date` is the requested string or `null` for range scope and `events` contains at most 10 `{ title, start, end, isAllDay }` objects, or the failure envelope below |
| `<prefix>-navigate` | Changes visible calendar state and may invoke the configured event source | Exactly `{ target: "date", date }` or `{ target: "today" | "previous-month" | "next-month" }` | `{ ok: true, changed, state }`, or the failure envelope below |

`get-events` is annotated read-only and marks its returned event content as untrusted because titles originate in application data. It reads only the current or retained loaded snapshot and never fetches or navigates. The fixed page size is 10; callers continue with `nextOffset` when it is non-null. `totalEvents` counts the complete filtered result before paging, and `state.range` supplies the inclusive-start/exclusive-end bounds of the loaded 42-day range.

When `date` is omitted, the tool returns every unique source event whose date span intersects at least one allowed date in that visible range. A multi-day event appears once in this range scope, even when it spans several visible days. Events that fall only on grid dates disabled by `minDate` or `maxDate`, and events entirely outside `state.range`, are excluded. Distinct source events remain distinct when their presentation-safe `title`, `start`, `end`, and `isAllDay` fields happen to be identical; internal IDs preserve that identity during collection but are never returned. The successful result uses `date: null` to identify this range scope; `null` is not accepted as an input value, so omit the property instead.

Grid density, overflow, agenda paging, and agenda DOM limits affect presentation but do not remove otherwise eligible source events from `get-events`. Applications must enforce authorization and intentional visibility in the event source itself rather than treating a visual rendering limit as a privacy filter.

When `date` is supplied, the tool returns events intersecting that allowed date, including multi-day events. An allowed date with no matching events returns a successful empty page. A disabled date inside the rendered grid is likewise excluded rather than disclosing events outside the configured bounds. A date outside `state.range` fails without loading another range.

A current or retained usable snapshot returns `ok: true`, `dataAvailable: true`, the numeric total, and the bounded page. While the current visible range has no loaded snapshot, it instead returns `ok: false` with error code `date-not-loaded`; an unavailable calendar with no usable snapshot returns `calendar-unavailable`. It never presents an unloaded range as an empty schedule. `navigate` is not read-only and returns no event content: it uses the same bounds, lifecycle, source cancellation, validation, loading, failure, and stale-result rules as the public navigation methods, and waits for its own resulting source generation before returning. A destination load that ends unavailable also returns `calendar-unavailable`.

Every handled failure is a stable `{ ok: false, error: { code, message }, state }` envelope. Raw causes are never returned.

| Code | Meaning |
| --- | --- |
| `invalid-input` | The input is malformed, has an extra or symbol field, uses an unsafe offset, or requests a navigation destination outside configured or renderable bounds. |
| `date-outside-visible-range` | `get-events` requested a date outside the current 42-day range, or the calendar has no visible range. The tool does not fetch or navigate to satisfy the read. |
| `date-not-loaded` | The current visible range has no current or retained usable snapshot yet. |
| `calendar-unavailable` | The instance is torn down or fatal, has no usable snapshot, or could not load the requested navigation destination. |
| `navigation-superseded` | A later WebMCP or ordinary calendar navigation became authoritative before this navigation settled. |

Canceling an execution rejects it with `AbortError` and stops waiting. Cancellation does not undo navigation that already committed. Destroy or fatal teardown aborts the shared registration signal and any pending navigation wait.

Neither tool activates an event, selects an application command, follows a link, invokes `onDaySelect`, invokes an event or context-action callback, edits data, or bypasses application authorization. Ordinary state observation and event-source lifecycle callbacks still run for a committed navigation, just as they do for the equivalent public method. Tool results omit event identifiers, URLs, metadata, raw errors, and extension data. They expose only the bounded normalized fields required to understand the visible schedule.

Litefold supports only imperative top-level registration through `document.modelContext.registerTool`. It does not use the deprecated navigator-scoped predecessor, declarative tools, cross-origin `exposedTo`, consumer APIs such as `getTools()` or `executeTool()`, or a WebMCP polyfill.

The [public API reference](api.md#webmcp-site-tools) owns the exported option shape. The [application integration guide](integration-guide.md#webmcp-site-tools) shows how to assign prefixes in a page that may host more than one calendar.

## Lifecycle and fallback

Registration begins only after a calendar successfully claims and renders its host. The two calls are sequential because WebMCP has no atomic batch API, and both share one `AbortSignal`. Destroying the instance aborts that signal, removes both registrations, and leaves lifecycle guards so a stale tool cannot act through the destroyed calendar. An observed registration rejection also aborts the shared signal, rolling back both registrations where the host honors it. WebMCP provides no registration timeout, so Litefold cannot make a never-settling `registerTool()` call atomic or time it out.

Tool-name conflicts fail closed without replacing another site's or calendar instance's registration. A registration rejection is reported through `onError` as diagnostic-only `host-integration-failed` with hook `webMcp`, or through the global error channel when no observer exists. It does not add an issue to `CalendarState` or disable the UI. Keep prefixes unique and recreate the calendar with a corrected prefix rather than manipulating `document.modelContext` behind the package.

The ordinary UI remains authoritative and usable at all times. Unsupported WebMCP environments, registration failures, tool invocation failures, or an agent choosing not to use a tool must not remove navigation controls, alter keyboard behavior, hide errors, or suppress progressive fallback content.

## Privacy and security

Enabling site tools creates an additional structured disclosure path from the signed-in document to the configured browser agent and its provider. Before opting in, confirm that this recipient is allowed to receive every event in the allowed portion of the loaded 42-day range, including each returned title plus raw normalized `start`, `end`, and `isAllDay` value. Same-origin controls which document registers the tools; it does not guarantee where an agent or model processes returned data. `eventTimeDisplay` controls visual presentation only; choosing `"grid"`, `"agenda"`, or `"none"` does not remove start/end civil values from `get-events`.

- Apply the same authentication, authorization, tenant isolation, and event-source filtering used for the visible calendar. WebMCP grants no new server permission.
- Treat every tool argument as untrusted. Litefold revalidates dates, paging values, navigation targets, lifecycle state, and configured bounds instead of trusting the agent.
- Treat returned event titles as untrusted content even though Litefold supplies structured JSON rather than executable markup.
- Do not place secrets or sensitive application payloads in event titles. Metadata, URLs, identifiers, diagnostic causes, and extension content are deliberately excluded from tool results.
- Remember that navigation can fetch another permitted month through the configured event source. Keep source requests bounded, abort-aware, authorization-aware, and safe to repeat.
- Preserve the visible interface and normal review path for consequential application actions. Litefold's tools intentionally provide no create, edit, delete, link-following, or callback-activation operation.

The repository [security model](security-model.md) covers the model/tool trust boundary and residual risks. Report a realistic disclosure, stale-registration, collision, validation, or authorization bypass privately under the [security policy](../SECURITY.md).

## Compatibility and testing

Compatibility snapshot checked **2026-08-28**:

- The [WebMCP Community Group report](https://webmachinelearning.github.io/webmcp/) defines the current `document.modelContext` API. It is experimental and may change.
- [Chrome's WebMCP guidance](https://developer.chrome.com/docs/ai/webmcp) documents an origin trial beginning in version 149 and an experimental flag for local development. [Microsoft Edge's separate origin trial](https://developer.microsoft.com/en-us/microsoft-edge/origin-trials/trials/0b76fe60-b266-458e-a285-04e375c0c31a) is active through November 17, 2026. Treat these as trial availability rather than a browser-support guarantee and feature-detect in every browser.
- The [ChatGPT WebMCP documentation](https://learn.chatgpt.com/docs/webmcp) describes site-tool availability in ChatGPT desktop's built-in browser. Current support is for top-level imperative tools; declarative form tools and iframe tools are not supported. Availability can also depend on rollout, workspace policy, and selected model.

Do not make WebMCP a required browser capability or infer availability from the browser brand alone. Use the exact feature test above.

To exercise a deployed page, use one of these experimental routes:

- Open the top-level page in ChatGPT desktop's built-in browser under a workspace and model where site tools are available, then ask ChatGPT or Codex to read or navigate the named calendar. Do not put the calendar in an iframe.
- Enroll the application origin in the Chrome or Edge trial, or follow Chrome's linked local-testing guidance to enable its experimental flag. Reload the page and confirm the exact feature test returns `true` before expecting registrations.

For application verification:

1. Test the normal calendar with `document.modelContext` absent.
2. Test successful registration, both tool schemas and annotations, unique prefixes, and cleanup after `destroy()` with a controlled model-context fixture.
3. Reject duplicate names, malformed arguments, out-of-range dates, invalid offsets, and calls after teardown without changing calendar state. Verify a read before the first snapshot returns `date-not-loaded`, and an unavailable calendar without retained data returns `calendar-unavailable`.
4. Confirm `get-events` never changes state, retained degraded data remains readable, and range paging covers every eligible source event exactly once. Exercise multi-day events, configured date bounds, identical public fields on distinct IDs, day filtering, and data entirely outside the loaded range. Results must never include identifiers, URLs, metadata, or raw errors.
5. Confirm `navigate` changes at most the requested calendar view, waits for current source state, leaves application activation callbacks untouched, and preserves normal visible loading/error behavior.
6. Exercise the deployed example in an enabled ChatGPT desktop browser or an explicitly enabled browser origin trial; do not treat an experimental browser flag as the package's general compatibility baseline.

[Back to the documentation hub](README.md)
