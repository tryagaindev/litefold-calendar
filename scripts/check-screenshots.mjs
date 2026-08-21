import { readdir, readFile, stat } from "node:fs/promises";
import { dirname, extname, isAbsolute, relative, resolve, sep } from "node:path";

import { REPOSITORY_ROOT } from "./lib/process.mjs";
import {
	assertSupportedNode,
	assertPinnedNpm,
	computeSourceFingerprint,
	readPngDimensions,
	readScreenshotManifest,
	SCREENSHOT_DIRECTORY,
	sha256File,
	validateScreenshotManifest
} from "./screenshot-contract.mjs";

assertSupportedNode();
assertPinnedNpm();

const SCREENSHOT_EXTENSIONS = new Set([".avif", ".jpeg", ".jpg", ".png", ".webp"]);
const MARKDOWN_IMAGE = /!\[([^\]]*)\]\((<?[^)\s>]+>?)(?:\s+["'][^"']*["'])?\)/gu;

function repositoryRelative(path) {
	return relative(REPOSITORY_ROOT, path).replaceAll("\\", "/");
}

function isWithinRepository(path) {
	const child = relative(REPOSITORY_ROOT, path);
	return child !== "" && child !== ".." && !child.startsWith(`..${sep}`) && !isAbsolute(child);
}

async function collectMarkdown(path) {
	const entries = await readdir(path, { withFileTypes: true });
	const files = [];
	for (const entry of entries) {
		if (entry.name.startsWith(".") || entry.name === "dist" || entry.name === "node_modules" ||
			entry.name === "test-results") {
			continue;
		}
		const entryPath = resolve(path, entry.name);
		if (entry.isDirectory()) {
			files.push(...await collectMarkdown(entryPath));
		} else if (entry.isFile() && extname(entry.name).toLowerCase() === ".md") {
			files.push(entryPath);
		}
	}
	return files;
}

async function collectScreenshotReferences() {
	const references = [];
	for (const markdownPath of await collectMarkdown(REPOSITORY_ROOT)) {
		const markdown = await readFile(markdownPath, "utf8");
		for (const match of markdown.matchAll(MARKDOWN_IMAGE)) {
			const rawTarget = match[2].replace(/^</u, "").replace(/>$/u, "").split("#", 1)[0];
			if (/^[a-z][a-z0-9+.-]*:/iu.test(rawTarget)) {
				continue;
			}
			const target = resolve(dirname(markdownPath), rawTarget);
			if (isWithinRepository(target) && dirname(target) === SCREENSHOT_DIRECTORY) {
				references.push({
					alt: match[1],
					document: repositoryRelative(markdownPath),
					target: repositoryRelative(target)
				});
			}
		}
	}
	return references;
}

const manifest = await readScreenshotManifest();
const errors = validateScreenshotManifest(manifest, { final: true });
const references = await collectScreenshotReferences();
const expectedOutputs = new Set();

if (Array.isArray(manifest.scenes)) {
	for (const scene of manifest.scenes) {
		if (scene === null || typeof scene !== "object" || typeof scene.output !== "string") {
			continue;
		}
		expectedOutputs.add(scene.output);
		const output = resolve(REPOSITORY_ROOT, scene.output);
		try {
			if (!(await stat(output)).isFile()) {
				throw new Error("not a file");
			}
			const dimensions = await readPngDimensions(output);
			if (dimensions.width !== scene.viewport?.width || dimensions.height !== scene.viewport?.height) {
				errors.push(
					`${scene.id}: dimensions are ${String(dimensions.width)}x${String(dimensions.height)}, ` +
					`expected ${String(scene.viewport?.width)}x${String(scene.viewport?.height)}.`
				);
			}
			const hash = await sha256File(output);
			if (hash !== scene.sha256) {
				errors.push(`${scene.id}: SHA-256 does not match the manifest.`);
			}
		} catch (error) {
			errors.push(`${scene.id}: missing or invalid capture ${scene.output} (${error.message}).`);
		}

		for (const referencePath of scene.references ?? []) {
			const match = references.find((reference) =>
				reference.document === referencePath && reference.target === scene.output);
			if (match === undefined) {
				errors.push(`${scene.id}: ${referencePath} does not reference ${scene.output}.`);
			} else if (match.alt !== scene.alt) {
				errors.push(`${scene.id}: ${referencePath} alt text does not match the manifest.`);
			}
		}
	}
}

try {
	const currentFingerprint = await computeSourceFingerprint();
	if (currentFingerprint !== manifest.sourceFingerprint) {
		errors.push("Screenshot source fingerprint is stale; run npm run screenshots:update.");
	}
} catch (error) {
	errors.push(`Unable to compute screenshot source fingerprint (${error.message}).`);
}

for (const entry of await readdir(SCREENSHOT_DIRECTORY, { withFileTypes: true })) {
	if (!entry.isFile() || !SCREENSHOT_EXTENSIONS.has(extname(entry.name).toLowerCase())) {
		continue;
	}
	const asset = `docs/screenshots/${entry.name}`;
	if (!expectedOutputs.has(asset)) {
		errors.push(`Orphaned or obsolete screenshot asset: ${asset}.`);
	}
}

for (const reference of references) {
	if (!expectedOutputs.has(reference.target)) {
		errors.push(`${reference.document} references an unmanifested screenshot: ${reference.target}.`);
	}
}

if (errors.length > 0) {
	console.error(`Screenshot validation failed:\n- ${[...new Set(errors)].join("\n- ")}`);
	process.exitCode = 1;
} else {
	console.log(
		`Verified ${String(manifest.scenes.length)} screenshot scenes, dimensions, hashes, sources, ` +
		"references, and alt text."
	);
}
