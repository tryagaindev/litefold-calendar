import { createHash } from "node:crypto";
import { readdir, readFile, stat } from "node:fs/promises";
import { isAbsolute, relative, resolve, sep } from "node:path";

import {
	assertSupportedNodeVersion,
	isSupportedNodeVersion,
	SUPPORTED_NODE_RANGE
} from "./lib/node-version.mjs";
import { REPOSITORY_ROOT } from "./lib/process.mjs";
import { resolveBrowserTargets } from "./lib/browser-targets.mjs";
import { parseSemVer } from "./lib/semver.mjs";
import {
	fingerprintScreenshotFiles, isScreenshotSourceInput, SCREENSHOT_SOURCE_INPUTS
} from "./lib/screenshot-fingerprint.mjs";

export {
	canonicalizeScreenshotSource, captureDependencyVersions, fingerprintScreenshotFiles,
	isScreenshotSourceFile, isScreenshotSourceInput, SCREENSHOT_SOURCE_INPUTS
} from "./lib/screenshot-fingerprint.mjs";

export const REQUIRED_NPM_VERSION = "12.0.2";
const PACKAGE_MANIFEST = JSON.parse(await readFile(resolve(REPOSITORY_ROOT, "package.json"), "utf8"));
export const REQUIRED_PLAYWRIGHT_VERSION = pinnedPlaywrightVersion(PACKAGE_MANIFEST);
export const SCREENSHOT_MANIFEST_PATH = resolve(REPOSITORY_ROOT, "screenshots.manifest.json");
export const SCREENSHOT_DIRECTORY = resolve(REPOSITORY_ROOT, "docs", "screenshots");
export const EXPECTED_SCENES = Object.freeze([
	"desktop-month-grid",
	"month-year-jump",
	"mobile-month-agenda-dark",
	"mobile-month-swipe-pull",
	"event-details-dark",
	"grid-event-keyboard-focus",
	"compact-default-counts",
	"compact-all-counts",
	"wide-all-counts",
	"count-keyboard-focus"
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

export function pinnedPlaywrightVersion(packageManifest) {
	const version = packageManifest?.devDependencies?.["@playwright/test"];
	try {
		parseSemVer(version);
	} catch (error) {
		throw new Error("package.json must pin @playwright/test to an exact version.", { cause: error });
	}
	return version;
}

export async function assertPinnedPlaywright() {
	let installedVersion;
	try {
		const installedManifest = JSON.parse(await readFile(resolve(
			REPOSITORY_ROOT, "node_modules", "@playwright", "test", "package.json"
		), "utf8"));
		installedVersion = installedManifest.version;
	} catch (error) {
		throw new Error("Screenshot tooling requires the package.json-pinned @playwright/test install. Run npm ci.", {
			cause: error
		});
	}
	if (installedVersion !== REQUIRED_PLAYWRIGHT_VERSION) {
		throw new Error(
			`Screenshot tooling requires @playwright/test ${REQUIRED_PLAYWRIGHT_VERSION}; ` +
			`received ${installedVersion ?? "unknown"}. Run npm ci.`
		);
	}
}

function isRepositoryPath(path) {
	const child = relative(REPOSITORY_ROOT, path);
	return child !== "" && child !== ".." && !child.startsWith(`..${sep}`) && !isAbsolute(child);
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
	const paths = (await Promise.all(SCREENSHOT_SOURCE_INPUTS.map((input) =>
		collectFiles(resolve(REPOSITORY_ROOT, input))))).flat();
	const files = await Promise.all(paths.map(async (file) => {
		if (!isRepositoryPath(file)) {
			throw new Error(`Screenshot source escaped the repository: ${file}`);
		}
		return { path: relative(REPOSITORY_ROOT, file).replaceAll("\\", "/"), contents: await readFile(file) };
	}));
	return fingerprintScreenshotFiles(files, resolveBrowserTargets());
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
		manifest.toolchain?.playwright !== REQUIRED_PLAYWRIGHT_VERSION ||
		manifest.toolchain?.browser !== "chromium") {
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
