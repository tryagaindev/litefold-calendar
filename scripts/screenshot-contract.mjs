import { createHash } from "node:crypto";
import { readdir, readFile, stat } from "node:fs/promises";
import { extname, isAbsolute, relative, resolve, sep } from "node:path";

import {
	assertSupportedNodeVersion,
	isSupportedNodeVersion,
	SUPPORTED_NODE_RANGE
} from "./lib/node-version.mjs";
import { REPOSITORY_ROOT } from "./lib/process.mjs";

export const REQUIRED_NPM_VERSION = "12.0.2";
export const SCREENSHOT_MANIFEST_PATH = resolve(REPOSITORY_ROOT, "screenshots.manifest.json");
export const SCREENSHOT_DIRECTORY = resolve(REPOSITORY_ROOT, "docs", "screenshots");
export const EXPECTED_SCENES = Object.freeze([
	"desktop-month-grid",
	"month-year-jump",
	"mobile-month-agenda-dark",
	"mobile-month-swipe-pull",
	"event-details-dark",
	"grid-event-keyboard-focus"
]);

const SOURCE_EXTENSIONS = new Set([".css", ".html", ".js", ".json", ".mjs", ".ts"]);
const GENERATED_SOURCE_FILES = new Set([
	"examples/advanced/main.js",
	"examples/metadata.json"
]);
const SCREENSHOT_SOURCE_DIRECTORIES = new Set(["src"]);
const SCREENSHOT_PACKAGE_SCRIPTS = Object.freeze([
	"prebuild:package",
	"build:package",
	"postbuild:package",
	"prebuild:examples:advanced",
	"build:examples:advanced",
	"postbuild:examples:advanced",
	"prescreenshots:update",
	"screenshots:update",
	"postscreenshots:update"
]);
export const SCREENSHOT_SOURCE_INPUTS = Object.freeze([
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
const PNG_SIGNATURE = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]);

export function assertSupportedNode() {
	assertSupportedNodeVersion("Screenshot tooling");
}

export function assertPinnedNpm() {
	const userAgent = process.env["npm_config_user_agent"] ?? "";
	const npmVersion = /(?:^|\s)npm\/([^\s]+)/u.exec(userAgent)?.[1];
	if (npmVersion !== REQUIRED_NPM_VERSION) {
		throw new Error(
			`Screenshot tooling requires npm ${REQUIRED_NPM_VERSION}; received ${npmVersion ?? "unknown"}. ` +
			"Run it through the manifest-pinned package manager."
		);
	}
}

function isRepositoryPath(path) {
	const child = relative(REPOSITORY_ROOT, path);
	return child !== "" && child !== ".." && !child.startsWith(`..${sep}`) && !isAbsolute(child);
}

export function isScreenshotSourceFile(repositoryRelativePath) {
	const normalizedPath = repositoryRelativePath.replaceAll("\\", "/");
	return !GENERATED_SOURCE_FILES.has(normalizedPath) &&
		SOURCE_EXTENSIONS.has(extname(normalizedPath).toLowerCase());
}

export function isScreenshotSourceInput(repositoryRelativePath) {
	const normalizedPath = repositoryRelativePath.replaceAll("\\", "/");
	return isScreenshotSourceFile(normalizedPath) && (
		SCREENSHOT_SOURCE_INPUTS.includes(normalizedPath) ||
		[...SCREENSHOT_SOURCE_DIRECTORIES].some((directory) =>
			normalizedPath.startsWith(`${directory}/`)
		)
	);
}

export function canonicalizeScreenshotSource(repositoryRelativePath, contents) {
	const normalizedPath = repositoryRelativePath.replaceAll("\\", "/");
	if (normalizedPath !== "package.json" && normalizedPath !== "package-lock.json") {
		return Buffer.isBuffer(contents) ? contents : Buffer.from(contents);
	}

	const manifest = JSON.parse(Buffer.isBuffer(contents) ? contents.toString("utf8") : contents);
	if (manifest === null || typeof manifest !== "object" || Array.isArray(manifest)) {
		throw new Error(`${normalizedPath} must contain a JSON object.`);
	}
	if (Object.hasOwn(manifest, "version")) {
		manifest.version = "<root-version>";
	}
	if (normalizedPath === "package.json" &&
		manifest.scripts !== null && typeof manifest.scripts === "object" &&
		!Array.isArray(manifest.scripts)) {
		manifest.scripts = Object.fromEntries(SCREENSHOT_PACKAGE_SCRIPTS
			.filter((name) => Object.hasOwn(manifest.scripts, name))
			.map((name) => [name, manifest.scripts[name]]));
	}
	if (normalizedPath === "package-lock.json" &&
		manifest.packages?.[""] !== null &&
		typeof manifest.packages?.[""] === "object" &&
		!Array.isArray(manifest.packages[""]) &&
		Object.hasOwn(manifest.packages[""], "version")) {
		manifest.packages[""].version = "<root-version>";
	}
	return Buffer.from(JSON.stringify(manifest));
}

async function collectFiles(path) {
	const metadata = await stat(path);
	if (metadata.isFile()) {
		const repositoryRelativePath = relative(REPOSITORY_ROOT, path).replaceAll("\\", "/");
		return isScreenshotSourceInput(repositoryRelativePath) ? [path] : [];
	}
	if (!metadata.isDirectory()) {
		return [];
	}

	const entries = await readdir(path, { withFileTypes: true });
	const nested = await Promise.all(entries
		.filter((entry) => !entry.name.startsWith(".") && entry.name !== "node_modules")
		.map((entry) => collectFiles(resolve(path, entry.name))));
	return nested.flat();
}

