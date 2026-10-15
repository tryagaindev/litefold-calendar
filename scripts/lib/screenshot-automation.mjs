import { createHash } from "node:crypto";
import { execFile } from "node:child_process";
import { appendFile, lstat, readFile, readdir, realpath, writeFile } from "node:fs/promises";
import { basename, isAbsolute, join, relative, resolve, sep } from "node:path";
import { promisify } from "node:util";
import { fileURLToPath } from "node:url";

import { isScreenshotSourceInput, SCREENSHOT_SOURCE_INPUTS } from "./screenshot-fingerprint.mjs";
import { dependencyScreenshotEligibility, planScreenshotPromotion } from "./screenshot-promotion.mjs";

const REPOSITORY_ROOT = fileURLToPath(new URL("../../", import.meta.url));
const REPOSITORY = "tryagaindev/litefold-calendar";
const MAX_FILE_BYTES = 4 * 1024 * 1024;
const MAX_LOG_BYTES = 16 * 1024 * 1024;
const execFileAsync = promisify(execFile);
const SHA = /^[a-f0-9]{40}$/u;

function requireCondition(condition, message) {
	if (!condition) { throw new Error(message); }
}

function positiveInteger(value, label) {
	requireCondition(typeof value === "string" && /^[1-9]\d*$/u.test(value) &&
		Number.isSafeInteger(Number(value)), label + " must be a positive integer.");
	return Number(value);
}

function commitSha(value, label) {
	requireCondition(typeof value === "string" && SHA.test(value), label + " must be a full commit SHA.");
	return value;
}

function hash(contents) {
	return createHash("sha256").update(contents).digest("hex");
}

/** Uses GitHub's authenticated API without forwarding credentials to redirected log hosts. */
export function githubRequest(environment, fetchImplementation = fetch) {
	requireCondition(environment.GITHUB_REPOSITORY === REPOSITORY, "Unexpected repository.");
	requireCondition(typeof environment.GITHUB_TOKEN === "string" && environment.GITHUB_TOKEN.length > 0,
		"GitHub API authentication is required.");
	return async (path, { method = "GET", body, text = false } = {}) => {
		requireCondition(path === "/graphql" || path.startsWith("/repos/" + REPOSITORY + "/"),
			"Unexpected API destination.");
		let response = await fetchImplementation("https://api.github.com" + path, {
			method, redirect: "manual",
			headers: {
				Authorization: "Bearer " + environment.GITHUB_TOKEN,
				Accept: "application/vnd.github+json",
				"X-GitHub-Api-Version": "2022-11-28",
				...(body === undefined ? {} : { "Content-Type": "application/json" })
			},
			...(body === undefined ? {} : { body: JSON.stringify(body) })
		});
		if (text && response.status === 302) {
			const destination = new URL(response.headers.get("location"));
			requireCondition(destination.protocol === "https:" && !destination.username && !destination.password,
				"Invalid log download destination.");
			response = await fetchImplementation(destination, { redirect: "error" });
		}
		requireCondition(response.ok, "GitHub API request failed (" + response.status + ").");
		if (response.status === 204) { return undefined; }
		const value = await response.text();
		requireCondition(Buffer.byteLength(value) <= (text ? MAX_LOG_BYTES : MAX_FILE_BYTES * 2),
			"GitHub API response exceeds the evidence limit.");
		return text ? value : JSON.parse(value);
	};
}

async function output(environment, values) {
	if (environment.GITHUB_OUTPUT) {
		await appendFile(environment.GITHUB_OUTPUT, Object.entries(values)
			.map(([key, value]) => key + "=" + String(value) + "\n").join(""));
	}
}

async function summary(environment, message) {
	console.log(message);
	if (environment.GITHUB_STEP_SUMMARY) { await appendFile(environment.GITHUB_STEP_SUMMARY, message + "\n"); }
}

async function fileAt(request, path, sha) {
	const file = await request("/repos/" + REPOSITORY + "/contents/" + path + "?ref=" + sha);
	requireCondition(file.type === "file" && file.encoding === "base64" && SHA.test(file.sha),
		"Repository evidence must be a regular Git blob.");
	const contents = Buffer.from(file.content, "base64");
	requireCondition(contents.length <= MAX_FILE_BYTES, "Repository evidence exceeds the file limit.");
	return { contents, sha: file.sha, value: JSON.parse(contents.toString("utf8")) };
}

