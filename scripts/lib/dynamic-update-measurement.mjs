import { gzipSync } from "node:zlib";

export const EVENT_COUNT = 10_000;
export const MEASURED_RUNS_DEFAULT = 20;
export const WARMUP_RUNS = 5;
export const VISIBLE_RANGE = Object.freeze({
	end: "2026-09-06",
	start: "2026-07-26"
});

const DAYS_IN_VISIBLE_RANGE = 42;
const GZIP_OPTIONS = Object.freeze({ level: 9 });
const MILLISECOND_PRECISION = 3;

/**
 * Creates the two immutable, deterministic event snapshots used by every measured strategy.
 *
 * @returns {readonly [readonly object[], readonly object[]]}
 */
export function createEventSnapshots() {
	const dates = createVisibleDates();
	const createSnapshot = (label) => Object.freeze(Array.from(
		{ length: EVENT_COUNT },
		(_value, index) => Object.freeze({
			id: `${label}-event-${String(index).padStart(5, "0")}`,
			start: dates[index % dates.length],
			title: `Snapshot ${label.toUpperCase()} event ${String(index + 1)}`
		})
	));

	return Object.freeze([createSnapshot("a"), createSnapshot("b")]);
}

/**
 * Calculates a median and nearest-rank 95th percentile without applying a threshold.
 *
 * @param {readonly number[]} samples
 * @returns {{medianMilliseconds: number, p95Milliseconds: number}}
 */
export function summarizeDurations(samples) {
	if (samples.length === 0 || samples.some((sample) => !Number.isFinite(sample) || sample < 0)) {
		throw new TypeError("Duration samples must be a non-empty list of finite, non-negative numbers.");
	}

	const sorted = [...samples].sort((left, right) => left - right);
	const middle = Math.floor(sorted.length / 2);
	const median = sorted.length % 2 === 0
		? ((sorted[middle - 1] ?? 0) + (sorted[middle] ?? 0)) / 2
		: sorted[middle] ?? 0;
	const p95Index = Math.max(0, Math.ceil(sorted.length * 0.95) - 1);

	return Object.freeze({
		medianMilliseconds: median,
		p95Milliseconds: sorted[p95Index] ?? 0
	});
}

/**
 * Reports raw and maximum-compression gzip byte counts, with optional baseline deltas.
 *
 * @param {Uint8Array} currentBytes
 * @param {Uint8Array | null} baselineBytes
 * @returns {{
 *   baseline: {gzipBytes: number, rawBytes: number} | null,
 *   current: {gzipBytes: number, rawBytes: number},
 *   delta: {gzipBytes: number, rawBytes: number} | null
 * }}
 */
export function summarizeDistributionSize(currentBytes, baselineBytes = null) {
	const current = sizeOf(currentBytes);
	const baseline = baselineBytes === null ? null : sizeOf(baselineBytes);
	return compareDistributionSizes(current, baseline);
}

/**
 * Sums raw bytes and separately compressed module bytes for a JavaScript distribution graph.
 *
 * @param {readonly Uint8Array[]} files
 * @returns {{fileCount: number, gzipBytes: number, rawBytes: number}}
 */
export function summarizeDistributionFiles(files) {
	if (files.length === 0) {
		throw new TypeError("A distribution graph must contain at least one JavaScript file.");
	}
	const totals = files.reduce((result, bytes) => {
		const size = sizeOf(bytes);
		return {
			fileCount: result.fileCount + 1,
			gzipBytes: result.gzipBytes + size.gzipBytes,
			rawBytes: result.rawBytes + size.rawBytes
		};
	}, { fileCount: 0, gzipBytes: 0, rawBytes: 0 });
	return Object.freeze(totals);
}

/**
 * Adds optional signed deltas to already measured distribution sizes.
 *
 * @param {{gzipBytes: number, rawBytes: number}} current
 * @param {{gzipBytes: number, rawBytes: number} | null} baseline
 * @returns {{
 *   baseline: {gzipBytes: number, rawBytes: number} | null,
 *   current: {gzipBytes: number, rawBytes: number},
 *   delta: {gzipBytes: number, rawBytes: number} | null
 * }}
 */
