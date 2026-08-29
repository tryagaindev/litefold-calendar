# Async errors example

This example keeps successful rendering and failure ownership visible on one page. It covers an asynchronous event source, an event action, a render hook, `onError`, and an application-owned live announcer.

## Run it

From the repository root, run `npm run demo`, then choose **Handle asynchronous failures** from the examples landing page. Wait for the first event to load before trying the controls.

## Failure scenarios

| Try this | Expected result |
| --- | --- |
| Activate **Fail next source request** | The current events remain visible and the package shows a recoverable source warning with Retry. |
| Enable **Use application source-error UI**, then fail the next request | `onError` returns `"handled"` for the source failure, so the application alert replaces the package's visible error UI. |
| Enable **Make event actions reject**, then activate **Open async details** | The returned promise rejects and the package presents an `action-failed` error. |
| Enable **Make render hooks fail** | The calendar is rebuilt, the throwing hook set is quarantined, and the package presents a `render-hook-failed` warning while core rendering remains usable. |
| Disable **Make render hooks fail** | A healthy calendar instance is created and **Render hooks active** appears again. |

## Implementation notes

- The event source uses an abort-aware local delay; it makes no network request.
- Source errors return `"handled"` only when application ownership is enabled. Other failures return `"default"` so package presentation remains active.
- `onAnnounce` forwards messages to one polite and one assertive live region created before the calendar starts.
- A failed render-hook set stays quarantined for the lifetime of its calendar instance, so changing that toggle destroys and recreates the instance.
- A non-cached `pagehide` destroys whichever instance is current; entering the browser's back/forward cache preserves it for restoration.

The unprefixed `data-*` attributes are application-owned selectors, not litefold-calendar output.

Browse the [JavaScript](main.js), [HTML](index.html), and [shared example CSS](../example.css). See the [error handling guide](../../docs/errors.md) for the full ownership, announcement, and recovery contracts.