async function pullRequestContext(request, number, run) {
	const pullRequest = await request("/repos/" + REPOSITORY + "/pulls/" + number);
	const changedFiles = [];
	for (let page = 1; page <= 2; page += 1) {
		const files = await request("/repos/" + REPOSITORY + "/pulls/" + number + "/files?per_page=100&page=" + page);
		requireCondition(Array.isArray(files), "Invalid pull request file inventory.");
		changedFiles.push(...files);
		if (files.length < 100) { break; }
	}
	//Classify paths before downloading any branch-controlled document.
	if (changedFiles.length > 3 || changedFiles.some((file) =>
		!["package.json", "package-lock.json", "screenshots.manifest.json"].includes(file.filename))) {
		return { eligible: false, reason: "The pull request includes changes beyond dependency provenance." };
	}
	const [basePackage, headPackage, baseLock, headLock, baseline, current] = await Promise.all([
		fileAt(request, "package.json", pullRequest.base.sha),
		fileAt(request, "package.json", pullRequest.head.sha),
		fileAt(request, "package-lock.json", pullRequest.base.sha),
		fileAt(request, "package-lock.json", pullRequest.head.sha),
		fileAt(request, "screenshots.manifest.json", pullRequest.base.sha),
		fileAt(request, "screenshots.manifest.json", pullRequest.head.sha)
	]);
	const input = {
		repository: REPOSITORY, pullRequest, run, changedFiles,
		basePackage: basePackage.value, headPackage: headPackage.value,
		baseLock: baseLock.value, headLock: headLock.value,
		baselineManifest: baseline.value, currentManifest: current.value
	};
	const eligibility = dependencyScreenshotEligibility(input);
	if (eligibility.eligible) {
		//The PR inventory is a merge-base diff; copied base inputs require that base to be an ancestor.
		const comparison = await request("/repos/" + REPOSITORY + "/compare/" +
			pullRequest.base.sha + "..." + pullRequest.head.sha);
		if (comparison.merge_base_commit?.sha !== pullRequest.base.sha) {
			return { eligible: false, reason: "Update the dependency branch with current main before capturing evidence." };
		}
	}
	return { ...eligibility, input, headPackage, headLock, current };
}

/** Accepts only a complete quality gate, or its sole stale-fingerprint failure with a green package check. */
export function classifyScreenshotQuality(jobs, log = "") {
	const candidate = jobs.find((job) => job.name === "Capture Dependabot screenshot candidates");
	const verify = jobs.find((job) => job.name === "Build, test, and verify package");
	const source = jobs.find((job) => job.name === "Resolve the verified source");
	if (candidate?.conclusion !== "success" || source?.conclusion !== "success") { return false; }
	if (verify?.conclusion === "success") { return true; }
	if (verify?.conclusion !== "failure") { return false; }
	const quality = verify.steps?.find((step) => step.name === "Run the CI quality gate");
	const packageCheck = verify.steps?.find((step) => step.name === "Verify dependency package after a failed quality gate");
	if (quality?.conclusion !== "failure" || packageCheck?.conclusion !== "success" ||
		verify.steps.some((step) => step.conclusion === "failure" && step !== quality)) { return false; }
	const lines = log.split(/\r?\n/u).map((line) => line.replace(/^\d{4}-\d\d-\d\dT\S+\s/u, ""));
	const failures = lines.filter((line) => line.startsWith("##[error]"));
	const start = lines.lastIndexOf("Screenshot validation failed:");
	if (start === -1 || failures.length !== 1 ||
		!failures[0].includes("Process completed with exit code 1.")) { return false; }
	const validation = lines.slice(start + 1).findIndex((line) => line.startsWith("##[error]"));
	if (validation < 0) { return false; }
	const diagnostics = lines.slice(start + 1, start + 1 + validation).filter((line) => line.trim() !== "");
	return diagnostics.length === 1 &&
		diagnostics[0] === "- Screenshot source fingerprint is stale; run npm run screenshots:prepare.";
}

