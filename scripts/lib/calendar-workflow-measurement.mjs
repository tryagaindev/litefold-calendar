import { readFile } from "node:fs/promises";
import { dirname, extname, relative, resolve, sep } from "node:path";
import { gzipSync } from "node:zlib";

import ts from "typescript";

export const DENSE_EVENT_COUNT = 10_000;
export const WORKFLOW_MEASURED_RUNS_DEFAULT = 10;
export const WORKFLOW_WARMUP_RUNS_DEFAULT = 3;
export const IMPORT_MEASURED_RUNS_DEFAULT = 10;
export const IMPORT_WARMUP_RUNS_DEFAULT = 2;

export const WORKFLOW_OPERATION_EXPECTATIONS = Object.freeze([
	Object.freeze({
		gridCommits: 0,
		key: "initialize",
		phases: Object.freeze([]),
		sourceCalls: 0
	}),
	Object.freeze({
		gridCommits: 1,
		key: "denseInitialRender",
		phases: Object.freeze(["ready"]),
		sourceCalls: 1
	}),
	Object.freeze({
		gridCommits: 1,
		key: "nextMonth",
		phases: Object.freeze(["ready"]),
		sourceCalls: 1
	}),
	Object.freeze({
		gridCommits: 1,
		key: "directSetEvents",
		phases: Object.freeze(["ready"]),
		sourceCalls: 0
	}),
	Object.freeze({
		gridCommits: 1,
		key: "asyncStart",
		phases: Object.freeze(["loading"]),
		sourceCalls: 1
	}),
	Object.freeze({
		gridCommits: 1,
		key: "asyncCompletion",
		phases: Object.freeze(["ready"]),
		sourceCalls: 0
	})
]);

const GZIP_OPTIONS = Object.freeze({ level: 9 });

/**
 * Measures one emitted asset without assigning a pass/fail threshold.
 *
 * @param {string} path
 * @returns {Promise<Readonly<{ gzipBytes: number, rawBytes: number }>>}
 */
export async function measureDistributionAsset(path) {
	const bytes = await readFile(path);
	return Object.freeze({
		gzipBytes: gzipSync(bytes, GZIP_OPTIONS).byteLength,
		rawBytes: bytes.byteLength
	});
}

/**
 * Resolves the JavaScript modules statically reachable from one ESM entry.
 * Dynamic imports intentionally remain outside the initial-load graph.
 *
 * @param {string} entryPath
 * @param {string} rootDirectory
 * @returns {Promise<Readonly<{
 *   combinedGzipBytes: number,
 *   fileCount: number,
 *   files: readonly string[],
 *   rawBytes: number,
 *   separateGzipBytes: number
 * }>>}
 */
export async function measureReachableJavaScriptGraph(entryPath, rootDirectory) {
	const absoluteRoot = resolve(rootDirectory);
	const pending = [resolve(entryPath)];
	const files = new Map();

	while (pending.length > 0) {
		const path = pending.pop();
		if (path === undefined || files.has(path)) {
			continue;
		}
		assertWithinRoot(path, absoluteRoot);
		const bytes = await readFile(path);
		files.set(path, bytes);
		const source = ts.createSourceFile(
			path,
			bytes.toString("utf8"),
			ts.ScriptTarget.Latest,
			false,
			ts.ScriptKind.JS
		);
		for (const specifier of readStaticModuleSpecifiers(source)) {
			if (!specifier.startsWith("./") && !specifier.startsWith("../")) {
				continue;
			}
			const resolvedPath = resolve(dirname(path), specifier);
			pending.push(extname(resolvedPath) === "" ? `${resolvedPath}.js` : resolvedPath);
		}
	}

	const ordered = [...files].sort(([left], [right]) => left.localeCompare(right, "en"));
	const rawBytes = ordered.reduce((total, [, bytes]) => total + bytes.byteLength, 0);
	const separateGzipBytes = ordered.reduce(
		(total, [, bytes]) => total + gzipSync(bytes, GZIP_OPTIONS).byteLength,
		0
	);
	const combined = Buffer.concat(ordered.map(([, bytes]) => bytes));
	return Object.freeze({
		combinedGzipBytes: gzipSync(combined, GZIP_OPTIONS).byteLength,
		fileCount: ordered.length,
		files: Object.freeze(ordered.map(([path]) => relative(absoluteRoot, path).replaceAll(sep, "/"))),
		rawBytes,
		separateGzipBytes
	});
}

