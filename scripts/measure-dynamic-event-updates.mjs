import { readFile, readdir, stat } from "node:fs/promises";
import { createRequire } from "node:module";
import { arch, platform } from "node:os";
import { dirname, isAbsolute, join, relative, resolve, sep } from "node:path";
import { performance as nodePerformance } from "node:perf_hooks";
import { fileURLToPath, pathToFileURL } from "node:url";

import { JSDOM } from "jsdom";

import {
	createEventSnapshots,
	createDistributionMeasurements,
	EVENT_COUNT,
	formatMilliseconds,
	parseMeasurementArguments,
	summarizeDurations,
	VISIBLE_RANGE,
	WARMUP_RUNS
} from "./lib/dynamic-update-measurement.mjs";

const REPOSITORY_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const DIST_DIRECTORY = join(REPOSITORY_ROOT, "dist");
const DIST_ENTRY = join(DIST_DIRECTORY, "index.js");
const DIST_COORDINATOR = join(DIST_DIRECTORY, "internal", "runtime", "coordinator.js");
const require = createRequire(import.meta.url);
const JSDOM_VERSION = require("jsdom/package.json").version;
const READY_ATTEMPTS = 200;
const DOM_GLOBAL_NAMES = [
	"AbortController",
	"CustomEvent",
	"DOMException",
	"Element",
	"Event",
	"HTMLElement",
	"HTMLButtonElement",
	"KeyboardEvent",
	"MouseEvent",
	"Node"
];
const STRATEGY_LABELS = Object.freeze({
	recreate: "Instance recreation",
	refetch: "Provider state + refetchEvents()",
	setEvents: "setEvents()"
});

const options = parseMeasurementArguments(process.argv.slice(2));
const baselinePath = options.baselinePath === null
	? null
	: isAbsolute(options.baselinePath)
		? options.baselinePath
		: resolve(process.cwd(), options.baselinePath);
const distribution = await measureDistribution(baselinePath);

let performanceReport = null;
if (!options.sizeOnly) {
	const packageModule = await import(`${pathToFileURL(DIST_ENTRY).href}?dynamic-update-measurement`);
	if (typeof packageModule.createCalendar !== "function") {
		throw new TypeError("dist/index.js must export createCalendar().");
	}
	performanceReport = await measureStrategies(packageModule.createCalendar, options.measuredRuns);
}

const report = {
	distribution,
	environment: {
		architecture: arch(),
		jsdom: JSDOM_VERSION,
		node: process.version,
		platform: platform()
	},
	performance: performanceReport,
	protocol: {
		eventCount: EVENT_COUNT,
		measuredRuns: options.measuredRuns,
		thresholdsApplied: false,
		visibleRange: VISIBLE_RANGE,
		warmupRuns: WARMUP_RUNS
	}
};

if (options.json) {
	console.log(JSON.stringify(report, null, 2));
} else {
	printHumanReport(report);
}

async function measureStrategies(createCalendar, measuredRuns) {
	const snapshots = createEventSnapshots();
	if (snapshots.some((snapshot) => snapshot.length !== EVENT_COUNT)) {
		throw new Error(`Every measurement snapshot must contain exactly ${String(EVENT_COUNT)} events.`);
	}
	const dom = new JSDOM(`
		<div id="set-events-calendar"></div>
		<div id="refetch-calendar"></div>
		<div id="recreate-calendar"></div>
	`, {
		pretendToBeVisual: true,
		url: "https://example.test/dynamic-event-update-measurement"
	});
	const restoreGlobals = installDomGlobals(dom);
	const liveCalendars = new Set();
	try {
		const setEventsHost = getHost(dom, "set-events-calendar");
		const refetchHost = getHost(dom, "refetch-calendar");
		const recreateHost = getHost(dom, "recreate-calendar");
		const createOptions = (events) => ({
			agendaDomLimit: 200,
			agendaPageSize: 50,
			events,
			firstDay: 0,
			initialDate: "2026-08-15",
			locale: "en-US",
			maxGridEventsPerDay: 3,
			now: () => new Date("2026-08-15T12:00:00Z"),
			sourceEventLimit: EVENT_COUNT,
			swipe: false,
			timeZone: "UTC"
		});

		let setEventsCalendar = createCalendar(setEventsHost, createOptions(snapshots[0]));
		if (typeof setEventsCalendar.setEvents !== "function") {
			throw new TypeError("The built Calendar must expose the accepted setEvents(events) API.");
		}
		setEventsCalendar.render();
		liveCalendars.add(setEventsCalendar);

		let providerSnapshot = snapshots[0];
		let lastProviderRange = null;
		const provider = (range) => {
			lastProviderRange = { end: range.end, start: range.start };
			return providerSnapshot;
		};
		const refetchCalendar = createCalendar(refetchHost, createOptions(provider));
		refetchCalendar.render();
		liveCalendars.add(refetchCalendar);

		let recreateCalendar = createCalendar(recreateHost, createOptions(snapshots[0]));
		recreateCalendar.render();
		liveCalendars.add(recreateCalendar);

		await Promise.all([
			waitUntilReady(setEventsCalendar),
			waitUntilReady(refetchCalendar),
			waitUntilReady(recreateCalendar)
		]);
		assertVisibleRange(setEventsCalendar);
		assertVisibleRange(refetchCalendar);
		assertVisibleRange(recreateCalendar);
		assertRange(lastProviderRange, "provider request");

		const strategies = [
			{
				key: "setEvents",
				run: async (events) => {
					setEventsCalendar.setEvents(events);
					await waitUntilReady(setEventsCalendar);
					assertVisibleRange(setEventsCalendar);
				}
			},
			{
				key: "refetch",
				run: async (events) => {
					providerSnapshot = events;
					refetchCalendar.refetchEvents();
					await waitUntilReady(refetchCalendar);
					assertVisibleRange(refetchCalendar);
					assertRange(lastProviderRange, "provider request");
				}
			},
			{
				key: "recreate",
				run: async (events) => {
					recreateCalendar.destroy();
					liveCalendars.delete(recreateCalendar);
					recreateCalendar = createCalendar(recreateHost, createOptions(events));
					recreateCalendar.render();
					liveCalendars.add(recreateCalendar);
					await waitUntilReady(recreateCalendar);
					assertVisibleRange(recreateCalendar);
				}
			}
		];

		await runCycles(strategies, snapshots, WARMUP_RUNS, null, 0);
		const samples = new Map(strategies.map((strategy) => [strategy.key, []]));
		await runCycles(strategies, snapshots, measuredRuns, samples, WARMUP_RUNS);

		return strategies.map((strategy) => {
			const strategySamples = samples.get(strategy.key) ?? [];
			return {
				key: strategy.key,
				label: STRATEGY_LABELS[strategy.key],
				samplesMilliseconds: strategySamples,
				...summarizeDurations(strategySamples)
			};
		});
	} finally {
		for (const calendar of liveCalendars) {
			calendar.destroy();
		}
		restoreGlobals();
	}
}

