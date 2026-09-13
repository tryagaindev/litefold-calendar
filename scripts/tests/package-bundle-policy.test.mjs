import assert from "node:assert/strict";
import { posix } from "node:path";
import test from "node:test";

import {
	inspectDistributionInventory,
	inspectPackageBundles,
	requiredPackageFiles
} from "../lib/package-bundle-policy.mjs";

const SHARED_CHUNK = "dist/chunks/registry-AbCd0123.js";
const EXTENSION_ENTRY = "dist/extensions/webmcp/index.js";

function setJavaScript(fixture, path, content, sourcePaths) {
	fixture.files.set(path, `${content}\n//# sourceMappingURL=${posix.basename(path)}.map\n`);
	fixture.files.set(`${path}.map`, JSON.stringify({
		file: posix.basename(path),
		mappings: "AAAA",
		names: [],
		sources: sourcePaths.map((source) => posix.relative(posix.dirname(path), source)),
		sourcesContent: sourcePaths.map((source) => fixture.sources.get(source)),
		version: 3
	}));
}

function fixture() {
	const sourceModules = ["index", "types", "internal/registry", "extensions/webmcp/index"];
	const publicJavaScript = ["dist/index.js", EXTENSION_ENTRY];
	const sources = new Map(sourceModules.map((name) => [`src/${name}.ts`, `//Source: ${name}\n`]));
	const files = new Map([["dist/styles.css", ""], ["dist/styles.css.d.ts", "export {};\n"]]);
	for (const name of sourceModules) {
		const path = `dist/${name}.d.ts`;
		files.set(path, "export {};\n");
		files.set(`${path}.map`, JSON.stringify({
			file: posix.basename(path),
			mappings: "AAAA",
			names: [],
			sourceRoot: "",
			sources: [posix.relative(posix.dirname(path), `src/${name}.ts`)],
			version: 3
		}));
	}
	const result = { files, publicJavaScript, sourceModules, sources };
	setJavaScript(result, "dist/index.js", `export { registry } from "./chunks/${posix.basename(SHARED_CHUNK)}";`, ["src/index.ts"]);
	setJavaScript(result, SHARED_CHUNK, "export const registry = new WeakMap();", ["src/internal/registry.ts"]);
	setJavaScript(result, EXTENSION_ENTRY,
		`import { registry } from "../../chunks/${posix.basename(SHARED_CHUNK)}"; export const extension = () => registry;`,
		["src/extensions/webmcp/index.ts"]);
	return result;
}

void test("package bundle policy accepts shared bundled ESM with source declarations and embedded provenance", () => {
	const data = fixture();
	assert.deepEqual(inspectPackageBundles(data), []);
	const packed = [...data.files.keys(), "LICENSE", "README.md", "package.json"];
	assert.deepEqual(inspectDistributionInventory(packed, data.sourceModules, data.publicJavaScript, { packed: true }), []);
	assert.equal(requiredPackageFiles(data.sourceModules, data.publicJavaScript).has("dist/internal/registry.js"), false);
});

void test("package bundle policy rejects extension code concealed in a core-reachable private chunk", () => {
	const data = fixture();
	setJavaScript(data, SHARED_CHUNK, "export const registry = new WeakMap();", ["src/extensions/webmcp/index.ts"]);
	assert.ok(inspectPackageBundles(data).some((error) =>
		error.includes("dist/index.js reaches optional extension") && error.includes(SHARED_CHUNK)));
});

void test("package bundle policy rejects sibling-extension source reachable from another extension", () => {
	const data = fixture();
	data.sources.set("src/extensions/other/index.ts", "export {};\n");
	setJavaScript(data, EXTENSION_ENTRY, "export const extension = () => undefined;", ["src/extensions/other/index.ts"]);
	assert.ok(inspectPackageBundles(data).some((error) => error.includes(`${EXTENSION_ENTRY} reaches optional extension "other"`)));
});

void test("package bundle policy rejects altered source content and source-map paths outside repository source", () => {
	const data = fixture();
	const map = JSON.parse(data.files.get(`${SHARED_CHUNK}.map`));
	map.sourcesContent[0] = "export const registry = false;\n";
	data.files.set(`${SHARED_CHUNK}.map`, JSON.stringify(map));
	assert.ok(inspectPackageBundles(data).some((error) => error.includes("matching sourcesContent")));
	map.sources[0] = "../../node_modules/unexpected/index.ts";
	data.files.set(`${SHARED_CHUNK}.map`, JSON.stringify(map));
	assert.ok(inspectPackageBundles(data).some((error) => error.includes("repository src/ TypeScript module")));
});

void test("package bundle policy resolves static, dynamic, and declaration imports against shipped output", () => {
	const data = fixture();
	setJavaScript(data, "dist/index.js", 'export const load = () => import("./missing.js");', ["src/index.ts"]);
	data.files.set("dist/index.d.ts", 'export type { Missing } from "./missing.js";\n');
	const errors = inspectPackageBundles(data);
	assert.ok(errors.some((error) => error.includes("shipped JavaScript module inside dist/")));
	assert.ok(errors.some((error) => error.includes("shipped declaration module inside dist/")));
	data.files.set("dist/index.d.ts", 'export type { Value } from "./types.js";\n');
	assert.equal(inspectPackageBundles(data).some((error) => error.includes("shipped declaration")), false);
});

void test("package bundle policy rejects orphan runtime outputs and incomplete map pairs", () => {
	const data = fixture();
	const orphan = "dist/chunks/unused-EfGh4567.js";
	setJavaScript(data, orphan, "export const unused = true;", ["src/types.ts"]);
	assert.ok(inspectPackageBundles(data).some((error) => error.includes(`${orphan} is not reachable`)));
	data.files.delete(`${orphan}.map`);
	assert.ok(inspectPackageBundles(data).some((error) => error.includes(`${orphan} requires a companion`)));
	data.files.delete(orphan);
	data.files.delete("dist/index.js");
	assert.ok(inspectPackageBundles(data).some((error) => error.includes("dist/index.js.map has no corresponding")));
});

void test("package bundle policy accepts source-free forwarding entries but rejects unmapped runtime code", () => {
	const data = fixture();
	setJavaScript(data, "dist/index.js", `export { registry } from "./chunks/${posix.basename(SHARED_CHUNK)}";`, []);
	assert.deepEqual(inspectPackageBundles(data), []);
	setJavaScript(data, "dist/index.js", 'export const registry = new WeakMap();', []);
	assert.ok(inspectPackageBundles(data).some((error) => error.includes("runtime code without repository source provenance")));
});

void test("package bundle policy rejects unexpected artifacts and wrong source-map identity", () => {
	const data = fixture();
	data.files.set("dist/accidental.json", "{}");
	const map = JSON.parse(data.files.get(`${SHARED_CHUNK}.map`));
	map.file = "different.js";
	data.files.set(`${SHARED_CHUNK}.map`, JSON.stringify(map));
	const errors = inspectPackageBundles(data);
	assert.ok(errors.some((error) => error.includes("Unexpected built file: dist/accidental.json")));
	assert.ok(errors.some((error) => error.includes("companion output as the generated file")));
});
