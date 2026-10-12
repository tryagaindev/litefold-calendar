import assert from "node:assert/strict";
import test from "node:test";

import { fingerprintScreenshotFiles, SCREENSHOT_SOURCE_INPUTS } from "../lib/screenshot-fingerprint.mjs";
import {
	dependencyScreenshotEligibility, planScreenshotPromotion, validateDependencyOnlyChanges
} from "../lib/screenshot-promotion.mjs";

const BASE_SHA = "a".repeat(40);
const HEAD_SHA = "b".repeat(40);
const IMAGE_HASH = "c".repeat(64);
const CHANGED_IMAGE_HASH = "d".repeat(64);
const SCENE_OUTPUT = "docs/screenshots/desktop-month-grid-1440x900.png";

function sourceFiles(packageManifest, lock) {
	return SCREENSHOT_SOURCE_INPUTS.map((path) => ({ path: path === "src" ? "src/index.ts" : path,
		contents: path === "package.json" ? JSON.stringify(packageManifest) :
			path === "package-lock.json" ? JSON.stringify(lock) : "fixture source\n" }));
}

function fixture() {
	const basePackage = { name: "fixture", version: "1.0.0", packageManager: "npm@12.0.2",
		scripts: { "build:package": "node scripts/build-package.mjs" },
		devDependencies: { "@playwright/test": "1.63.0", typescript: "6.0.3", vite: "8.3.2",
			esbuild: "0.28.2", stylelint: "17.16.0" } };
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
	const baseSourceFiles = sourceFiles(basePackage, baseLock);
	const baselineManifest = { version: 1, state: "final",
		toolchain: { browser: "chromium", node: "24.19.0", npm: "12.0.2", playwright: "1.63.0" },
		sourceFingerprint: fingerprintScreenshotFiles(baseSourceFiles, browserTargets),
		scenes: [{ id: "desktop-month-grid", output: SCENE_OUTPUT, route: "/examples/advanced/",
			viewport: { width: 1440, height: 900 }, hasTouch: false, setup: ["wait-ready"],
			alt: "Desktop advanced calendar example", references: ["README.md"], sha256: IMAGE_HASH }],
		browserTargets };
	const candidateManifest = structuredClone(baselineManifest);
	candidateManifest.toolchain.node = "24.21.0";
	candidateManifest.browserTargets.dataVersions.vite = "8.3.3";
	candidateManifest.browserTargets.effectiveQuery = "Vite 8.3.3: baseline-widely-available";
	candidateManifest.browserTargets.resolvedAt = "2026-10-12";
	const headSourceFiles = sourceFiles(headPackage, headLock);
	candidateManifest.sourceFingerprint = fingerprintScreenshotFiles(headSourceFiles, candidateManifest.browserTargets);
	return { repository: "owner/repo", pullRequest: { number: 38, state: "open",
		user: { login: "dependabot[bot]" }, head: { sha: HEAD_SHA, repo: { full_name: "owner/repo" } },
		base: { sha: BASE_SHA, ref: "main", repo: { full_name: "owner/repo" } } },
		run: { id: 42, run_attempt: 1, event: "pull_request", repository: { full_name: "owner/repo" },
			head_sha: HEAD_SHA, created_at: "2026-10-12T01:00:00Z" },
		expectedCapture: { node: "24.21.0", resolvedAt: "2026-10-12" },
		report: { version: 1, repository: "owner/repo", prNumber: 38, headSha: HEAD_SHA,
			baseSha: BASE_SHA, runId: 42, runAttempt: 1 },
		changedFiles: [{ filename: "package.json", status: "modified" },
			{ filename: "package-lock.json", status: "modified" }],
		basePackage, headPackage, baseLock, headLock, baselineManifest,
		currentManifest: structuredClone(baselineManifest), candidateManifest,
		canonicalHashes: { [SCENE_OUTPUT]: IMAGE_HASH }, baseCaptureHashes: { [SCENE_OUTPUT]: IMAGE_HASH },
		candidateHashes: { [SCENE_OUTPUT]: IMAGE_HASH }, sourceFiles: headSourceFiles, baseSourceFiles };
}

void test("promotion rebuilds provenance while retaining canonical scenes and leaving input data untouched", () => {
	const input = fixture();
	const before = structuredClone(input);
	const result = planScreenshotPromotion(input);
	assert.equal(result.status, "promote", result.reason);
	assert.deepEqual(result.manifest.scenes, input.baselineManifest.scenes);
	assert.deepEqual(result.manifest.toolchain, input.candidateManifest.toolchain);
	assert.deepEqual(result.manifest.browserTargets, input.candidateManifest.browserTargets);
	assert.equal(result.manifest.sourceFingerprint, input.candidateManifest.sourceFingerprint);
	assert.deepEqual(input, before);
	result.manifest.scenes[0].alt = "changed result";
	assert.equal(input.baselineManifest.scenes[0].alt, "Desktop advanced calendar example");
});