async function upstreamContext(request, environment) {
	const runId = positiveInteger(environment.LFC_UPSTREAM_RUN_ID, "Upstream run");
	const attempt = positiveInteger(environment.LFC_UPSTREAM_RUN_ATTEMPT, "Upstream attempt");
	const head = commitSha(environment.LFC_UPSTREAM_HEAD_SHA, "Upstream head");
	const run = await request("/repos/" + REPOSITORY + "/actions/runs/" + runId);
	if (run.id !== runId || run.run_attempt !== attempt || run.head_sha !== head || run.event !== "pull_request" ||
		run.path !== ".github/workflows/ci.yml" || run.status !== "completed" ||
		!["success", "failure"].includes(run.conclusion) ||
		typeof run.created_at !== "string" || Number.isNaN(Date.parse(run.created_at)) ||
		run.repository?.full_name !== REPOSITORY || run.head_repository?.full_name !== REPOSITORY) {
		return { eligible: false, reason: "The originating CI run is stale or ineligible." };
	}
	const linked = run.pull_requests ?? [];
	if (linked.length !== 1) { return { eligible: false, reason: "CI must identify exactly one pull request." }; }
	const context = await pullRequestContext(request, linked[0].number, run);
	if (!context.eligible) { return context; }
	if (context.input.pullRequest.head.ref !== run.head_branch) {
		return { eligible: false, reason: "The originating branch changed." };
	}
	const jobs = (await request("/repos/" + REPOSITORY + "/actions/runs/" + runId +
		"/attempts/" + attempt + "/jobs?per_page=100")).jobs;
	requireCondition(Array.isArray(jobs) && jobs.length < 100, "Invalid CI job inventory.");
	const verify = jobs.find((job) => job.name === "Build, test, and verify package");
	const log = verify?.conclusion === "failure"
		? await request("/repos/" + REPOSITORY + "/actions/jobs/" + verify.id + "/logs", { text: true }) : "";
	if (!classifyScreenshotQuality(jobs, log)) {
		return { eligible: false, reason: "Required checks failed beyond screenshot freshness." };
	}
	const artifacts = (await request("/repos/" + REPOSITORY + "/actions/runs/" + runId +
		"/artifacts?per_page=100")).artifacts;
	requireCondition(Array.isArray(artifacts) && artifacts.length < 100, "Invalid artifact inventory.");
	const matches = artifacts.filter((artifact) =>
		artifact.name === "screenshot-candidate-" + runId + "-" + attempt && !artifact.expired);
	if (matches.length !== 1 || !Number.isSafeInteger(matches[0].id) || matches[0].id <= 0 ||
		!Number.isSafeInteger(matches[0].size_in_bytes) || matches[0].size_in_bytes <= 0 ||
		matches[0].size_in_bytes > 20 * 1024 * 1024 ||
		matches[0].workflow_run?.id !== runId || matches[0].workflow_run?.head_sha !== head) {
		return { eligible: false, reason: "A unique exact-run candidate artifact is required." };
	}
	return { ...context, artifact: matches[0] };
}

async function readBoundedFile(path) {
	const metadata = await lstat(path);
	requireCondition(metadata.isFile() && !metadata.isSymbolicLink() && metadata.size <= MAX_FILE_BYTES,
		"Evidence must be a bounded regular file.");
	return readFile(path);
}

/** Rejects unexpected paths and links before consuming any downloaded evidence. */
export async function inspectScreenshotArtifact(directory, manifest) {
	const metadata = await lstat(directory);
	requireCondition(metadata.isDirectory() && !metadata.isSymbolicLink(), "Candidate root must be a regular directory.");
	const root = await realpath(directory);
	const expected = new Set(["index.html", "changes.json", "screenshots.manifest.json", "report.json"]);
	for (const scene of manifest.scenes) {
		for (const side of ["before", "after"]) { expected.add(side + "/" + basename(scene.output)); }
	}
	const found = new Set();
	async function inspect(path, prefix = "") {
		for (const entry of await readdir(path, { withFileTypes: true })) {
			const name = prefix + entry.name;
			const target = join(path, entry.name);
			const metadata = await lstat(target);
			requireCondition(!metadata.isSymbolicLink(), "Candidate links are forbidden.");
			if (metadata.isDirectory()) {
				requireCondition(prefix === "" && ["before", "after"].includes(entry.name),
					"Unexpected candidate directory.");
				await inspect(target, name + "/");
			} else {
				requireCondition(expected.has(name), "Unexpected candidate file.");
				await readBoundedFile(target);
				found.add(name);
			}
		}
	}
	await inspect(root);
	requireCondition(found.size === expected.size, "The candidate evidence is incomplete.");
	return root;
}

