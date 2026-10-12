import { isDeepStrictEqual } from "node:util";

import {
	captureDependencyVersions, fingerprintScreenshotFiles, isScreenshotSourceInput,
	SCREENSHOT_SOURCE_INPUTS
} from "./screenshot-fingerprint.mjs";

const SHA256 = /^[a-f0-9]{64}$/u;
const COMMIT_SHA = /^[a-f0-9]{40}$/u;
const EXACT_VERSION = /^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)(?:-[0-9A-Za-z-]+(?:\.[0-9A-Za-z-]+)*)?(?:\+[0-9A-Za-z-]+(?:\.[0-9A-Za-z-]+)*)?$/u;
const MANIFEST_KEYS = ["version", "state", "toolchain", "sourceFingerprint", "scenes", "browserTargets"];
const TARGET_KEYS = ["query", "effectiveQuery", "resolvedAt", "dataVersions", "browsers", "javascript", "css"];
const SCENE_KEYS = ["id", "route", "output", "viewport", "hasTouch", "setup", "alt", "references", "sha256"];
const REPORT_KEYS = ["version", "repository", "prNumber", "headSha", "baseSha", "runId", "runAttempt"];
const ALLOWED_PATHS = new Set(["package.json", "package-lock.json", "screenshots.manifest.json"]);

function requireCondition(condition, message) {
	if (!condition) { throw new Error(message); }
}

function hasExactKeys(value, keys) {
	return value !== null && typeof value === "object" && !Array.isArray(value) &&
		isDeepStrictEqual(Object.keys(value).sort(), [...keys].sort());
}

function without(value, keys) {
	return Object.fromEntries(Object.entries(value).filter(([key]) => !keys.includes(key)));
}

function validateIdentity({ repository, pullRequest, run }) {
	requireCondition(typeof repository === "string" && /^[^/\s]+\/[^/\s]+$/u.test(repository),
		"Repository identity is invalid.");
	requireCondition(pullRequest?.state === "open" && pullRequest.user?.login === "dependabot[bot]",
		"Only an open Dependabot pull request is eligible.");
	requireCondition(pullRequest.head?.repo?.full_name === repository &&
		pullRequest.base?.repo?.full_name === repository && pullRequest.base.ref === "main",
		"Pull request must originate in this repository and target main.");
	requireCondition(Number.isSafeInteger(pullRequest.number) && pullRequest.number > 0 &&
		COMMIT_SHA.test(pullRequest.head.sha) && COMMIT_SHA.test(pullRequest.base.sha),
		"Pull request commit identities are invalid.");
	requireCondition(run?.event === "pull_request" && run.repository?.full_name === repository &&
		run.head_sha === pullRequest.head.sha && Number.isSafeInteger(run.id) && run.id > 0 &&
		Number.isSafeInteger(run.run_attempt) && run.run_attempt > 0,
		"Workflow run does not identify the current pull request head.");
}

function validateDependencyChanges({ changedFiles, basePackage, headPackage, baseLock, headLock }) {
	requireCondition(Array.isArray(changedFiles) && changedFiles.length > 0 && changedFiles.length <= 3,
		"Changed file inventory is invalid.");
	const paths = changedFiles.map((file) => typeof file === "string" ? file : file.filename);
	requireCondition(new Set(paths).size === paths.length && paths.every((path) => ALLOWED_PATHS.has(path)) &&
		changedFiles.every((file) => typeof file === "string" || file.status === "modified"),
		"Only modified dependency manifests and existing screenshot provenance are eligible.");
	requireCondition(basePackage?.devDependencies !== null && typeof basePackage?.devDependencies === "object" &&
		headPackage?.devDependencies !== null && typeof headPackage?.devDependencies === "object" &&
		!Array.isArray(basePackage.devDependencies) && !Array.isArray(headPackage.devDependencies),
		"Package development dependencies are invalid.");
	requireCondition(isDeepStrictEqual(without(basePackage, ["devDependencies"]),
		without(headPackage, ["devDependencies"])), "Package changes exceed development dependency versions.");
	const names = Object.keys(basePackage.devDependencies).sort();
	requireCondition(isDeepStrictEqual(names, Object.keys(headPackage.devDependencies).sort()) &&
		names.every((name) => typeof headPackage.devDependencies[name] === "string" &&
			EXACT_VERSION.test(headPackage.devDependencies[name])),
		"Only existing, exactly pinned development dependency versions may change.");
	requireCondition(baseLock?.packages?.[""] !== undefined && headLock?.packages?.[""] !== undefined &&
		isDeepStrictEqual(without(baseLock, ["packages"]), without(headLock, ["packages"])) &&
		isDeepStrictEqual(without(baseLock.packages[""], ["devDependencies"]),
			without(headLock.packages[""], ["devDependencies"])) &&
		isDeepStrictEqual(baseLock.packages[""].devDependencies, basePackage.devDependencies) &&
		isDeepStrictEqual(headLock.packages[""].devDependencies, headPackage.devDependencies),
		"Lockfile root and metadata must match the dependency-only package update.");
	requireCondition(!isDeepStrictEqual(baseLock, headLock) && paths.includes("package-lock.json"),
		"There is no locked dependency update to promote.");
	requireCondition(isDeepStrictEqual(basePackage, headPackage) || paths.includes("package.json"),
		"Package update is absent from the changed file inventory.");
}

