import assert from "node:assert/strict";
import { access, readFile } from "node:fs/promises";
import { join } from "node:path";
import { pathToFileURL } from "node:url";

import { JSDOM } from "jsdom";

import { parseExampleMetadata } from "../lib/example-metadata.mjs";
import { REPOSITORY_ROOT } from "../lib/process.mjs";

const EXAMPLES_DIRECTORY = join(REPOSITORY_ROOT, "examples");
const EXPECTED_EXAMPLE_PATHS = Object.freeze([
	"advanced/",
	"async-errors/",
	"basic/",
	"classic-script/",
	"fullcalendar-v6-migration/",
	"progressive-enhancement/"
]);
const LANDING_MODULE = join(EXAMPLES_DIRECTORY, "index.js");

function installGlobal(name, value, descriptors) {
	descriptors.set(name, Object.getOwnPropertyDescriptor(globalThis, name));
	Object.defineProperty(globalThis, name, {
		configurable: true,
		value,
		writable: true
	});
}

function restoreGlobals(descriptors) {
	for (const [name, descriptor] of descriptors) {
		if (descriptor === undefined) {
			Reflect.deleteProperty(globalThis, name);
		} else {
			Object.defineProperty(globalThis, name, descriptor);
		}
	}
}

function verifyLocalRuntimeAssets(document) {
	assert.equal(document.querySelectorAll("script:not([src]), style").length, 0);
	const resources = [
		...document.querySelectorAll("script[src]"),
		...document.querySelectorAll('link[rel="stylesheet"][href]'),
		...document.querySelectorAll("img[src]")
	];
	for (const resource of resources) {
		const rawUrl = resource.getAttribute(resource.localName === "link" ? "href" : "src");
		assert.ok(rawUrl !== null);
		const url = new URL(rawUrl, document.URL);
		assert.equal(url.origin, "https://example.test", `Expected a same-origin asset: ${rawUrl}`);
	}
}

async function renderMetadata(dom, metadata) {
	const descriptors = new Map();
	try {
		installGlobal("document", dom.window.document, descriptors);
		installGlobal("HTMLElement", dom.window.HTMLElement, descriptors);
		installGlobal("window", dom.window, descriptors);
		installGlobal("fetch", async (input, init) => {
			assert.equal(input, "./metadata.json");
			assert.deepEqual(init, {
				cache: "no-store",
				credentials: "same-origin",
				headers: { Accept: "application/json" }
			});
			return {
				json: async () => metadata,
				ok: true,
				status: 200
			};
		}, descriptors);
		await import(`${pathToFileURL(LANDING_MODULE).href}?lfc-landing-smoke=1`);
	} finally {
		restoreGlobals(descriptors);
	}
}

export async function verifyExamplesLandingPage() {
	const [markup, metadataSource, packageSource] = await Promise.all([
		readFile(join(EXAMPLES_DIRECTORY, "index.html"), "utf8"),
		readFile(join(EXAMPLES_DIRECTORY, "metadata.json"), "utf8"),
		readFile(join(REPOSITORY_ROOT, "package.json"), "utf8")
	]);
	const metadata = parseExampleMetadata(JSON.parse(metadataSource));
	const packageJson = JSON.parse(packageSource);
	assert.equal(metadata.version, packageJson.version);

	const dom = new JSDOM(markup, { url: "https://example.test/examples/" });
	try {
		assert.equal(dom.window.document.documentElement.lang, "en");
		assert.ok(dom.window.document.querySelector("main#example-list"));
		assert.ok(dom.window.document.querySelector('a[href="#example-list"]'));
		verifyLocalRuntimeAssets(dom.window.document);

		const exampleLinks = [...dom.window.document.querySelectorAll(".example-card h3 a")]
			.map((link) => link.getAttribute("href")?.replace(/^\.\//u, "") ?? "")
			.sort();
		assert.deepEqual(exampleLinks, EXPECTED_EXAMPLE_PATHS);
		await Promise.all(EXPECTED_EXAMPLE_PATHS.map((path) =>
			access(join(EXAMPLES_DIRECTORY, path, "index.html"))
		));

		await renderMetadata(dom, metadata);
		assert.equal(
			dom.window.document.querySelector("[data-example-version]")?.textContent,
			metadata.version
		);
		assert.equal(
			dom.window.document.querySelector("[data-example-commit]")?.textContent,
			metadata.commit ?? "Not available"
		);
		assert.equal(
			dom.window.document.querySelector("[data-example-metadata-state]")
				?.getAttribute("data-example-metadata-state"),
			"ready"
		);
	} finally {
		dom.window.close();
	}
}
