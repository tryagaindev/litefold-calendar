import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { join } from "node:path";
import test from "node:test";

import { REPOSITORY_ROOT } from "../lib/process.mjs";
import {
	canonicalizeScreenshotSource,
	captureDependencyVersions,
	fingerprintScreenshotFiles,
	isScreenshotSourceFile,
	isScreenshotSourceInput,
	pinnedPlaywrightVersion,
	REQUIRED_PLAYWRIGHT_VERSION,
	SCREENSHOT_SOURCE_INPUTS
} from "../screenshot-contract.mjs";

void test("screenshot tooling derives the exact Playwright pin from package.json", async () => {
	const packageManifest = JSON.parse(await readFile(join(REPOSITORY_ROOT, "package.json"), "utf8"));
	assert.equal(REQUIRED_PLAYWRIGHT_VERSION, packageManifest.devDependencies["@playwright/test"]);
	assert.equal(pinnedPlaywrightVersion(packageManifest), REQUIRED_PLAYWRIGHT_VERSION);
	for (const version of ["^1.63.0", "latest", undefined]) {
		assert.throws(
			() => pinnedPlaywrightVersion({ devDependencies: { "@playwright/test": version } }),
			/exact version/u
		);
	}
});

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
		"vite.config.mjs",
		"src",
		"examples/example.css",
		"examples/advanced/index.html",
		"examples/advanced/main.ts",
		"examples/advanced/theme.css",
		"examples/advanced/tsconfig.json",
		"scripts/build-advanced-example.mjs",
		"scripts/build-package.mjs",
		"scripts/lib/advanced-example-build.mjs",
		"scripts/lib/browser-targets.mjs",
		"scripts/lib/node-version.mjs",
		"scripts/lib/package-entries.mjs",
		"scripts/lib/process.mjs",
		"scripts/lib/styles.mjs",
		"scripts/lib/screenshot-fingerprint.mjs",
		"scripts/lib/screenshot-preparation.mjs",
		"scripts/prepare-screenshots.mjs",
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
		"node scripts/prepare-screenshots.mjs --force"
	);
	assert.equal(packageManifest.scripts?.["screenshots:prepare"], "node scripts/prepare-screenshots.mjs");
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
		"postscreenshots:update",
		"prescreenshots:prepare",
		"screenshots:prepare",
		"postscreenshots:prepare",
		"prescreenshots:candidate",
		"screenshots:candidate",
		"postscreenshots:candidate"
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

function dependencyFixture() {
	return {
		lockfileVersion: 3, name: "fixture", version: "1.0.0",
		packages: {
			"": { name: "fixture", version: "1.0.0", devDependencies: {
				"@playwright/test": "1.63.0", esbuild: "0.28.2", typescript: "6.0.3", vite: "8.3.2",
				eslint: "10.11.0", jsdom: "30.1.1", stylelint: "17.16.0"
			} },
			"node_modules/@playwright/test": { version: "1.63.0", dependencies: { playwright: "1.63.0" } },
			"node_modules/playwright": { version: "1.63.0", dependencies: { "playwright-core": "1.63.0" },
				optionalDependencies: { fsevents: "2.3.2" } },
			"node_modules/playwright-core": { version: "1.63.0" },
			"node_modules/esbuild": { version: "0.28.2", optionalDependencies: { "@esbuild/linux-x64": "0.28.2" } },
			"node_modules/@esbuild/linux-x64": { version: "0.28.2", os: ["linux"], cpu: ["x64"] },
			"node_modules/typescript": { version: "6.0.3" },
			"node_modules/vite": { version: "8.3.2", dependencies: { "source-map-js": "^1.2.1" },
				peerDependencies: { "@types/node": ">=24", sass: "*" } },
			"node_modules/@types/node": { version: "24.19.1" },
			"node_modules/source-map-js": { version: "1.2.1", integrity: "sha512-source" },
			"node_modules/eslint": { version: "10.11.0" },
			"node_modules/jsdom": { version: "30.1.1", dependencies: { "source-map-js": "^1.2.1" } },
			"node_modules/stylelint": { version: "17.16.0" }
		}
	};
}

