import { access, copyFile, mkdir, rm, writeFile } from "node:fs/promises";
import { join } from "node:path";

import { build } from "vite";

import { createLibraryConfig } from "../vite.config.mjs";
import { resolveBrowserTargets, writeBrowserTargetReport } from "./lib/browser-targets.mjs";
import { REPOSITORY_ROOT, runTsc } from "./lib/process.mjs";
import { extractExtensionEntries, readPackageManifest } from "./lib/package-entries.mjs";
import { composeDistributedStyles } from "./lib/styles.mjs";

const DIST_DIRECTORY = join(REPOSITORY_ROOT, "dist");
const SOURCE_STYLE_TYPES = join(REPOSITORY_ROOT, "src", "styles.css.d.ts");
const extensionEntries = extractExtensionEntries(await readPackageManifest());

const targets = resolveBrowserTargets();
const packageStyles = await composeDistributedStyles({ targets: targets.css });
await rm(DIST_DIRECTORY, { force: true, recursive: true });
await build(await createLibraryConfig(targets));
await runTsc(["-p", "tsconfig.build.json", "--pretty", "false"]);
await mkdir(DIST_DIRECTORY, { recursive: true });
await Promise.all([
	writeFile(join(DIST_DIRECTORY, "styles.css"), packageStyles, "utf8"),
	copyFile(SOURCE_STYLE_TYPES, join(DIST_DIRECTORY, "styles.css.d.ts"))
]);
await writeBrowserTargetReport(targets);

await Promise.all([
	access(join(DIST_DIRECTORY, "index.js")),
	access(join(DIST_DIRECTORY, "index.d.ts")),
	access(join(DIST_DIRECTORY, "styles.css")),
	access(join(DIST_DIRECTORY, "styles.css.d.ts")),
	...extensionEntries.flatMap((entry) => [
		access(join(REPOSITORY_ROOT, entry.distJavaScript)),
		access(join(REPOSITORY_ROOT, entry.distDeclaration))
	])
]);

console.log(`Built Vite ESM, declarations, and explicit styles for ${targets.effectiveQuery}.`);
