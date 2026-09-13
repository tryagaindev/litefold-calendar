import { createHash } from "node:crypto";
import { join } from "node:path";
import { readFile, readdir, lstat } from "node:fs/promises";

import semver from "semver";

export const NIGHTLY_PACKAGE = "@tryagaindev/litefold-calendar";
export const NIGHTLY_WORKFLOW = ".github/workflows/publish-nightly.yml";
export const NIGHTLY_BASE_PATTERN = /^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)-nightly\.0$/u;
export const NIGHTLY_VERSION_PATTERN = /^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)-nightly\.(\d{14})\.([1-9]\d*)$/u;
const SHA_PATTERN = /^[0-9a-f]{40}$/u;
const PLAN_KEYS = ["baseVersion", "createdAt", "event", "name", "runId", "schemaVersion", "sourceCommit", "version", "workflow"];

/** Derives one immutable nightly identity; reruns use the original run creation time. */
export function createNightlyPlan({ baseVersion, createdAt, event, runId, sourceCommit }) {
	if (!NIGHTLY_BASE_PATTERN.test(baseVersion) || semver.valid(baseVersion) !== baseVersion) {
		throw new Error("Nightly source version must be a normalized x.y.z-nightly.0 development base.");
	}
	if (!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}Z$/u.test(createdAt) ||
		new Date(createdAt).toISOString().replace(".000Z", "Z") !== createdAt) {
		throw new Error("Nightly creation time must be the workflow run's exact UTC creation time.");
	}
	if (typeof runId !== "string" || !/^[1-9]\d*$/u.test(runId) || !Number.isSafeInteger(Number(runId))) {
		throw new Error("Nightly run ID must be a positive safe integer string.");
	}
	if (!SHA_PATTERN.test(sourceCommit) || !["schedule", "workflow_dispatch"].includes(event)) {
		throw new Error("Nightly requires a full source SHA and schedule or workflow_dispatch event.");
	}
	const timestamp = createdAt.replace(/[-:TZ]/gu, "");
	const version = baseVersion.replace(/-nightly\.0$/u, `-nightly.${timestamp}.${runId}`);
	return Object.freeze({ baseVersion, createdAt, event, name: NIGHTLY_PACKAGE, runId,
		schemaVersion: 1, sourceCommit, version, workflow: NIGHTLY_WORKFLOW });
}

/** Rejects modified plans instead of trusting artifact metadata as an instruction. */
export function validateNightlyPlan(value) {
	if (value === null || typeof value !== "object" || Array.isArray(value) ||
		Object.keys(value).sort().join(",") !== PLAN_KEYS.join(",")) {
		throw new Error("Nightly plan has an unexpected schema.");
	}
	const expected = createNightlyPlan(value);
	for (const key of PLAN_KEYS) {
		if (value[key] !== expected[key]) {
			throw new Error(`Nightly plan ${key} does not match its immutable inputs.`);
		}
	}
	return expected;
}

export async function readNightlyPlan(path) {
	return validateNightlyPlan(JSON.parse(await readFile(path, "utf8")));
}

/** Changes only artifact version; the source checkout remains untouched. */
export function nightlyPackageManifest(manifest, planValue) {
	const plan = validateNightlyPlan(planValue);
	if (manifest.name !== NIGHTLY_PACKAGE || manifest.version !== plan.baseVersion ||
		manifest.private !== false || manifest.publishConfig?.tag !== "nightly" ||
		manifest.publishConfig?.access !== "public" || manifest.publishConfig?.provenance !== true) {
		throw new Error("Nightly source manifest does not match the approved package policy and base.");
	}
	return { ...manifest, version: plan.version };
}

