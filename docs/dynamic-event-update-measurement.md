# Dynamic event update measurement

Use this opt-in harness to compare complete event replacement paths without turning machine-dependent timings into a release gate.  It measures `setEvents()`, application-owned provider state followed by `refetchEvents()`, and instance recreation against the same visible range and event data.

## Run the measurement

Run the opt-in harness from the repository root:

```sh
npm run measure:dynamic-events
```

The default protocol uses two deterministic snapshots of 10,000 valid events across the fixed `2026-07-26`/`2026-09-06` visible range.  Each strategy receives five warmup operations and twenty measured operations.  Strategy order rotates between cycles, the snapshot alternates each cycle, and the report uses the median and nearest-rank 95th percentile.  Pass `--runs N` to collect more measured operations; `N` cannot be less than twenty.

The harness runs the built package in JSDOM.  Use its results to compare the three update paths on one machine and toolchain, not as browser latency or Interaction to Next Paint data.  No timing or size threshold is asserted, so normal measurement variance cannot fail the repository checks.  Lifecycle, ready-state, fixture event-count, and visible-range mismatches still fail because they invalidate the comparison.

## Compare distribution size

The same report includes raw and maximum-compression gzip byte counts for `dist/index.js`, `dist/internal/runtime/coordinator.js`, and every JavaScript module beneath `dist/`.  The graph total sums the size of each module compressed separately; it is not a packed-tarball size.  Preserve the complete prior `dist/` directory outside the candidate's build output, then supply that directory as the baseline:

```sh
npm run measure:dynamic-events -- --baseline .cache/dynamic-update-baseline/dist
```

The report prints signed raw and gzip deltas.  Use `--size-only` when only the byte comparison is needed, or `--json` for the complete machine-readable report and raw timing samples.  A baseline directory enables all three deltas.  A single prior `index.js` file remains accepted when only the entry delta is available; without either baseline form, current raw and gzip counts are still reported.

## Interpretation

`setEvents()` and provider-state refetch both preserve the live calendar instance.  Recreation includes teardown, construction, render, and the event load, so it intentionally measures more work.  Static snapshots and the provider return the same in-memory event arrays; transport, application parsing, framework rendering, garbage collection controls, and network delay are outside this measurement.

Record Node, operating system, architecture, sample counts, median, p95, raw bytes, gzip bytes, and any baseline delta when sharing results.  Compare results only when the build, runtime, hardware, and protocol match.

## Recorded reference run

The candidate working tree based on pre-change commit `53cf1fbb5f4176929c3105030a62e1d0c235b54f` produced this local reference on August 24, 2026:

| Environment | Protocol |
|---|---|
| Node v24.19.0, JSDOM 30.0.1, Windows x64 | 10,000 events, 5 warmups, 20 measured runs |

| Strategy | Median | P95 |
|---|---:|---:|
| `setEvents()` | 280.125 ms | 317.129 ms |
| Provider state plus `refetchEvents()` | 283.350 ms | 324.556 ms |
| Instance recreation | 252.673 ms | 295.647 ms |

The run completed every semantic check and applied no numeric threshold.  Recreation had the lowest median in this JSDOM run; that ordering is evidence from this protocol, not a browser-performance claim or API acceptance target.

The candidate distribution and an isolated clean build of that pre-change commit produced these module-level measurements with gzip level 9:

| Artifact | Baseline raw | Candidate raw | Raw delta | Baseline gzip | Candidate gzip | Gzip delta |
|---|---:|---:|---:|---:|---:|---:|
| `dist/index.js` | 134 B | 134 B | 0 B | 120 B | 120 B | 0 B |
| `dist/internal/runtime/coordinator.js` | 93,960 B | 94,714 B | +754 B | 16,631 B | 16,790 B | +159 B |
| All `dist` JavaScript | 232,587 B (32 modules) | 238,432 B (36 modules) | +5,845 B | 54,426 B | 56,441 B | +2,015 B |

The complete-graph delta includes every JavaScript distribution change in the candidate working tree, not only `setEvents()`.  The unchanged entry is a small re-export facade, which is why the coordinator and graph rows are required.  Package verification remains authoritative for the publishable artifact and consumer behavior.