function canonicalLock(lock) {
	return canonicalizeScreenshotSource("package-lock.json", JSON.stringify(lock));
}

void test("unrelated lint and test dependencies do not stale captures, but shared rendering dependencies do", () => {
	const lock = dependencyFixture();
	const changed = structuredClone(lock);
	for (const name of ["eslint", "jsdom", "stylelint"]) {
		changed.packages[""].devDependencies[name] = "99.0.0";
		changed.packages[`node_modules/${name}`] = { version: "99.0.0", integrity: "new", license: "new" };
	}
	assert.deepEqual(canonicalLock(changed), canonicalLock(lock));
	assert.deepEqual(canonicalizeScreenshotSource("package.json", JSON.stringify(changed.packages[""])),
		canonicalizeScreenshotSource("package.json", JSON.stringify(lock.packages[""])));
	changed.packages["node_modules/source-map-js"].integrity = "sha512-changed";
	assert.notDeepEqual(canonicalLock(changed), canonicalLock(lock));
	for (const name of ["@playwright/test", "typescript", "vite", "esbuild"]) {
		const compilerChanged = structuredClone(lock.packages[""]);
		compilerChanged.devDependencies[name] = "99.0.0";
		assert.notDeepEqual(canonicalizeScreenshotSource("package.json", JSON.stringify(compilerChanged)),
			canonicalizeScreenshotSource("package.json", JSON.stringify(lock.packages[""])), name);
	}
});

void test("lock traversal follows nested, hoisted, scoped, optional, peer, and cyclic dependencies", () => {
	const lock = dependencyFixture();
	lock.packages["node_modules/vite"].dependencies = { plugin: "1", "@scope/renderer": "1" };
	lock.packages["node_modules/vite/node_modules/plugin"] = {
		version: "1.0.0", dependencies: { "source-map-js": "2", vite: "8" },
		optionalDependencies: { "optional-renderer": "1" }
	};
	lock.packages["node_modules/vite/node_modules/source-map-js"] = { version: "2.0.0" };
	lock.packages["node_modules/vite/node_modules/@scope/renderer"] = {
		version: "1.0.0", dependencies: { "hoisted-renderer": "1" }
	};
	lock.packages["node_modules/hoisted-renderer"] = { version: "1.0.0" };
	lock.packages["node_modules/optional-renderer"] = { version: "1.0.0" };
	const selected = JSON.parse(canonicalLock(lock)).packages;
	for (const path of ["node_modules/vite/node_modules/plugin", "node_modules/vite/node_modules/source-map-js",
		"node_modules/vite/node_modules/@scope/renderer", "node_modules/hoisted-renderer",
		"node_modules/optional-renderer", "node_modules/@types/node", "node_modules/@esbuild/linux-x64"]) {
		assert.ok(Object.hasOwn(selected, path), path);
	}
	assert.equal(Object.hasOwn(selected, "node_modules/source-map-js"), false);
	for (const path of ["node_modules/@types/node", "node_modules/@esbuild/linux-x64", "node_modules/optional-renderer"]) {
		const changed = structuredClone(lock);
		changed.packages[path].version = "2.0.0";
		assert.notDeepEqual(canonicalLock(changed), canonicalLock(lock), path);
	}
});