/** Validates a fresh registry snapshot, including the first alpha-to-nightly transition. */
export function validateNightlyRegistryState(metadata, planValue) {
	const plan = validateNightlyPlan(planValue);
	const versions = typeof metadata?.versions === "string" ? [metadata.versions] : metadata?.versions;
	const tags = metadata?.["dist-tags"];
	if (!Array.isArray(versions) || versions.length === 0 ||
		versions.some((version) => typeof version !== "string" || semver.valid(version) !== version) ||
		tags === null || typeof tags !== "object" || Array.isArray(tags)) {
		throw new Error("Nightly publishing requires valid metadata for the existing npm package.");
	}
	const stableExists = versions.some((version) => semver.prerelease(version) === null);
	if (typeof tags.latest !== "string" || !versions.includes(tags.latest) ||
		(stableExists && semver.prerelease(tags.latest) !== null)) {
		throw new Error("npm latest must select a published version, and belongs to stable after first stable.");
	}
	const predecessor = tags.nightly ?? tags.alpha;
	if (typeof predecessor !== "string" || !versions.includes(predecessor) ||
		!(NIGHTLY_VERSION_PATTERN.test(predecessor) || /^0\.\d+\.\d+-alpha\.\d+$/u.test(predecessor))) {
		throw new Error("Nightly requires a verified published nightly or historical alpha predecessor.");
	}
	if (tags.nightly !== undefined && !NIGHTLY_VERSION_PATTERN.test(tags.nightly)) {
		throw new Error("npm nightly has an unsupported version shape.");
	}
	if (predecessor !== plan.version && !semver.lt(predecessor, plan.version)) {
		throw new Error("Nightly candidate must be newer than its predecessor.");
	}
	if (versions.some((version) => version !== plan.version && semver.gte(version, plan.version))) {
		throw new Error("Nightly base must advance beyond every previously published version.");
	}
	const existing = versions.includes(plan.version);
	if (existing && tags.nightly !== plan.version) {
		throw new Error("Existing nightly candidate is not selected by the nightly tag.");
	}
	if (!stableExists && predecessor !== plan.version && tags.latest !== predecessor) {
		throw new Error("A previous nightly has incomplete latest synchronization; resume that attempt first.");
	}
	return Object.freeze({ existing, latest: tags.latest, predecessor, stableExists });
}

/** Checks expiry before public writes; rotation does not expose token material. */
export function tokenExpiryStatus(expiresAt, now = new Date()) {
	const expiry = new Date(expiresAt);
	if (typeof expiresAt !== "string" || !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}Z$/u.test(expiresAt) ||
		!Number.isFinite(expiry.getTime()) || !Number.isFinite(now.getTime()) ||
		expiry.toISOString().replace(".000Z", "Z") !== expiresAt) {
		throw new Error("Nightly tag-token expiry must be an explicit UTC timestamp.");
	}
	const remaining = expiry.getTime() - now.getTime();
	if (remaining <= 0) {
		throw new Error("Nightly tag token has expired; rotate it before publishing.");
	}
	return Object.freeze({ expiresAt, warn: remaining <= 7 * 24 * 60 * 60 * 1_000 });
}


/** Selects retained evidence from this run; incomplete public attempts cannot rebuild. */
export function selectNightlyRecoveryArtifacts({ artifacts, plan: value, attempt, hasPublicState }) {
	const plan = validateNightlyPlan(value);
	if (!Array.isArray(artifacts) || !Number.isSafeInteger(attempt) || attempt < 1) {
		throw new Error("Nightly recovery requires a complete artifact listing and valid attempt.");
	}
	const bundlePrefix = `npm-release-bundle-v${plan.version}-${plan.runId}-`;
	const notesPrefix = `release-notes-v${plan.version}-${plan.runId}-`;
	const candidates = [];
	for (let previous = 1; previous < attempt; previous += 1) {
		const bundle = artifacts.filter((entry) => entry.name === `${bundlePrefix}${previous}`);
		const notes = artifacts.filter((entry) => entry.name === `${notesPrefix}${previous}`);
		if (bundle.length > 1 || notes.length > 1) {
			throw new Error("Nightly recovery artifact identities are ambiguous.");
		}
		if (bundle.length === 1 && notes.length === 1) {
			candidates.push({ attempt: previous, bundle: bundle[0], notes: notes[0] });
		}
	}
	const candidate = candidates[0];
	if (candidate === undefined) {
		if (hasPublicState) {
			throw new Error("Staged or published nightly has no retained complete evidence; refusing to rebuild.");
		}
		return null;
	}
	for (const artifact of [candidate.bundle, candidate.notes]) {
		if (artifact.expired !== false || !Number.isSafeInteger(artifact.id) || artifact.id < 1 ||
			!/^sha256:[0-9a-f]{64}$/u.test(artifact.digest)) {
			throw new Error("Original nightly evidence is expired or lacks a verifiable artifact digest.");
		}
	}
	return Object.freeze(candidate);
}

