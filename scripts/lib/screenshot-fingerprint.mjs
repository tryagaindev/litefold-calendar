import { createHash } from "node:crypto";
import { extname } from "node:path";

const SOURCE_EXTENSIONS = new Set([".css", ".html", ".js", ".json", ".mjs", ".ts"]);
const GENERATED_SOURCE_FILES = new Set(["examples/advanced/main.js", "examples/metadata.json"]);
const CAPTURE_DEPENDENCIES = Object.freeze(["@playwright/test", "esbuild", "typescript", "vite"]);
const PACKAGE_NAME = /^(?:@[a-z\d._-]+\/)?[a-z\d._-]+$/iu;
const PACKAGE_PARENT = /(?:^|\/)node_modules\/(?:@[^/]+\/)?[^/]+$/u;
const SCREENSHOT_PACKAGE_SCRIPTS = Object.freeze([
	"prebuild:package", "build:package", "postbuild:package",
	"prebuild:examples:advanced", "build:examples:advanced", "postbuild:examples:advanced",
	"prescreenshots:update", "screenshots:update", "postscreenshots:update",
	"prescreenshots:prepare", "screenshots:prepare", "postscreenshots:prepare",
	"prescreenshots:candidate", "screenshots:candidate", "postscreenshots:candidate"
]);

/** Repository-owned files that can change the canonical advanced example captures. */
export const SCREENSHOT_SOURCE_INPUTS = Object.freeze([
	"package.json", "package-lock.json", "tsconfig.base.json", "tsconfig.build.json",
	"vite.config.mjs", "src", "examples/example.css", "examples/advanced/index.html",
	"examples/advanced/main.ts", "examples/advanced/theme.css", "examples/advanced/tsconfig.json",
	"scripts/build-advanced-example.mjs", "scripts/build-package.mjs",
	"scripts/lib/advanced-example-build.mjs", "scripts/lib/browser-targets.mjs",
	"scripts/lib/node-version.mjs", "scripts/lib/package-entries.mjs", "scripts/lib/process.mjs",
	"scripts/lib/styles.mjs", "scripts/lib/screenshot-fingerprint.mjs",
	"scripts/lib/screenshot-preparation.mjs", "scripts/prepare-screenshots.mjs",
	"scripts/screenshot-contract.mjs", "scripts/screenshot-scenes.mjs",
	"scripts/serve-repository.mjs", "scripts/update-screenshots.mjs"
]);

function assertObject(value, label) {
	if (value === null || typeof value !== "object" || Array.isArray(value)) {
		throw new Error(`${label} must contain a JSON object.`);
	}
	return value;
}

function dependencyMap(value, label) {
	const entries = Object.entries(value === undefined ? {} : assertObject(value, label));
	for (const [name, requirement] of entries) {
		if (!PACKAGE_NAME.test(name) || name === "." || name === ".." || typeof requirement !== "string") {
			throw new Error(`${label} contains an invalid dependency: ${name}.`);
		}
	}
	return Object.fromEntries(entries);
}

function captureRootManifest(manifest) {
	const result = { ...manifest };
	if (Object.hasOwn(result, "version")) { result.version = "<root-version>"; }
	if (Object.hasOwn(result, "devDependencies")) {
		const dependencies = dependencyMap(result.devDependencies, "devDependencies");
		result.devDependencies = Object.fromEntries(CAPTURE_DEPENDENCIES
			.filter((name) => Object.hasOwn(dependencies, name)).map((name) => [name, dependencies[name]]));
	}
	if (Object.hasOwn(result, "scripts")) {
		assertObject(result.scripts, "scripts");
		result.scripts = Object.fromEntries(SCREENSHOT_PACKAGE_SCRIPTS
			.filter((name) => Object.hasOwn(result.scripts, name)).map((name) => [name, result.scripts[name]]));
	}
	return result;
}

function lockedPackages(lock) {
	assertObject(lock, "package-lock.json");
	if (lock.lockfileVersion !== 2 && lock.lockfileVersion !== 3) {
		throw new Error("Screenshot fingerprints require npm lockfile version 2 or 3.");
	}
	const packages = assertObject(lock.packages, "package-lock.json packages");
	assertObject(packages[""], "package-lock.json root package");
	return packages;
}

function resolveDependency(packages, from, name) {
	let directory = from;
	for (;;) {
		const candidate = `${directory === "" ? "" : `${directory}/`}node_modules/${name}`;
		if (Object.hasOwn(packages, candidate)) { return candidate; }
		if (directory === "") { return undefined; }
		const parent = directory.replace(PACKAGE_PARENT, "");
		if (parent === directory) { throw new Error(`Unsupported npm package path: ${directory}.`); }
		directory = parent;
	}
}

