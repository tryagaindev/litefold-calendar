# Internal architecture

This guide helps contributors decide where a change belongs and which invariants must survive a refactor. The public behavior remains canonical in the [API reference](api.md); this document describes repository ownership and dependency direction rather than adding another consumer contract.

## Dependency direction

The package has one composition edge into the runtime and otherwise points inward through explicit layers:

```text
index.ts -> calendar.ts -> internal/runtime/coordinator.ts
internal/runtime/coordinator.ts -> internal/runtime/*
internal/runtime/* -> internal/dom/*, internal/domain/*, public contracts
internal/dom/*     -> internal/dom/*, internal/domain/*, public contracts
internal/domain/*  -> internal/domain/*, public contracts
```

| Area | Owns | Dependency rule |
|---|---|---|
| Root facade and contracts | `index.ts`, `calendar.ts`, public types, errors, icons, messages, defaults, and pure message formatting | `calendar.ts` is the intentional composition entry into the coordinator. Other contract modules remain independent of runtime implementation. |
| `internal/domain` | Gregorian civil-date parsing and arithmetic, ranges, bounds, fixed month grids, and atomic event normalization | No DOM or runtime imports. Domain code may use public types and errors. |
| `internal/dom` | Stable semantic element creation, localized presentation, focus helpers, and bounded DOM rendering primitives | May use domain and public contracts, but does not own lifecycle, requests, or state transitions. |
| `internal/runtime` | Option normalization, event-source generations, actions, extension isolation, integration-node leases, swipe state, observable state, and transaction coordination | May compose public, domain, DOM, and focused runtime peers. Runtime modules do not become public subpath APIs. |
| `styles.css` | Visual states, responsive placement, direction-aware layout, motion preferences, and public CSS-token consumption | Layout remains CSS-only; script does not move controls or branch on breakpoints. |

Do not add internal barrel files, cross-layer cycles, or a generic catch-all helper module. Import the narrow module that owns the behavior. The repository ESLint architecture rule enforces these layer edges and permits only `calendar.ts` to compose the public surface with the runtime coordinator.

## Where a change belongs

| Change | Primary location |
|---|---|
| Civil-date parsing, comparison, projection, range math, or locale week start | `internal/domain` |
| Stable markup, native semantics, localized display formatting, or focus mechanics | `internal/dom` |
| Configuration validation, async source behavior, abort/reentrancy policy, actions, extensions, integration leases, or state | `internal/runtime` |
| Public names, callback shapes, defaults, exports, or diagnostics | Root contract modules plus the API documentation and examples |
| Responsive placement, sizing, focus visuals, forced colors, or motion styling | `styles.css`, CSS-token documentation, and affected browser tests |

A formatter or renderer that can be tested without calendar lifecycle state should normally be a DOM or domain leaf rather than another coordinator method. A helper that decides whether a source result may commit belongs to the runtime because it participates in the transaction.

## Render transaction ownership

The coordinator's `MonthCalendar` class is the sole transaction owner. Its size is deliberate: it sequences behavior that must remain atomic and reentrancy-safe, while leaf modules own separable policies and presentation details.

A normal lifecycle follows this order:

1. Construction snapshots and validates application options before package DOM is committed.
2. `render()` establishes one stable package-owned shell and acquires any application-node leases.
3. A source generation owns one abort signal and one complete 42-day request range.
4. A current result is validated and normalized atomically; malformed or stale results never partially commit.
5. The coordinator commits the displayed month, selected date, normalized events, and observable phase as one current generation.
6. DOM modules render from that committed snapshot; focus restoration, issue presentation, and announcements follow the same generation checks.
7. `destroy()` aborts work, invalidates retained controls, runs extension cleanup, releases leases, restores managed fallback state, and removes package ownership.

Keep generation checks and commit decisions in the coordinator or a focused runtime policy module. Do not let DOM renderers start requests, mutate public state, or decide whether stale work may commit.

## Stable DOM and ownership invariants

- One live calendar owns a host at a time.
- One current interactive 42-day grid represents one committed provider range. Pager lanes are decorative and never contain a second event surface.
- The toolbar, title, grid shell, agenda shell, live regions, and issue regions stay stable across ordinary renders so focus and references survive.
- `toolbarEnd`, fallback content, and extension nodes remain application-owned. The package leases or mounts them according to their documented lifecycle instead of cloning or silently adopting them.
- Extension failures are isolated and cleaned up without weakening core calendar semantics.
- Responsive changes alter computed CSS layout only. They do not refetch, replace nodes, reorder focus stops, or move DOM.
- Private `lfc-*` classes, IDs, attributes, containers, and keyframes may change; integrations use public options, callbacks, elements, and tokens instead.

## Localized and responsive text

Treat localized values as complete formatted strings:

- Use one `Intl.DateTimeFormat` call for each complete label. Do not concatenate localized month and year fragments or reconstruct structured values from display text.
- Keep one canonical full DOM string for a title, live-region value, or accessible name. A compact visual alternative is a separate `aria-hidden` presentation, not duplicate readable DOM text.
- Preserve locale-specific ordering, punctuation, numbering systems, and calendar formatting options in both full and abbreviated forms.
- Compare the next value with the current DOM value before writing to an `aria-live` region or referenced label; unrelated rerenders must not repeat an unchanged announcement.
- Locale-derived week starts accept the platform's method or accessor form of week information, validate `firstDay`, and use the documented Sunday fallback only when neither form is usable.

## Refactoring guidance

Extract a leaf module when it has one coherent responsibility, a narrow typed input, and tests that do not require reproducing coordinator lifecycle. Keep orchestration together when splitting it would distribute generation ownership, rollback, focus restoration, or error-state decisions across modules.

Before moving code, identify:

1. The owner of the input and output values.
2. Whether the behavior is pure, DOM-local, or transaction-sensitive.
3. Which stable DOM, accessibility, date, lifecycle, and teardown invariants are affected.
4. The focused regression test that proves the boundary after the move.

Prefer explicit names such as `month-title`, `message-configuration`, or `node-leases` over broad names such as `utils`, `helpers`, or `common`.

## Validation by change type

Use the narrowest checks during development, then run the aggregate repository check before submission:

```shell
npm run lint
npm run typecheck
npm run test:unit
npm run build
npm run test:browser
npm run check:docs
npm run check
```

DOM, CSS, interaction, or accessibility changes also require the affected pinned-Chromium scenarios and the relevant manual checks in the [accessibility guide](../ACCESSIBILITY.md). Public behavior changes require synchronized declarations, examples, API documentation, migration guidance, release notes, and screenshot evidence when a canonical scene changes.

[Back to the documentation hub](README.md)
