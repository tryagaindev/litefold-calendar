import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { promisify } from "node:util";

import { REPOSITORY_ROOT } from "../lib/process.mjs";

const execFileAsync = promisify(execFile);
const CHECK_SBOM_PATH = join(REPOSITORY_ROOT, "scripts", "check-sbom.mjs");
const packageJson = JSON.parse(await readFile(join(REPOSITORY_ROOT, "package.json"), "utf8"));
const SOURCE_COMMIT = "0123456789abcdef0123456789abcdef01234567";
const OTHER_SOURCE_COMMIT = "89abcdef0123456789abcdef0123456789abcdef";
const SOURCE_DATE_EPOCH = 1_785_027_600;

function npmPurl(name, version) {
	const encodedName = name.split("/").map((segment) => encodeURIComponent(segment)).join("/");
	return `pkg:npm/${encodedName}@${encodeURIComponent(version)}`;
}

function validSbom({
	created = "2026-08-27T12:34:56.000Z",
	documentNamespace = "https://example.test/spdx/volatile-uuid"
} = {}) {
	const packageId = `SPDXRef-Package-${packageJson.name}-${packageJson.version}`;
	return {
		spdxVersion: "SPDX-2.3",
		dataLicense: "CC0-1.0",
		SPDXID: "SPDXRef-DOCUMENT",
		name: `${packageJson.name}@${packageJson.version}`,
		documentNamespace,
		creationInfo: {
			creators: ["Tool: npm/12.0.2"],
			created
		},
		documentDescribes: [packageId],
		packages: [{
			name: packageJson.name,
			SPDXID: packageId,
			versionInfo: packageJson.version,
			licenseDeclared: "MIT",
			externalRefs: [{
				referenceCategory: "PACKAGE-MANAGER",
				referenceType: "purl",
				referenceLocator: npmPurl(packageJson.name, packageJson.version)
			}]
		}],
		relationships: [{
			spdxElementId: "SPDXRef-DOCUMENT",
			relatedSpdxElement: packageId,
			relationshipType: "DESCRIBES"
		}]
	};
}

function sortObjectKeys(value) {
	if (Array.isArray(value)) {
		return value.map((entry) => sortObjectKeys(entry));
	}
	if (value === null || typeof value !== "object") {
		return value;
	}
	return Object.fromEntries(
		Object.entries(value)
			.sort(([left], [right]) => left < right ? -1 : left > right ? 1 : 0)
			.map(([key, entry]) => [key, sortObjectKeys(entry)])
	);
}

async function createFixture(t, sbom = validSbom()) {
	const directory = await mkdtemp(join(tmpdir(), "lfc-check-sbom-test-"));
	t.after(() => rm(directory, { force: true, recursive: true }));
	const invocationPath = join(directory, "invocation.json");
	const npmStubPath = join(directory, "npm-stub.mjs");
	await writeFile(
		npmStubPath,
		[
			'import { writeFile } from "node:fs/promises";',
			"await writeFile(process.env.LFC_STUB_INVOCATION, JSON.stringify(process.argv.slice(2)));",
			"process.stdout.write(process.env.LFC_STUB_SBOM);",
			""
		].join("\n"),
		"utf8"
	);
	return {
		environment: {
			...process.env,
			npm_execpath: npmStubPath,
			LFC_STUB_INVOCATION: invocationPath,
			LFC_STUB_SBOM: JSON.stringify(sbom)
		},
		invocationPath
	};
}

function jsonArguments(sourceCommit = SOURCE_COMMIT) {
	return [
		"--json",
		"--source-commit",
		sourceCommit,
		"--source-date-epoch",
		String(SOURCE_DATE_EPOCH)
	];
}

async function runJson(fixture, sourceCommit = SOURCE_COMMIT) {
	return execFileAsync(process.execPath, [CHECK_SBOM_PATH, ...jsonArguments(sourceCommit)], {
		cwd: REPOSITORY_ROOT,
		env: fixture.environment
	});
}

test("check-sbom JSON mode emits canonical validated bytes from the exact npm command", async (t) => {
	const fixture = await createFixture(t);
	const result = await runJson(fixture);
	const sbom = JSON.parse(result.stdout);
	assert.equal(result.stderr, "");
	assert.equal(
		sbom.documentNamespace,
		`https://github.com/tryagaindev/litefold-calendar#spdx-${packageJson.version}-${SOURCE_COMMIT}`
	);
	assert.equal(sbom.creationInfo.created, new Date(SOURCE_DATE_EPOCH * 1000).toISOString());
	assert.deepEqual(sbom.creationInfo.creators, ["Tool: npm/12.0.2"]);
	assert.equal(result.stdout, `${JSON.stringify(sortObjectKeys(sbom), null, 2)}\n`);
	assert.deepEqual(
		JSON.parse(await readFile(fixture.invocationPath, "utf8")),
		["sbom", "--sbom-format=spdx", "--omit=dev"]
	);
});

