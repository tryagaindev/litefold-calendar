import { access } from "node:fs/promises";
import { join } from "node:path";

import { REPOSITORY_ROOT, runTsc } from "./lib/process.mjs";

const ADVANCED_EXAMPLE_CONFIG = join(REPOSITORY_ROOT, "examples", "advanced", "tsconfig.json");
const ADVANCED_EXAMPLE_MODULE = join(REPOSITORY_ROOT, "examples", "advanced", "main.js");
const MIGRATION_EXAMPLE_CONFIG = join(
	REPOSITORY_ROOT,
	"examples",
	"fullcalendar-v6-migration",
	"tsconfig.json"
);

await runTsc(["-p", ADVANCED_EXAMPLE_CONFIG, "--pretty", "false"]);
await runTsc(["-p", MIGRATION_EXAMPLE_CONFIG, "--pretty", "false"]);
await access(ADVANCED_EXAMPLE_MODULE);

console.log("Built the advanced TypeScript example and checked the migration recipe.");
