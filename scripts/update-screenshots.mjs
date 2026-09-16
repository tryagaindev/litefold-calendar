import { mkdir, mkdtemp, open, rm } from "node:fs/promises";
import { basename, dirname, join, relative, resolve } from "node:path";

import { chromium } from "@playwright/test";

import { resolveBrowserTargets } from "./lib/browser-targets.mjs";
import { REPOSITORY_ROOT } from "./lib/process.mjs";
import {
	replaceScreenshotBatch, validateScreenshotBatch, writeScreenshotReview
} from "./lib/screenshot-preparation.mjs";
import {
	assertSupportedNode, assertPinnedNpm, computeSourceFingerprint, readPngDimensions,
	readScreenshotManifest, SCREENSHOT_DIRECTORY, SCREENSHOT_MANIFEST_PATH,
	sha256File, validateScreenshotManifest
} from "./screenshot-contract.mjs";
import { ADDITIONAL_SCREENSHOT_SCENES, prepareScreenshotScene } from "./screenshot-scenes.mjs";
import { startRepositoryServer } from "./serve-repository.mjs";

assertSupportedNode();
assertPinnedNpm();
if (process.env["CI"]) {
	throw new Error("CI must verify screenshot evidence; canonical captures can only be prepared locally.");
}

const previousManifest = await readScreenshotManifest();
const manifest = {
	...previousManifest,
	scenes: [...previousManifest.scenes, ...ADDITIONAL_SCREENSHOT_SCENES.filter((scene) =>
		!previousManifest.scenes.some((previous) => previous.id === scene.id))]
};
const manifestErrors = validateScreenshotManifest(manifest);
if (manifestErrors.length > 0) {
	throw new Error(`Screenshot manifest is invalid:\n- ${manifestErrors.join("\n- ")}`);
}

const cacheDirectory = resolve(REPOSITORY_ROOT, ".cache", "screenshots");
await mkdir(cacheDirectory, { recursive: true });
const lockPath = join(cacheDirectory, "capture.lock");
const lock = await open(lockPath, "wx");
let repositoryServer;
let browser;

try {
	const stagingDirectory = await mkdtemp(join(cacheDirectory, "staging-"));
	const sourceFingerprint = await computeSourceFingerprint();
	repositoryServer = await startRepositoryServer({ port: 0 });
	browser = await chromium.launch({ headless: true });
	const updatedScenes = [];
	for (const scene of manifest.scenes) {
		if (dirname(resolve(REPOSITORY_ROOT, scene.output)) !== SCREENSHOT_DIRECTORY) {
			throw new Error(`${scene.id}: output escaped the canonical screenshot directory.`);
		}
		const output = join(stagingDirectory, basename(scene.output));
		const context = await browser.newContext({
			baseURL: repositoryServer.origin, colorScheme: "light", deviceScaleFactor: 1,
			hasTouch: scene.hasTouch, locale: "en-US", reducedMotion: "reduce",
			serviceWorkers: "block", timezoneId: "America/Los_Angeles", viewport: scene.viewport
		});
		try {
			const page = await context.newPage();
			const runtimeErrors = [];
			page.on("console", (message) => {
				if (message.type() === "error") { runtimeErrors.push(`console: ${message.text()}`); }
			});
			page.on("pageerror", (error) => { runtimeErrors.push(`page: ${error.message}`); });
			await page.route("**/*", async (route) => {
				if (new URL(route.request().url()).origin === repositoryServer.origin) {
					await route.continue();
				} else {
					runtimeErrors.push(`External request: ${route.request().url()}`);
					await route.abort("blockedbyclient");
				}
			});
			await prepareScreenshotScene(page, scene);
			await page.screenshot({ animations: "disabled", caret: "hide", fullPage: false,
				path: output, scale: "css" });
			if (runtimeErrors.length > 0) {
				throw new Error(`${scene.id} emitted runtime errors:\n- ${runtimeErrors.join("\n- ")}`);
			}
		} finally { await context.close(); }
		updatedScenes.push({ ...scene, sha256: await sha256File(output) });
		console.log(`Staged ${scene.output}.`);
	}
	const updatedManifest = {
		...manifest, state: "final",
		toolchain: { ...manifest.toolchain, node: process.versions.node },
		browserTargets: resolveBrowserTargets(), sourceFingerprint, scenes: updatedScenes
	};
	const finalErrors = validateScreenshotManifest(updatedManifest, { final: true });
	if (finalErrors.length > 0) { throw new Error(finalErrors.join("\n")); }
	await validateScreenshotBatch({ directory: stagingDirectory, manifest: updatedManifest,
		readDimensions: readPngDimensions, hashFile: sha256File });
	if (await computeSourceFingerprint() !== sourceFingerprint) {
		throw new Error("Screenshot sources changed during capture; canonical evidence was preserved. Retry after edits settle.");
	}
	const review = await writeScreenshotReview({ directory: join(cacheDirectory, "review"),
		beforeDirectory: SCREENSHOT_DIRECTORY, afterDirectory: stagingDirectory,
		previousManifest, manifest: updatedManifest });
	await replaceScreenshotBatch({ stagingDirectory, screenshotDirectory: SCREENSHOT_DIRECTORY,
		manifestPath: SCREENSHOT_MANIFEST_PATH, manifest: updatedManifest });
	await rm(stagingDirectory, { recursive: true, force: true });
	console.log(`Finalized ${updatedScenes.length} screenshots; ${review.changed.length} changed. ` +
		`Review ${relative(REPOSITORY_ROOT, join(cacheDirectory, "review", "index.html"))}.`);
} finally {
	try { await browser?.close(); }
	finally {
		try { await repositoryServer?.close(); }
		finally {
			await lock.close();
			await rm(lockPath, { force: true });
		}
	}
}
