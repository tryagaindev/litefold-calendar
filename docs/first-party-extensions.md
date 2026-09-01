# First-party extensions

Litefold Calendar exposes two deliberately different integration mechanisms. Choose between them by ownership and scope, not by whether the code happens to run during rendering.

| Mechanism | Use it for | Public surface |
| --- | --- | --- |
| Consumer-owned render hooks | Trusted application callbacks that contribute visual nodes, observe mounts, retain an abort signal, and release application resources through cleanup functions | `CalendarRenderHooks<TMetadata>` in `renderHooks` |
| First-party extensions | Complete, cohesive package components that can coordinate a capability or lifecycle and may be entirely headless | Opaque `CalendarExtension` values in `extensions` |

Render hooks are the stable customization API for application-owned presentation. They receive documented elements and contexts; they do not become package extensions merely because several hooks are grouped in one object. A failing render-hook set is quarantined and reported as diagnostic `render-hook-failed` with `renderHookId`.

Extensions are configured components implemented and shipped by Litefold Calendar. Consumers obtain them from explicit optional subpaths and cannot construct or inspect the opaque `CalendarExtension` value themselves. Extension failures are isolated from the ordinary calendar UI and reported as diagnostic `extension-failed` with `extensionId`.

## Available extensions

| Extension | Import | Purpose |
| --- | --- | --- |
| WebMCP | `@tryagaindev/litefold-calendar/extensions/webmcp` | Registers experimental, presentation-safe calendar read and navigation tools when the browser exposes `document.modelContext` |

WebMCP remains a progressive no-op when that browser API is unavailable. A registration failure is diagnostic-only `extension-failed` with `extensionId: "webmcp"`; it never becomes a `CalendarState` issue. See the [WebMCP guide](webmcp.md) for configuration, privacy, compatibility, and testing.

## Configure an extension

Import the calendar core and each selected extension independently:

```ts
import { createCalendar } from "@tryagaindev/litefold-calendar";
import { webMcp } from "@tryagaindev/litefold-calendar/extensions/webmcp";

const calendar = createCalendar(host, {
	events,
	extensions: [
		webMcp({ toolNamePrefix: "my-schedule" })
	],
	renderHooks: [applicationRenderHooks]
});

calendar.render();
```

`webMcp()` uses `"litefold-calendar"` as its default `toolNamePrefix`. Supply a stable explicit prefix when more than one calendar can share a document, because WebMCP tool names are document-wide.

Factories validate and snapshot their configuration synchronously. The returned extension value is immutable and reusable across independent calendar instances, with separate runtime state for each. Reuse does not bypass platform-wide constraints: co-resident WebMCP calendars still need distinct tool-name prefixes. A calendar rejects duplicate stable extension IDs, including two separately configured WebMCP values, as synchronous `invalid-configuration` before mutating its host.

Selected extensions activate and receive state in caller order. Teardown runs in reverse order. Distinct extension IDs are independent: Litefold Calendar defines no dependency, priority, precedence, or conflict system between them. One failed extension is quarantined without disabling the core calendar or another extension.

