import assert from "node:assert/strict";
import test from "node:test";

import {
	canonicalizeScreenshotSource,
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

void test("screenshot fingerprints ignore only root package version metadata", () => {
	const packageManifest = {
		dependencies: { "calendar-runtime": "1.0.0" },
		name: "fixture",
		version: "1.0.0"
	};
	const changedVersion = { ...packageManifest, version: "2.0.0-alpha.1" };
	assert.deepEqual(
		canonicalizeScreenshotSource("package.json", JSON.stringify(packageManifest)),
		canonicalizeScreenshotSource("package.json", JSON.stringify(changedVersion))
	);
	assert.notDeepEqual(
		canonicalizeScreenshotSource("package.json", JSON.stringify(packageManifest)),
		canonicalizeScreenshotSource("package.json", JSON.stringify({
			...changedVersion,
			dependencies: { "calendar-runtime": "1.0.1" }
		}))
	);

	const packageLock = {
		lockfileVersion: 3,
		name: "fixture",
		packages: {
			"": { dependencies: { "calendar-runtime": "1.0.0" }, name: "fixture", version: "1.0.0" },
			"node_modules/calendar-runtime": { version: "1.0.0" }
		},
		version: "1.0.0"
	};
	const changedLockVersion = structuredClone(packageLock);
	changedLockVersion.version = "2.0.0-alpha.1";
	changedLockVersion.packages[""].version = "2.0.0-alpha.1";
	assert.deepEqual(
		canonicalizeScreenshotSource("package-lock.json", JSON.stringify(packageLock)),
		canonicalizeScreenshotSource("package-lock.json", JSON.stringify(changedLockVersion))
	);
	const changedDependency = structuredClone(changedLockVersion);
	changedDependency.packages["node_modules/calendar-runtime"].version = "1.0.1";
	assert.notDeepEqual(
		canonicalizeScreenshotSource("package-lock.json", JSON.stringify(packageLock)),
		canonicalizeScreenshotSource("package-lock.json", JSON.stringify(changedDependency))
	);
});
