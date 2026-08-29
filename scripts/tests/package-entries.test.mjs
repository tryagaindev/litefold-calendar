import assert from "node:assert/strict";
import test from "node:test";

import {
	expectedExtensionExport,
	extractExtensionEntries
} from "../lib/package-entries.mjs";

void test("package extension entries are sorted and derived from export paths", () => {
	const entries = extractExtensionEntries({
		exports: {
			".": { default: "./dist/index.js" },
			"./extensions/zeta": expectedExtensionExport("zeta"),
			"./styles.css": { default: "./dist/styles.css" },
			"./extensions/alpha-beta": expectedExtensionExport("alpha-beta")
		}
	});

	assert.deepEqual(
		entries.map((entry) => entry.id),
		["alpha-beta", "zeta"]
	);
	assert.deepEqual(entries[0], {
		distDeclaration: "dist/extensions/alpha-beta/index.d.ts",
		distJavaScript: "dist/extensions/alpha-beta/index.js",
		exportPath: "./extensions/alpha-beta",
		id: "alpha-beta",
		sourceEntry: "src/extensions/alpha-beta/index.ts",
		sourceModule: "extensions/alpha-beta/index"
	});
	assert.ok(Object.isFrozen(entries));
	assert.ok(entries.every((entry) => Object.isFrozen(entry)));
});

void test("package extension entries reject noncanonical IDs", () => {
	for (const exportPath of [
		"./extensions/",
		"./extensions/WebMcp",
		"./extensions/webmcp/extra",
		"./extensions/web_mcp"
	]) {
		assert.throws(
			() => extractExtensionEntries({ exports: { [exportPath]: {} } }),
			/lowercase kebab-case/u
		);
	}
});