Extensions observe the normal event-source and state lifecycle. The
[API source-timing contract](api.md#source-timing-and-renders) owns exact
provider classification and callback order; the activation-specific delivery
rules appear below.

## Choose the right boundary

Use the narrowest ownership boundary that fits the work:

| Boundary | Choose it when | Ownership and distribution |
| --- | --- | --- |
| Calendar core | The behavior is required for the calendar's ordinary documented semantics, safety, accessibility, or lifecycle | Litefold Calendar owns it and every root consumer receives it |
| Render hook | An application needs localized presentation at an existing mount point | The consumer owns the callback, created content, external resources, and returned cleanup; it ships in the application |
| First-party extension | Optional functionality needs coordinated state observation, navigation, platform integration, presentation, or an independently removable lifecycle | Litefold Calendar owns the complete component; the application only imports its subpath, configures it, and registers the returned value |
| Separate package | The functionality needs independent installation, versioning, dependencies, security policy, ownership, or removal from installed package bytes | Its publisher owns a distinct package and compatibility boundary |

A complete component does not need to render UI. WebMCP is an extension because it coordinates a browser integration, state projection, navigation, cancellation, and disposal even though it is headless. Conversely, grouping several visual callbacks does not turn consumer-owned render hooks into an extension.

## Discovery and registration

Registration is declarative: add a factory result to `CalendarOptions.extensions`. Importing an extension module alone does nothing, and there is no `registerExtension` method or runtime discovery system.

During construction, Litefold Calendar snapshots and validates the complete array before mutating the host. Unreadable or forged values, repeated values, and duplicate extension IDs are invalid configuration. Distinct IDs can coexist. A configured value can be reused across calendars; each instance creates independent runtime state and cancellation, but a document-wide platform registry may still require instance-specific configuration such as distinct WebMCP prefixes.

The runtime protocol is package-private. Treat configured extension values as opaque: store, reuse, and pass them to `extensions`, but do not inspect or forge them.

## Capabilities, lifecycle, and isolation

Litefold Calendar gives an extension only the capabilities declared by its private definition. Capability objects and state snapshots are immutable, and retained capabilities fail closed after quarantine or calendar destruction. Consumer render hooks cannot request extension capabilities, observe peers, or join this lifecycle.

The observable order is:

```mermaid
sequenceDiagram
  accTitle: First-party extension activation, delivery, and teardown order
  accDescr: Extensions activate and receive state in registration order. A direct initial result renders before activation and is then delivered once. An initial promise-like loading state is not replayed. Destruction aborts and disposes extensions in reverse order.
  actor Consumer as Application
  participant Calendar
  participant First as Extension 1
  participant Last as Extension n
  Consumer->>Calendar: render()
  alt Direct initial array
    Calendar->>Calendar: Terminal commit, onStateChange, and DOM render
    Calendar->>First: activate()
    Calendar->>Last: activate()
    Calendar-->>First: Queued terminal state delivery
    Calendar-->>Last: Queued terminal state delivery
  else Initial PromiseLike
    Calendar->>Calendar: Attach settlement handlers; loading callback and render
    Calendar->>First: activate()
    Calendar->>Last: activate()
    Note over First,Last: The already-published loading state is not replayed.
    Calendar->>Calendar: Terminal commit, onStateChange, and DOM render
    Calendar-->>First: Queued terminal state delivery
    Calendar-->>Last: Queued terminal state delivery
  end
  Note over Calendar,Last: Later coalesced state deliveries run 1 to n after consumer onStateChange.
  Consumer->>Calendar: destroy()
  Calendar--x Last: Abort lifetime
  Calendar->>Last: dispose()
  Calendar--x First: Abort lifetime
  Calendar->>First: dispose()
```

In prose: activation and state delivery follow registration order, while teardown reverses it. A direct initial result renders before activation and receives one queued terminal delivery. An initial PromiseLike activates extensions after the loading render without replaying loading, then delivers the settled terminal state. Later deliveries are coalesced and occur after the consumer's `onStateChange` callback.

Lifecycle entry points are synchronous. An extension binds asynchronous work to its supplied lifetime signal rather than returning a promise. A fatal stop uses the same reverse teardown as `destroy()`. A hook failure quarantines, aborts, and disposes only that extension, then emits one diagnostic; ordinary calendar behavior and other extensions continue. The [optional-extension architecture](architecture.md#optional-extension-boundary) documents reentrancy, stale capability behavior, and navigation transaction safeguards.

## Bundle and import behavior

The root entry exports the opaque `CalendarExtension` type and accepts `extensions`, but it does not import an extension implementation. Each first-party extension has an explicit `/extensions/<id>` entry point and is never re-exported from the root.

- If an extension value is omitted from `extensions`, that calendar does not activate it.
- If its subpath import is absent from the application import graph, a bundler can omit that implementation. In particular, omitting `/extensions/webmcp` keeps the WebMCP adapter out of the graph.
- A runtime condition around a static import controls activation, not whether the imported module is included. Use an application build-time branch or dynamic import before calendar construction when different builds must include different extensions.
- Optional extensions still ship inside the same npm tarball. Tree shaking removes consumer bundle bytes; it does not remove files from an installed package. A separately published package would be required to remove installed bytes.

Extension entry modules remain side-effect-free and safe to evaluate during server rendering. Importing one must not read browser globals, mutate a document, register tools, or discover calendars at module scope. Browser work starts only when a configured extension is activated for a rendered calendar.

## Official extension changes

Extension authoring remains package-private. Contributors adding an official
extension follow the
[architecture authoring checklist](architecture.md#author-an-official-extension).
This application-integration guide owns selection, configuration, lifecycle, bundle behavior,
and the absence of a third-party authoring API.

## Third-party authoring stability

The public contract supports consuming official extension factories; it does not provide a third-party authoring API or permit application code to forge `CalendarExtension` values. Use `CalendarRenderHooks` for consumer-owned rendering.

Any future third-party authoring surface will be explicit, separately documented, lower stability, and distinct from render hooks. Internal first-party machinery creates no compatibility promise for application or package authors.

See the [public API reference](api.md), [WebMCP guide](webmcp.md), [internal architecture](architecture.md), [security model](security-model.md), and [package verification](package-verification.md) for their respective contracts.

[Back to the documentation hub](README.md)