/** Checks API-provided PR identities and dependency-only changes without executing repository code. */
export function dependencyScreenshotEligibility(input) {
	try {
		validateIdentity(input);
		const changes = validateDependencyOnlyChanges(input);
		if (!changes.eligible) { return changes; }
		return { eligible: true };
	} catch (error) { return { eligible: false, reason: error.message }; }
}

/** Classifies dependency changes for an unprivileged capture job and a trusted writer alike. */
export function validateDependencyOnlyChanges(input) {
	try {
		validateDependencyChanges(input);
		if (input.baselineManifest !== undefined || input.currentManifest !== undefined) {
			validateManifest(input.baselineManifest, "Baseline");
			validateManifest(input.currentManifest, "Current");
			requireCondition(isDeepStrictEqual(
				without(input.baselineManifest, ["sourceFingerprint", "toolchain", "browserTargets"]),
				without(input.currentManifest, ["sourceFingerprint", "toolchain", "browserTargets"])),
				"Current screenshot evidence changes more than provenance.");
			for (const key of ["query", "browsers", "javascript", "css"]) {
				requireCondition(isDeepStrictEqual(input.baselineManifest.browserTargets[key],
					input.currentManifest.browserTargets[key]), "Current screenshot browser targets changed.");
			}
		}
		return { eligible: true };
	} catch (error) { return { eligible: false, reason: error.message }; }
}

function validateManifest(manifest, label) {
	requireCondition(hasExactKeys(manifest, MANIFEST_KEYS) && manifest.version === 1 &&
		manifest.state === "final" && SHA256.test(manifest.sourceFingerprint), `${label} manifest schema is invalid.`);
	requireCondition(hasExactKeys(manifest.toolchain, ["browser", "node", "npm", "playwright"]) &&
		manifest.toolchain.browser === "chromium" && /^24\.(0|[1-9]\d*)\.(0|[1-9]\d*)$/u.test(manifest.toolchain.node) &&
		EXACT_VERSION.test(manifest.toolchain.npm) && EXACT_VERSION.test(manifest.toolchain.playwright),
		`${label} capture toolchain is invalid.`);
	const targets = manifest.browserTargets;
	requireCondition(hasExactKeys(targets, TARGET_KEYS) && hasExactKeys(targets.dataVersions, ["vite", "esbuild"]) &&
		EXACT_VERSION.test(targets.dataVersions.vite) && EXACT_VERSION.test(targets.dataVersions.esbuild) &&
		targets.query === "baseline-widely-available" &&
		targets.effectiveQuery === `Vite ${targets.dataVersions.vite}: ${targets.query}` &&
		typeof targets.resolvedAt === "string" && /^\d{4}-\d{2}-\d{2}$/u.test(targets.resolvedAt) &&
		Number.isFinite(Date.parse(`${targets.resolvedAt}T00:00:00.000Z`)) &&
		new Date(`${targets.resolvedAt}T00:00:00.000Z`).toISOString().slice(0, 10) === targets.resolvedAt &&
		["browsers", "javascript", "css"].every((key) => Array.isArray(targets[key]) && targets[key].length > 0 &&
			targets[key].every((target) => typeof target === "string" && /^[a-z]+\d+(?:\.\d+)*$/u.test(target))),
		`${label} browser target evidence is invalid.`);
	requireCondition(Array.isArray(manifest.scenes) && manifest.scenes.length > 0 && manifest.scenes.length <= 50,
		`${label} scene inventory is invalid.`);
	const ids = new Set();
	const outputs = new Set();
	for (const scene of manifest.scenes) {
		requireCondition(hasExactKeys(scene, SCENE_KEYS) && typeof scene.id === "string" &&
			/^[a-z0-9-]+$/u.test(scene.id) && !ids.has(scene.id) && !outputs.has(scene.output) &&
			typeof scene.output === "string" && /^docs\/screenshots\/[a-z0-9-]+\.png$/u.test(scene.output) &&
			scene.route === "/examples/advanced/" && hasExactKeys(scene.viewport, ["width", "height"]) &&
			[scene.viewport.width, scene.viewport.height].every((dimension) => Number.isSafeInteger(dimension) && dimension > 0) &&
			typeof scene.hasTouch === "boolean" && Array.isArray(scene.setup) && scene.setup.length > 0 &&
			scene.setup.every((step) => typeof step === "string" && step.length > 0) &&
			typeof scene.alt === "string" && scene.alt.length > 0 && Array.isArray(scene.references) &&
			scene.references.length > 0 && scene.references.every((reference) => typeof reference === "string" &&
				reference.endsWith(".md")) && SHA256.test(scene.sha256), `${label} scene contract is invalid.`);
		ids.add(scene.id);
		outputs.add(scene.output);
	}
}

