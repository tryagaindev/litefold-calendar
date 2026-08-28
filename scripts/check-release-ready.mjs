import { resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { verifyRelease } from "./lib/release-state.mjs";

const SCRIPT_PATH = fileURLToPath(import.meta.url);
const VALUE_OPTIONS = new Map([
	["--commit", "expectedCommit"],
	["--tag", "expectedTag"],
	["--tag-state", "tagState"],
	["--version", "expectedVersion"]
]);
const TAG_STATES = new Set(["absent", "either", "matching"]);

export function parseReleaseVerificationArguments(arguments_) {
	const options = {
		json: false,
		requireClean: false,
		tagState: "either"
	};
	let legacyTag;
	const seenValueOptions = new Set();
	for (let index = 0; index < arguments_.length; index += 1) {
		const argument = arguments_[index];
		if (VALUE_OPTIONS.has(argument)) {
			const property = VALUE_OPTIONS.get(argument);
			const value = arguments_[index + 1];
			if (value === undefined || seenValueOptions.has(argument)) {
				throw new Error(`${argument} requires exactly one value.`);
			}
			options[property] = value;
			seenValueOptions.add(argument);
			index += 1;
			continue;
		}
		if (argument === "--json" && !options.json) {
			options.json = true;
			continue;
		}
		if (argument === "--require-clean" && !options.requireClean) {
			options.requireClean = true;
			continue;
		}
		if (!argument.startsWith("-") && legacyTag === undefined) {
			legacyTag = argument;
			continue;
		}
		throw new Error(
			"Usage: npm run release:verify -- [--version <version>] [--commit <sha>] [--tag <tag>] [--tag-state absent|either|matching] [--require-clean] [--json]"
		);
	}
	if (legacyTag !== undefined) {
		if (options.expectedTag !== undefined) {
			throw new Error("Provide a release tag either positionally or with --tag, not both.");
		}
		options.expectedTag = legacyTag;
	}
	if (!TAG_STATES.has(options.tagState)) {
		throw new Error("--tag-state must be absent, either, or matching.");
	}
	return options;
}

export async function main(arguments_ = process.argv.slice(2)) {
	const options = parseReleaseVerificationArguments(arguments_);
	const result = await verifyRelease(options);
	if (options.json) {
		console.log(JSON.stringify(result));
	} else {
		console.log(`Release ${result.tag} is ready (commit ${result.git.head}).`);
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
			console.error(`Release verification failed: ${message}`);
		}
		process.exitCode = 1;
	}
}
