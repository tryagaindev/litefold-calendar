import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import { readFile, mkdtemp, rm, writeFile } from "node:fs/promises";
import { createServer } from "node:http";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { promisify } from "node:util";

import { REPOSITORY_ROOT, runNpm } from "../lib/process.mjs";

const execFileAsync = promisify(execFile);
const WORKFLOW_PATH = join(REPOSITORY_ROOT, ".github", "workflows", "publish-alpha.yml");
const FIXTURE_DIRECTORY = join(REPOSITORY_ROOT, "scripts", "tests", "fixtures", "npm-view-json");
const VERSION = "0.2.0-alpha.0";
const SOURCE_COMMIT = "a".repeat(40);
const EXPECTED_DIGEST = Buffer.alloc(64, 0xa5);
const EXPECTED_INTEGRITY = `sha512-${EXPECTED_DIGEST.toString("base64")}`;
const REPOSITORY = "tryagaindev/litefold-calendar";
const SERVER_URL = "https://github.com";
const RUN_ID = "123456789";

function foldedEnvironmentScript(source, name) {
	const lines = source.split(/\r?\n/u);
	const start = lines.findIndex((line) => line === `  ${name}: >-`);
	assert.notEqual(start, -1, `Expected folded environment script ${name}.`);
	const body = [];
	for (let index = start + 1; index < lines.length && lines[index].startsWith("    "); index += 1) {
		body.push(lines[index].slice(4));
	}
	assert.ok(body.length > 0, `Expected a body for ${name}.`);
	return body.join(" ");
}

function inlineModule(source, marker) {
	const lines = source.split(/\r?\n/u);
	const start = lines.findIndex((line) => line.trim() === `# ${marker}_START`);
	assert.notEqual(start, -1, `Expected inline module marker ${marker}.`);
	assert.match(lines[start + 1].trim(), /^node --input-type=module <<'NODE'$/u);
	const end = lines.findIndex(
		(line, index) => index > start + 1 && line.trim() === "NODE"
	);
	assert.notEqual(end, -1, `Expected inline module terminator for ${marker}.`);
	assert.equal(lines[end + 1].trim(), `# ${marker}_END`);
	const body = lines.slice(start + 2, end);
	const indentation = Math.min(
		...body.filter((line) => line.trim().length > 0).map((line) => /^\s*/u.exec(line)[0].length)
	);
	return body.map((line) => line.slice(Math.min(indentation, line.length))).join("\n");
}

function runInlineModule(source, options = {}) {
	return execFileAsync(process.execPath, ["--input-type=module", "--eval", source], {
		...options,
		maxBuffer: 1024 * 1024
	});
}

async function temporaryDirectory(context, prefix) {
	const directory = await mkdtemp(join(tmpdir(), prefix));
	context.after(() => rm(directory, { force: true, recursive: true }));
	return directory;
}

async function jsonFixture(name) {
	return JSON.parse(await readFile(join(FIXTURE_DIRECTORY, name), "utf8"));
}

void test("the workflow normalizer accepts only npm 12 single-result arrays", async (context) => {
	const workflow = await readFile(WORKFLOW_PATH, "utf8");
	const normalizer = foldedEnvironmentScript(workflow, "LFC_NORMALIZE_NPM_VIEW_JSON");
	const directory = await temporaryDirectory(context, "lfc-npm-view-normalizer-");

	for (const name of ["versions-dist-tags.json", "integrity.json", "dist-tags.json"]) {
		const input = join(FIXTURE_DIRECTORY, name);
		const output = join(directory, name);
		await execFileAsync(
			process.execPath,
			["--input-type=module", "--eval", normalizer, input, output]
		);
		const fixture = await jsonFixture(name);
		assert.deepEqual(JSON.parse(await readFile(output, "utf8")), fixture[0]);
	}

	for (const name of ["empty.json", "multiple.json", "legacy-object.json", "legacy-string.json"]) {
		const input = join(FIXTURE_DIRECTORY, name);
		const output = join(directory, `rejected-${name}`);
		await assert.rejects(
			execFileAsync(process.execPath, ["--input-type=module", "--eval", normalizer, input, output]),
			/npm view --json must return exactly one result/u
		);
	}
});

