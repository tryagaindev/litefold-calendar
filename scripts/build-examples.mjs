import { access, readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";

import { buildAdvancedExample } from "./lib/advanced-example-build.mjs";
import {
	createExampleMetadata,
	resolveExampleSourceCommit,
	serializeExampleMetadata
} from "./lib/example-metadata.mjs";
import { REPOSITORY_ROOT, run, runTsc } from "./lib/process.mjs";

const MIGRATION_EXAMPLE_CONFIG = join(
	REPOSITORY_ROOT,
	"examples",
	"fullcalendar-v6-migration",
	"tsconfig.json"
);
const EXAMPLE_METADATA_PATH = join(REPOSITORY_ROOT, "examples", "metadata.json");
const PACKAGE_JSON_PATH = join(REPOSITORY_ROOT, "package.json");

async function readGitIdentity() {
	try {
		const [head, status] = await Promise.all([
			run("git", ["rev-parse", "--verify", "HEAD^{commit}"], { capture: true }),
			run("git", ["status", "--short", "--untracked-files=normal"], { capture: true })
		]);
		return Object.freeze({
			headCommit: head.stdout.trim(),
			workingTreeDirty: status.stdout.trim().length > 0
		});
	} catch {
		return Object.freeze({ headCommit: null, workingTreeDirty: false });
	}
}

const packageJson = JSON.parse(await readFile(PACKAGE_JSON_PATH, "utf8"));
if (typeof packageJson.version !== "string") {
	throw new Error("package.json must provide a string version for example metadata.");
}

const channel = process.env["LFC_EXAMPLES_CHANNEL"] ?? "local";
const gitIdentity = await readGitIdentity();
const metadata = createExampleMetadata({
	channel,
	commit: resolveExampleSourceCommit({
		channel,
		explicitCommit: process.env["LFC_EXAMPLES_COMMIT"],
		headCommit: gitIdentity.headCommit,
		workingTreeDirty: gitIdentity.workingTreeDirty
	}),
	version: process.env["LFC_EXAMPLES_VERSION"] ?? packageJson.version
});

await buildAdvancedExample();
await runTsc(["-p", MIGRATION_EXAMPLE_CONFIG, "--pretty", "false"]);
await writeFile(EXAMPLE_METADATA_PATH, serializeExampleMetadata(metadata), "utf8");
await access(EXAMPLE_METADATA_PATH);

console.log(
	`Built the examples and generated ${metadata.channel} metadata for ${metadata.version}.`
);
