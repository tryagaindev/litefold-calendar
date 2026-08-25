import assert from "node:assert/strict";
import test from "node:test";

import {
	compareDistributionSizes,
	createDistributionMeasurements,
	createEventSnapshots,
	EVENT_COUNT,
	MEASURED_RUNS_DEFAULT,
	parseMeasurementArguments,
	summarizeDistributionFiles,
	summarizeDistributionSize,
	summarizeDurations,
	VISIBLE_RANGE,
	WARMUP_RUNS
} from "../lib/dynamic-update-measurement.mjs";

void test("dynamic update snapshots are bounded, unique, and cover one fixed visible range", () => {
	const snapshots = createEventSnapshots();
	assert.equal(snapshots.length, 2);
	for (const snapshot of snapshots) {
		assert.equal(snapshot.length, EVENT_COUNT);
		assert.equal(new Set(snapshot.map((event) => event.id)).size, EVENT_COUNT);
		const dates = new Set(snapshot.map((event) => event.start));
		assert.equal(dates.size, 42);
		assert.equal([...dates].at(-1), "2026-09-05");
		assert.equal(snapshot[0]?.start, VISIBLE_RANGE.start);
	}
	assert.notEqual(snapshots[0][0]?.id, snapshots[1][0]?.id);
});

void test("duration summaries use median and nearest-rank p95 without thresholds", () => {
	const samples = Array.from({ length: MEASURED_RUNS_DEFAULT }, (_value, index) => index + 1);
	assert.deepEqual(summarizeDurations(samples), {
		medianMilliseconds: 10.5,
		p95Milliseconds: 19
	});
	assert.throws(() => summarizeDurations([]), /non-empty/u);
	assert.throws(() => summarizeDurations([1, Number.NaN]), /finite/u);
});

void test("distribution size reports raw and gzip deltas", () => {
	const current = Buffer.from("calendar calendar calendar\n", "utf8");
	const baseline = Buffer.from("calendar\n", "utf8");
	const report = summarizeDistributionSize(current, baseline);
	assert.equal(report.current.rawBytes, current.byteLength);
	assert.equal(report.baseline?.rawBytes, baseline.byteLength);
	assert.equal(report.delta?.rawBytes, current.byteLength - baseline.byteLength);
	assert.equal(
		report.delta?.gzipBytes,
		(report.current.gzipBytes - (report.baseline?.gzipBytes ?? 0))
	);
	assert.equal(summarizeDistributionSize(current).delta, null);
	const graph = summarizeDistributionFiles([current, baseline]);
	assert.deepEqual(graph, {
		fileCount: 2,
		gzipBytes: report.current.gzipBytes + (report.baseline?.gzipBytes ?? 0),
		rawBytes: current.byteLength + baseline.byteLength
	});
	assert.deepEqual(compareDistributionSizes(graph, graph).delta, {
		gzipBytes: 0,
		rawBytes: 0
	});
	assert.throws(() => summarizeDistributionFiles([]), /at least one/u);
});

void test("distribution report keeps entry, coordinator, and complete JavaScript graph rows", () => {
	const current = Buffer.from("current calendar module\n", "utf8");
	const baseline = Buffer.from("baseline module\n", "utf8");
	const rows = createDistributionMeasurements(
		{ coordinator: current, entry: current, javascript: [current, current] },
		{ coordinator: baseline, entry: baseline, javascript: [baseline] }
	);
	assert.deepEqual(rows.map(({ key, label }) => ({ key, label })), [
		{ key: "entry", label: "dist/index.js" },
		{ key: "coordinator", label: "dist/internal/runtime/coordinator.js" },
		{ key: "javascriptTotal", label: "dist JavaScript total (2 modules)" }
	]);
	assert.equal(rows[1]?.delta?.rawBytes, current.byteLength - baseline.byteLength);
	assert.equal(rows[2]?.current.rawBytes, current.byteLength * 2);
	assert.equal(rows[2]?.baseline?.rawBytes, baseline.byteLength);
});

void test("measurement arguments preserve the minimum protocol", () => {
	assert.deepEqual(parseMeasurementArguments([]), {
		baselinePath: null,
		json: false,
		measuredRuns: MEASURED_RUNS_DEFAULT,
		sizeOnly: false
	});
	assert.deepEqual(
		parseMeasurementArguments(["--baseline", "previous/index.js", "--json", "--runs", "25", "--size-only"]),
		{
			baselinePath: "previous/index.js",
			json: true,
			measuredRuns: 25,
			sizeOnly: true
		}
	);
	assert.throws(
		() => parseMeasurementArguments(["--runs", String(MEASURED_RUNS_DEFAULT - 1)]),
		/new measurement argument|at least/u
	);
	assert.throws(() => parseMeasurementArguments(["--baseline"]), /requires a path/u);
	assert.throws(() => parseMeasurementArguments(["--json", "--json"]), /at most once/u);
	assert.equal(WARMUP_RUNS, 5);
});
