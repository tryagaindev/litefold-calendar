import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import { createRequire } from "node:module";
import { promisify } from "node:util";
import { arch, platform } from "node:os";
import { dirname, join, resolve } from "node:path";
import { performance as nodePerformance } from "node:perf_hooks";
import { fileURLToPath, pathToFileURL } from "node:url";

import { JSDOM } from "jsdom";

import {
	assertWorkflowOperationContract,
	DENSE_EVENT_COUNT,
	measureDistributionAsset,
	measureReachableJavaScriptGraph,
	parseWorkflowMeasurementArguments
} from "./lib/calendar-workflow-measurement.mjs";
import { summarizeDurations } from "./lib/dynamic-update-measurement.mjs";

const execFileAsync = promisify(execFile);
const require = createRequire(import.meta.url);
const JSDOM_VERSION = require("jsdom/package.json").version;
const REPOSITORY_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const DIST_DIRECTORY = join(REPOSITORY_ROOT, "dist");
const DIST_ENTRY = join(DIST_DIRECTORY, "index.js");
const DIST_STYLES = join(DIST_DIRECTORY, "styles.css");
const DAYS_PER_GRID = 42;
const GRID_EVENTS_PER_DAY = 3;
const AGENDA_EVENT_LIMIT = 50;
const READY_ATTEMPTS = 200;
const INITIAL_RANGE = Object.freeze({ end: "2026-09-06", start: "2026-07-26" });
const NEXT_RANGE = Object.freeze({ end: "2026-10-11", start: "2026-08-30" });
const DOM_GLOBAL_NAMES = [
	"AbortController",
	"AbortSignal",
	"CustomEvent",
	"DOMException",
	"Element",
	"Event",
	"HTMLElement",
	"HTMLButtonElement",
	"KeyboardEvent",
	"MouseEvent",
	"MutationObserver",
	"Node"
];

const options = parseWorkflowMeasurementArguments(process.argv.slice(2));
const entryUrl = pathToFileURL(DIST_ENTRY).href;
const importSamples = await measureFreshProcessImports(
	entryUrl,
	options.importWarmupRuns,
	options.importMeasuredRuns
);
const [rootImportGraph, stylesheet] = await Promise.all([
	measureReachableJavaScriptGraph(DIST_ENTRY, DIST_DIRECTORY),
	measureDistributionAsset(DIST_STYLES)
]);
assert.equal(
	rootImportGraph.files.some((path) => path.startsWith("extensions/")),
	false,
	"The root import graph must exclude optional extensions."
);

const packageModule = await import(`${entryUrl}?calendar-workflow-measurement`);
assert.equal(typeof packageModule.createCalendar, "function", "dist/index.js must export createCalendar().");
const snapshots = Object.freeze({
	initial: createDenseEvents(INITIAL_RANGE.start, "initial"),
	next: createDenseEvents(NEXT_RANGE.start, "next"),
	replacement: createDenseEvents(NEXT_RANGE.start, "replacement"),
	settled: createDenseEvents(NEXT_RANGE.start, "settled")
});

const measuredResults = [];
const totalRuns = options.warmupRuns + options.measuredRuns;
for (let runIndex = 0; runIndex < totalRuns; runIndex += 1) {
	const result = await runWorkflow(packageModule.createCalendar, snapshots);
	assertWorkflowOperationContract(result.steps.map((step) => step.operations));
	for (const step of result.steps.slice(1)) {
		assertDenseDom(step.dom, step.key);
	}
	if (runIndex >= options.warmupRuns) {
		measuredResults.push(result);
	}
}

const report = Object.freeze({
	distribution: Object.freeze({ rootImportGraph, stylesheet }),
	environment: Object.freeze({
		architecture: arch(),
		jsdom: JSDOM_VERSION,
		node: process.version,
		platform: platform()
	}),
	import: Object.freeze({
		freshProcess: Object.freeze({
			samplesMilliseconds: Object.freeze(importSamples),
			...summarizeDurations(importSamples)
		})
	}),
	operations: Object.freeze(measuredResults[0]?.steps.map((step) => Object.freeze({
		dom: step.dom,
		...step.operations
	})) ?? []),
	performance: Object.freeze(summarizeWorkflowTimings(measuredResults)),
	protocol: Object.freeze({
		denseEventCount: DENSE_EVENT_COUNT,
		importMeasuredRuns: options.importMeasuredRuns,
		importWarmupRuns: options.importWarmupRuns,
		measuredRuns: options.measuredRuns,
		thresholdsApplied: false,
		warmupRuns: options.warmupRuns
	})
});

