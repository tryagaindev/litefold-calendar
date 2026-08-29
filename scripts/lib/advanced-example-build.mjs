import { access } from "node:fs/promises";
import { join } from "node:path";

import { REPOSITORY_ROOT, runTsc } from "./process.mjs";

const ADVANCED_EXAMPLE_CONFIG = join(REPOSITORY_ROOT, "examples", "advanced", "tsconfig.json");
const ADVANCED_EXAMPLE_MODULE = join(REPOSITORY_ROOT, "examples", "advanced", "main.js");

/** Compiles the advanced example used by smoke tests and canonical screenshots. */
export async function buildAdvancedExample() {
	await runTsc(["-p", ADVANCED_EXAMPLE_CONFIG, "--pretty", "false"]);
	await access(ADVANCED_EXAMPLE_MODULE);
}