export async function computeSourceFingerprint() {
	const files = (await Promise.all(SCREENSHOT_SOURCE_INPUTS.map((input) =>
		collectFiles(resolve(REPOSITORY_ROOT, input))))).flat().sort();
	const hash = createHash("sha256");
	for (const file of files) {
		if (!isRepositoryPath(file)) {
			throw new Error(`Screenshot source escaped the repository: ${file}`);
		}
		hash.update(relative(REPOSITORY_ROOT, file).replaceAll("\\", "/"));
		hash.update("\0");
		hash.update(canonicalizeScreenshotSource(
			relative(REPOSITORY_ROOT, file).replaceAll("\\", "/"),
			await readFile(file)
		));
		hash.update("\0");
	}
	return hash.digest("hex");
}

export async function readScreenshotManifest() {
	return JSON.parse(await readFile(SCREENSHOT_MANIFEST_PATH, "utf8"));
}

export function validateScreenshotManifest(manifest, { final = false } = {}) {
	const errors = [];
	if (manifest === null || typeof manifest !== "object" || Array.isArray(manifest)) {
		return ["Manifest root must be an object."];
	}
	if (manifest.version !== 1) {
		errors.push("Manifest version must be 1.");
	}
	if (manifest.state !== "provisional" && manifest.state !== "final") {
		errors.push('Manifest state must be "provisional" or "final".');
	}
	if (!isSupportedNodeVersion(manifest.toolchain?.node) ||
		manifest.toolchain?.npm !== REQUIRED_NPM_VERSION ||
		manifest.toolchain?.playwright !== "1.62.1" || manifest.toolchain?.browser !== "chromium") {
		errors.push(
			`Manifest toolchain must record an exact Node ${SUPPORTED_NODE_RANGE} runtime and the pinned ` +
			"npm, Playwright, and Chromium inputs."
		);
	}
	if (!Array.isArray(manifest.scenes)) {
		return [...errors, "Manifest scenes must be an array."];
	}

	const ids = manifest.scenes.map((scene) => scene?.id);
	if (JSON.stringify(ids) !== JSON.stringify(EXPECTED_SCENES)) {
		errors.push(`Manifest scenes must be ordered exactly as: ${EXPECTED_SCENES.join(", ")}.`);
	}
	const outputs = new Set();
	for (const scene of manifest.scenes) {
		if (scene === null || typeof scene !== "object" || Array.isArray(scene)) {
			errors.push("Every manifest scene must be an object.");
			continue;
		}
		if (typeof scene.route !== "string" || !scene.route.startsWith("/examples/") ||
			!scene.route.endsWith("/")) {
			errors.push(`${scene.id}: route must be a repository example URL.`);
		}
		if (typeof scene.output !== "string" ||
			!/^docs\/screenshots\/[a-z0-9-]+\.png$/u.test(scene.output)) {
			errors.push(`${scene.id}: output must be a canonical PNG under docs/screenshots.`);
		} else if (outputs.has(scene.output)) {
			errors.push(`${scene.id}: output is duplicated.`);
		} else {
			outputs.add(scene.output);
		}
		if (!Number.isSafeInteger(scene.viewport?.width) || scene.viewport.width <= 0 ||
			!Number.isSafeInteger(scene.viewport?.height) || scene.viewport.height <= 0) {
			errors.push(`${scene.id}: viewport must contain positive integer dimensions.`);
		}
		if (typeof scene.hasTouch !== "boolean") {
			errors.push(`${scene.id}: hasTouch must record whether touch input is enabled.`);
		}
		if (!Array.isArray(scene.setup) || scene.setup.length === 0 ||
			scene.setup.some((step) => typeof step !== "string" || step.length === 0)) {
			errors.push(`${scene.id}: setup must record deterministic scene steps.`);
		}
		if (typeof scene.alt !== "string" || scene.alt.trim() !== scene.alt || scene.alt.length < 20) {
			errors.push(`${scene.id}: alt text must be a useful, trimmed description.`);
		}
		if (!Array.isArray(scene.references) || scene.references.length === 0 ||
			scene.references.some((reference) => typeof reference !== "string" || !reference.endsWith(".md"))) {
			errors.push(`${scene.id}: references must list Markdown documents.`);
		}
		if (final && !/^[a-f0-9]{64}$/u.test(scene.sha256 ?? "")) {
			errors.push(`${scene.id}: final captures require a SHA-256 hash.`);
		}
	}

	if (final && manifest.state !== "final") {
		errors.push("Screenshot manifest is still provisional; run npm run screenshots:update.");
	}
	if (final && !/^[a-f0-9]{64}$/u.test(manifest.sourceFingerprint ?? "")) {
		errors.push("Final screenshot manifest requires a source fingerprint.");
	}
	return errors;
}

export async function sha256File(path) {
	return createHash("sha256").update(await readFile(path)).digest("hex");
}

export async function readPngDimensions(path) {
	const bytes = await readFile(path);
	if (bytes.byteLength < 24 || !bytes.subarray(0, 8).equals(PNG_SIGNATURE) ||
		bytes.toString("ascii", 12, 16) !== "IHDR") {
		throw new Error(`${relative(REPOSITORY_ROOT, path)} is not a valid PNG with an IHDR chunk.`);
	}
	return Object.freeze({
		height: bytes.readUInt32BE(20),
		width: bytes.readUInt32BE(16)
	});
}
