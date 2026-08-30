import { readFile } from "node:fs/promises";
import { extname, join, relative, sep } from "node:path";

import { listFiles } from "./lib/files.mjs";
import {
	findOwnershipViolations,
	isOwnershipDocumentationLanguage,
	isOwnershipSourceExtension,
	markdownCodeBlocks
} from "./lib/ownership.mjs";
import { REPOSITORY_ROOT } from "./lib/process.mjs";

const DOCUMENTATION_ROOTS = [
	join(REPOSITORY_ROOT, "README.md"),
	join(REPOSITORY_ROOT, "ACCESSIBILITY.md"),
	join(REPOSITORY_ROOT, "DESIGN.md"),
	join(REPOSITORY_ROOT, "docs"),
	join(REPOSITORY_ROOT, "examples")
];
const APPLICATION_ROOTS = [
	join(REPOSITORY_ROOT, "examples"),
	join(REPOSITORY_ROOT, "scripts", "pages-site")
];
const GENERATED_APPLICATION_PATHS = new Set([
	join(REPOSITORY_ROOT, "examples", "advanced", "main.js")
]);
const CONSUMER_ROOTS = [
	join(REPOSITORY_ROOT, "scripts", "advanced-smoke"),
	join(REPOSITORY_ROOT, "scripts", "assemble-pages.mjs"),
	join(REPOSITORY_ROOT, "scripts", "build-advanced-example.mjs"),
	join(REPOSITORY_ROOT, "scripts", "build-examples.mjs"),
	join(REPOSITORY_ROOT, "scripts", "build-pages.mjs"),
	join(REPOSITORY_ROOT, "scripts", "lib", "advanced-example-build.mjs"),
	join(REPOSITORY_ROOT, "scripts", "screenshot-scenes.mjs"),
	join(REPOSITORY_ROOT, "scripts", "tests", "build-pages.test.mjs"),
	join(REPOSITORY_ROOT, "scripts", "tests", "example-metadata.test.mjs"),
	join(REPOSITORY_ROOT, "scripts", "update-screenshots.mjs"),
	join(REPOSITORY_ROOT, "tests", "classic-script-example.test.ts"),
	join(REPOSITORY_ROOT, "tests", "e2e")
];

function displayPath(path) {
	return relative(REPOSITORY_ROOT, path).replaceAll(sep, "/");
}

async function filesBelow(path) {
	if (extname(path) !== "") {
		return [path];
	}
	return listFiles(path);
}

async function collectPaths(roots, predicate) {
	const paths = new Set();
	for (const root of roots) {
		for (const path of await filesBelow(root)) {
			if (predicate(path)) {
				paths.add(path);
			}
		}
	}
	return [...paths].sort((left, right) => left.localeCompare(right, "en"));
}

async function scanDocumentation(path) {
	const source = await readFile(path, "utf8");
	const violations = [];
	for (const block of markdownCodeBlocks(source)) {
		if (!isOwnershipDocumentationLanguage(block.language)) {
			continue;
		}
		violations.push(...findOwnershipViolations(block.source, {
			language: block.language,
			lineOffset: block.lineOffset,
			path: displayPath(path),
			strict: true
		}));
	}
	return violations;
}

async function scanSource(path, strict) {
	return findOwnershipViolations(await readFile(path, "utf8"), {
		language: extname(path).slice(1),
		path: displayPath(path),
		strict
	});
}

const [documentationPaths, applicationPaths, consumerPaths] = await Promise.all([
	collectPaths(DOCUMENTATION_ROOTS, (path) => extname(path).toLowerCase() === ".md"),
	collectPaths(
		APPLICATION_ROOTS,
		(path) => isOwnershipSourceExtension(extname(path)) && !GENERATED_APPLICATION_PATHS.has(path)
	),
	collectPaths(CONSUMER_ROOTS, (path) => isOwnershipSourceExtension(extname(path)))
]);
const violations = [
	...await Promise.all(documentationPaths.map(scanDocumentation)),
	...await Promise.all(applicationPaths.map((path) => scanSource(path, true))),
	...await Promise.all(consumerPaths.map((path) => scanSource(path, false)))
].flat().sort((left, right) =>
	left.path.localeCompare(right.path, "en") || left.line - right.line || left.column - right.column
);

if (violations.length > 0) {
	for (const violation of violations) {
		console.error(
			`${violation.path}:${String(violation.line)}:${String(violation.column)} ${violation.reason} (${violation.token})`
		);
	}
	console.error(`Ownership check failed with ${String(violations.length)} violation(s).`);
	process.exitCode = 1;
} else {
	console.log("Ownership check passed.");
}