async function repositorySources(root) {
	const files = [];
	async function collect(path) {
		const metadata = await lstat(join(root, path));
		requireCondition(!metadata.isSymbolicLink(), "Screenshot source links are forbidden.");
		if (metadata.isDirectory()) {
			for (const entry of await readdir(join(root, path))) { await collect(path + "/" + entry); }
		} else if (isScreenshotSourceInput(path)) {
			files.push({ path, contents: await readBoundedFile(join(root, path)) });
		}
	}
	for (const input of SCREENSHOT_SOURCE_INPUTS) { await collect(input); }
	return files;
}

async function readSourceHead(root) {
	const { stdout } = await execFileAsync("git", ["rev-parse", "HEAD"], { cwd: root });
	return stdout.trim();
}

async function promote(context, request, environment, root, readHead) {
	const { input } = context;
	if (await readHead(root) !== input.pullRequest.base.sha) {
		await summary(environment, "Main advanced since capture; update the dependency branch with main, then rerun CI.");
		return;
	}
	const candidateDirectory = resolve(environment.LFC_CANDIDATE_DIRECTORY ?? "");
	const temporaryRoot = resolve(environment.RUNNER_TEMP ?? "");
	const child = relative(temporaryRoot, candidateDirectory);
	requireCondition(environment.RUNNER_TEMP && environment.LFC_CANDIDATE_DIRECTORY && child !== "" &&
		child !== ".." && !child.startsWith(".." + sep) && !isAbsolute(child),
		"Candidate evidence must stay in the runner temporary directory.");
	const artifactRoot = await inspectScreenshotArtifact(candidateDirectory, input.baselineManifest);
	const [candidateManifest, report] = await Promise.all(["screenshots.manifest.json", "report.json"]
		.map(async (name) => JSON.parse((await readBoundedFile(join(artifactRoot, name))).toString("utf8"))));
	const canonicalHashes = {};
	const baseCaptureHashes = {};
	const candidateHashes = {};
	for (const scene of input.baselineManifest.scenes) {
		canonicalHashes[scene.output] = hash(await readBoundedFile(join(root, scene.output)));
		baseCaptureHashes[scene.output] = hash(await readBoundedFile(join(artifactRoot, "before", basename(scene.output))));
		candidateHashes[scene.output] = hash(await readBoundedFile(join(artifactRoot, "after", basename(scene.output))));
	}
	const baseSourceFiles = await repositorySources(root);
	const sourceFiles = baseSourceFiles.map((file) => ({
		...file, contents: file.path === "package.json" ? context.headPackage.contents :
			file.path === "package-lock.json" ? context.headLock.contents : file.contents
	}));
	const plan = planScreenshotPromotion({ ...input, candidateManifest, report, canonicalHashes,
		baseCaptureHashes, candidateHashes, baseSourceFiles, sourceFiles,
		expectedCapture: { node: environment.LFC_NODE_VERSION, resolvedAt: input.run.created_at.slice(0, 10) } });
	if (plan.status !== "promote") {
		await summary(environment, plan.status === "needs-review"
			? "Screenshots require human review. Download the candidate gallery from the originating CI run."
			: (plan.reason ?? "Screenshot evidence is already current."));
		return;
	}
	const fresh = await request("/repos/" + REPOSITORY + "/pulls/" + input.pullRequest.number);
	if (fresh.state !== "open" || fresh.head.sha !== input.pullRequest.head.sha ||
		fresh.base.sha !== input.pullRequest.base.sha || fresh.head.repo?.full_name !== REPOSITORY) {
		await summary(environment, "Pull request changed during verification; no evidence was committed.");
		return;
	}
	//GraphQL expectedHeadOid atomically rejects a concurrent push, rebase, or rewind.
	const mutation = "mutation($input:CreateCommitOnBranchInput!){createCommitOnBranch(input:$input){commit{oid}}}";
	const commit = await request("/graphql", {
		method: "POST", body: {
			query: mutation, variables: { input: {
				branch: { repositoryNameWithOwner: REPOSITORY, branchName: fresh.head.ref },
				expectedHeadOid: input.pullRequest.head.sha,
				message: { headline: "chore(deps): refresh unchanged screenshot provenance" },
				fileChanges: { additions: [{
					path: "screenshots.manifest.json",
					contents: Buffer.from(JSON.stringify(plan.manifest, null, 2) + "\n").toString("base64")
				}] }
			} }
		}
	});
	const newHead = commit.data?.createCommitOnBranch?.commit?.oid;
	requireCondition(!commit.errors && SHA.test(newHead), "The pull request changed before the atomic evidence commit.");
	await request("/repos/" + REPOSITORY + "/actions/workflows/ci.yml/dispatches", {
		method: "POST", body: {
			ref: fresh.head.ref,
			inputs: { "pr-number": String(fresh.number), "expected-head": newHead }
		}
	});
	await summary(environment, "Refreshed unchanged screenshot provenance and dispatched CI for " + newHead + ".");
}

