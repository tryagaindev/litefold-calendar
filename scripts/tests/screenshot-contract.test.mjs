import assert from "node:assert/strict";
import test from "node:test";

import {
	isScreenshotSourceFile,
	SCREENSHOT_SOURCE_INPUTS
} from "../screenshot-contract.mjs";

void test("screenshot fingerprints exclude generated example identity and modules", () => {
	for (const path of [
		"examples/advanced/main.js",
		"examples/metadata.json"
	]) {
		assert.equal(isScreenshotSourceFile(path), false, path);
		assert.equal(isScreenshotSourceFile(path.replaceAll("/", "\\")), false, path);
	}
	assert.equal(isScreenshotSourceFile("examples/advanced/main.ts"), true);
	assert.equal(isScreenshotSourceFile("src/styles/preferences.css"), true);
	assert.equal(isScreenshotSourceFile("README.md"), false);
});

void test("screenshot fingerprints include the visual build contract", () => {
	assert.ok(SCREENSHOT_SOURCE_INPUTS.includes("src"));
	assert.ok(SCREENSHOT_SOURCE_INPUTS.includes("scripts/build.mjs"));
	assert.ok(SCREENSHOT_SOURCE_INPUTS.includes("scripts/build-examples.mjs"));
	assert.ok(SCREENSHOT_SOURCE_INPUTS.includes("scripts/build-package.mjs"));
	assert.ok(SCREENSHOT_SOURCE_INPUTS.includes("scripts/lib/styles.mjs"));
});