async function runCycles(strategies, snapshots, cycleCount, samples, cycleOffset) {
	for (let cycle = 0; cycle < cycleCount; cycle += 1) {
		const absoluteCycle = cycle + cycleOffset;
		const events = snapshots[(absoluteCycle + 1) % snapshots.length];
		const rotation = absoluteCycle % strategies.length;
		const ordered = [...strategies.slice(rotation), ...strategies.slice(0, rotation)];
		for (const strategy of ordered) {
			await Promise.resolve();
			const started = nodePerformance.now();
			await strategy.run(events);
			const duration = nodePerformance.now() - started;
			if (samples !== null) {
				samples.get(strategy.key)?.push(duration);
			}
		}
	}
}

async function waitUntilReady(calendar) {
	for (let attempt = 0; attempt < READY_ATTEMPTS; attempt += 1) {
		const phase = calendar.getState().phase;
		if (phase === "ready") {
			return;
		}
		if (phase !== "loading") {
			throw new Error(`Calendar entered ${String(phase)} instead of ready.`);
		}
		await Promise.resolve();
	}
	throw new Error("Calendar did not become ready within the deterministic microtask allowance.");
}

function assertVisibleRange(calendar) {
	assertRange(calendar.getState().range, "calendar state");
}

function assertRange(range, description) {
	if (range?.start !== VISIBLE_RANGE.start || range.end !== VISIBLE_RANGE.end) {
		throw new Error(
			`${description} used ${String(range?.start)}/${String(range?.end)}; ` +
			`expected ${VISIBLE_RANGE.start}/${VISIBLE_RANGE.end}.`
		);
	}
}

function getHost(dom, id) {
	const host = dom.window.document.getElementById(id);
	if (!(host instanceof dom.window.HTMLElement)) {
		throw new TypeError(`Measurement host ${id} was not created.`);
	}
	return host;
}

