import { rm } from "node:fs/promises";
import { relative, resolve } from "node:path";

import { REPOSITORY_ROOT } from "./lib/process.mjs";

const TARGETS = [
	".test-dist",
	".npm-cache",
	"coverage",
	"dist",
	"examples/advanced/main.js",
	"test-results"
];

for (const target of TARGETS) {
	const absoluteTarget = resolve(REPOSITORY_ROOT, target);
	const repositoryRelative = relative(REPOSITORY_ROOT, absoluteTarget);
	if (repositoryRelative.startsWith("..") || repositoryRelative.length === 0) {
		throw new Error(`Refusing to clean unsafe path: ${absoluteTarget}`);
	}

	await rm(absoluteTarget, { force: true, recursive: true });
}

console.log(`Removed generated paths: ${TARGETS.join(", ")}`);
