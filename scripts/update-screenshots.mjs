import { mkdir, writeFile } from "node:fs/promises";
import { dirname, relative, resolve } from "node:path";

import { chromium } from "@playwright/test";

import { REPOSITORY_ROOT } from "./lib/process.mjs";
import {
	assertSupportedNode,
	assertPinnedNpm,
	computeSourceFingerprint,
	readPngDimensions,
	readScreenshotManifest,
	SCREENSHOT_DIRECTORY,
	SCREENSHOT_MANIFEST_PATH,
	sha256File,
	validateScreenshotManifest
} from "./screenshot-contract.mjs";
import { prepareScreenshotScene } from "./screenshot-scenes.mjs";
import { startRepositoryServer } from "./serve-repository.mjs";

assertSupportedNode();
assertPinnedNpm();

const manifest = await readScreenshotManifest();
const manifestErrors = validateScreenshotManifest(manifest);
if (manifestErrors.length > 0) {
	throw new Error(`Screenshot manifest is invalid:\n- ${manifestErrors.join("\n- ")}`);
}

const repositoryServer = await startRepositoryServer({ port: 0 });
const browser = await chromium.launch({ headless: true });
const updatedScenes = [];

try {
	for (const scene of manifest.scenes) {
		const output = resolve(REPOSITORY_ROOT, scene.output);
		if (dirname(output) !== SCREENSHOT_DIRECTORY) {
			throw new Error(`${scene.id}: output escaped the canonical screenshot directory.`);
		}

		const context = await browser.newContext({
			baseURL: repositoryServer.origin,
			colorScheme: "light",
			deviceScaleFactor: 1,
			hasTouch: scene.hasTouch,
			locale: "en-US",
			reducedMotion: "reduce",
			serviceWorkers: "block",
			timezoneId: "America/Los_Angeles",
			viewport: scene.viewport
		});
		try {
			const page = await context.newPage();
			const runtimeErrors = [];
			page.on("console", (message) => {
				if (message.type() === "error") {
					runtimeErrors.push(`console: ${message.text()}`);
				}
			});
			page.on("pageerror", (error) => {
				runtimeErrors.push(`page: ${error.message}`);
			});
			page.on("request", (request) => {
				if (new URL(request.url()).origin !== repositoryServer.origin) {
					runtimeErrors.push(`external request blocked by screenshot contract: ${request.url()}`);
				}
			});

			await prepareScreenshotScene(page, scene);
			if (runtimeErrors.length > 0) {
				throw new Error(`${scene.id} emitted runtime errors:\n- ${runtimeErrors.join("\n- ")}`);
			}
			await mkdir(dirname(output), { recursive: true });
			await page.screenshot({
				animations: "disabled",
				caret: "hide",
				fullPage: false,
				path: output,
				scale: "css"
			});
		} finally {
			await context.close();
		}

		const dimensions = await readPngDimensions(output);
		if (dimensions.width !== scene.viewport.width || dimensions.height !== scene.viewport.height) {
			throw new Error(
				`${scene.id} captured ${String(dimensions.width)}x${String(dimensions.height)}; expected ` +
				`${String(scene.viewport.width)}x${String(scene.viewport.height)}.`
			);
		}
		updatedScenes.push({
			...scene,
			sha256: await sha256File(output)
		});
		console.log(`Captured ${relative(REPOSITORY_ROOT, output)}.`);
	}
} finally {
	await browser.close();
	await repositoryServer.close();
}

const updatedManifest = {
	...manifest,
	state: "final",
	toolchain: {
		...manifest.toolchain,
		node: process.versions.node
	},
	sourceFingerprint: await computeSourceFingerprint(),
	scenes: updatedScenes
};
await writeFile(SCREENSHOT_MANIFEST_PATH, `${JSON.stringify(updatedManifest, null, 2)}\n`, "utf8");
console.log(
	`Updated ${String(updatedScenes.length)} deterministic screenshots and finalized their manifest.`
);