void test("the prerelease channel policy converges alpha and latest on the candidate", async () => {
	const workflow = await readFile(WORKFLOW_PATH, "utf8");
	const policy = inlineModule(workflow, "LFC_PRERELEASE_CHANNEL_POLICY");
	const candidate = "0.3.0-alpha.0";
	const runPolicy = (metadata) => runInlineModule(policy, {
		cwd: REPOSITORY_ROOT,
		env: {
			...process.env,
			LFC_REGISTRY_METADATA: JSON.stringify(metadata),
			LFC_VERSION: candidate
		}
	});
	const versions = ["0.1.0-alpha.0", "0.2.0-alpha.0"];

	for (const metadata of [
		{ "dist-tags": {}, versions: [] },
		{
			"dist-tags": { alpha: "0.2.0-alpha.0", latest: "0.2.0-alpha.0" },
			versions
		},
		{
			"dist-tags": { alpha: candidate, latest: "0.2.0-alpha.0" },
			versions: [...versions, candidate]
		},
		{
			"dist-tags": { alpha: candidate, latest: candidate },
			versions: [...versions, candidate]
		}
	]) {
		await runPolicy(metadata);
	}

	for (const metadata of [
		{ "dist-tags": { alpha: "0.2.0-alpha.0" }, versions },
		{
			"dist-tags": { alpha: "0.2.0-alpha.0", latest: "0.1.0-alpha.0" },
			versions
		},
		{
			"dist-tags": { alpha: "0.2.0-alpha.1", latest: "0.1.0-alpha.0" },
			versions: [...versions, "0.2.0-alpha.1"]
		},
		{
			"dist-tags": { alpha: "0.2.0-alpha.0", latest: "0.2.0" },
			versions: [...versions, "0.2.0"]
		},
		{
			"dist-tags": { alpha: "0.2.0-alpha.0", latest: "0.2.1-alpha.0" },
			versions
		},
		{
			"dist-tags": { alpha: "0.4.0-alpha.0", latest: "0.4.0-alpha.0" },
			versions: [...versions, "0.4.0-alpha.0"]
		},
		{ "dist-tags": [], versions: [] },
		{ "dist-tags": { alpha: "0.2.0-alpha.0", latest: "0.2.0-alpha.0" }, versions: [] }
	]) {
		await assert.rejects(runPolicy(metadata));
	}
});

void test("the pinned npm CLI emits the captured npm 12 view shapes", async (context) => {
	const workflow = await readFile(WORKFLOW_PATH, "utf8");
	const pinnedVersion = /LFC_NPM_VERSION: "([^"]+)"/u.exec(workflow)?.[1];
	assert.equal(typeof pinnedVersion, "string");
	const { stdout: versionOutput } = await runNpm(["--version"], { capture: true });
	if (versionOutput.trim() !== pinnedVersion) {
		context.skip(`Requires workflow-pinned npm ${pinnedVersion}; found ${versionOutput.trim()}.`);
		return;
	}

	const directory = await temporaryDirectory(context, "lfc-npm-view-registry-");
	const userConfig = join(directory, "empty.npmrc");
	await writeFile(userConfig, "", "utf8");
	let registryUrl = "";
	const packageName = "@lfc/npm-view-fixture";
	const packument = {
		"dist-tags": {
			alpha: "1.1.0-alpha.0",
			latest: "1.0.0"
		},
		name: packageName,
		versions: {
			"1.0.0": {
				dist: {
					integrity: "sha512-YWFh",
					tarball: ""
				},
				name: packageName,
				version: "1.0.0"
			},
			"1.1.0-alpha.0": {
				dist: {
					integrity: "sha512-YmJi",
					tarball: ""
				},
				name: packageName,
				version: "1.1.0-alpha.0"
			}
		}
	};
	const server = createServer((request, response) => {
		const path = decodeURIComponent(new URL(request.url, registryUrl).pathname.slice(1));
		if (request.method !== "GET" || path !== packageName) {
			response.writeHead(404, { "content-type": "application/json" });
			response.end('{"error":"not_found"}\n');
			return;
		}
		const body = `${JSON.stringify(packument)}\n`;
		response.writeHead(200, {
			"cache-control": "no-store",
			"content-length": Buffer.byteLength(body),
			"content-type": "application/json"
		});
		response.end(body);
	});
	await new Promise((resolve, reject) => {
		server.once("error", reject);
		server.listen(0, "127.0.0.1", resolve);
	});
	context.after(() => new Promise((resolve, reject) => {
		server.close((error) => error === undefined ? resolve() : reject(error));
	}));
	const address = server.address();
	assert.notEqual(address, null);
	assert.equal(typeof address, "object");
	registryUrl = `http://127.0.0.1:${String(address.port)}/`;
	packument.versions["1.0.0"].dist.tarball = `${registryUrl}@lfc/npm-view-fixture/-/npm-view-fixture-1.0.0.tgz`;
	packument.versions["1.1.0-alpha.0"].dist.tarball =
		`${registryUrl}@lfc/npm-view-fixture/-/npm-view-fixture-1.1.0-alpha.0.tgz`;

	const commonArguments = [
		"--registry", registryUrl,
		"--json",
		"--cache", join(directory, "cache"),
		"--userconfig", userConfig,
		"--prefer-online"
	];
	const environment = {
		...process.env,
		NPM_CONFIG_UPDATE_NOTIFIER: "false"
	};
	const multi = await runNpm(
		["view", packageName, "versions", "dist-tags", ...commonArguments],
		{ capture: true, env: environment }
	);
	const integrity = await runNpm(
		["view", `${packageName}@1.0.0`, "dist.integrity", ...commonArguments],
		{ capture: true, env: environment }
	);
	const tags = await runNpm(
		["view", packageName, "dist-tags", ...commonArguments],
		{ capture: true, env: environment }
	);

	assert.deepEqual(JSON.parse(multi.stdout), await jsonFixture("versions-dist-tags.json"));
	assert.deepEqual(JSON.parse(integrity.stdout), await jsonFixture("integrity.json"));
	assert.deepEqual(JSON.parse(tags.stdout), await jsonFixture("dist-tags.json"));
});

