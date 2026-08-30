import { access, copyFile, mkdir, rm, writeFile } from "node:fs/promises";
import { join } from "node:path";

import { REPOSITORY_ROOT, runTsc } from "./lib/process.mjs";
import { extractExtensionEntries, readPackageManifest } from "./lib/package-entries.mjs";
import { composeDistributedStyles } from "./lib/styles.mjs";

const DIST_DIRECTORY = join(REPOSITORY_ROOT, "dist");
const SOURCE_STYLE_TYPES = join(REPOSITORY_ROOT, "src", "styles.css.d.ts");
const extensionEntries = extractExtensionEntries(await readPackageManifest());

const packageStyles = await composeDistributedStyles();
await rm(DIST_DIRECTORY, { force: true, recursive: true });
await runTsc(["-p", "tsconfig.build.json", "--pretty", "false"]);
await mkdir(DIST_DIRECTORY, { recursive: true });
await Promise.all([
	writeFile(join(DIST_DIRECTORY, "styles.css"), packageStyles, "utf8"),
	copyFile(SOURCE_STYLE_TYPES, join(DIST_DIRECTORY, "styles.css.d.ts"))
]);

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

console.log("Built dependency-free ESM, declarations, and styles.");