void test("already promoted current evidence does not create another commit", () => {
	const input = fixture();
	input.currentManifest = planScreenshotPromotion(input).manifest;
	input.changedFiles.push({ filename: "screenshots.manifest.json", status: "modified" });
	assert.deepEqual(planScreenshotPromotion(input), { status: "current" });
});

void test("an unrelated locked linter update keeps the screenshot fingerprint current", () => {
	const input = fixture();
	input.headPackage = structuredClone(input.basePackage);
	input.headPackage.devDependencies.stylelint = "17.16.1";
	input.headLock = structuredClone(input.baseLock);
	input.headLock.packages[""].devDependencies.stylelint = "17.16.1";
	input.headLock.packages["node_modules/stylelint"].version = "17.16.1";
	input.sourceFiles = sourceFiles(input.headPackage, input.headLock);
	input.candidateManifest = structuredClone(input.baselineManifest);
	input.candidateManifest.toolchain.node = "24.21.0";
	input.candidateManifest.browserTargets.resolvedAt = "2026-10-12";
	input.candidateManifest.sourceFingerprint = fingerprintScreenshotFiles(input.sourceFiles,
		input.candidateManifest.browserTargets);
	assert.equal(input.candidateManifest.sourceFingerprint, input.baselineManifest.sourceFingerprint);
	assert.deepEqual(planScreenshotPromotion(input), { status: "current" });
});

void test("a transitive lock-only update is eligible", () => {
	const input = fixture();
	input.headPackage = structuredClone(input.basePackage);
	input.headLock = structuredClone(input.baseLock);
	input.headLock.packages["node_modules/source-map-js"] = { version: "1.2.2", dev: true };
	input.changedFiles = ["package-lock.json"];
	assert.equal(validateDependencyOnlyChanges(input).eligible, true);
});

void test("capture eligibility rejects changed scripts, added dependencies, and nondependency files", () => {
	for (const mutate of [
		(input) => { input.headPackage.scripts["build:package"] = "node hostile.mjs"; },
		(input) => { input.headPackage.devDependencies["new-dependency"] = "1.0.0"; },
		(input) => { input.headPackage.devDependencies.vite = "^8.3.3"; },
		(input) => { input.changedFiles.push("scripts/hostile.mjs"); },
		(input) => { input.changedFiles[0].status = "renamed"; },
		(input) => { input.headLock.packages[""].devDependencies.vite = "8.3.4"; },
		(input) => { input.headLock.version = "2.0.0"; },
		(input) => { input.changedFiles = ["package-lock.json", "package-lock.json"]; }
	]) {
		const input = fixture();
		mutate(input);
		assert.equal(validateDependencyOnlyChanges(input).eligible, false);
		assert.equal(planScreenshotPromotion(input).status, "ineligible");
	}
});

void test("author, repository, target, and current run head all bind capture eligibility", () => {
	for (const mutate of [
		(input) => { input.pullRequest.user.login = "contributor"; },
		(input) => { input.pullRequest.state = "closed"; },
		(input) => { input.pullRequest.head.repo.full_name = "fork/repo"; },
		(input) => { input.pullRequest.base.ref = "release"; },
		(input) => { input.run.event = "workflow_dispatch"; },
		(input) => { input.run.repository.full_name = "fork/repo"; },
		(input) => { input.run.head_sha = BASE_SHA; }
	]) {
		const input = fixture();
		mutate(input);
		assert.equal(dependencyScreenshotEligibility(input).eligible, false);
	}
});

void test("stale or forged artifact identities cannot promote current evidence", () => {
	for (const mutate of [
		(input) => { input.report.headSha = BASE_SHA; },
		(input) => { input.report.baseSha = HEAD_SHA; },
		(input) => { input.report.repository = "fork/repo"; },
		(input) => { input.report.prNumber = 39; },
		(input) => { input.report.runId = 41; },
		(input) => { input.report.runAttempt = 2; },
		(input) => { input.report.command = "arbitrary code"; }
	]) {
		const input = fixture();
		mutate(input);
		assert.equal(planScreenshotPromotion(input).status, "ineligible");
	}
});

