import assert from "node:assert/strict";
import { mkdtemp, mkdir, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { gzipSync } from "node:zlib";

import {
	assertWorkflowOperationContract,
	IMPORT_MEASURED_RUNS_DEFAULT,
	IMPORT_WARMUP_RUNS_DEFAULT,
	measureDistributionAsset,
	measureReachableJavaScriptGraph,
	parseWorkflowMeasurementArguments,
	WORKFLOW_MEASURED_RUNS_DEFAULT,
	WORKFLOW_OPERATION_EXPECTATIONS,
	WORKFLOW_WARMUP_RUNS_DEFAULT
} from "../lib/calendar-workflow-measurement.mjs";

void test("distribution asset measurement reports reproducible raw and gzip bytes", async (context) => {
	const directory = await mkdtemp(join(tmpdir(), "lfc-workflow-asset-"));
	context.after(async () => { await rm(directory, { force: true, recursive: true }); });
	const path = join(directory, "styles.css");
	const source = ".litefold-calendar{color:rebeccapurple}\n".repeat(100);
	await writeFile(path, source, "utf8");

	assert.deepEqual(await measureDistributionAsset(path), {
		gzipBytes: gzipSync(Buffer.from(source), { level: 9 }).byteLength,
		rawBytes: Buffer.byteLength(source, "utf8")
	});
});

void test("root import graph excludes unreferenced optional modules", async (context) => {
	const directory = await mkdtemp(join(tmpdir(), "lfc-workflow-graph-"));
	context.after(async () => { await rm(directory, { force: true, recursive: true }); });
	await mkdir(join(directory, "extensions"));
	const sources = new Map([
		["index.js", 'export { createCalendar } from "./calendar.js";\nexport { CalendarError } from "./errors.js";\n'],
		["calendar.js", 'import { helper } from "./internal.js";\nexport const createCalendar = helper;\n'],
		["errors.js", "export class CalendarError extends Error {}\n"],
		["internal.js", 'import "node:fs";\nexport const helper = () => undefined;\nexport const loadOptional = () => import("./extensions/webmcp.js");\n'],
		[join("extensions", "webmcp.js"), "export const optional = true;\n"]
	]);
	await Promise.all([...sources].map(([path, source]) => writeFile(join(directory, path), source, "utf8")));

	const graph = await measureReachableJavaScriptGraph(join(directory, "index.js"), directory);
	assert.deepEqual(graph.files, ["calendar.js", "errors.js", "index.js", "internal.js"]);
	assert.equal(
		graph.rawBytes,
		[...sources].filter(([path]) => !path.includes("extensions"))
			.reduce((total, [, source]) => total + Buffer.byteLength(source, "utf8"), 0)
	);
	assert.ok(graph.separateGzipBytes > 0);
	assert.ok(graph.combinedGzipBytes > 0);
});

void test("workflow operation contract catches redundant renders without timing assertions", () => {
	const canonical = WORKFLOW_OPERATION_EXPECTATIONS.map((step) => ({
		...step,
		phases: [...step.phases]
	}));
	assert.doesNotThrow(() => { assertWorkflowOperationContract(canonical); });

	const redundant = canonical.map((step) => ({ ...step }));
	const directUpdate = redundant.find((step) => step.key === "directSetEvents");
	assert.ok(directUpdate !== undefined);
	directUpdate.gridCommits += 1;
	assert.throws(
		() => { assertWorkflowOperationContract(redundant); },
		/directSetEvents completed 2 gridCommits/u
	);

	const incorrectTimingSemantics = canonical.map((step) => ({ ...step, phases: [...step.phases] }));
	const asyncStart = incorrectTimingSemantics.find((step) => step.key === "asyncStart");
	assert.ok(asyncStart !== undefined);
	asyncStart.phases = ["ready"];
	assert.throws(
		() => { assertWorkflowOperationContract(incorrectTimingSemantics); },
		/asyncStart emitted phases ready; expected loading/u
	);
});

void test("workflow measurement arguments keep timings diagnostic and allow zero warmups", () => {
	assert.deepEqual(parseWorkflowMeasurementArguments([]), {
		importMeasuredRuns: IMPORT_MEASURED_RUNS_DEFAULT,
		importWarmupRuns: IMPORT_WARMUP_RUNS_DEFAULT,
		json: false,
		measuredRuns: WORKFLOW_MEASURED_RUNS_DEFAULT,
		warmupRuns: WORKFLOW_WARMUP_RUNS_DEFAULT
	});
	assert.deepEqual(
		parseWorkflowMeasurementArguments([
			"--json",
			"--runs", "3",
			"--warmups", "0",
			"--import-runs", "4",
			"--import-warmups", "0"
		]),
		{
			importMeasuredRuns: 4,
			importWarmupRuns: 0,
			json: true,
			measuredRuns: 3,
			warmupRuns: 0
		}
	);
	assert.throws(() => parseWorkflowMeasurementArguments(["--runs", "0"]), /positive integer/u);
	assert.throws(() => parseWorkflowMeasurementArguments(["--json", "--json"]), /at most once/u);
});