if (options.json) {
	console.log(JSON.stringify(report, null, 2));
} else {
	printHumanReport(report);
}

async function runWorkflow(createCalendar, eventSnapshots) {
	const dom = new JSDOM('<div id="calendar"></div>', {
		pretendToBeVisual: true,
		url: "https://example.test/calendar-workflow-measurement"
	});
	const restoreGlobals = installDomGlobals(dom);
	const host = dom.window.document.getElementById("calendar");
	assert.ok(host instanceof dom.window.HTMLElement, "The measurement host must exist.");
	const mutations = createMutationRecorder(host, dom.window);
	const observations = { phases: [], sourceCalls: 0 };
	const directSnapshots = new Map([
		[INITIAL_RANGE.start, eventSnapshots.initial],
		[NEXT_RANGE.start, eventSnapshots.next]
	]);
	const source = (range) => {
		observations.sourceCalls += 1;
		const snapshot = directSnapshots.get(range.start);
		if (snapshot === undefined) {
			throw new Error(`No dense snapshot was prepared for ${range.start}/${range.end}.`);
		}
		return snapshot;
	};
	let calendar;

	try {
		const steps = [];
		steps.push(await measureStep("initialize", observations, mutations, host, () => {
			calendar = createCalendar(host, {
				agendaDomLimit: AGENDA_EVENT_LIMIT,
				agendaPageSize: AGENDA_EVENT_LIMIT,
				events: source,
				firstDay: 0,
				initialDate: "2026-08-15",
				locale: "en-US",
				maxGridEventsPerDay: GRID_EVENTS_PER_DAY,
				now: () => new Date("2026-08-15T12:00:00Z"),
				onStateChange: (state) => { observations.phases.push(state.phase); },
				sourceEventLimit: DENSE_EVENT_COUNT,
				swipe: false,
				timeZone: "UTC"
			});
			assert.equal(calendar.getState().phase, "idle");
			assert.equal(host.childElementCount, 0, "createCalendar() must not render eagerly.");
		}));

		steps.push(await measureStep("denseInitialRender", observations, mutations, host, () => {
			calendar.render();
			assert.equal(calendar.getState().phase, "ready");
		}));
		assertRange(calendar, INITIAL_RANGE, "dense initial render");

		steps.push(await measureStep("nextMonth", observations, mutations, host, () => {
			calendar.next();
			assert.equal(calendar.getState().phase, "ready");
		}));
		assertRange(calendar, NEXT_RANGE, "next-month navigation");

		steps.push(await measureStep("directSetEvents", observations, mutations, host, () => {
			calendar.setEvents(eventSnapshots.replacement);
			assert.equal(calendar.getState().phase, "ready");
		}));

		let resolvePending;
		const pending = new Promise((resolvePromise) => { resolvePending = resolvePromise; });
		steps.push(await measureStep("asyncStart", observations, mutations, host, () => {
			calendar.setEvents(() => {
				observations.sourceCalls += 1;
				return pending;
			});
			assert.equal(calendar.getState().phase, "loading");
			assert.equal(host.getAttribute("aria-busy"), "true");
		}));

		steps.push(await measureStep("asyncCompletion", observations, mutations, host, async () => {
			assert.equal(typeof resolvePending, "function", "The controlled source must expose its resolver.");
			resolvePending(eventSnapshots.settled);
			await waitUntilReady(calendar);
			assert.notEqual(host.getAttribute("aria-busy"), "true");
		}));

		return Object.freeze({ steps: Object.freeze(steps) });
	} finally {
		mutations.disconnect();
		calendar?.destroy();
		restoreGlobals();
	}
}

async function measureStep(key, observations, mutations, host, operation) {
	await flushMutationRecords();
	const before = Object.freeze({
		mutations: mutations.snapshot(),
		phaseIndex: observations.phases.length,
		sourceCalls: observations.sourceCalls
	});
	const started = nodePerformance.now();
	const result = operation();
	if (result !== null && typeof result === "object" && typeof result.then === "function") {
		await result;
	}
	const durationMilliseconds = nodePerformance.now() - started;
	await flushMutationRecords();
	const mutationDelta = subtractCounters(mutations.snapshot(), before.mutations);
	return Object.freeze({
		dom: snapshotDom(host),
		durationMilliseconds,
		key,
		operations: Object.freeze({
			...mutationDelta,
			key,
			phases: Object.freeze(observations.phases.slice(before.phaseIndex)),
			sourceCalls: observations.sourceCalls - before.sourceCalls
		})
	});
}

