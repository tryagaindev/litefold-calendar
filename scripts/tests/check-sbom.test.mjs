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

function npmPurl(name, version) {
	const encodedName = name.split("/").map((segment) => encodeURIComponent(segment)).join("/");
	return `pkg:npm/${encodedName}@${encodeURIComponent(version)}`;
}

function validSbom() {
	const packageId = `SPDXRef-Package-${packageJson.name}-${packageJson.version}`;
	return {
		spdxVersion: "SPDX-2.3",
		dataLicense: "CC0-1.0",
		SPDXID: "SPDXRef-DOCUMENT",
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

async function createFixture(t) {
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
			LFC_STUB_SBOM: JSON.stringify(validSbom())
		},
		invocationPath
	};
}

test("check-sbom JSON mode emits canonical validated bytes from the exact npm command", async (t) => {
	const fixture = await createFixture(t);
	const result = await execFileAsync(process.execPath, [CHECK_SBOM_PATH, "--json"], {
		cwd: REPOSITORY_ROOT,
		env: fixture.environment
	});
	assert.equal(result.stderr, "");
	assert.equal(result.stdout, `${JSON.stringify(validSbom(), null, 2)}\n`);
	assert.deepEqual(
		JSON.parse(await readFile(fixture.invocationPath, "utf8")),
		["sbom", "--sbom-format=spdx", "--omit=dev"]
	);
});

test("check-sbom rejects unknown and duplicate flags before invoking npm", async (t) => {
	for (const arguments_ of [["--unknown"], ["--json", "--json"]]) {
		await t.test(arguments_.join(" "), async (t) => {
			const fixture = await createFixture(t);
			await assert.rejects(
				execFileAsync(process.execPath, [CHECK_SBOM_PATH, ...arguments_], {
					cwd: REPOSITORY_ROOT,
					env: fixture.environment
				}),
				(error) => error instanceof Error && "stderr" in error &&
					String(error.stderr).includes("Usage: node scripts/check-sbom.mjs [--json]")
			);
			await assert.rejects(readFile(fixture.invocationPath), /ENOENT/u);
		});
	}
});
