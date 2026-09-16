import { join } from "node:path";

import { defineConfig } from "vite";

import { resolveBrowserTargets } from "./scripts/lib/browser-targets.mjs";
import { extractExtensionEntries, readPackageManifest } from "./scripts/lib/package-entries.mjs";
import { REPOSITORY_ROOT } from "./scripts/lib/process.mjs";

/** Builds all public entry points together so private extension registration stays shared. */
export async function createLibraryConfig(targets = resolveBrowserTargets()) {
	const extensions = extractExtensionEntries(await readPackageManifest());
	return defineConfig({
		configFile: false,
		root: REPOSITORY_ROOT,
		build: {
			emptyOutDir: false,
			lib: {
				entry: Object.fromEntries([
					["index", join(REPOSITORY_ROOT, "src/index.ts")],
					...extensions.map((entry) => [entry.sourceModule, join(REPOSITORY_ROOT, entry.sourceEntry)])
				]),
				formats: ["es"],
				fileName: (_format, entryName) => `${entryName}.js`
			},
			minify: false,
			outDir: join(REPOSITORY_ROOT, "dist"),
			rolldownOptions: {
				output: { chunkFileNames: "chunks/[name]-[hash].js" }
			},
			sourcemap: true,
			target: "baseline-widely-available",
			cssTarget: [...targets.css]
		}
	});
}

export default createLibraryConfig();
