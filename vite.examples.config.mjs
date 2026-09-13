import { dirname, join, resolve } from "node:path";

import { defineConfig } from "vite";

import { REPOSITORY_ROOT } from "./scripts/lib/process.mjs";
import { composeStyles } from "./scripts/lib/styles.mjs";
import { createExampleMetadata, serializeExampleMetadata } from "./scripts/lib/example-metadata.mjs";
import { readPackageManifest } from "./scripts/lib/package-entries.mjs";

const VIRTUAL_STYLES = "\0lfc-source-styles.css";

/** Serves source modules during local development; verification still uses built artifacts. */
export function sourceExamplesPlugin() {
	return {
		name: "litefold-source-examples",
		enforce: "pre",
		configureServer(server) {
			server.middlewares.use((request, response, next) => {
				if (request.url?.split("?", 1)[0] !== "/examples/metadata.json") { next(); return; }
				void readPackageManifest().then((manifest) => {
					response.setHeader("Content-Type", "application/json; charset=utf-8");
					response.setHeader("Cache-Control", "no-store");
					response.end(serializeExampleMetadata(createExampleMetadata({
						channel: "local", commit: null, version: manifest.version
					})));
				}).catch(next);
			});
		},
		resolveId(source, importer) {
			const path = source.startsWith("/")
				? join(REPOSITORY_ROOT, source)
				: importer === undefined ? null : resolve(dirname(importer), source);
			if (path === join(REPOSITORY_ROOT, "dist", "styles.css")) {
				return VIRTUAL_STYLES;
			}
			if (path === join(REPOSITORY_ROOT, "dist", "index.js")) {
				return join(REPOSITORY_ROOT, "src", "index.ts");
			}
			const extension = path?.replaceAll("\\", "/")
				.match(/\/dist\/extensions\/([a-z][a-z0-9-]*)\/index\.js$/u)?.[1];
			if (extension !== undefined && path.startsWith(join(REPOSITORY_ROOT, "dist"))) {
				return join(REPOSITORY_ROOT, "src", "extensions", extension, "index.ts");
			}
		},
		load(id) {
			if (id === VIRTUAL_STYLES) { return composeStyles(); }
		},
		transformIndexHtml: {
			order: "pre",
			handler(html, context) {
				return context.path === "/examples/advanced/index.html" || context.path === "/examples/advanced/"
					? html.replace('src="./main.js"', 'src="./main.ts"')
					: html;
			}
		},
		handleHotUpdate(context) {
			if (context.file.startsWith(join(REPOSITORY_ROOT, "src", "styles"))) {
				const module = context.server.moduleGraph.getModuleById(VIRTUAL_STYLES);
				if (module !== undefined) { context.server.moduleGraph.invalidateModule(module); }
				context.server.ws.send({ type: "full-reload" });
				return [];
			}
		}
	};
}

export default defineConfig({
	root: REPOSITORY_ROOT,
	plugins: [sourceExamplesPlugin()],
	server: { host: "127.0.0.1", open: "/examples/", port: 4173, strictPort: true }
});
