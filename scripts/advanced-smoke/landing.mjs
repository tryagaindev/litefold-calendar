import assert from "node:assert/strict";
import { access, readFile } from "node:fs/promises";
import { join } from "node:path";
import { pathToFileURL } from "node:url";

import { JSDOM } from "jsdom";

import { parseExampleMetadata } from "../lib/example-metadata.mjs";
import { EXAMPLE_ROUTES } from "../lib/example-routes.mjs";
import { REPOSITORY_ROOT } from "../lib/process.mjs";

const EXAMPLES_DIRECTORY = join(REPOSITORY_ROOT, "examples");
const EXPECTED_EXAMPLE_PATHS = EXAMPLE_ROUTES.map(({ route }) => route.slice("/examples/".length)).sort();
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

async function renderMetadata(dom, response, scenario) {
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
			return response();
		}, descriptors);
		await import(`${pathToFileURL(LANDING_MODULE).href}?lfc-landing-smoke=${encodeURIComponent(scenario)}`);
	} finally {
		restoreGlobals(descriptors);
	}
}

function successfulResponse(metadata) {
	return () => ({ json: async () => metadata, ok: true, status: 200 });
}

function verifyRepositoryLinks(document, commit) {
	const links = document.querySelectorAll("a[data-my-repository-path]");
	assert.ok(links.length > 0, "Expected source and documentation links on the examples landing page.");
	for (const link of links) {
		assert.equal(
			link.getAttribute("href"),
			`https://github.com/tryagaindev/litefold-calendar/${link.getAttribute("data-my-repository-kind")}/${commit}/${link.getAttribute("data-my-repository-path")}`
		);
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
		assert.ok(dom.window.document.querySelector("main#my-list"));
		assert.ok(dom.window.document.querySelector('a[href="#my-list"]'));
		verifyLocalRuntimeAssets(dom.window.document);

		const exampleLinks = [...dom.window.document.querySelectorAll(".my-card h3 a")]
			.map((link) => link.getAttribute("href")?.replace(/^\.\//u, "") ?? "")
			.sort();
		assert.deepEqual(exampleLinks, EXPECTED_EXAMPLE_PATHS);
		await Promise.all(EXPECTED_EXAMPLE_PATHS.map((path) =>
			access(join(EXAMPLES_DIRECTORY, path, "index.html"))
		));

		await renderMetadata(dom, successfulResponse(metadata), "built-metadata");
		assert.equal(
			dom.window.document.querySelector("[data-my-version]")?.textContent,
			metadata.version
		);
		assert.equal(
			dom.window.document.querySelector("[data-my-commit]")?.textContent,
			metadata.commit ?? "Not available"
		);
		assert.equal(
			dom.window.document.querySelector("[data-my-metadata-state]")
				?.getAttribute("data-my-metadata-state"),
			"ready"
		);
	} finally {
		dom.window.close();
	}

	const commit = "0123456789abcdef0123456789abcdef01234567";
	for (const [channel, label] of [
		["local", "Local working copy"],
		["main", "Rolling main preview"],
		["release", "Immutable release"]
	]) {
		const successDom = new JSDOM(markup, { url: "https://example.test/examples/" });
		try {
			const sourceCommit = channel === "local" ? null : commit;
			await renderMetadata(successDom, successfulResponse({
				channel, commit: sourceCommit, version: metadata.version
			}), channel);
			const document = successDom.window.document;
			assert.equal(document.querySelector("[data-my-metadata-state]")?.getAttribute("data-my-metadata-state"), "ready");
			assert.equal(document.querySelector("[data-my-version]")?.textContent, metadata.version);
			assert.equal(document.querySelector("[data-my-channel]")?.textContent, label);
			assert.equal(document.querySelector("[data-my-commit]")?.textContent, sourceCommit ?? "Not available");
			assert.equal(document.querySelector("[data-my-commit-link]")?.getAttribute("href"), sourceCommit === null
				? "https://github.com/tryagaindev/litefold-calendar/tree/main"
				: `https://github.com/tryagaindev/litefold-calendar/commit/${sourceCommit}`);
			verifyRepositoryLinks(document, sourceCommit ?? "main");
		} finally {
			successDom.window.close();
		}
	}

	for (const [scenario, response] of [
		["missing-file", () => ({ ok: false, status: 404 })],
		["missing-fields", successfulResponse({})],
		["malformed-metadata", successfulResponse({ channel: "release", commit: null, version: metadata.version })],
		["invalid-json", () => ({
			json: async () => { throw new SyntaxError("Invalid JSON"); }, ok: true, status: 200
		})],
		["network-failure", () => { throw new Error("Network request failed"); }]
	]) {
		const failureDom = new JSDOM(markup, { url: "https://example.test/examples/" });
		try {
			await renderMetadata(failureDom, response, scenario);
			const document = failureDom.window.document;
			assert.equal(document.querySelector("[data-my-metadata-state]")?.getAttribute("data-my-metadata-state"), "error", scenario);
			assert.equal(document.querySelector("[data-my-version]")?.textContent, "Not available", scenario);
			assert.equal(document.querySelector("[data-my-channel]")?.textContent, "Metadata unavailable", scenario);
			assert.equal(document.querySelector("[data-my-commit]")?.textContent, "main branch", scenario);
			assert.equal(document.querySelector("[data-my-commit-link]")?.getAttribute("href"),
				"https://github.com/tryagaindev/litefold-calendar/tree/main", scenario);
			assert.match(document.querySelector("[data-my-metadata-status]")?.textContent ?? "", /main branch/u, scenario);
			verifyRepositoryLinks(document, "main");
		} finally {
			failureDom.window.close();
		}
	}
}
