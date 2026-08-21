import { readFile } from "node:fs/promises";
import { join } from "node:path";

import { REPOSITORY_ROOT } from "./lib/process.mjs";

const EXPECTED_NAME = "@tryagaindev/litefold-calendar";
const EXPECTED_REPOSITORY = "git+https://github.com/tryagaindev/litefold-calendar.git";
const EXPECTED_GITHUB_REPOSITORY = "tryagaindev/litefold-calendar";
const packageJson = JSON.parse(await readFile(join(REPOSITORY_ROOT, "package.json"), "utf8"));
const expectedTag = `v${String(packageJson.version)}`;
const actualTag = process.argv[2];
const repositoryUrl = typeof packageJson.repository === "string"
	? packageJson.repository
	: packageJson.repository?.url;

if (packageJson.name !== EXPECTED_NAME) {
	throw new Error(`Release package must be ${EXPECTED_NAME}.`);
}
if (packageJson.private !== false) {
	throw new Error("Release publishing requires package.json private to be false.");
}
if (!/^0\.\d+\.\d+-alpha\.\d+$/u.test(packageJson.version)) {
	throw new Error("Release publishing requires a 0.x alpha prerelease version.");
}
if (actualTag !== expectedTag) {
	throw new Error(`Release tag must be ${expectedTag}; received ${String(actualTag)}.`);
}
if (repositoryUrl !== EXPECTED_REPOSITORY) {
	throw new Error(`Release repository must be ${EXPECTED_REPOSITORY}.`);
}
if (process.env.GITHUB_REPOSITORY !== undefined &&
	process.env.GITHUB_REPOSITORY !== EXPECTED_GITHUB_REPOSITORY) {
	throw new Error(`Release workflow must run from ${EXPECTED_GITHUB_REPOSITORY}.`);
}
if (packageJson.publishConfig?.access !== "public" ||
	packageJson.publishConfig?.provenance !== true ||
	packageJson.publishConfig?.tag !== "alpha") {
	throw new Error("Release publishConfig must require public access, provenance, and the alpha dist-tag.");
}

console.log(`Release manifest is ready for ${expectedTag}.`);
