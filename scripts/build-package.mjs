import { access, copyFile, mkdir, rm } from "node:fs/promises";
import { join } from "node:path";

import { REPOSITORY_ROOT, runTsc } from "./lib/process.mjs";

const DIST_DIRECTORY = join(REPOSITORY_ROOT, "dist");
const SOURCE_STYLES = join(REPOSITORY_ROOT, "src", "styles.css");
const SOURCE_STYLE_TYPES = join(REPOSITORY_ROOT, "src", "styles.css.d.ts");

await rm(DIST_DIRECTORY, { force: true, recursive: true });
await runTsc(["-p", "tsconfig.build.json", "--pretty", "false"]);
await mkdir(DIST_DIRECTORY, { recursive: true });
await Promise.all([
	copyFile(SOURCE_STYLES, join(DIST_DIRECTORY, "styles.css")),
	copyFile(SOURCE_STYLE_TYPES, join(DIST_DIRECTORY, "styles.css.d.ts"))
]);

await Promise.all([
	access(join(DIST_DIRECTORY, "index.js")),
	access(join(DIST_DIRECTORY, "index.d.ts")),
	access(join(DIST_DIRECTORY, "styles.css")),
	access(join(DIST_DIRECTORY, "styles.css.d.ts"))
]);

console.log("Built dependency-free ESM, declarations, and styles.");
