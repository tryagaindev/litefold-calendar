import assert from "node:assert/strict";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";

import {
	assertStyleModuleOrder,
	composeDistributedStyles,
	composeStyles,
	minifyStyles,
	STYLE_MODULE_ORDER
} from "../lib/styles.mjs";

async function createStyleFixture(context, moduleNames) {
	const sourceDirectory = await mkdtemp(join(tmpdir(), "lfc-styles-test-"));
	context.after(() => rm(sourceDirectory, { force: true, recursive: true }));
	await Promise.all(
		moduleNames.map((moduleName) =>
			writeFile(
				join(sourceDirectory, moduleName),
				"@layer lfc {\n  :where(.litefold-calendar) {}\n}\n",
				"utf8"
			)
		)
	);
	return sourceDirectory;
}

void test("style modules compose deterministically in cascade order", async () => {
	const [firstComposition, secondComposition] = await Promise.all([
		composeStyles(),
		composeStyles()
	]);
	assert.equal(firstComposition, secondComposition);
	assert.ok(firstComposition.endsWith("\n"), "Expected a newline-terminated stylesheet.");
	assert.equal(
		[...firstComposition.matchAll(/@layer lfc \{/gu)].length,
		1,
		"Expected the distributed stylesheet to contain one lfc layer block."
	);

	const orderedSignatures = [
		"--lfc-font-family:",
		".lfc-calendar-nav-button,",
		".lfc-calendar-toolbar {",
		".lfc-calendar-swipe-viewport {",
		".lfc-calendar-weekdays,",
		".lfc-calendar-agenda {",
		"@container lfc-calendar (inline-size <= 42rem)",
		"@media (hover: hover)"
	];
	let previousIndex = -1;
	for (const signature of orderedSignatures) {
		const index = firstComposition.indexOf(signature);
		assert.ok(index > previousIndex, `Expected ${signature} after the preceding style module.`);
		previousIndex = index;
	}

	assert.match(firstComposition, /:dir\(rtl\)/u);
	assert.match(firstComposition, /@keyframes lfc-day-selection-reveal/u);
	assert.match(firstComposition, /@keyframes lfc-day-selection-confirm/u);
	assert.match(firstComposition, /\bscale:\s*1;/u);
	assert.match(firstComposition, /@media \(prefers-contrast: more\)/u);
	assert.match(firstComposition, /@media \(prefers-reduced-motion: reduce\)/u);
	assert.match(firstComposition, /@media \(forced-colors: active\)/u);
});

void test("distributed styles are deterministically minified without changing critical CSS contracts", async () => {
	const readable = await composeStyles();
	const [firstDistribution, secondDistribution] = await Promise.all([
		composeDistributedStyles(),
		composeDistributedStyles()
	]);

	assert.equal(firstDistribution, secondDistribution);
	assert.equal(await minifyStyles(firstDistribution), firstDistribution);
	assert.ok(firstDistribution.endsWith("\n"), "Expected a newline-terminated stylesheet.");
	assert.ok(
		Buffer.byteLength(firstDistribution, "utf8") < Buffer.byteLength(readable, "utf8"),
		"Expected distributed CSS to be smaller than its readable source composition."
	);
	assert.equal(
		[...firstDistribution.matchAll(/@layer lfc\{/gu)].length,
		1,
		"Expected the distributed stylesheet to retain one lfc layer block."
	);
	assert.doesNotMatch(firstDistribution, /\/\*/u);
	assert.match(firstDistribution, /:dir\(rtl\)/u);
	assert.match(firstDistribution, /@container lfc-calendar \(inline-size <= 42rem\)/u);
	assert.match(firstDistribution, /@keyframes lfc-day-selection-reveal/u);
	assert.match(firstDistribution, /prefers-contrast:more/u);
	assert.match(firstDistribution, /prefers-reduced-motion:reduce/u);
	assert.match(firstDistribution, /forced-colors:active/u);
});

void test("style minification rejects non-string input", async () => {
	await assert.rejects(minifyStyles(undefined), /must be a string/u);
});

void test("style module order rejects missing modules", () => {
	assert.throws(
		() => assertStyleModuleOrder(STYLE_MODULE_ORDER.slice(1)),
		/missing tokens\.css/u
	);
});

void test("style composition rejects missing source modules", async (context) => {
	const sourceDirectory = await createStyleFixture(context, STYLE_MODULE_ORDER.slice(1));
	await assert.rejects(
		composeStyles({ sourceDirectory }),
		/style module directory missing tokens\.css/ui
	);
});

void test("style module order rejects duplicated modules", () => {
	assert.throws(
		() => assertStyleModuleOrder([...STYLE_MODULE_ORDER, STYLE_MODULE_ORDER[0]]),
		/duplicated modules: tokens\.css/u
	);
});

void test("style module order rejects incorrectly ordered modules", () => {
	const reordered = [...STYLE_MODULE_ORDER];
	[reordered[3], reordered[4]] = [reordered[4], reordered[3]];
	assert.throws(
		() => assertStyleModuleOrder(reordered),
		/incorrectly ordered/u
	);
});

void test("style module order rejects unexpected modules", () => {
	assert.throws(
		() => assertStyleModuleOrder([...STYLE_MODULE_ORDER, "legacy.css"]),
		/contains unexpected legacy\.css/u
	);
});
