import { access, readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";

import {
	createExampleMetadata,
	serializeExampleMetadata
} from "./lib/example-metadata.mjs";
import { REPOSITORY_ROOT, run, runTsc } from "./lib/process.mjs";

const ADVANCED_EXAMPLE_CONFIG = join(REPOSITORY_ROOT, "examples", "advanced", "tsconfig.json");
const ADVANCED_EXAMPLE_MODULE = join(REPOSITORY_ROOT, "examples", "advanced", "main.js");
const MIGRATION_EXAMPLE_CONFIG = join(
	REPOSITORY_ROOT,
	"examples",
	"fullcalendar-v6-migration",
	"tsconfig.json"
);
const EXAMPLE_METADATA_PATH = join(REPOSITORY_ROOT, "examples", "metadata.json");
const PACKAGE_JSON_PATH = join(REPOSITORY_ROOT, "package.json");

async function readSourceCommit() {
	try {
		const result = await run("git", ["rev-parse", "--verify", "HEAD^{commit}"], { capture: true });
		return result.stdout.trim();
	} catch {
		return null;
	}
}

const packageJson = JSON.parse(await readFile(PACKAGE_JSON_PATH, "utf8"));
if (typeof packageJson.version !== "string") {
	throw new Error("package.json must provide a string version for example metadata.");
}

const metadata = createExampleMetadata({
	channel: process.env["LFC_EXAMPLES_CHANNEL"] ?? "local",
	commit: process.env["LFC_EXAMPLES_COMMIT"] ?? await readSourceCommit(),
	version: process.env["LFC_EXAMPLES_VERSION"] ?? packageJson.version
});

await runTsc(["-p", ADVANCED_EXAMPLE_CONFIG, "--pretty", "false"]);
await runTsc(["-p", MIGRATION_EXAMPLE_CONFIG, "--pretty", "false"]);
await writeFile(EXAMPLE_METADATA_PATH, serializeExampleMetadata(metadata), "utf8");
await access(ADVANCED_EXAMPLE_MODULE);
await access(EXAMPLE_METADATA_PATH);

console.log(
	`Built the examples and generated ${metadata.channel} metadata for ${metadata.version}.`
);