void test("the workflow accepts the tested GitHub CLI version and newer releases", async () => {
	const workflow = await readFile(WORKFLOW_PATH, "utf8");
	const policy = inlineModule(workflow, "LFC_GH_VERSION_POLICY");
	const minimum = "2.96.0";
	for (const version of [minimum, "2.96.1", "2.97.0", "3.0.0"]) {
		await runInlineModule(policy, {
			env: {
				...process.env,
				LFC_GH_MIN_VERSION: minimum,
				LFC_GH_VERSION: version
			}
		});
	}
	for (const version of ["2.95.9", "1.999.999", "2.96.0-pre", "02.96.0", ""]) {
		await assert.rejects(runInlineModule(policy, {
			env: {
				...process.env,
				LFC_GH_MIN_VERSION: minimum,
				LFC_GH_VERSION: version
			}
		}));
	}
});

const PROVENANCE_ENVIRONMENT = {
	GITHUB_EVENT_NAME: "push",
	GITHUB_REF: "refs/heads/main",
	GITHUB_REPOSITORY: REPOSITORY,
	GITHUB_REPOSITORY_ID: "987654321",
	GITHUB_REPOSITORY_OWNER: "tryagaindev",
	GITHUB_REPOSITORY_OWNER_ID: "1234567",
	GITHUB_RUN_ATTEMPT: "3",
	GITHUB_RUN_ID: RUN_ID,
	GITHUB_SERVER_URL: SERVER_URL,
	GITHUB_SHA: SOURCE_COMMIT,
	GITHUB_WORKFLOW_REF:
		`${REPOSITORY}/.github/workflows/publish-alpha.yml@refs/heads/main`,
	GITHUB_WORKFLOW_SHA: SOURCE_COMMIT,
	LFC_EXPECTED_INTEGRITY: EXPECTED_INTEGRITY,
	LFC_SOURCE_COMMIT: SOURCE_COMMIT,
	LFC_VERSION: VERSION
};

function invocation(attempt, runId = RUN_ID) {
	return `${SERVER_URL}/${REPOSITORY}/actions/runs/${runId}/attempts/${String(attempt)}`;
}

function provenanceStatement(attempt = 3) {
	return {
		_type: "https://in-toto.io/Statement/v1",
		predicate: {
			buildDefinition: {
				buildType: "https://slsa-framework.github.io/github-actions-buildtypes/workflow/v1",
				externalParameters: {
					workflow: {
						path: ".github/workflows/publish-alpha.yml",
						ref: "refs/heads/main",
						repository: `${SERVER_URL}/${REPOSITORY}`
					}
				},
				internalParameters: {
					github: {
						event_name: "push",
						repository_id: PROVENANCE_ENVIRONMENT.GITHUB_REPOSITORY_ID,
						repository_owner_id: PROVENANCE_ENVIRONMENT.GITHUB_REPOSITORY_OWNER_ID
					}
				},
				resolvedDependencies: [
					{
						digest: { gitCommit: SOURCE_COMMIT },
						uri: `git+${SERVER_URL}/${REPOSITORY}@refs/heads/main`
					}
				]
			},
			runDetails: {
				builder: { id: "https://github.com/actions/runner/github-hosted" },
				metadata: { invocationId: invocation(attempt) }
			}
		},
		predicateType: "https://slsa.dev/provenance/v1",
		subject: [
			{
				digest: { sha512: EXPECTED_DIGEST.toString("hex") },
				name: `pkg:npm/%40tryagaindev/litefold-calendar@${VERSION}`
			}
		]
	};
}

