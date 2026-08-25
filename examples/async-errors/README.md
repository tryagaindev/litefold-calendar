# Async errors example

Run `npm run demo` from the repository root, then choose **Async errors** from the examples landing page.

Use **Fail next source request** to see a retained-data warning and package Retry behavior. **Application owns source-error UI** demonstrates the explicit `"handled"` return; all other errors keep package-owned presentation. **Reject event actions** demonstrates observable async failure from the native grid or agenda button. **Rebuild with a failing extension** demonstrates extension quarantine: checked mode produces a package-owned `extension-failed` warning while the core calendar remains usable; unchecked mode recreates a healthy instance and renders **Extension active** details. Every toggle destroys and recreates the calendar because a quarantined extension is not retried within its instance. The two pre-created live regions model a centralized application announcer.

The source is an abort-aware local delay. The example performs no network request and imports no runtime dependency.

The example's `data-host-*`, `data-calendar`, and related unprefixed attributes are application-owned fixture selectors. They are not package output or public API.

Browse the source: [JavaScript](main.js), [HTML](index.html), and [shared example CSS](../example.css).

Next: read the [error handling guide](../../docs/errors.md) for the complete ownership, announcement, and recovery contracts.