export function compareDistributionSizes(current, baseline = null) {
	return Object.freeze({
		baseline,
		current,
		delta: baseline === null
			? null
			: Object.freeze({
				gzipBytes: current.gzipBytes - baseline.gzipBytes,
				rawBytes: current.rawBytes - baseline.rawBytes
			})
	});
}

/**
 * Creates the three distribution rows emitted by the opt-in measurement command.
 *
 * @param {{coordinator: Uint8Array, entry: Uint8Array, javascript: readonly Uint8Array[]}} current
 * @param {{coordinator: Uint8Array | null, entry: Uint8Array | null, javascript: readonly Uint8Array[] | null} | null} baseline
 * @returns {readonly object[]}
 */
export function createDistributionMeasurements(current, baseline = null) {
	const currentGraph = summarizeDistributionFiles(current.javascript);
	const baselineGraph = baseline?.javascript === null || baseline?.javascript === undefined
		? null
		: summarizeDistributionFiles(baseline.javascript);
	return Object.freeze([
		Object.freeze({
			key: "entry",
			label: "dist/index.js",
			...summarizeDistributionSize(current.entry, baseline?.entry ?? null)
		}),
		Object.freeze({
			key: "coordinator",
			label: "dist/internal/runtime/coordinator.js",
			...summarizeDistributionSize(current.coordinator, baseline?.coordinator ?? null)
		}),
		Object.freeze({
			key: "javascriptTotal",
			label: `dist JavaScript total (${String(currentGraph.fileCount)} modules)`,
			...compareDistributionSizes(currentGraph, baselineGraph)
		})
	]);
}

/**
 * Parses the small opt-in measurement command surface.
 *
 * @param {readonly string[]} argumentsList
 * @returns {{baselinePath: string | null, json: boolean, measuredRuns: number, sizeOnly: boolean}}
 */
export function parseMeasurementArguments(argumentsList) {
	const options = {
		baselinePath: null,
		json: false,
		measuredRuns: MEASURED_RUNS_DEFAULT,
		sizeOnly: false
	};
	const seen = new Set();

	for (let index = 0; index < argumentsList.length; index += 1) {
		const argument = argumentsList[index];
		if (seen.has(argument)) {
			throw new TypeError(`${String(argument)} may be supplied at most once.`);
		}
		if (argument === "--baseline") {
			seen.add(argument);
			const value = argumentsList[index + 1];
			if (value === undefined || value.startsWith("--")) {
				throw new TypeError("--baseline requires a path to a prior dist/index.js file.");
			}
			options.baselinePath = value;
			index += 1;
		} else if (argument === "--json") {
			seen.add(argument);
			options.json = true;
		} else if (argument === "--runs") {
			seen.add(argument);
			const value = argumentsList[index + 1];
			const parsed = Number(value);
			if (!Number.isSafeInteger(parsed) || parsed < MEASURED_RUNS_DEFAULT) {
				throw new TypeError(`--runs must be an integer of at least ${String(MEASURED_RUNS_DEFAULT)}.`);
			}
			options.measuredRuns = parsed;
			index += 1;
		} else if (argument === "--size-only") {
			seen.add(argument);
			options.sizeOnly = true;
		} else {
			throw new TypeError(`Unknown measurement argument: ${String(argument)}`);
		}
	}

	return Object.freeze(options);
}

/**
 * Formats milliseconds consistently for the human-readable report.
 *
 * @param {number} value
 * @returns {string}
 */
export function formatMilliseconds(value) {
	return value.toFixed(MILLISECOND_PRECISION);
}

function createVisibleDates() {
	const firstDate = Date.UTC(2026, 6, 26);
	return Object.freeze(Array.from({ length: DAYS_IN_VISIBLE_RANGE }, (_value, index) => {
		const date = new Date(firstDate);
		date.setUTCDate(date.getUTCDate() + index);
		return date.toISOString().slice(0, 10);
	}));
}

function sizeOf(bytes) {
	return Object.freeze({
		gzipBytes: gzipSync(bytes, GZIP_OPTIONS).byteLength,
		rawBytes: bytes.byteLength
	});
}
