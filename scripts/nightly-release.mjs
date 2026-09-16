import { readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";

import { createNightlyPlan, readNightlyPlan, nightlyPackageManifest } from "./lib/nightly-release.mjs";
import { REPOSITORY_ROOT, run } from "./lib/process.mjs";

const [command, ...arguments_] = process.argv.slice(2);
const options = new Map();
for (let index = 0; index < arguments_.length; index += 2) {
	const key = arguments_[index];
	const value = arguments_[index + 1];
	if (!key?.startsWith("--") || value === undefined || options.has(key)) {
		throw new Error("Nightly options require unique --name value pairs.");
	}
	options.set(key, value);
}
const manifest = JSON.parse(await readFile(join(REPOSITORY_ROOT, "package.json"), "utf8"));
let plan;
if (command === "plan") {
	if ([...options.keys()].some((key) => !["--created-at", "--event", "--output", "--run-id", "--source-sha"].includes(key))) {
		throw new Error("Unknown nightly plan option.");
	}
	plan = createNightlyPlan({ baseVersion: manifest.version, createdAt: options.get("--created-at"),
		event: options.get("--event"), runId: options.get("--run-id"), sourceCommit: options.get("--source-sha") });
} else if (command === "verify" && options.size === 1 && options.has("--plan")) {
	plan = await readNightlyPlan(options.get("--plan"));
} else {
	throw new Error("Use nightly-release.mjs plan --created-at UTC --event EVENT --run-id ID --source-sha SHA [--output PATH], or verify --plan PATH.");
}
nightlyPackageManifest(manifest, plan);
const head = (await run("git", ["rev-parse", "--verify", "HEAD^{commit}"], { capture: true })).stdout.trim();
const status = (await run("git", ["status", "--porcelain=v1", "--untracked-files=all"], { capture: true })).stdout.trim();
if (head !== plan.sourceCommit || status !== "") {
	throw new Error("Nightly planning requires the exact committed, clean source checkout.");
}
const serialized = `${JSON.stringify(plan, null, 2)}\n`;
if (options.has("--output")) {
	await writeFile(options.get("--output"), serialized, { flag: "wx" });
}
console.log(serialized.trimEnd());