/** Runs one narrowly scoped capture, promotion, or exact-head dispatch operation. */
export async function runScreenshotAutomation({ command, environment = process.env,
	request, root = REPOSITORY_ROOT, readHead = readSourceHead }) {
	requireCondition(environment.GITHUB_REPOSITORY === REPOSITORY, "Unexpected repository.");
	if (command !== "seal-candidate") { request ??= githubRequest(environment); }
	if (command === "promotion-context" || command === "promote") {
		const context = await upstreamContext(request, environment);
		await output(environment, { eligible: context.eligible, "artifact-id": context.artifact?.id ?? "" });
		if (!context.eligible) { await summary(environment, context.reason); return; }
		if (command === "promote") { await promote(context, request, environment, root, readHead); }
		return;
	}
	const number = positiveInteger(environment.LFC_PR_NUMBER, "Pull request");
	const head = commitSha(environment.LFC_HEAD_SHA, "Pull request head");
	if (command === "verify-dispatch") {
		requireCondition(environment.GITHUB_EVENT_NAME === "workflow_dispatch" && environment.GITHUB_SHA === head,
			"Dispatch must identify the exact current pull request head.");
		const context = await pullRequestContext(request, number, {
			event: "pull_request", repository: { full_name: REPOSITORY },
			id: positiveInteger(environment.GITHUB_RUN_ID, "CI run"), run_attempt: 1, head_sha: head
		});
		requireCondition(context.eligible, context.reason ?? "Dispatch head changed.");
		await output(environment, { "checkout-ref": head, head, base: context.input.pullRequest.base.sha, "pr-number": number });
		return;
	}
	const base = commitSha(environment.LFC_BASE_SHA, "Pull request base");
	if (command === "seal-candidate") {
		const directory = join(root, ".cache", "screenshots", "candidate");
		try { await lstat(join(directory, "screenshots.manifest.json")); }
		catch (error) { if (error.code === "ENOENT") { return; } throw error; }
		const report = { version: 1, repository: REPOSITORY, prNumber: number, headSha: head, baseSha: base,
			runId: positiveInteger(environment.GITHUB_RUN_ID, "CI run"),
			runAttempt: positiveInteger(environment.GITHUB_RUN_ATTEMPT, "CI attempt") };
		await writeFile(join(directory, "report.json"), JSON.stringify(report, null, 2) + "\n");
		return;
	}
	requireCondition(command === "candidate-eligibility", "Unknown screenshot automation operation.");
	const run = { event: "pull_request", repository: { full_name: REPOSITORY }, head_sha: head,
		id: positiveInteger(environment.GITHUB_RUN_ID, "CI run"),
		run_attempt: positiveInteger(environment.GITHUB_RUN_ATTEMPT, "CI attempt") };
	const context = await pullRequestContext(request, number, run);
	const eligible = context.eligible && context.input.pullRequest.base.sha === base;
	const upstream = eligible ? await request("/repos/" + REPOSITORY + "/actions/runs/" + run.id) : undefined;
	if (eligible) {
		requireCondition(upstream.id === run.id && upstream.head_sha === head &&
			upstream.run_attempt === run.run_attempt && typeof upstream.created_at === "string" &&
			!Number.isNaN(Date.parse(upstream.created_at)), "Capture run identity changed.");
	}
	await output(environment, { eligible, "capture-date": upstream?.created_at?.slice(0, 10) ?? "" });
	if (!eligible) { await summary(environment, context.reason ?? "The pull request base changed."); }
}