void test("missing required and linked capture dependencies fail; absent optional and peer packages are allowed", () => {
	const lock = dependencyFixture();
	assert.doesNotThrow(() => canonicalLock(lock));
	for (const path of ["node_modules/@playwright/test", "node_modules/source-map-js"]) {
		const missing = structuredClone(lock);
		delete missing.packages[path];
		assert.throws(() => canonicalLock(missing), /Missing locked screenshot dependency/u, path);
	}
	const linked = structuredClone(lock);
	linked.packages["node_modules/vite"] = { link: true, resolved: "packages/vite" };
	assert.throws(() => canonicalLock(linked), /Linked screenshot dependencies/u);
	const optionalOverride = structuredClone(lock);
	optionalOverride.packages["node_modules/vite"].dependencies.missing = "1";
	optionalOverride.packages["node_modules/vite"].optionalDependencies = { missing: "1" };
	assert.doesNotThrow(() => canonicalLock(optionalOverride));
	assert.throws(() => canonicalLock({ ...lock, lockfileVersion: 1 }), /lockfile version/u);
});

void test("runtime dependency fields and reachable runtime lock entries remain fingerprint inputs", () => {
	const lock = dependencyFixture();
	lock.packages[""].dependencies = { "calendar-runtime": "1.0.0" };
	lock.packages["node_modules/calendar-runtime"] = { version: "1.0.0" };
	const changed = structuredClone(lock);
	changed.packages["node_modules/calendar-runtime"].version = "2.0.0";
	assert.notDeepEqual(canonicalLock(changed), canonicalLock(lock));
	for (const field of ["dependencies", "optionalDependencies", "peerDependencies", "overrides", "exports", "engines"]) {
		const manifest = { name: "fixture", [field]: { "calendar-runtime": "1.0.0" } };
		assert.notDeepEqual(canonicalizeScreenshotSource("package.json", JSON.stringify(manifest)),
			canonicalizeScreenshotSource("package.json", JSON.stringify({ ...manifest, [field]: {} })), field);
	}
});

void test("capture root versions come from exact locked records without loading dependency code", () => {
	const lock = dependencyFixture();
	assert.deepEqual(captureDependencyVersions(lock), {
		"@playwright/test": "1.63.0", esbuild: "0.28.2", typescript: "6.0.3", vite: "8.3.2"
	});
	for (const entry of [{ version: "^1.63.0" }, { link: true, version: "1.63.0" }, {}]) {
		const changed = structuredClone(lock);
		changed.packages["node_modules/@playwright/test"] = entry;
		assert.throws(() => captureDependencyVersions(changed), /exact locked version/u);
	}
});

void test("pure fingerprints are stable across file and JSON key ordering, but retain content and browser inputs", async () => {
	const source = await readFile(new URL("../lib/screenshot-fingerprint.mjs", import.meta.url));
	const pure = await import(`data:text/javascript;base64,${source.toString("base64")}`);
	const targets = { query: "baseline-widely-available", dataVersions: { vite: "8.3.2", esbuild: "0.28.2" },
		browsers: ["chrome111"], javascript: ["chrome111"], css: ["chrome111"], resolvedAt: "2026-10-12" };
	const files = [{ path: "src/index.ts", contents: "export {};" },
		{ path: "package.json", contents: JSON.stringify({ name: "fixture", engines: { node: "24" } }) }];
	const expected = fingerprintScreenshotFiles(files, targets);
	assert.equal(pure.fingerprintScreenshotFiles(files, targets), expected);
	assert.equal(fingerprintScreenshotFiles([...files].reverse(), { ...targets, resolvedAt: "2026-10-13" }), expected);
	assert.equal(fingerprintScreenshotFiles([files[0], { ...files[1],
		contents: JSON.stringify({ engines: { node: "24" }, name: "fixture" }) }], targets), expected);
	assert.notEqual(fingerprintScreenshotFiles([{ ...files[0], contents: "export const value = 1;" }, files[1]], targets), expected);
	assert.notEqual(fingerprintScreenshotFiles(files, { ...targets, css: ["chrome112"] }), expected);
	assert.throws(() => fingerprintScreenshotFiles([...files, files[0]], targets), /duplicate/u);
	assert.throws(() => fingerprintScreenshotFiles([{ path: "src/../README.md", contents: "" }], targets), /Invalid/u);
});
