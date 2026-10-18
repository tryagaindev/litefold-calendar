import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { mkdir, mkdtemp, readFile, rm, rmdir, symlink, unlink, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { basename, dirname, join } from "node:path";
import test from "node:test";

import {
	classifyScreenshotQuality, githubRequest, inspectScreenshotArtifact, runScreenshotAutomation
} from "../lib/screenshot-automation.mjs";
import { fingerprintScreenshotFiles, SCREENSHOT_SOURCE_INPUTS } from "../lib/screenshot-fingerprint.mjs";

const REPOSITORY = "tryagaindev/litefold-calendar";
const API = `/repos/${REPOSITORY}`;
const BASE_SHA = "a".repeat(40);
const HEAD_SHA = "b".repeat(40);
const NEW_HEAD_SHA = "c".repeat(40);
const SCENE_OUTPUT = "docs/screenshots/desktop-month-grid-1440x900.png";
const IMAGE = Buffer.from("canonical image fixture");
const STALE_LOG = [
	"2026-10-12T00:00:00.000Z Screenshot validation failed:",
	"2026-10-12T00:00:00.000Z - Screenshot source fingerprint is stale; run npm run screenshots:prepare.",
	"2026-10-12T00:00:00.000Z ##[error]Process completed with exit code 1."
].join("\n");

function hash(value) { return createHash("sha256").update(value).digest("hex"); }

function response(value, status = 200, location) {
	return { ok: status >= 200 && status < 300, status,
		headers: { get: (name) => name === "location" ? location : null },
		text: async () => typeof value === "string" ? value : JSON.stringify(value) };
}

function qualityJobs() {
	return [
		{ name: "Resolve the verified source", conclusion: "success" },
		{ name: "Capture Dependabot screenshot candidates", conclusion: "success" },
		{ id: 99, name: "Build, test, and verify package", conclusion: "failure", steps: [
			{ name: "Run the CI quality gate", conclusion: "failure" },
			{ name: "Verify dependency package after a failed quality gate", conclusion: "success" }
		] }
	];
}

function fixture() {
	const basePackage = { name: "fixture", version: "1.0.0", packageManager: "npm@12.0.2",
		scripts: { "build:package": "node scripts/build-package.mjs" }, devDependencies: {
			"@playwright/test": "1.63.0", typescript: "6.0.3", vite: "8.3.2", esbuild: "0.28.2"
		} };
	const baseLock = { name: "fixture", version: "1.0.0", lockfileVersion: 3, requires: true,
		packages: { "": { name: "fixture", version: "1.0.0", devDependencies: { ...basePackage.devDependencies } },
			...Object.fromEntries(Object.entries(basePackage.devDependencies).map(([name, version]) =>
				[`node_modules/${name}`, { version, dev: true }])) } };
	const headPackage = structuredClone(basePackage);
	headPackage.devDependencies.vite = "8.3.3";
	const headLock = structuredClone(baseLock);
	headLock.packages[""].devDependencies.vite = "8.3.3";
	headLock.packages["node_modules/vite"].version = "8.3.3";
	const browserTargets = { query: "baseline-widely-available",
		effectiveQuery: "Vite 8.3.2: baseline-widely-available", resolvedAt: "2026-10-11",
		dataVersions: { vite: "8.3.2", esbuild: "0.28.2" }, browsers: ["chrome111", "safari16.4"],
		javascript: ["chrome111", "safari16.4"], css: ["chrome111", "safari16.4"] };
	const sourceFiles = SCREENSHOT_SOURCE_INPUTS.map((path) => ({
		path: path === "src" ? "src/index.ts" : path,
		contents: path === "package.json" ? JSON.stringify(basePackage) :
			path === "package-lock.json" ? JSON.stringify(baseLock) : "fixture source\n"
	}));
	const baselineManifest = { version: 1, state: "final",
		toolchain: { browser: "chromium", node: "24.19.0", npm: "12.0.2", playwright: "1.63.0" },
		sourceFingerprint: fingerprintScreenshotFiles(sourceFiles, browserTargets), browserTargets,
		scenes: [{ id: "desktop-month-grid", route: "/examples/advanced/", output: SCENE_OUTPUT,
			viewport: { width: 1440, height: 900 }, hasTouch: false, setup: ["wait-ready"],
			alt: "Desktop advanced calendar example", references: ["README.md"], sha256: hash(IMAGE) }] };
	const candidateManifest = structuredClone(baselineManifest);
	candidateManifest.browserTargets.dataVersions.vite = "8.3.3";
	candidateManifest.browserTargets.effectiveQuery = "Vite 8.3.3: baseline-widely-available";
	candidateManifest.browserTargets.resolvedAt = "2026-10-12";
	candidateManifest.sourceFingerprint = fingerprintScreenshotFiles(sourceFiles.map((file) => ({ ...file,
		contents: file.path === "package.json" ? JSON.stringify(headPackage) :
			file.path === "package-lock.json" ? JSON.stringify(headLock) : file.contents
	})), candidateManifest.browserTargets);
	const branch = "dependabot/npm_and_yarn/vite-8.3.3";
	return { basePackage, headPackage, baseLock, headLock, sourceFiles, baselineManifest, candidateManifest,
		currentManifest: structuredClone(baselineManifest),
		pullRequest: { number: 38, state: "open", user: { login: "dependabot[bot]" },
			head: { sha: HEAD_SHA, ref: branch, repo: { full_name: REPOSITORY } },
			base: { sha: BASE_SHA, ref: "main", repo: { full_name: REPOSITORY } } },
		run: { id: 42, run_attempt: 1, event: "pull_request", path: ".github/workflows/ci.yml",
			status: "completed", conclusion: "failure", head_sha: HEAD_SHA, head_branch: branch,
			created_at: "2026-10-12T00:00:00Z", repository: { full_name: REPOSITORY },
			head_repository: { full_name: REPOSITORY }, pull_requests: [{ number: 38 }] },
		report: { version: 1, repository: REPOSITORY, prNumber: 38, headSha: HEAD_SHA,
			baseSha: BASE_SHA, runId: 42, runAttempt: 1 },
		changedFiles: [{ filename: "package.json", status: "modified" },
			{ filename: "package-lock.json", status: "modified" }],
		jobs: qualityJobs(), log: STALE_LOG,
		artifacts: [{ id: 700, name: "screenshot-candidate-42-1", expired: false, size_in_bytes: 2000,
			workflow_run: { id: 42, head_sha: HEAD_SHA } }] };
}

function mockRequest(data, { freshPullRequest, commitResponse } = {}) {
	const calls = [];
	let pullReads = 0;
	async function request(path, options = {}) {
		calls.push({ path, ...structuredClone(options) });
		if (path === `${API}/pulls/38`) {
			pullReads += 1;
			return structuredClone(pullReads > 1 && freshPullRequest ? freshPullRequest : data.pullRequest);
		}
		if (path === `${API}/pulls/38/files?per_page=100&page=1`) { return structuredClone(data.changedFiles); }
		if (path === `${API}/compare/${data.pullRequest.base.sha}...${data.pullRequest.head.sha}`) {
			return { merge_base_commit: { sha: data.mergeBaseSha ?? data.pullRequest.base.sha } };
		}
		if (path === `${API}/actions/runs/42`) { return structuredClone(data.run); }
		if (path === `${API}/actions/runs/42/attempts/1/jobs?per_page=100`) { return { jobs: structuredClone(data.jobs) }; }
		if (path === `${API}/actions/jobs/99/logs`) { assert.equal(options.text, true); return data.log; }
		if (path === `${API}/actions/runs/42/artifacts?per_page=100`) { return { artifacts: structuredClone(data.artifacts) }; }
		if (path === "/graphql") {
			return commitResponse ?? { data: { createCommitOnBranch: { commit: { oid: NEW_HEAD_SHA } } } };
		}
		if (path === `${API}/actions/workflows/ci.yml/dispatches`) { return undefined; }
		const content = path.match(/\/contents\/([^?]+)\?ref=([a-f0-9]{40})$/u);
		if (content) {
			const [, name, sha] = content;
			const values = sha === BASE_SHA ? {
				"package.json": data.basePackage, "package-lock.json": data.baseLock,
				"screenshots.manifest.json": data.baselineManifest
			} : {
				"package.json": data.headPackage, "package-lock.json": data.headLock,
				"screenshots.manifest.json": data.currentManifest
			};
			assert.ok(Object.hasOwn(values, name), `Unexpected evidence path: ${path}`);
			return { type: "file", encoding: "base64", sha: "d".repeat(40),
				content: Buffer.from(JSON.stringify(values[name])).toString("base64") };
		}
		throw new Error(`Unexpected API request: ${path}`);
	}
	return { request, calls };
}

function noWrites(calls) { assert.deepEqual(calls.filter((call) => call.method && call.method !== "GET"), []); }

async function temporaryDirectory(t) {
	const directory = await mkdtemp(join(tmpdir(), "lfc-screenshot-automation-"));
	t.after(async () => { await rm(directory, { recursive: true, force: true }); });
	return directory;
}

async function write(path, contents) {
	await mkdir(dirname(path), { recursive: true });
	await writeFile(path, contents);
}

async function candidateDirectory(t, data) {
	const temporary = await temporaryDirectory(t);
	const directory = join(temporary, "candidate");
	await write(join(directory, "index.html"), "<!doctype html><title>Candidate gallery</title>");
	await write(join(directory, "changes.json"), "[]\n");
	await write(join(directory, "screenshots.manifest.json"), JSON.stringify(data.candidateManifest));
	await write(join(directory, "report.json"), JSON.stringify(data.report));
	for (const side of ["before", "after"]) {
		await write(join(directory, side, basename(SCENE_OUTPUT)), IMAGE);
	}
	return { temporary, directory };
}

async function promotionFixture(t) {
	const data = fixture();
	const root = await temporaryDirectory(t);
	for (const file of data.sourceFiles) { await write(join(root, file.path), file.contents); }
	await write(join(root, SCENE_OUTPUT), IMAGE);
	const { temporary, directory } = await candidateDirectory(t, data);
	const environment = { GITHUB_REPOSITORY: REPOSITORY, LFC_NODE_VERSION: "24.19.0",
		LFC_UPSTREAM_RUN_ID: "42", LFC_UPSTREAM_RUN_ATTEMPT: "1", LFC_UPSTREAM_HEAD_SHA: HEAD_SHA,
		RUNNER_TEMP: temporary, LFC_CANDIDATE_DIRECTORY: directory };
	return { data, root, directory, environment };
}

void test("GitHub log redirects never receive the API bearer token", async () => {
	const calls = [];
	const request = githubRequest({ GITHUB_REPOSITORY: REPOSITORY, GITHUB_TOKEN: "test-api-secret" },
		async (url, options) => {
			calls.push({ url: String(url), options });
			return calls.length === 1 ? response("", 302, "https://logs.example.test/download") : response("job log");
		});
	assert.equal(await request(`${API}/actions/jobs/99/logs`, { text: true }), "job log");
	assert.equal(calls[0].options.redirect, "manual");
	assert.equal(calls[0].options.headers.Authorization, "Bearer test-api-secret");
	assert.deepEqual(calls[1], { url: "https://logs.example.test/download", options: { redirect: "error" } });
});

void test("GitHub transport rejects unrelated destinations, unsafe log redirects, and oversized evidence", async () => {
	const environment = { GITHUB_REPOSITORY: REPOSITORY, GITHUB_TOKEN: "test-api-secret" };
	for (const location of ["http://logs.example.test/download", "https://user:secret@logs.example.test/download"]) {
		let calls = 0;
		const request = githubRequest(environment, async () => { calls += 1; return response("", 302, location); });
		await assert.rejects(request(`${API}/actions/jobs/99/logs`, { text: true }), /Invalid log download destination/u);
		assert.equal(calls, 1);
	}
	for (const text of [false, true]) {
		const limit = text ? 16 * 1024 * 1024 : 8 * 1024 * 1024;
		const request = githubRequest(environment, async () => response("x".repeat(limit + 1)));
		await assert.rejects(request(`${API}/actions/jobs/99/logs`, { text }), /evidence limit/u);
	}
	const request = githubRequest(environment, async () => { throw new Error("Unexpected fetch"); });
	await assert.rejects(request("/repos/another/repository/pulls/1"), /Unexpected API destination/u);
	assert.throws(() => githubRequest({ ...environment, GITHUB_REPOSITORY: "another/repository" }), /Unexpected repository/u);
	assert.throws(() => githubRequest({ GITHUB_REPOSITORY: REPOSITORY }), /authentication/u);
});

void test("only the sole stale screenshot failure plus successful package validation qualifies", () => {
	assert.equal(classifyScreenshotQuality(qualityJobs(), STALE_LOG), true);
	const green = qualityJobs();
	green[2].conclusion = "success";
	assert.equal(classifyScreenshotQuality(green), true);
	for (const log of [
		"", STALE_LOG.replace("fingerprint is stale", "image hash is incorrect"),
		"##[error]Earlier test failure\n" + STALE_LOG,
		STALE_LOG + "\n##[error]A second check failed",
		STALE_LOG.replace("##[error]", "- A second screenshot diagnostic\n##[error]"),
		STALE_LOG.replace("exit code 1.", "exit code 2.")
	]) { assert.equal(classifyScreenshotQuality(qualityJobs(), log), false, log); }
	for (const mutate of [
		(jobs) => { jobs[0].conclusion = "failure"; },
		(jobs) => { jobs[1].conclusion = "skipped"; },
		(jobs) => { jobs[2].conclusion = "cancelled"; },
		(jobs) => { jobs[2].steps[1].conclusion = "failure"; },
		(jobs) => { jobs[2].steps[1].conclusion = "skipped"; },
		(jobs) => { jobs[2].steps.push({ name: "Another check", conclusion: "failure" }); }
	]) {
		const jobs = qualityJobs(); mutate(jobs);
		assert.equal(classifyScreenshotQuality(jobs, STALE_LOG), false);
	}
});

void test("candidate artifacts require the exact complete file inventory", async (t) => {
	const data = fixture();
	const { directory } = await candidateDirectory(t, data);
	assert.equal(await inspectScreenshotArtifact(directory, data.baselineManifest), directory);
	await write(join(directory, "unexpected.txt"), "unexpected");
	await assert.rejects(inspectScreenshotArtifact(directory, data.baselineManifest), /Unexpected candidate file/u);
	await rm(join(directory, "unexpected.txt"));
	await rm(join(directory, "before", basename(SCENE_OUTPUT)));
	await assert.rejects(inspectScreenshotArtifact(directory, data.baselineManifest), /incomplete/u);
});

void test("candidate evidence rejects links and nested directories", async (t) => {
	const data = fixture();
	const { temporary, directory } = await candidateDirectory(t, data);
	const nested = join(directory, "after", "nested");
	await mkdir(nested);
	await assert.rejects(inspectScreenshotArtifact(directory, data.baselineManifest), /Unexpected candidate directory/u);
	await rmdir(nested);
	const linked = join(directory, "linked");
	await symlink(join(directory, "after"), linked, "junction");
	await assert.rejects(inspectScreenshotArtifact(directory, data.baselineManifest), /links are forbidden/u);
	if (process.platform === "win32") { await rmdir(linked); }
	else { await unlink(linked); }
	const rootLink = join(temporary, "linked-root");
	await symlink(directory, rootLink, "junction");
	await assert.rejects(inspectScreenshotArtifact(rootLink, data.baselineManifest), /regular directory/u);
});

void test("candidate eligibility binds live author, base, head, and API changed paths", async (t) => {
	for (const [label, mutate] of [
		["valid dependency update", () => {}],
		["changed head", (data) => { data.pullRequest.head.sha = NEW_HEAD_SHA; }],
		["changed base", (data) => { data.pullRequest.base.sha = NEW_HEAD_SHA; }],
		["non-Dependabot author", (data) => { data.pullRequest.user.login = "contributor"; }],
		["source change", (data) => { data.changedFiles.push({ filename: "src/index.ts", status: "modified" }); }]
	]) {
		const data = fixture(); mutate(data);
		const output = join(await temporaryDirectory(t), "output");
		const { request, calls } = mockRequest(data);
		await runScreenshotAutomation({ command: "candidate-eligibility", request, environment: {
			GITHUB_REPOSITORY: REPOSITORY, GITHUB_RUN_ID: "42", GITHUB_RUN_ATTEMPT: "1", GITHUB_OUTPUT: output,
			LFC_PR_NUMBER: "38", LFC_HEAD_SHA: HEAD_SHA, LFC_BASE_SHA: BASE_SHA
		} });
		const eligible = label === "valid dependency update";
		assert.equal(await readFile(output, "utf8"), `eligible=${eligible}\ncapture-date=${eligible ? "2026-10-12" : ""}\n`, label);
		noWrites(calls);
		if (label === "source change") { assert.equal(calls.some((call) => call.path.includes("/contents/")), false); }
	}
});

void test("dispatch checkout accepts only an eligible PR at the exact triggering SHA", async (t) => {
	const data = fixture();
	const environment = { GITHUB_REPOSITORY: REPOSITORY, GITHUB_EVENT_NAME: "workflow_dispatch",
		GITHUB_SHA: HEAD_SHA, GITHUB_RUN_ID: "42", LFC_PR_NUMBER: "38", LFC_HEAD_SHA: HEAD_SHA };
	const output = join(await temporaryDirectory(t), "output");
	const success = mockRequest(data);
	await runScreenshotAutomation({ command: "verify-dispatch", request: success.request,
		environment: { ...environment, GITHUB_OUTPUT: output } });
	assert.equal(await readFile(output, "utf8"), `checkout-ref=${HEAD_SHA}\nhead=${HEAD_SHA}\nbase=${BASE_SHA}\npr-number=38\n`);
	noWrites(success.calls);
	for (const [label, mutate] of [
		["wrong triggering SHA", (_data, env) => { env.GITHUB_SHA = BASE_SHA; }],
		["wrong trigger", (_data, env) => { env.GITHUB_EVENT_NAME = "pull_request"; }],
		["changed live head", (data) => { data.pullRequest.head.sha = NEW_HEAD_SHA; }],
		["other author", (data) => { data.pullRequest.user.login = "contributor"; }],
		["unexpected PR path", (data) => { data.changedFiles.push({ filename: "scripts/update-screenshots.mjs", status: "modified" }); }]
	]) {
		const rejected = fixture(); const env = { ...environment }; mutate(rejected, env);
		const mock = mockRequest(rejected);
		await assert.rejects(runScreenshotAutomation({ command: "verify-dispatch", request: mock.request, environment: env }), undefined, label);
		noWrites(mock.calls);
	}
});

void test("capture, promotion, and dispatch reject a PR branch missing the current main base", async (t) => {
	for (const command of ["candidate-eligibility", "promote", "verify-dispatch"]) {
		const data = fixture();
		data.mergeBaseSha = "e".repeat(40);
		const output = join(await temporaryDirectory(t), "output");
		const { request, calls } = mockRequest(data);
		const environment = {
			GITHUB_REPOSITORY: REPOSITORY, GITHUB_EVENT_NAME: "workflow_dispatch", GITHUB_SHA: HEAD_SHA,
			GITHUB_RUN_ID: "42", GITHUB_RUN_ATTEMPT: "1", GITHUB_OUTPUT: output,
			LFC_PR_NUMBER: "38", LFC_HEAD_SHA: HEAD_SHA, LFC_BASE_SHA: BASE_SHA,
			LFC_UPSTREAM_RUN_ID: "42", LFC_UPSTREAM_RUN_ATTEMPT: "1", LFC_UPSTREAM_HEAD_SHA: HEAD_SHA
		};
		const operation = runScreenshotAutomation({ command, request, environment });
		if (command === "verify-dispatch") {
			await assert.rejects(operation, /current main/u);
		} else {
			await operation;
			assert.equal(await readFile(output, "utf8"), command === "promote"
				? "eligible=false\nartifact-id=\n" : "eligible=false\ncapture-date=\n", command);
		}
		assert.equal(calls.some((call) => call.path === `${API}/compare/${BASE_SHA}...${HEAD_SHA}`), true, command);
		noWrites(calls);
	}
});

void test("forged runs and nonunique or stale artifacts never authorize provider writes", async (t) => {
	for (const [label, mutate] of [
		["wrong run", (data) => { data.run.id = 43; }],
		["wrong attempt", (data) => { data.run.run_attempt = 2; }],
		["old head", (data) => { data.run.head_sha = BASE_SHA; }],
		["wrong workflow", (data) => { data.run.path = ".github/workflows/other.yml"; }],
		["wrong event", (data) => { data.run.event = "push"; }],
		["running", (data) => { data.run.status = "in_progress"; }],
		["foreign source", (data) => { data.run.head_repository.full_name = "fork/repo"; }],
		["ambiguous PR", (data) => { data.run.pull_requests.push({ number: 39 }); }],
		["changed branch", (data) => { data.run.head_branch = "different"; }],
		["additional failed check", (data) => { data.log = "##[error]Unit tests failed\n" + data.log; }],
		["expired artifact", (data) => { data.artifacts[0].expired = true; }],
		["wrong artifact run", (data) => { data.artifacts[0].workflow_run.id = 43; }],
		["wrong artifact head", (data) => { data.artifacts[0].workflow_run.head_sha = BASE_SHA; }],
		["oversized artifact", (data) => { data.artifacts[0].size_in_bytes = 21 * 1024 * 1024; }],
		["duplicate artifact", (data) => { data.artifacts.push(structuredClone(data.artifacts[0])); }]
	]) {
		const data = fixture(); mutate(data);
		const { request, calls } = mockRequest(data);
		const output = join(await temporaryDirectory(t), "output");
		await runScreenshotAutomation({ command: "promote", request, environment: {
			GITHUB_REPOSITORY: REPOSITORY, LFC_UPSTREAM_RUN_ID: "42", LFC_UPSTREAM_RUN_ATTEMPT: "1",
			LFC_UPSTREAM_HEAD_SHA: HEAD_SHA, GITHUB_OUTPUT: output
		} });
		assert.equal(await readFile(output, "utf8"), "eligible=false\nartifact-id=\n", label);
		noWrites(calls);
	}
});

void test("unchanged images promote only the manifest atomically and dispatch CI for the new head", async (t) => {
	const { data, environment, root } = await promotionFixture(t);
	const { request, calls } = mockRequest(data);
	await runScreenshotAutomation({ command: "promote", environment, request, root, readHead: async () => BASE_SHA });
	const writes = calls.filter((call) => call.method === "POST");
	assert.equal(writes.length, 2);
	assert.equal(writes[0].path, "/graphql");
	assert.match(writes[0].body.query, /createCommitOnBranch/u);
	const mutation = writes[0].body.variables.input;
	assert.deepEqual(mutation.branch, { repositoryNameWithOwner: REPOSITORY, branchName: data.pullRequest.head.ref });
	assert.equal(mutation.expectedHeadOid, HEAD_SHA);
	assert.deepEqual(Object.keys(mutation.fileChanges), ["additions"]);
	assert.equal(mutation.fileChanges.additions.length, 1);
	assert.equal(mutation.fileChanges.additions[0].path, "screenshots.manifest.json");
	const manifest = JSON.parse(Buffer.from(mutation.fileChanges.additions[0].contents, "base64").toString("utf8"));
	assert.deepEqual(manifest.scenes, data.baselineManifest.scenes);
	assert.equal(manifest.sourceFingerprint, data.candidateManifest.sourceFingerprint);
	assert.deepEqual(writes[1], { path: `${API}/actions/workflows/ci.yml/dispatches`, method: "POST", body: {
		ref: data.pullRequest.head.ref, inputs: { "pr-number": "38", "expected-head": NEW_HEAD_SHA }
	} });
	assert.deepEqual(await readFile(join(root, SCENE_OUTPUT)), IMAGE);
});

void test("changed candidate images require human review and make no provider writes", async (t) => {
	const { data, environment, root, directory } = await promotionFixture(t);
	const changedImage = Buffer.from("changed image fixture");
	data.candidateManifest.scenes[0].sha256 = hash(changedImage);
	await write(join(directory, "screenshots.manifest.json"), JSON.stringify(data.candidateManifest));
	await write(join(directory, "after", basename(SCENE_OUTPUT)), changedImage);
	const { request, calls } = mockRequest(data);
	await runScreenshotAutomation({ command: "promote", environment, request, root, readHead: async () => BASE_SHA });
	noWrites(calls);
});

void test("main advancing or a concurrent PR push prevents the evidence commit", async (t) => {
	for (const kind of ["main", "head", "base"]) {
		const { data, environment, root } = await promotionFixture(t);
		const fresh = structuredClone(data.pullRequest);
		if (kind === "head") { fresh.head.sha = NEW_HEAD_SHA; }
		if (kind === "base") { fresh.base.sha = NEW_HEAD_SHA; }
		const { request, calls } = mockRequest(data, { freshPullRequest: fresh });
		await runScreenshotAutomation({ command: "promote", environment, request, root,
			readHead: async () => kind === "main" ? NEW_HEAD_SHA : BASE_SHA });
		noWrites(calls);
	}
});

void test("atomic commit rejection never dispatches CI on an unverified head", async (t) => {
	const { data, environment, root } = await promotionFixture(t);
	const { request, calls } = mockRequest(data, { commitResponse: { errors: [{ message: "Branch moved" }] } });
	await assert.rejects(runScreenshotAutomation({ command: "promote", environment, request, root,
		readHead: async () => BASE_SHA }), /atomic evidence commit/u);
	assert.deepEqual(calls.filter((call) => call.method === "POST").map((call) => call.path), ["/graphql"]);
});

void test("forged candidate reports, manifest fields, and image hashes never write", async (t) => {
	for (const [label, mutate] of [
		["old report head", (data) => { data.report.headSha = BASE_SHA; }],
		["different report base", (data) => { data.report.baseSha = HEAD_SHA; }],
		["different report attempt", (data) => { data.report.runAttempt = 2; }],
		["forged fingerprint", (data) => { data.candidateManifest.sourceFingerprint = "e".repeat(64); }],
		["unknown manifest command", (data) => { data.candidateManifest.command = "hostile"; }],
		["image hash mismatch", (data) => { data.candidateManifest.scenes[0].sha256 = "e".repeat(64); }]
	]) {
		const { data, environment, root, directory } = await promotionFixture(t); mutate(data);
		await write(join(directory, "report.json"), JSON.stringify(data.report));
		await write(join(directory, "screenshots.manifest.json"), JSON.stringify(data.candidateManifest));
		const { request, calls } = mockRequest(data);
		await runScreenshotAutomation({ command: "promote", environment, request, root, readHead: async () => BASE_SHA });
		noWrites(calls);
		assert.equal(calls.some((call) => call.path === "/graphql"), false, label);
	}
});