function createMutationRecorder(host, ownerWindow) {
	const counts = {
		addedElements: 0,
		addedNodes: 0,
		agendaCommits: 0,
		attributeMutations: 0,
		childListMutations: 0,
		gridCommits: 0,
		hostCommits: 0,
		removedElements: 0,
		removedNodes: 0,
		weekRootsAdded: 0
	};
	const observer = new ownerWindow.MutationObserver((records) => {
		for (const record of records) {
			if (record.type === "attributes") {
				counts.attributeMutations += 1;
				continue;
			}
			if (record.type !== "childList") {
				continue;
			}
			counts.childListMutations += 1;
			counts.addedNodes += record.addedNodes.length;
			counts.removedNodes += record.removedNodes.length;
			counts.addedElements += countElements(record.addedNodes, ownerWindow);
			counts.removedElements += countElements(record.removedNodes, ownerWindow);
			if (record.target === host) {
				counts.hostCommits += 1;
			}
			if (record.target instanceof ownerWindow.Element &&
				record.target.classList.contains("lfc-calendar-weeks")) {
				counts.gridCommits += 1;
				counts.weekRootsAdded += [...record.addedNodes].filter((node) =>
					node instanceof ownerWindow.Element && node.classList.contains("lfc-calendar-week")
				).length;
			}
			if (record.target instanceof ownerWindow.Element &&
				record.target.classList.contains("lfc-calendar-agenda-list")) {
				counts.agendaCommits += 1;
			}
		}
	});
	observer.observe(host, { attributes: true, childList: true, subtree: true });
	return Object.freeze({
		disconnect: () => { observer.disconnect(); },
		snapshot: () => Object.freeze({ ...counts })
	});
}

function countElements(nodes, ownerWindow) {
	let count = 0;
	for (const node of nodes) {
		if (!(node instanceof ownerWindow.Element)) {
			continue;
		}
		count += 1 + node.querySelectorAll("*").length;
	}
	return count;
}

function subtractCounters(after, before) {
	return Object.fromEntries(Object.keys(after).map((key) => [key, after[key] - before[key]]));
}

function snapshotDom(host) {
	return Object.freeze({
		agendaEvents: host.querySelectorAll(".lfc-calendar-agenda-event").length,
		compactOverflows: host.querySelectorAll(".lfc-calendar-event-overflow.lfc-is-compact").length,
		elementCount: host.querySelectorAll("*").length,
		gridCells: host.querySelectorAll('[role="gridcell"]').length,
		gridSummaries: host.querySelectorAll(".lfc-calendar-event-summary").length,
		wideOverflows: host.querySelectorAll(".lfc-calendar-event-overflow.lfc-is-wide").length
	});
}

function assertDenseDom(snapshot, workflow) {
	assert.equal(snapshot.gridCells, DAYS_PER_GRID, `${workflow} must render one fixed six-week grid.`);
	assert.equal(
		snapshot.gridSummaries,
		DAYS_PER_GRID * GRID_EVENTS_PER_DAY,
		`${workflow} must preserve the configured grid cap.`
	);
	assert.equal(snapshot.agendaEvents, AGENDA_EVENT_LIMIT, `${workflow} must preserve the agenda DOM cap.`);
	assert.equal(snapshot.compactOverflows, DAYS_PER_GRID, `${workflow} must render one compact overflow per day.`);
	assert.equal(snapshot.wideOverflows, DAYS_PER_GRID, `${workflow} must render one wide overflow per day.`);
}

function createDenseEvents(start, label) {
	const startDate = new Date(`${start}T00:00:00.000Z`);
	return Object.freeze(Array.from({ length: DENSE_EVENT_COUNT }, (_value, index) => {
		const date = new Date(startDate);
		date.setUTCDate(date.getUTCDate() + (index % DAYS_PER_GRID));
		return Object.freeze({
			id: `${label}-event-${String(index).padStart(5, "0")}`,
			start: date.toISOString().slice(0, 10),
			title: `${label} event ${String(index + 1)}`
		});
	}));
}

async function waitUntilReady(calendar) {
	for (let attempt = 0; attempt < READY_ATTEMPTS; attempt += 1) {
		if (calendar.getState().phase === "ready") {
			return;
		}
		await Promise.resolve();
	}
	throw new Error("Calendar did not become ready within the deterministic microtask allowance.");
}

function assertRange(calendar, expected, workflow) {
	assert.deepEqual(calendar.getState().range, expected, `${workflow} must use the expected fixed range.`);
}

