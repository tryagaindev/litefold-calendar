import assert from "node:assert/strict";
import { mkdtemp, readFile, rm, stat, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";

import {
	renderBrowserTargetDocumentation,
	replaceBrowserTargetDocumentation,
	syncBrowserTargetDocumentation
} from "../lib/browser-target-documentation.mjs";

//Synthetic resolver evidence exercises formatting, not today's supported browser versions.
const REPORT = Object.freeze({
	query: "baseline-widely-available",
	dataVersions: Object.freeze({ vite: "1.2.3", esbuild: "0.1.2" }),
	resolvedAt: "2024-01-01",
	javascript: Object.freeze(["safari16.4", "firefox114", "edge111", "chrome111", "ios16.4"]),
	css: Object.freeze(["chrome111", "edge111", "firefox114", "safari16.4", "ios16.4"])
});
const START = "<!-- browser-targets:start -->";
const END = "<!-- browser-targets:end -->";
const DOCUMENT = `# Compatibility\n\nKeep this introduction.\n\n${START}\nstale\n${END}\n\n## Policy\nKeep this policy.\n`;

void test("formats explicit desktop and mobile targets with resolver provenance", () => {
	const output = renderBrowserTargetDocumentation(REPORT);
	assert.match(output, /Preset: `baseline-widely-available`/u);
	assert.match(output, /Vite `1\.2\.3`; esbuild `0\.1\.2`/u);
	for (const row of [
		"| Google Chrome | 111 | 111 |",
		"| Microsoft Edge (Chromium) | 111 | 111 |",
		"| Mozilla Firefox | 114 | 114 |",
		"| Safari on macOS | 16.4 | 16.4 |",
		"| Safari on iOS / iPadOS | 16.4 | 16.4 |"
	]) {
		assert.ok(output.includes(row), row);
	}
});

void test("resolution dates and target ordering do not create documentation churn", () => {
	assert.equal(renderBrowserTargetDocumentation(REPORT), renderBrowserTargetDocumentation({
		...REPORT,
		resolvedAt: "2025-01-01",
		javascript: [...REPORT.javascript].reverse(),
		css: [...REPORT.css].reverse()
	}));
});

void test("reports different JavaScript and CSS minima without rounding or conflating them", () => {
	const output = renderBrowserTargetDocumentation({
		...REPORT, javascript: ["safari16.4.1"], css: ["safari17.2", "ios17.2"]
	});
	assert.ok(output.includes("| Safari on macOS | 16.4.1 | 17.2 |"));
	assert.ok(output.includes("| Safari on iOS / iPadOS | — | 17.2 |"));
	assert.ok(!output.includes("Google Chrome"));
});

void test("does not infer an iOS target from a desktop Safari target", () => {
	const output = renderBrowserTargetDocumentation({ ...REPORT, javascript: ["safari16.4"], css: ["safari16.4"] });
	assert.ok(!output.includes("iOS"));
});

void test("rejects empty, malformed, unknown, and duplicate targets instead of hiding drift", () => {
	for (const targets of [[], null, "chrome111", [null], ["chrome"], ["chrome111\n"],
		["unknown111"], ["chrome111", "chrome112"], ["chrome111", "chrome111"]]) {
		for (const column of ["javascript", "css"]) {
			assert.throws(() => renderBrowserTargetDocumentation({ ...REPORT, [column]: targets }), TypeError);
		}
	}
});

void test("rejects incomplete and Markdown-bearing provenance", () => {
	for (const report of [null, {}, { ...REPORT, query: "preset|injection" },
		{ ...REPORT, dataVersions: {} },
		{ ...REPORT, dataVersions: { ...REPORT.dataVersions, vite: "1.2.3`\n" } }]) {
		assert.throws(() => renderBrowserTargetDocumentation(report), TypeError);
	}
});

void test("replaces the generated block without modifying surrounding prose and is idempotent", () => {
	const updated = replaceBrowserTargetDocumentation(DOCUMENT, REPORT);
	assert.equal(updated, DOCUMENT.replace(`${START}\nstale\n${END}`, renderBrowserTargetDocumentation(REPORT)));
	assert.equal(replaceBrowserTargetDocumentation(updated, REPORT), updated);
});

void test("rejects missing, repeated, reversed, and inline markers", () => {
	for (const source of ["", DOCUMENT.replace(START, ""), DOCUMENT.replace(END, ""),
		`${DOCUMENT}\n${START}\n`, `${DOCUMENT}\n${END}\n`, `${END}\n${START}\n`,
		DOCUMENT.replace(START, `inline ${START}`), DOCUMENT.replace(END, `${END} inline`)]) {
		assert.throws(() => replaceBrowserTargetDocumentation(source, REPORT), /standalone target markers/u);
	}
});

void test("allows a complete document consisting only of the generated block", () => {
	const source = `${START}\n${END}`;
	assert.equal(replaceBrowserTargetDocumentation(source, REPORT), renderBrowserTargetDocumentation(REPORT));
});

void test("read-only checks reject stale output without writing; explicit updates converge", async (context) => {
	const directory = await mkdtemp(join(tmpdir(), "lfc-browser-docs-"));
	context.after(async () => { await rm(directory, { recursive: true, force: true }); });
	const path = join(directory, "browser-support.md");
	await writeFile(path, DOCUMENT);
	const before = await stat(path);
	await assert.rejects(syncBrowserTargetDocumentation(path, REPORT, { check: true }), /--write-docs/u);
	assert.equal(await readFile(path, "utf8"), DOCUMENT);
	assert.equal((await stat(path)).mtimeMs, before.mtimeMs);
	assert.equal(await syncBrowserTargetDocumentation(path, REPORT), true);
	const current = await readFile(path, "utf8");
	const after = await stat(path);
	assert.equal(await syncBrowserTargetDocumentation(path, REPORT, { check: true }), false);
	assert.equal(await syncBrowserTargetDocumentation(path, REPORT), false);
	assert.equal(await readFile(path, "utf8"), current);
	assert.equal((await stat(path)).mtimeMs, after.mtimeMs);
});

void test("dependency changes invalidate documentation even when the targets stay the same", async (context) => {
	const directory = await mkdtemp(join(tmpdir(), "lfc-browser-docs-"));
	context.after(async () => { await rm(directory, { recursive: true, force: true }); });
	const path = join(directory, "browser-support.md");
	await writeFile(path, replaceBrowserTargetDocumentation(DOCUMENT, REPORT));
	await assert.rejects(syncBrowserTargetDocumentation(path, {
		...REPORT, dataVersions: { ...REPORT.dataVersions, vite: "2.0.0" }
	}, { check: true }), /stale/u);
});

void test("invalid marker edits fail without damaging the original file", async (context) => {
	const directory = await mkdtemp(join(tmpdir(), "lfc-browser-docs-"));
	context.after(async () => { await rm(directory, { recursive: true, force: true }); });
	const path = join(directory, "browser-support.md");
	const source = "# Browser support\nNo generated region exists.\n";
	await writeFile(path, source);
	await assert.rejects(syncBrowserTargetDocumentation(path, REPORT), /standalone target markers/u);
	assert.equal(await readFile(path, "utf8"), source);
});
