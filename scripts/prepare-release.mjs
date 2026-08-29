import { resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { prepareRelease } from "./lib/release-state.mjs";

const SCRIPT_PATH = fileURLToPath(import.meta.url);
const BUMPS = new Set(["prerelease", "prepatch", "preminor"]);

export function parsePrepareReleaseArguments(arguments_) {
	let bump;
	let dryRun = false;
	let json = false;
	for (let index = 0; index < arguments_.length; index += 1) {
		const argument = arguments_[index];
		if (argument === "--bump") {
			if (bump !== undefined || arguments_[index + 1] === undefined) {
				throw new Error("--bump requires exactly one value.");
			}
			bump = arguments_[index += 1];
			continue;
		}
		if (argument === "--dry-run" && !dryRun) {
			dryRun = true;
			continue;
		}
		if (argument === "--json" && !json) {
			json = true;
			continue;
		}
		throw new Error(
			"Usage: npm run release:prepare -- --bump prerelease|prepatch|preminor [--dry-run] [--json]"
		);
	}
	if (!BUMPS.has(bump)) {
		throw new Error(
			"Usage: npm run release:prepare -- --bump prerelease|prepatch|preminor [--dry-run] [--json]"
		);
	}
	return { bump, dryRun, json };
}

export async function main(arguments_ = process.argv.slice(2)) {
	const options = parsePrepareReleaseArguments(arguments_);
	const result = await prepareRelease(options);
	if (options.json) {
		console.log(JSON.stringify(result));
		return result;
	}
	const action = result.dryRun ? "Would prepare" : "Prepared";
	console.log(`${action} ${result.tag} on ${result.branch}.`);
	console.log(`Changed files: ${result.changedFiles.join(", ")}`);
	if (!result.dryRun) {
		console.log("Review the diff, run npm run release:verify, then open the generated release pull request.");
	}
	return result;
}

if (process.argv[1] !== undefined && resolve(process.argv[1]) === SCRIPT_PATH) {
	try {
		await main();
	} catch (error) {
		const message = error instanceof Error ? error.message : String(error);
		if (process.argv.includes("--json")) {
			console.error(JSON.stringify({ error: message, status: "error" }));
		} else {
			console.error(`Release preparation failed: ${message}`);
		}
		process.exitCode = 1;
	}
}