async function flushMutationRecords() {
	await Promise.resolve();
	await Promise.resolve();
}

function installDomGlobals(dom) {
	const descriptors = new Map();
	const install = (name, value) => {
		descriptors.set(name, Object.getOwnPropertyDescriptor(globalThis, name));
		Object.defineProperty(globalThis, name, { configurable: true, value, writable: true });
	};
	install("window", dom.window);
	install("document", dom.window.document);
	for (const name of DOM_GLOBAL_NAMES) {
		if (name in dom.window) {
			install(name, dom.window[name]);
		}
	}
	return () => {
		for (const [name, descriptor] of descriptors) {
			if (descriptor === undefined) {
				Reflect.deleteProperty(globalThis, name);
			} else {
				Object.defineProperty(globalThis, name, descriptor);
			}
		}
		dom.window.close();
	};
}

async function measureFreshProcessImports(url, warmupRuns, measuredRuns) {
	const samples = [];
	for (let index = 0; index < warmupRuns + measuredRuns; index += 1) {
		const source = [
			'import { performance } from "node:perf_hooks";',
			`const started = performance.now(); const loaded = await import(${JSON.stringify(url)});`,
			'if (typeof loaded.createCalendar !== "function") throw new TypeError("Missing createCalendar export.");',
			"process.stdout.write(String(performance.now() - started));"
		].join("\n");
		const { stdout } = await execFileAsync(process.execPath, [
			"--input-type=module",
			"--eval",
			source
		], {
			cwd: REPOSITORY_ROOT,
			encoding: "utf8",
			maxBuffer: 1024,
			timeout: 30_000,
			windowsHide: true
		});
		const duration = Number(stdout);
		if (!Number.isFinite(duration) || duration < 0) {
			throw new TypeError(`Fresh-process import emitted an invalid duration: ${stdout}`);
		}
		if (index >= warmupRuns) {
			samples.push(duration);
		}
	}
	return Object.freeze(samples);
}

function summarizeWorkflowTimings(results) {
	const first = results[0];
	if (first === undefined) {
		return [];
	}
	return first.steps.map((step, stepIndex) => {
		const samplesMilliseconds = results.map((result) => {
			const candidate = result.steps[stepIndex];
			assert.equal(candidate?.key, step.key, "Every measured run must preserve workflow order.");
			return candidate.durationMilliseconds;
		});
		return Object.freeze({
			key: step.key,
			samplesMilliseconds: Object.freeze(samplesMilliseconds),
			...summarizeDurations(samplesMilliseconds)
		});
	});
}

function printHumanReport(reportValue) {
	console.log("Calendar workflow performance measurement");
	console.log(
		`Runtime: ${reportValue.environment.node}; ${reportValue.environment.platform} ` +
		`${reportValue.environment.architecture}; JSDOM ${reportValue.environment.jsdom}`
	);
	console.log(
		`Root import graph: ${String(reportValue.distribution.rootImportGraph.fileCount)} modules; ` +
		`${String(reportValue.distribution.rootImportGraph.rawBytes)} raw bytes; ` +
		`${String(reportValue.distribution.rootImportGraph.separateGzipBytes)} separately-gzipped bytes; ` +
		`${String(reportValue.distribution.rootImportGraph.combinedGzipBytes)} combined-gzip bytes`
	);
	console.log(
		`Public stylesheet: ${String(reportValue.distribution.stylesheet.rawBytes)} raw bytes; ` +
		`${String(reportValue.distribution.stylesheet.gzipBytes)} gzip bytes`
	);
	console.log(
		`Fresh-process import: ${reportValue.import.freshProcess.medianMilliseconds.toFixed(3)} ms median; ` +
		`${reportValue.import.freshProcess.p95Milliseconds.toFixed(3)} ms p95`
	);
	console.log("");
	console.log("Workflow                       Grid commits  Source calls  Median (ms)   P95 (ms)");
	for (const timing of reportValue.performance) {
		const operation = reportValue.operations.find((candidate) => candidate.key === timing.key);
		console.log(
			`${timing.key.padEnd(31)}` +
			`${String(operation?.gridCommits ?? "-").padStart(12)}` +
			`${String(operation?.sourceCalls ?? "-").padStart(14)}` +
			`${timing.medianMilliseconds.toFixed(3).padStart(14)}` +
			`${timing.p95Milliseconds.toFixed(3).padStart(11)}`
		);
	}
	console.log("");
	console.log("Operation counts are asserted; elapsed-time and byte thresholds are not applied.");
}