function provenanceBundle(statement = provenanceStatement()) {
	return {
		dsseEnvelope: {
			payload: Buffer.from(JSON.stringify(statement), "utf8").toString("base64"),
			payloadType: "application/vnd.in-toto+json",
			signatures: [{ sig: "fixture" }]
		},
		mediaType: "application/vnd.dev.sigstore.bundle.v0.3+json",
		verificationMaterial: {}
	};
}

function provenanceCertificate(attempt = 3) {
	const workflowIdentity =
		`${SERVER_URL}/${REPOSITORY}/.github/workflows/publish-alpha.yml@refs/heads/main`;
	return {
		buildConfigDigest: SOURCE_COMMIT,
		buildConfigURI: workflowIdentity,
		buildSignerDigest: SOURCE_COMMIT,
		buildSignerURI: workflowIdentity,
		buildTrigger: "push",
		issuer: "https://token.actions.githubusercontent.com",
		runInvocationURI: invocation(attempt),
		runnerEnvironment: "github-hosted",
		sourceRepositoryDigest: SOURCE_COMMIT,
		sourceRepositoryIdentifier: PROVENANCE_ENVIRONMENT.GITHUB_REPOSITORY_ID,
		sourceRepositoryOwnerIdentifier: PROVENANCE_ENVIRONMENT.GITHUB_REPOSITORY_OWNER_ID,
		sourceRepositoryOwnerURI: `${SERVER_URL}/tryagaindev`,
		sourceRepositoryRef: "refs/heads/main",
		sourceRepositoryURI: `${SERVER_URL}/${REPOSITORY}`,
		sourceRepositoryVisibilityAtSigning: "public",
		subjectAlternativeName: workflowIdentity
	};
}

function auditReport(bundle = provenanceBundle()) {
	return {
		invalid: [],
		missing: [],
		verified: [
			{
				attestationBundles: [
					{
						bundle: { dsseEnvelope: { payload: "publish" } },
						predicateType: "https://github.com/npm/attestation/tree/main/specs/publish/v0.1"
					},
					{
						bundle,
						predicateType: "https://slsa.dev/provenance/v1"
					}
				],
				name: "@tryagaindev/litefold-calendar",
				version: VERSION
			}
		]
	};
}

function verificationResult(certificate = provenanceCertificate()) {
	return [
		{
			verificationResult: {
				signature: { certificate }
			}
		}
	];
}

async function runExtractor(context, module, report) {
	const directory = await temporaryDirectory(context, "lfc-provenance-extract-");
	await writeFile(join(directory, "signatures.json"), `${JSON.stringify(report)}\n`, "utf8");
	await runInlineModule(module, {
		cwd: directory,
		env: { ...process.env, ...PROVENANCE_ENVIRONMENT }
	});
	return {
		bundle: JSON.parse(await readFile(join(directory, "provenance.sigstore.json"), "utf8")),
		directory
	};
}

async function runPolicy(context, module, options = {}) {
	const directory = await temporaryDirectory(context, "lfc-provenance-policy-");
	const statement = options.statement ?? provenanceStatement(options.attempt);
	const bundle = options.bundle ?? provenanceBundle(statement);
	const certificate = options.certificate ?? provenanceCertificate(options.attempt);
	const verification = options.verification ?? verificationResult(certificate);
	await writeFile(
		join(directory, "provenance.sigstore.json"),
		`${JSON.stringify(bundle)}\n`,
		"utf8"
	);
	await writeFile(
		join(directory, "provenance-verification.json"),
		`${JSON.stringify(verification)}\n`,
		"utf8"
	);
	return runInlineModule(module, {
		cwd: directory,
		env: { ...process.env, ...PROVENANCE_ENVIRONMENT, ...options.environment }
	});
}