/** Verifies restored bytes against immutable source identity before any release writer. */
export async function verifyRestoredNightlyBundle(directory, planValue, sourceManifest) {
	const plan = validateNightlyPlan(planValue);
	const manifest = nightlyPackageManifest(sourceManifest, plan);
	const tarball = `tryagaindev-litefold-calendar-${plan.version}.tgz`;
	const ordered = [tarball, "package-verification.json", "sbom.spdx.json", "LICENSE"];
	const expected = [...ordered, "SHA256SUMS"].sort();
	const actual = (await readdir(directory)).sort();
	if (JSON.stringify(actual) !== JSON.stringify(expected)) {
		throw new Error("Restored nightly evidence must contain exactly five files.");
	}
	const files = new Map();
	for (const name of expected) {
		const path = join(directory, name);
		const metadata = await lstat(path);
		if (!metadata.isFile() || metadata.isSymbolicLink()) {
			throw new Error("Restored nightly evidence must contain regular files only.");
		}
		files.set(name, await readFile(path));
	}
	const digest = (bytes, algorithm = "sha256", encoding = "hex") => createHash(algorithm).update(bytes).digest(encoding);
	const checksums = ordered.map((name) => `${digest(files.get(name))}  ${name}\n`).join("");
	if (files.get("SHA256SUMS").toString("utf8") !== checksums) {
		throw new Error("Restored nightly evidence checksums do not match its retained bytes.");
	}
	const receipt = JSON.parse(files.get("package-verification.json"));
	if (receipt.schemaVersion !== 2 || receipt.name !== NIGHTLY_PACKAGE || receipt.version !== plan.version ||
		receipt.sourceVersion !== plan.baseVersion || receipt.sourceCommit !== plan.sourceCommit ||
		receipt.sourceTreeDirty !== false || receipt.manifestTransform !== "version-only" ||
		JSON.stringify(validateNightlyPlan(receipt.nightly)) !== JSON.stringify(plan) ||
		receipt.sourceManifestSha256 !== digest(JSON.stringify(sourceManifest)) ||
		receipt.publishedManifestSha256 !== digest(JSON.stringify(manifest)) ||
		receipt.sha256 !== digest(files.get(tarball)) ||
		receipt.npmIntegrity !== `sha512-${digest(files.get(tarball), "sha512", "base64")}` ||
		receipt.browserTargets?.resolvedAt !== plan.createdAt.slice(0, 10) ||
		receipt.browserTargets?.query !== "baseline-widely-available" ||
		receipt.browserTargets?.dataVersions?.vite !== sourceManifest.devDependencies?.vite ||
		receipt.browserTargets?.dataVersions?.esbuild !== sourceManifest.devDependencies?.esbuild ||
		receipt.browserTargets?.effectiveQuery !== `Vite ${sourceManifest.devDependencies?.vite}: baseline-widely-available` ||
		receipt.browserTargetsSha256 !== digest(JSON.stringify(receipt.browserTargets))) {
		throw new Error("Restored nightly receipt differs from its exact source, plan, or artifact bytes.");
	}
	return receipt;
}