/**
 * Applies deterministic render-operation assertions without comparing elapsed time.
 *
 * @param {readonly Readonly<{
 *   gridCommits: number,
 *   key: string,
 *   phases: readonly string[],
 *   sourceCalls: number
 * }>[] } steps
 * @returns {void}
 */
export function assertWorkflowOperationContract(steps) {
	if (steps.length !== WORKFLOW_OPERATION_EXPECTATIONS.length) {
		throw new Error(
			`Expected ${String(WORKFLOW_OPERATION_EXPECTATIONS.length)} workflow steps; received ${String(steps.length)}.`
		);
	}
	for (let index = 0; index < WORKFLOW_OPERATION_EXPECTATIONS.length; index += 1) {
		const expected = WORKFLOW_OPERATION_EXPECTATIONS[index];
		const actual = steps[index];
		if (expected === undefined || actual === undefined || actual.key !== expected.key) {
			throw new Error(
				`Workflow step ${String(index + 1)} must be ${String(expected?.key)}; received ${String(actual?.key)}.`
			);
		}
		assertCounter(actual, expected, "sourceCalls");
		assertCounter(actual, expected, "gridCommits");
		if (actual.phases.length !== expected.phases.length ||
			actual.phases.some((phase, phaseIndex) => phase !== expected.phases[phaseIndex])) {
			throw new Error(
				`${actual.key} emitted phases ${actual.phases.join(" -> ") || "(none)"}; ` +
				`expected ${expected.phases.join(" -> ") || "(none)"}.`
			);
		}
	}
}

/**
 * Parses the standalone measurement command without introducing CI thresholds.
 *
 * @param {readonly string[]} argumentsList
 * @returns {Readonly<{
 *   importMeasuredRuns: number,
 *   importWarmupRuns: number,
 *   json: boolean,
 *   measuredRuns: number,
 *   warmupRuns: number
 * }>}
 */
export function parseWorkflowMeasurementArguments(argumentsList) {
	const result = {
		importMeasuredRuns: IMPORT_MEASURED_RUNS_DEFAULT,
		importWarmupRuns: IMPORT_WARMUP_RUNS_DEFAULT,
		json: false,
		measuredRuns: WORKFLOW_MEASURED_RUNS_DEFAULT,
		warmupRuns: WORKFLOW_WARMUP_RUNS_DEFAULT
	};
	const valuedArguments = new Map([
		["--import-runs", "importMeasuredRuns"],
		["--import-warmups", "importWarmupRuns"],
		["--runs", "measuredRuns"],
		["--warmups", "warmupRuns"]
	]);
	const seen = new Set();

	for (let index = 0; index < argumentsList.length; index += 1) {
		const argument = argumentsList[index];
		if (argument === "--json") {
			if (seen.has(argument)) {
				throw new TypeError("--json may be supplied at most once.");
			}
			seen.add(argument);
			result.json = true;
			continue;
		}
		const property = valuedArguments.get(argument);
		if (property === undefined) {
			throw new TypeError(`Unknown workflow measurement argument: ${String(argument)}`);
		}
		if (seen.has(argument)) {
			throw new TypeError(`${argument} may be supplied at most once.`);
		}
		seen.add(argument);
		const rawValue = argumentsList[index + 1];
		const value = Number(rawValue);
		const isWarmup = property.toLowerCase().includes("warmup");
		if (!Number.isSafeInteger(value) || value < (isWarmup ? 0 : 1)) {
			throw new TypeError(`${argument} requires ${isWarmup ? "a non-negative" : "a positive"} integer.`);
		}
		result[property] = value;
		index += 1;
	}

	return Object.freeze(result);
}

function readStaticModuleSpecifiers(sourceFile) {
	const specifiers = [];
	for (const statement of sourceFile.statements) {
		if ((ts.isImportDeclaration(statement) || ts.isExportDeclaration(statement)) &&
			statement.moduleSpecifier !== undefined && ts.isStringLiteralLike(statement.moduleSpecifier)) {
			specifiers.push(statement.moduleSpecifier.text);
		}
	}
	return specifiers;
}

function assertWithinRoot(path, root) {
	const rootRelativePath = relative(root, path);
	if (rootRelativePath === ".." || rootRelativePath.startsWith(`..${sep}`) || resolve(path) === root) {
		throw new Error(`Reachable module ${path} must remain beneath ${root}.`);
	}
}

function assertCounter(actual, expected, property) {
	if (actual[property] !== expected[property]) {
		throw new Error(
			`${actual.key} completed ${String(actual[property])} ${property}; ` +
			`expected ${String(expected[property])}.`
		);
	}
}