function captureLockfile(lock) {
	const packages = lockedPackages(lock);
	const root = captureRootManifest(packages[""]);
	const selected = new Map([["", root]]);
	const pending = [];
	function include(from, name, required) {
		const path = resolveDependency(packages, from, name);
		if (path === undefined) {
			if (required) { throw new Error(`Missing locked screenshot dependency ${name} from ${from || "root"}.`); }
			return;
		}
		if (selected.has(path)) { return; }
		const entry = assertObject(packages[path], `Locked package ${path}`);
		if (entry.link) { throw new Error(`Linked screenshot dependencies are unsupported: ${path}.`); }
		selected.set(path, entry);
		pending.push(path);
	}
	function includeDependencies(from, entry, development = false) {
		const optional = dependencyMap(entry.optionalDependencies, `${from || "root"} optionalDependencies`);
		const required = dependencyMap(entry.dependencies, `${from || "root"} dependencies`);
		for (const name of Object.keys(required)) { include(from, name, !Object.hasOwn(optional, name)); }
		for (const name of Object.keys(optional)) { include(from, name, false); }
		for (const name of Object.keys(dependencyMap(entry.peerDependencies, `${from || "root"} peerDependencies`))) {
			include(from, name, false);
		}
		if (development) {
			for (const name of Object.keys(root.devDependencies ?? {})) { include(from, name, true); }
		}
	}
	includeDependencies("", root, true);
	for (let index = 0; index < pending.length; index++) {
		const path = pending[index];
		includeDependencies(path, selected.get(path));
	}
	const result = { ...lock, packages: Object.fromEntries(selected) };
	if (Object.hasOwn(result, "version")) { result.version = "<root-version>"; }
	//The legacy v2 dependency tree duplicates packages and includes unrelated development tooling.
	delete result.dependencies;
	return result;
}

function stableJson(value) {
	return JSON.stringify(value, (_key, entry) => entry !== null && typeof entry === "object" && !Array.isArray(entry)
		? Object.fromEntries(Object.keys(entry).sort().map((key) => [key, entry[key]])) : entry);
}

/** Selects supported source files while excluding generated example identity and output. */
export function isScreenshotSourceFile(repositoryRelativePath) {
	const path = repositoryRelativePath.replaceAll("\\", "/");
	return !GENERATED_SOURCE_FILES.has(path) && SOURCE_EXTENSIONS.has(extname(path).toLowerCase());
}

/** Selects the capture lifecycle and package source without including unrelated examples or tests. */
export function isScreenshotSourceInput(repositoryRelativePath) {
	const path = repositoryRelativePath.replaceAll("\\", "/");
	return isScreenshotSourceFile(path) && (SCREENSHOT_SOURCE_INPUTS.includes(path) || path.startsWith("src/"));
}

/** Keeps execution metadata and runtime dependencies, selecting only capture/build development dependencies. */
export function canonicalizeScreenshotSource(repositoryRelativePath, contents) {
	const path = repositoryRelativePath.replaceAll("\\", "/");
	const bytes = Buffer.isBuffer(contents) ? contents : Buffer.from(contents);
	if (path !== "package.json" && path !== "package-lock.json") { return bytes; }
	const manifest = assertObject(JSON.parse(bytes.toString("utf8")), path);
	return Buffer.from(stableJson(path === "package.json" ? captureRootManifest(manifest) : captureLockfile(manifest)));
}

/** Returns the exact locked versions of declared capture/build roots without loading their code. */
export function captureDependencyVersions(lock) {
	const packages = lockedPackages(lock);
	const roots = dependencyMap(packages[""].devDependencies, "root devDependencies");
	return Object.fromEntries(CAPTURE_DEPENDENCIES.filter((name) => Object.hasOwn(roots, name)).map((name) => {
		const path = resolveDependency(packages, "", name);
		const entry = path === undefined ? undefined : assertObject(packages[path], `Locked package ${path}`);
		if (entry?.link || typeof entry?.version !== "string" ||
			!/^\d+\.\d+\.\d+(?:-[\da-z.-]+)?(?:\+[\da-z.-]+)?$/iu.test(entry.version)) {
			throw new Error(`Screenshot dependency ${name} must resolve to an exact locked version.`);
		}
		return [name, entry.version];
	}));
}

/** Hashes {path, contents} files and effective browser targets; requires only built-in Node modules. */
export function fingerprintScreenshotFiles(files, browserTargets) {
	assertObject(browserTargets, "Browser targets");
	const paths = new Set();
	const normalized = files.map((file) => {
		const path = file.path.replaceAll("\\", "/");
		if (path.split("/").some((part) => part === "." || part === ".." || part === "") ||
			!isScreenshotSourceInput(path) || paths.has(path)) {
			throw new Error(`Invalid or duplicate screenshot source: ${path}.`);
		}
		paths.add(path);
		return { ...file, path };
	}).sort((left, right) => left.path < right.path ? -1 : left.path > right.path ? 1 : 0);
	const targets = { query: browserTargets.query, dataVersions: browserTargets.dataVersions,
		browsers: browserTargets.browsers, javascript: browserTargets.javascript, css: browserTargets.css };
	const hash = createHash("sha256");
	hash.update(createHash("sha256").update(stableJson(targets)).digest("hex"));
	hash.update("\0");
	for (const file of normalized) {
		hash.update(file.path);
		hash.update("\0");
		hash.update(canonicalizeScreenshotSource(file.path, file.contents));
		hash.update("\0");
	}
	return hash.digest("hex");
}