test("check-sbom JSON mode removes volatile npm identity from the artifact bytes", async (t) => {
	const firstFixture = await createFixture(t, validSbom({
		created: "2026-08-27T12:34:56.000Z",
		documentNamespace: "https://example.test/spdx/first-uuid"
	}));
	const secondFixture = await createFixture(t, validSbom({
		created: "2026-08-27T12:35:57.000Z",
		documentNamespace: "https://example.test/spdx/second-uuid"
	}));

	const [first, second] = await Promise.all([runJson(firstFixture), runJson(secondFixture)]);
	assert.equal(first.stdout, second.stdout);
});

test("check-sbom JSON namespace changes with the immutable source commit", async (t) => {
	const firstFixture = await createFixture(t);
	const secondFixture = await createFixture(t);
	const [first, second] = await Promise.all([
		runJson(firstFixture),
		runJson(secondFixture, OTHER_SOURCE_COMMIT)
	]);

	assert.notEqual(first.stdout, second.stdout);
	assert.equal(
		JSON.parse(second.stdout).documentNamespace,
		`https://github.com/tryagaindev/litefold-calendar#spdx-${packageJson.version}-${OTHER_SOURCE_COMMIT}`
	);
});

test("check-sbom no-argument validation mode remains unchanged", async (t) => {
	const fixture = await createFixture(t);
	const result = await execFileAsync(process.execPath, [CHECK_SBOM_PATH], {
		cwd: REPOSITORY_ROOT,
		env: fixture.environment
	});
	assert.equal(result.stderr, "");
	assert.equal(
		result.stdout,
		`SPDX 2.3 SBOM describes only ${packageJson.name}@${packageJson.version} under MIT.\n`
	);
});

test("check-sbom rejects missing SPDX document names and creators", async (t) => {
	for (const [name, mutate, expectedMessage] of [
		[
			"missing document name",
			(sbom) => { delete sbom.name; },
			"SPDX document must have a non-empty name."
		],
		[
			"blank document name",
			(sbom) => { sbom.name = "   "; },
			"SPDX document must have a non-empty name."
		],
		[
			"missing creators",
			(sbom) => { delete sbom.creationInfo.creators; },
			"SPDX creation information must have non-empty creators."
		],
		[
			"empty creators",
			(sbom) => { sbom.creationInfo.creators = []; },
			"SPDX creation information must have non-empty creators."
		],
		[
			"blank creator",
			(sbom) => { sbom.creationInfo.creators = ["Tool: npm/12.0.2", " "]; },
			"SPDX creation information must have non-empty creators."
		]
	]) {
		await t.test(name, async (t) => {
			const sbom = validSbom();
			mutate(sbom);
			const fixture = await createFixture(t, sbom);
			await assert.rejects(
				runJson(fixture),
				(error) => error instanceof Error && "stderr" in error &&
					String(error.stderr).includes(expectedMessage)
			);
		});
	}
});

test("check-sbom rejects invalid or incomplete source identity before invoking npm", async (t) => {
	for (const arguments_ of [
		["--unknown"],
		["--json", "--json"],
		["--json"],
		["--json", "--source-commit", SOURCE_COMMIT],
		[
			"--json",
			"--source-commit",
			SOURCE_COMMIT.toUpperCase(),
			"--source-date-epoch",
			String(SOURCE_DATE_EPOCH)
		],
		[
			"--json",
			"--source-commit",
			SOURCE_COMMIT,
			"--source-date-epoch",
			"-1"
		]
	]) {
		await t.test(arguments_.join(" "), async (t) => {
			const fixture = await createFixture(t);
			await assert.rejects(
				execFileAsync(process.execPath, [CHECK_SBOM_PATH, ...arguments_], {
					cwd: REPOSITORY_ROOT,
					env: fixture.environment
				}),
				(error) => error instanceof Error && "stderr" in error &&
					String(error.stderr).includes("Usage: node scripts/check-sbom.mjs")
			);
			await assert.rejects(readFile(fixture.invocationPath), /ENOENT/u);
		});
	}
});
