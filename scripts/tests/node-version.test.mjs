import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { join } from "node:path";
import test from "node:test";

import {
	assertSupportedNodeVersion,
	isSupportedNodeVersion,
	parseNodeVersion,
	SUPPORTED_NODE_MAJOR,
	SUPPORTED_NODE_RANGE,
	SUPPORTED_NODE_SELECTOR
} from "../lib/node-version.mjs";
import { REPOSITORY_ROOT } from "../lib/process.mjs";
import { validateScreenshotManifest } from "../screenshot-contract.mjs";

const screenshotManifest = JSON.parse(
	await readFile(join(REPOSITORY_ROOT, "screenshots.manifest.json"), "utf8")
);

test("Node policy constants describe one major release line", () => {
	assert.equal(SUPPORTED_NODE_MAJOR, 24);
	assert.equal(SUPPORTED_NODE_SELECTOR, "24");
	assert.equal(SUPPORTED_NODE_RANGE, "24.x");
});

test("Node version parsing accepts canonical stable semantic versions", () => {
	assert.deepEqual(parseNodeVersion("24.0.0"), { major: 24, minor: 0, patch: 0 });
	assert.deepEqual(parseNodeVersion("24.19.7"), { major: 24, minor: 19, patch: 7 });
	for (const value of [
		undefined,
		null,
		"24",
		"v24.1.0",
		"24.1",
		"24.1.0-rc.1",
		"024.1.0",
		`24.${"9".repeat(20)}.0`
	]) {
		assert.equal(parseNodeVersion(value), undefined);
	}
});

test("supported Node checks accept every stable 24.x patch and reject other majors", () => {
	for (const version of ["24.0.0", "24.1.2", "24.999.999"]) {
		assert.equal(isSupportedNodeVersion(version), true, version);
	}
	for (const version of ["22.16.0", "23.11.1", "25.0.0", "24", "not-a-version"]) {
		assert.equal(isSupportedNodeVersion(version), false, version);
	}
});

test("the assertion reports the supported range and actual runtime", () => {
	assert.doesNotThrow(() => assertSupportedNodeVersion("Fixture", "24.3.1"));
	assert.throws(
		() => assertSupportedNodeVersion("Fixture", "25.0.0"),
		/Fixture requires Node 24\.x; running 25\.0\.0\./u
	);
});

test("screenshot provenance accepts exact patches only within the supported Node major", () => {
	for (const node of ["24.0.0", "24.999.999"]) {
		const manifest = {
			...screenshotManifest,
			toolchain: { ...screenshotManifest.toolchain, node }
		};
		assert.deepEqual(validateScreenshotManifest(manifest, { final: true }), [], node);
	}
	const unsupportedManifest = {
		...screenshotManifest,
		toolchain: { ...screenshotManifest.toolchain, node: "25.0.0" }
	};
	assert.ok(
		validateScreenshotManifest(unsupportedManifest, { final: true })
			.some((error) => error.includes("exact Node 24.x runtime"))
	);
});