function validateSourceFiles(files, packageManifest, lock, label) {
	requireCondition(Array.isArray(files), `${label} source inventory is invalid.`);
	const byPath = new Map();
	for (const file of files) {
		requireCondition(typeof file?.path === "string" && isScreenshotSourceInput(file.path) &&
			!byPath.has(file.path) && (typeof file.contents === "string" || Buffer.isBuffer(file.contents)),
			`${label} source inventory has an unexpected or duplicate input.`);
		byPath.set(file.path, file.contents);
	}
	requireCondition(SCREENSHOT_SOURCE_INPUTS.every((path) => byPath.has(path) ||
		[...byPath.keys()].some((name) => name.startsWith(`${path}/`))), `${label} source inventory is incomplete.`);
	for (const [path, value] of [["package.json", packageManifest], ["package-lock.json", lock]]) {
		requireCondition(isDeepStrictEqual(JSON.parse(String(byPath.get(path))), value),
			`${label} source inventory does not match ${path}.`);
	}
}

function validateToolchain(manifest, packageManifest, lock, expectedNpm, label) {
	const versions = captureDependencyVersions(lock);
	requireCondition(manifest.toolchain.npm === expectedNpm && packageManifest.packageManager === `npm@${expectedNpm}` &&
		manifest.toolchain.playwright === packageManifest.devDependencies["@playwright/test"] &&
		manifest.toolchain.playwright === versions["@playwright/test"] &&
		manifest.browserTargets.dataVersions.vite === versions.vite &&
		manifest.browserTargets.dataVersions.esbuild === versions.esbuild,
		`${label} capture provenance does not match its locked toolchain.`);
}

function validateHashMap(hashes, manifest, label) {
	requireCondition(hasExactKeys(hashes, manifest.scenes.map((scene) => scene.output)) &&
		Object.values(hashes).every((value) => typeof value === "string" && SHA256.test(value)),
		`${label} image hash inventory is invalid.`);
}

/**
 * Plans a provenance-only update using API identities and externally hashed PNG files.
 * The caller must load both source inventories from exact Git commits, derive image hashes
 * from actual canonical/candidate bytes, verify workflow identity and quality checks, and
 * provide expectedCapture from trusted workflow configuration and the API run creation date.
 * Untrusted artifact manifests are validated as data; their fields never execute as code.
 */
