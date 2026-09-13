import assert from "node:assert/strict";
import { mkdtemp, readFile, readdir, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import test from "node:test";

import { createServer, normalizePath } from "vite";

import { createLibraryConfig } from "../../vite.config.mjs";
import examplesConfig, { sourceExamplesPlugin } from "../../vite.examples.config.mjs";
import { REPOSITORY_ROOT } from "../lib/process.mjs";
import { composeStyles } from "../lib/styles.mjs";

void test("Vite preserves public ESM entries, shared chunks, and standalone CSS", async () => {
	const config = await createLibraryConfig();
	assert.deepEqual(config.build.lib.formats, ["es"]);
	assert.equal(config.build.lib.entry.index, join(REPOSITORY_ROOT, "src/index.ts"));
	assert.equal(config.build.lib.entry["extensions/webmcp/index"], join(REPOSITORY_ROOT, "src/extensions/webmcp/index.ts"));
	assert.equal(config.build.lib.fileName("es", "extensions/webmcp/index"), "extensions/webmcp/index.js");
	assert.equal(config.build.rolldownOptions.output.chunkFileNames, "chunks/[name]-[hash].js");
	assert.equal(config.build.target, "baseline-widely-available");
	assert.equal(config.build.sourcemap, true);
	assert.equal(config.build.cssTarget.length > 0, true);
	const tsconfig = JSON.parse(await readFile(join(REPOSITORY_ROOT, "tsconfig.build.json"), "utf8"));
	assert.equal(tsconfig.compilerOptions.emitDeclarationOnly, true);
	assert.equal(tsconfig.compilerOptions.declarationMap, true);
});

void test("Vite examples resolve source modules and refresh styles without prebuilt output", async () => {
	const root = await mkdtemp(join(tmpdir(), "lfc-vite-examples-"));
	assert.deepEqual(await readdir(root), [], "The served root must start without dist or other generated files.");
	const plugin = sourceExamplesPlugin();
	const server = await createServer({
		...examplesConfig,
		configFile: false,
		root,
		plugins: [plugin],
		cacheDir: join(root, ".vite"),
		server: { middlewareMode: true, watch: null, fs: { allow: [root, REPOSITORY_ROOT] } },
		optimizeDeps: { noDiscovery: true }
	});
	try {
		const core = await server.transformRequest("/dist/index.js");
		assert.match(core.code, /src\/calendar\.ts/u);
		const extension = await server.transformRequest("/dist/extensions/webmcp/index.js");
		assert.match(extension.code, /webMcp/u);
		const styles = await server.transformRequest("/dist/styles.css?direct");
		assert.equal(styles.code, await composeStyles(), "Direct CSS must come from the current source composition.");
		const importedStyles = await server.transformRequest("/dist/styles.css");
		assert.match(importedStyles.code, /__vite__updateStyle/u);
		const directModule = await server.moduleGraph.getModuleByUrl("/dist/styles.css?direct");
		const importedModule = await server.moduleGraph.getModuleByUrl("/dist/styles.css");
		assert.ok(directModule.transformResult);
		assert.ok(importedModule.transformResult);
		plugin.handleHotUpdate({ file: normalizePath(join(REPOSITORY_ROOT, "src", "styles", "tokens.css")), server });
		assert.equal(directModule.transformResult, null, "Source edits must invalidate direct stylesheet requests.");
		assert.equal(importedModule.transformResult, null, "Source edits must invalidate CSS module requests.");
		assert.equal((await server.transformRequest("/dist/styles.css?direct")).code, await composeStyles());
		const advanced = await server.transformIndexHtml("/examples/advanced/index.html", '<script type="module" src="./main.js"></script>');
		assert.match(advanced, /src="\.\/main\.ts"/u);
	} finally {
		await server.close();
		assert.equal(dirname(root), resolve(tmpdir()), "Remove only the temporary root created by this test.");
		await rm(root, { recursive: true, force: true });
	}
});

void test("Vite only rewrites the TypeScript example and preserves classic dynamic import", () => {
	const plugin = sourceExamplesPlugin();
	const html = '<script src="./main.js"></script>';
	assert.equal(plugin.transformIndexHtml.handler(html, { path: "/examples/classic-script/" }), html);
	assert.equal(plugin.transformIndexHtml.handler(html, { path: "/examples/remote-data/" }), html);
});

void test("Vite source development identifies the working copy instead of a stale built commit", async () => {
	const plugin = sourceExamplesPlugin();
	let middleware;
	plugin.configureServer({ middlewares: { use(handler) { middleware = handler; } } });
	const metadata = await new Promise((resolve, reject) => {
		middleware({ url: "/examples/metadata.json" }, {
			setHeader() {},
			end(body) { resolve(JSON.parse(body)); }
		}, reject);
	});
	assert.equal(metadata.channel, "local");
	assert.equal(metadata.commit, null);
	assert.equal(typeof metadata.version, "string");
});
