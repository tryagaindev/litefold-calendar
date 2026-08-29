import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { join } from "node:path";
import test from "node:test";

import { REPOSITORY_ROOT } from "../lib/process.mjs";
import {
	canonicalizeScreenshotSource,
	isScreenshotSourceFile,
	isScreenshotSourceInput,
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

void test("screenshot fingerprints select the exact advanced route and build contract", () => {
	assert.deepEqual(SCREENSHOT_SOURCE_INPUTS, [
		"package.json",
		"package-lock.json",
		"tsconfig.base.json",
		"tsconfig.build.json",
		"src",
		"examples/example.css",
		"examples/advanced/index.html",
		"examples/advanced/main.ts",
		"examples/advanced/theme.css",
		"examples/advanced/tsconfig.json",
		"scripts/build-advanced-example.mjs",
		"scripts/build-package.mjs",
		"scripts/lib/advanced-example-build.mjs",
		"scripts/lib/node-version.mjs",
		"scripts/lib/package-entries.mjs",
		"scripts/lib/process.mjs",
		"scripts/lib/styles.mjs",
		"scripts/screenshot-contract.mjs",
		"scripts/screenshot-scenes.mjs",
		"scripts/serve-repository.mjs",
		"scripts/update-screenshots.mjs"
	]);

	for (const path of [
		"examples/example.css",
		"examples/advanced/index.html",
		"examples/advanced/main.ts",
		"examples/advanced/theme.css",
		"examples/advanced/tsconfig.json",
		"scripts/build-advanced-example.mjs",
		"scripts/lib/advanced-example-build.mjs",
		"scripts/lib/package-entries.mjs",
		"src/styles/preferences.css",
		"tsconfig.base.json",
		"tsconfig.build.json"
	]) {
		assert.equal(isScreenshotSourceInput(path), true, path);
		assert.equal(isScreenshotSourceInput(path.replaceAll("/", "\\")), true, path);
	}
});

void test("screenshot fingerprints ignore unrelated routes and aggregate build recipes", () => {
	for (const path of [
		"examples/index.css",
		"examples/advanced/tsconfig.eslint.json",
		"examples/fullcalendar-v6-migration/main.ts",
		"examples/metadata.json",
		"playwright.config.mjs",
		"scripts/build.mjs",
		"scripts/build-advanced-example.mjs/extra.js",
		"scripts/build-examples.mjs",
		"scripts/lib/example-metadata.mjs",
		"scripts/pages-site/site.css"
	]) {
		assert.equal(isScreenshotSourceInput(path), false, path);
		assert.equal(isScreenshotSourceInput(path.replaceAll("/", "\\")), false, path);
	}
});

void test("screenshot update builds only the package and advanced example", async () => {
	const packageManifest = JSON.parse(await readFile(join(REPOSITORY_ROOT, "package.json"), "utf8"));
	assert.equal(
		packageManifest.scripts?.["build:examples:advanced"],
		"node scripts/build-advanced-example.mjs"
	);
	assert.equal(
		packageManifest.scripts?.["screenshots:update"],
		"npm run build:package && npm run build:examples:advanced && node scripts/update-screenshots.mjs"
	);
});

void test("screenshot fingerprints ignore root versions and nonvisual package scripts", () => {
	const packageManifest = {
		dependencies: { "calendar-runtime": "1.0.0" },
		name: "fixture",
		scripts: {
			"build:examples:advanced": "node scripts/build-advanced-example.mjs",
			"build:package": "node scripts/build-package.mjs",
			lint: "eslint .",
			"screenshots:update": "npm run build:package && npm run build:examples:advanced && node scripts/update-screenshots.mjs"
		},
		version: "1.0.0"
	};
	const changedVersionAndTooling = {
		...packageManifest,
		scripts: {
			...packageManifest.scripts,
			build: "node scripts/build.mjs --all",
			"build:examples": "node scripts/build-examples.mjs --metadata",
			format: "prettier --write .",
			lint: "eslint . --fix",
		},
		version: "2.0.0-alpha.1"
	};
	assert.deepEqual(
		canonicalizeScreenshotSource("package.json", JSON.stringify(packageManifest)),
		canonicalizeScreenshotSource("package.json", JSON.stringify(changedVersionAndTooling))
	);
	assert.notDeepEqual(
		canonicalizeScreenshotSource("package.json", JSON.stringify(packageManifest)),
		canonicalizeScreenshotSource("package.json", JSON.stringify({
			...changedVersionAndTooling,
			dependencies: { "calendar-runtime": "1.0.1" }
		}))
	);
	for (const script of [
		"prebuild:package",
		"build:package",
		"postbuild:package",
		"prebuild:examples:advanced",
		"build:examples:advanced",
		"postbuild:examples:advanced",
		"prescreenshots:update",
		"screenshots:update",
		"postscreenshots:update"
	]) {
		assert.notDeepEqual(
			canonicalizeScreenshotSource("package.json", JSON.stringify(packageManifest)),
			canonicalizeScreenshotSource("package.json", JSON.stringify({
				...packageManifest,
				scripts: {
					...packageManifest.scripts,
					[script]: `changed ${script}`
				}
			})),
			script
		);
	}

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
