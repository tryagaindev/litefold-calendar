import { rm } from "node:fs/promises";
import { join } from "node:path";

import { listFiles } from "./lib/files.mjs";
import { REPOSITORY_ROOT, run, runTsc } from "./lib/process.mjs";

const TEST_OUTPUT = join(REPOSITORY_ROOT, ".test-dist");

await rm(TEST_OUTPUT, { force: true, recursive: true });
await runTsc(["-p", "tsconfig.unit.json", "--pretty", "false"]);

const tests = (await listFiles(join(TEST_OUTPUT, "tests")))
	.filter((path) => path.endsWith(".test.js"))
	.sort((left, right) => left.localeCompare(right, "en"));

if (tests.length === 0) {
	throw new Error("No compiled unit tests were found.");
}

await run(process.execPath, [
	"--enable-source-maps",
	"--experimental-vm-modules",
	"--test",
	"--test-reporter=spec",
	...tests
]);