void test("the workflow extracts one exact npm SLSA provenance bundle", async (context) => {
	const workflow = await readFile(WORKFLOW_PATH, "utf8");
	const extractor = inlineModule(workflow, "LFC_PROVENANCE_EXTRACT");
	const expected = provenanceBundle();
	const result = await runExtractor(context, extractor, auditReport(expected));
	assert.deepEqual(result.bundle, expected);

	const invalidReports = [
		(report) => { report.invalid.push({ code: "EATTESTATIONVERIFY" }); },
		(report) => { report.missing.push({ name: "@tryagaindev/litefold-calendar" }); },
		(report) => { report.verified = []; },
		(report) => { report.verified[0].name = "@example/other"; },
		(report) => { report.verified[0].version = "0.2.0-alpha.1"; },
		(report) => { report.verified[0].attestationBundles = []; },
		(report) => {
			report.verified[0].attestationBundles.push(
				structuredClone(report.verified[0].attestationBundles[1])
			);
		},
		(report) => {
			report.verified[0].attestationBundles[1].bundle.dsseEnvelope.payloadType = "text/plain";
		}
	];
	for (const mutate of invalidReports) {
		const report = auditReport();
		mutate(report);
		await assert.rejects(runExtractor(context, extractor, report));
	}
});

void test("the workflow provenance policy accepts the current or an earlier attempt of one run", async (context) => {
	const workflow = await readFile(WORKFLOW_PATH, "utf8");
	const policy = inlineModule(workflow, "LFC_PROVENANCE_POLICY");
	await runPolicy(context, policy, { attempt: 3 });
	await runPolicy(context, policy, { attempt: 1 });
});

void test("the workflow provenance policy rejects conflicting source and builder identities", async (context) => {
	const workflow = await readFile(WORKFLOW_PATH, "utf8");
	const policy = inlineModule(workflow, "LFC_PROVENANCE_POLICY");
	const invalidPolicies = [
		(options) => { options.statement.subject[0].name = "pkg:npm/%40example/other@0.2.0-alpha.0"; },
		(options) => { options.statement.subject[0].digest.sha512 = "0".repeat(128); },
		(options) => { options.statement.predicate.buildDefinition.externalParameters.workflow.ref = "refs/heads/other"; },
		(options) => { options.statement.predicate.buildDefinition.externalParameters.workflow.path = ".github/workflows/other.yml"; },
		(options) => { options.statement.predicate.buildDefinition.resolvedDependencies[0].digest.gitCommit = "b".repeat(40); },
		(options) => { options.statement.predicate.buildDefinition.internalParameters.github.event_name = "workflow_dispatch"; },
		(options) => { options.statement.predicate.runDetails.builder.id = "https://github.com/actions/runner/self-hosted"; },
		(options) => { options.statement.predicate.runDetails.metadata.invocationId = invocation(4); },
		(options) => { options.statement.predicate.runDetails.metadata.invocationId = invocation(1, "987654321"); },
		(options) => { options.certificate.subjectAlternativeName = `${SERVER_URL}/other/repository/workflow.yml`; },
		(options) => { options.certificate.sourceRepositoryDigest = "b".repeat(40); },
		(options) => { options.certificate.runnerEnvironment = "self-hosted"; },
		(options) => { options.certificate.sourceRepositoryIdentifier = "1"; },
		(options) => { options.certificate.runInvocationURI = invocation(2); },
		(options) => { options.certificate.buildTrigger = "workflow_dispatch"; },
		(options) => { options.environment.GITHUB_REPOSITORY = "attacker/repository"; },
		(options) => {
			options.environment.GITHUB_EVENT_NAME = "workflow_dispatch";
			options.statement.predicate.buildDefinition.internalParameters.github.event_name =
				"workflow_dispatch";
			options.certificate.buildTrigger = "workflow_dispatch";
		},
		(options) => {
			options.environment.GITHUB_EVENT_NAME = "pull_request";
			options.statement.predicate.buildDefinition.internalParameters.github.event_name =
				"pull_request";
			options.certificate.buildTrigger = "pull_request";
		},
		(options) => { options.verification.push(structuredClone(options.verification[0])); },
		(options) => { options.bundle.dsseEnvelope.payload = "not-base64-json"; }
	];

	for (const mutate of invalidPolicies) {
		const statement = provenanceStatement();
		const bundle = provenanceBundle(statement);
		const certificate = provenanceCertificate();
		const verification = verificationResult(certificate);
		const options = { bundle, certificate, environment: {}, statement, verification };
		mutate(options);
		if (options.bundle === bundle && bundle.dsseEnvelope.payload !== "not-base64-json") {
			options.bundle = provenanceBundle(options.statement);
		}
		await assert.rejects(runPolicy(context, policy, options));
	}
});
