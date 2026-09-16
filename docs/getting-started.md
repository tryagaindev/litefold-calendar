# Getting started

Use Litefold Calendar for a month grid and a selected-day event list. Your application supplies events and owns editing, permissions, routing, and dialogs. Review the [feature map](features.md#feature-map) and [browser policy](browser-support.md) before integrating it.

## Install and render

Follow the root [installation](../README.md#install) and [first render](../README.md#first-render) example. Import both the JavaScript entry and stylesheet, create the calendar on a client-owned element, then call `render()`.

Use the [basic JavaScript example](../examples/basic/) to start with a small event array. No TypeScript, metadata interface, framework, remote service, or optional extension is required.

## Add the next capability

| When you need… | Continue with… |
| --- | --- |
| Events from an API, filters, or refresh after saving | [Remote data walkthrough](remote-data.md) and [runnable example](../examples/remote-data/) |
| Clear day counts on phones or in a sidebar | [Choose event counts](integration-guide.md#choose-event-counts) |
| An application-owned event picker or details dialog | [Own the event chooser](integration-guide.md#own-the-event-chooser) |
| Useful content before JavaScript starts | [Progressive enhancement](seo-and-progressive-enhancement.md) |
| Exact options, date formats, and callback types | [API reference](api.md) |
| Typed adapters, caching, or render hooks | [Advanced integration](integration-guide.md) |

## Avoid common integration mistakes

- Event strings are civil dates or local date-times. Convert API instants into your chosen zone before mapping them; do not append `Z` or an offset. See the [date grammar](api.md#accepted-civil-values).
- Source requests use an inclusive `start` and exclusive `end`, covering the visible six-week grid rather than only the named month.
- A compact day with several events shows a total-count button by default. Activating it opens that date's agenda; provide `onEventOverflowActivate` only when your application owns the alternative interaction.
- Change filters outside the calendar, then call `refetchEvents()`. Use `setEvents()` when replacing the source itself or supplying a complete new local snapshot.
- Call `destroy()` during permanent component/router teardown. The standalone examples preserve instances during a cached `pagehide`.

The [documentation hub](README.md) separates everyday integration recipes, advanced contracts, contribution, and release operations.