void test("unknown artifact fields and invalid capture provenance are rejected", () => {
	for (const mutate of [
		(input) => { input.candidateManifest.command = "arbitrary code"; },
		(input) => { input.candidateManifest.scenes[0].command = "arbitrary code"; },
		(input) => { input.candidateManifest.toolchain.command = "arbitrary code"; },
		(input) => { input.candidateManifest.browserTargets.command = "arbitrary code"; },
		(input) => { input.candidateManifest.toolchain.node = "25.0.0"; },
		(input) => { input.candidateManifest.toolchain.npm = "12.0.3"; },
		(input) => { input.candidateManifest.toolchain.playwright = "1.62.0"; },
		(input) => { input.candidateManifest.browserTargets.dataVersions.vite = "8.3.4"; },
		(input) => { input.candidateManifest.browserTargets.resolvedAt = "2026-02-30"; },
		(input) => { input.candidateManifest.sourceFingerprint = CHANGED_IMAGE_HASH; },
		(input) => { input.baselineManifest.sourceFingerprint = CHANGED_IMAGE_HASH; }
	]) {
		const input = fixture();
		mutate(input);
		assert.equal(planScreenshotPromotion(input).status, "ineligible");
	}
});

void test("source inventories must be complete, unique, and tied to the exact package data", () => {
	for (const mutate of [
		(input) => { input.sourceFiles = input.sourceFiles.filter((file) => file.path !== "package-lock.json"); },
		(input) => { input.sourceFiles.push(input.sourceFiles[0]); },
		(input) => { input.sourceFiles.push({ path: "../../hostile.mjs", contents: "code" }); },
		(input) => { input.sourceFiles.find((file) => file.path === "package.json").contents = JSON.stringify(input.basePackage); },
		(input) => { input.baseSourceFiles[0].contents = "{}"; }
	]) {
		const input = fixture();
		mutate(input);
		assert.equal(planScreenshotPromotion(input).status, "ineligible");
	}
});

void test("valid-looking runtime and date claims must match trusted workflow capture inputs", () => {
	for (const mutate of [
		(input) => { delete input.expectedCapture; },
		(input) => { input.candidateManifest.toolchain.node = "24.999.999"; },
		(input) => { input.candidateManifest.browserTargets.resolvedAt = "1900-01-01"; },
		(input) => { input.expectedCapture.resolvedAt = "2026-10-11"; },
		(input) => { input.run.created_at = "2026-10-11T01:00:00Z"; }
	]) {
		const input = fixture();
		mutate(input);
		assert.equal(planScreenshotPromotion(input).status, "ineligible");
	}
});

void test("a valid target change requires review even if images are unchanged", () => {
	const input = fixture();
	input.candidateManifest.browserTargets.css = ["chrome112", "safari16.4"];
	input.candidateManifest.sourceFingerprint = fingerprintScreenshotFiles(input.sourceFiles,
		input.candidateManifest.browserTargets);
	assert.deepEqual(planScreenshotPromotion(input), { status: "needs-review", reason: "Effective browser targets changed." });
});

void test("changed scene setup requires review, and canonical scene edits in the PR are ineligible", () => {
	const input = fixture();
	input.candidateManifest.scenes[0].setup.push("new-state");
	assert.equal(planScreenshotPromotion(input).status, "needs-review");
	input.currentManifest.scenes[0].sha256 = CHANGED_IMAGE_HASH;
	assert.equal(planScreenshotPromotion(input).status, "ineligible");
});

void test("changed or mismatched PNG bytes never authorize a provenance refresh", () => {
	const changed = fixture();
	changed.candidateManifest.scenes[0].sha256 = CHANGED_IMAGE_HASH;
	changed.candidateHashes[SCENE_OUTPUT] = CHANGED_IMAGE_HASH;
	assert.deepEqual(planScreenshotPromotion(changed), { status: "needs-review", reason: "Candidate screenshots contain visual changes." });
	const forged = fixture();
	forged.candidateHashes[SCENE_OUTPUT] = CHANGED_IMAGE_HASH;
	assert.equal(planScreenshotPromotion(forged).status, "ineligible");
	for (const key of ["canonicalHashes", "baseCaptureHashes"]) {
		const drifted = fixture();
		drifted[key][SCENE_OUTPUT] = CHANGED_IMAGE_HASH;
		assert.equal(planScreenshotPromotion(drifted).status, "needs-review");
	}
	const unknown = fixture();
	unknown.candidateHashes["../../manifest.json"] = IMAGE_HASH;
	assert.equal(planScreenshotPromotion(unknown).status, "ineligible");
});