function installDomGlobals(dom) {
	const descriptors = new Map();
	const install = (name, value) => {
		descriptors.set(name, Object.getOwnPropertyDescriptor(globalThis, name));
		Object.defineProperty(globalThis, name, {
			configurable: true,
			value,
			writable: true
		});
	};

	install("window", dom.window);
	install("document", dom.window.document);
	for (const name of DOM_GLOBAL_NAMES) {
		install(name, dom.window[name]);
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

function printHumanReport(report) {
	console.log("Dynamic event update measurement");
	console.log(
		`Runtime: ${report.environment.node}; ${report.environment.platform} ` +
		`${report.environment.architecture}; JSDOM ${report.environment.jsdom}`
	);
	console.log(
		`Protocol: ${String(report.protocol.eventCount)} events; ` +
		`${String(report.protocol.warmupRuns)} warmups; ` +
		`${String(report.protocol.measuredRuns)} measured runs; ` +
		`${report.protocol.visibleRange.start}/${report.protocol.visibleRange.end}`
	);
	if (report.performance !== null) {
		console.log("");
		console.log("Strategy                              Median (ms)   P95 (ms)");
		for (const result of report.performance) {
			console.log(
				`${result.label.padEnd(37)}${formatMilliseconds(result.medianMilliseconds).padStart(11)}` +
				`${formatMilliseconds(result.p95Milliseconds).padStart(11)}`
			);
		}
	}

	console.log("");
	console.log("Distribution size (gzip level 9; JavaScript modules compressed separately)");
	if (report.distribution.baselinePath !== null) {
		console.log(`Baseline: ${report.distribution.baselinePath}`);
	}
	console.log("Artifact                                  Raw bytes  Gzip bytes   Raw delta  Gzip delta");
	for (const measurement of report.distribution.measurements) {
		const rawDelta = measurement.delta === null ? "-" : formatSigned(measurement.delta.rawBytes);
		const gzipDelta = measurement.delta === null ? "-" : formatSigned(measurement.delta.gzipBytes);
		console.log(
			`${measurement.label.padEnd(42)}` +
			`${String(measurement.current.rawBytes).padStart(9)}` +
			`${String(measurement.current.gzipBytes).padStart(12)}` +
			`${rawDelta.padStart(12)}` +
			`${gzipDelta.padStart(12)}`
		);
	}
	console.log("");
	console.log("No timing or size thresholds are applied.");
}

function formatSigned(value) {
	return value > 0 ? `+${String(value)}` : String(value);
}

function displayPath(path) {
	const repositoryPath = relative(REPOSITORY_ROOT, path);
	if (repositoryPath !== "" && repositoryPath !== ".." && !repositoryPath.startsWith(`..${sep}`)) {
		return repositoryPath.replaceAll(sep, "/");
	}
	return path;
}

async function readRequiredFile(path, correctiveAction) {
	try {
		return await readFile(path);
	} catch (error) {
		throw new Error(`${correctiveAction} Could not read ${path}.`, { cause: error });
	}
}

async function measureDistribution(baselinePath) {
	const currentGraph = await readJavaScriptGraph(DIST_DIRECTORY);
	const [currentEntry, currentCoordinator] = await Promise.all([
		readRequiredFile(DIST_ENTRY, "Run npm run build:package before measuring dynamic event updates."),
		readRequiredFile(DIST_COORDINATOR, "Run npm run build:package before measuring dynamic event updates.")
	]);
	const baseline = await resolveBaseline(baselinePath);
	const [baselineEntry, baselineCoordinator, baselineGraph] = await Promise.all([
		baseline === null
			? Promise.resolve(null)
			: readRequiredFile(
				baseline.entry,
				"The --baseline path must contain a readable index.js file."
			),
		baseline?.directory === null || baseline === null
			? Promise.resolve(null)
			: readRequiredFile(
				join(baseline.directory, "internal", "runtime", "coordinator.js"),
				"The baseline dist directory must contain internal/runtime/coordinator.js."
			),
		baseline?.directory === null || baseline === null
			? Promise.resolve(null)
			: readJavaScriptGraph(baseline.directory)
	]);
	return {
		baselinePath: baselinePath === null ? null : displayPath(baselinePath),
		gzipLevel: 9,
		measurements: createDistributionMeasurements(
			{
				coordinator: currentCoordinator,
				entry: currentEntry,
				javascript: currentGraph.bytes
			},
			baseline === null
				? null
				: {
					coordinator: baselineCoordinator,
					entry: baselineEntry,
					javascript: baselineGraph?.bytes ?? null
				}
		)
	};
}

async function resolveBaseline(path) {
	if (path === null) {
		return null;
	}
	let metadata;
	try {
		metadata = await stat(path);
	} catch (error) {
		throw new Error(`The --baseline path is not readable: ${path}.`, { cause: error });
	}
	if (metadata.isDirectory()) {
		return { directory: path, entry: join(path, "index.js") };
	}
	if (metadata.isFile()) {
		return { directory: null, entry: path };
	}
	throw new TypeError("--baseline must identify a prior dist directory or dist/index.js file.");
}

async function readJavaScriptGraph(directory) {
	const paths = await listJavaScriptFiles(directory);
	if (paths.length === 0) {
		throw new Error(`No JavaScript modules were found beneath ${directory}.`);
	}
	return {
		bytes: await Promise.all(paths.map((path) => readRequiredFile(
			path,
			"Every JavaScript module in the measured distribution must remain readable."
		))),
		paths
	};
}

async function listJavaScriptFiles(directory) {
	let entries;
	try {
		entries = await readdir(directory, { withFileTypes: true });
	} catch (error) {
		throw new Error(`Could not enumerate JavaScript modules beneath ${directory}.`, { cause: error });
	}
	const paths = [];
	for (const entry of entries.sort((left, right) => left.name.localeCompare(right.name, "en"))) {
		const path = join(directory, entry.name);
		if (entry.isDirectory()) {
			paths.push(...await listJavaScriptFiles(path));
		} else if (entry.isFile() && entry.name.endsWith(".js")) {
			paths.push(path);
		}
	}
	return paths;
}
