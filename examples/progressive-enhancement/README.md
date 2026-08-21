# Progressive-enhancement example

Run `npm run build`, serve the repository root over HTTP, and open `examples/progressive-enhancement/`.

The page starts with ordinary server-like HTML: a heading, ordered event list, native links, and `<time datetime>` values. It remains useful when JavaScript or the event source is unavailable. The fallback is a sibling of the calendar host because `fallbackElement` cannot be inside the host that rendering owns.

The package leaves that fallback unchanged while the first source request is loading. It hides the element only after the first usable snapshot commits, including a successful empty snapshot. A first-load failure and `destroy()` restore the element's original `hidden` state only while its value still matches the package's last write; an application visibility change survives. Use the two rebuild controls to inspect both outcomes. A later degraded refresh keeps the fallback hidden because the calendar still has usable retained data.

The fixture handles its deliberate first-load source error with visible application-owned text. That keeps the lifecycle demonstration self-contained; the [async-errors example](../async-errors/) compares package-owned and application-owned error presentation in depth.

The event URL includes a query and fragment. Litefold renders it as a native anchor on both action surfaces and leaves normal link navigation intact. The release-window event has neither a URL nor an application action, so it remains a static semantic representation.

This is progressive enhancement, not server rendering supplied by the package. The application server still owns canonical URLs, page metadata, privacy decisions, fallback freshness, and any structured data. The example intentionally emits no JSON-LD.

Browse the source: [JavaScript](main.js), [HTML](index.html), and [shared example CSS](../example.css).