export function planScreenshotPromotion(input) {
	const eligibility = dependencyScreenshotEligibility(input);
	if (!eligibility.eligible) { return { status: "ineligible", reason: eligibility.reason }; }
	try {
		const { repository, pullRequest, run, report, basePackage, headPackage, baseLock, headLock,
			baselineManifest, currentManifest, candidateManifest, canonicalHashes, baseCaptureHashes,
			candidateHashes, sourceFiles, baseSourceFiles, expectedCapture } = input;
		requireCondition(hasExactKeys(report, REPORT_KEYS) && report.version === 1 &&
			report.repository === repository && report.prNumber === pullRequest.number &&
			report.headSha === pullRequest.head.sha && report.baseSha === pullRequest.base.sha &&
			report.runId === run.id && report.runAttempt === run.run_attempt,
			"Candidate report does not identify this exact base, head, and workflow attempt.");
		validateManifest(baselineManifest, "Baseline");
		validateManifest(currentManifest, "Current");
		validateManifest(candidateManifest, "Candidate");
		requireCondition(hasExactKeys(expectedCapture, ["node", "resolvedAt"]) &&
			typeof run.created_at === "string" && expectedCapture.resolvedAt === run.created_at.slice(0, 10) &&
			candidateManifest.toolchain.node === expectedCapture.node &&
			candidateManifest.browserTargets.resolvedAt === expectedCapture.resolvedAt,
			"Candidate runtime and capture date do not match the trusted workflow run.");
		const expectedNpm = baselineManifest.toolchain.npm;
		validateToolchain(baselineManifest, basePackage, baseLock, expectedNpm, "Baseline");
		validateToolchain(candidateManifest, headPackage, headLock, expectedNpm, "Candidate");
		requireCondition(isDeepStrictEqual(without(baselineManifest, ["sourceFingerprint", "toolchain", "browserTargets"]),
			without(currentManifest, ["sourceFingerprint", "toolchain", "browserTargets"])),
			"Current screenshot evidence changes more than provenance.");
		validateSourceFiles(baseSourceFiles, basePackage, baseLock, "Base");
		validateSourceFiles(sourceFiles, headPackage, headLock, "Head");
		requireCondition(fingerprintScreenshotFiles(baseSourceFiles, baselineManifest.browserTargets) ===
			baselineManifest.sourceFingerprint, "Baseline screenshot fingerprint is stale.");
		const fingerprint = fingerprintScreenshotFiles(sourceFiles, candidateManifest.browserTargets);
		requireCondition(fingerprint === candidateManifest.sourceFingerprint, "Candidate screenshot fingerprint is incorrect.");
		for (const key of ["query", "browsers", "javascript", "css"]) {
			if (!isDeepStrictEqual(baselineManifest.browserTargets[key], candidateManifest.browserTargets[key])) {
				return { status: "needs-review", reason: "Effective browser targets changed." };
			}
		}
		if (!isDeepStrictEqual(baselineManifest.scenes.map((scene) => without(scene, ["sha256"])),
			candidateManifest.scenes.map((scene) => without(scene, ["sha256"])))) {
			return { status: "needs-review", reason: "Screenshot scene definitions changed." };
		}
		validateHashMap(canonicalHashes, baselineManifest, "Canonical");
		validateHashMap(baseCaptureHashes, baselineManifest, "Base capture");
		validateHashMap(candidateHashes, baselineManifest, "Candidate capture");
		for (const scene of baselineManifest.scenes) {
			if (canonicalHashes[scene.output] !== scene.sha256 || baseCaptureHashes[scene.output] !== scene.sha256) {
				return { status: "needs-review", reason: "Before evidence does not match canonical screenshot bytes." };
			}
			const candidate = candidateManifest.scenes.find((value) => value.id === scene.id);
			requireCondition(candidate.sha256 === candidateHashes[scene.output],
				"Candidate screenshot hash does not match its PNG bytes.");
			if (candidateHashes[scene.output] !== scene.sha256) {
				return { status: "needs-review", reason: "Candidate screenshots contain visual changes." };
			}
		}
		const manifest = { ...structuredClone(baselineManifest), sourceFingerprint: fingerprint,
			toolchain: structuredClone(candidateManifest.toolchain),
			browserTargets: structuredClone(candidateManifest.browserTargets) };
		if (currentManifest.sourceFingerprint === fingerprint &&
			currentManifest.toolchain.npm === expectedNpm &&
			currentManifest.toolchain.playwright === candidateManifest.toolchain.playwright &&
			isDeepStrictEqual(currentManifest.browserTargets.dataVersions, candidateManifest.browserTargets.dataVersions)) {
			return { status: "current" };
		}
		return { status: "promote", manifest };
	} catch (error) { return { status: "ineligible", reason: error.message }; }
}
