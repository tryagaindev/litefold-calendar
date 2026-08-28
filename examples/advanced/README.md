# Advanced TypeScript example

This is the repository's successful-path integration showcase. Start with the [basic example](../basic/) when a calendar only needs local events and activation.

## What it demonstrates

- A typed, range-aware event source with application-owned caching, filters, bounds, and complete event replacement.
- Every public `CalendarOptions` property, `Calendar` method, action callback, state field, message/icon surface, and `CalendarExtension` hook.
- Native month/year jumping, touch/pen/precision-scroll paging, managed grid-event keyboard access, links, context actions, and an application-owned dialog.
- Custom toolbar content, full CSS-token mapping, RTL, light/dark/system themes, progressive fallback, centralized announcements, and visible state inspection.
- Explicit WebMCP opt-in through prefix `litefold-advanced`, registering `litefold-advanced-get-events` and `litefold-advanced-navigate` only when the current document API is available. The read tool pages through events in the loaded visible range and can filter one date; the integration adds no visible control or alternative calendar UI.

The example uses `eventTimeDisplay: "agenda"`: grid summaries remain compact while the agenda exposes localized times. It also keeps one provider record beyond `maxDate` to prove that sources receive the complete 42-day range while out-of-range days remain unavailable.

`CompleteCalendarOptions`, `CompleteCalendarExtension`, and `calendarMethods` intentionally cover their public keys exhaustively. Typechecking fails when a new surface lacks a scenario. The smoke and browser suites own the detailed assertions; the [example coverage guide](../) explains those boundaries without duplicating them here.

WebMCP browser coverage supplies a controlled `document.modelContext` fixture, verifies both registrations and their shared teardown signal, reads the loaded range, navigates to `2026-08-07`, and filters the resulting `Follow-up call` event by date. The example does not require a native browser origin trial for repository tests. Review the [WebMCP guide](../../docs/webmcp.md) before copying the opt-in to an application with private schedules.

All `data-example-*` attributes are application-owned fixture selectors. The package claims `.litefold-calendar` and the presence-only `data-litefold-calendar` root marker; internal `data-lfc-*` attributes are not integration hooks.

## Run and inspect

From the repository root:

```sh
npm run demo
```

Choose **Advanced TypeScript**. The command builds the package and generated example module; no CDN or runtime dependency is used.

Browse the source: [TypeScript](main.ts), [HTML](index.html), and [theme CSS](theme.css).

Next: adapt the patterns with the [application integration guide](../../docs/integration-guide.md), review exact contracts in the [API reference](../../docs/api.md), or use the [error guide](../../docs/errors.md) for deliberate failure scenarios.
