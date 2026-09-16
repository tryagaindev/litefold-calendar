import assert from "node:assert/strict";
import test from "node:test";
import { createHash } from "node:crypto";
import { mkdtemp, readFile, writeFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { createNightlyPlan, nightlyPackageManifest, validateNightlyPlan,
	validateNightlyRegistryState, selectNightlyRecoveryArtifacts, verifyRestoredNightlyBundle } from "../lib/nightly-release.mjs";
import { validateDeploymentMetadata } from "../build-pages.mjs";
import { resolveBrowserTargets } from "../lib/browser-targets.mjs";

const INPUT = Object.freeze({ baseVersion: "0.6.0-nightly.0", createdAt: "2026-09-12T09:00:00Z",
	event: "workflow_dispatch", runId: "123456789", sourceCommit: "a".repeat(40) });
const PLAN = createNightlyPlan(INPUT);
const ALPHA = "0.5.0-alpha.0";
const PREVIOUS = "0.6.0-nightly.20260911090000.123456780";
const initialRegistry = () => ({ versions: [ALPHA], "dist-tags": { alpha: ALPHA, latest: ALPHA } });

void test("nightly versions derive from immutable run time and identity without attempt counters", () => {
	assert.equal(PLAN.version, "0.6.0-nightly.20260912090000.123456789");
	assert.deepEqual(createNightlyPlan({ ...INPUT }), PLAN);
	assert.notEqual(createNightlyPlan({ ...INPUT, runId: "123456790" }).version, PLAN.version);
	assert.equal(createNightlyPlan({ ...INPUT, event: "schedule" }).version, PLAN.version);
});

void test("nightly plans reject mutable, malformed, stable, and arbitrary-ref inputs", () => {
	for (const invalid of [{ baseVersion: "0.6.0" }, { baseVersion: "0.6.0-alpha.0" },
		{ createdAt: "2026-02-30T09:00:00Z" }, { createdAt: "2026-09-12T02:00:00-07:00" },
		{ runId: 123 }, { runId: "01" }, { runId: "9007199254740992" }, { sourceCommit: "main" }, { event: "push" }]) {
		assert.throws(() => createNightlyPlan({ ...INPUT, ...invalid }));
	}
	assert.throws(() => validateNightlyPlan({ ...PLAN, version: "0.6.0" }));
	assert.throws(() => validateNightlyPlan({ ...PLAN, workflow: ".github/workflows/other.yml" }));
	assert.throws(() => validateNightlyPlan({ ...PLAN, attempt: 2 }));
});

void test("nightly package staging changes only version and never mutates source manifest", () => {
	const source = { name: PLAN.name, version: INPUT.baseVersion, private: false,
		publishConfig: { access: "public", provenance: true, tag: "nightly" }, files: ["dist"] };
	const before = structuredClone(source);
	assert.deepEqual(nightlyPackageManifest(source, PLAN), { ...before, version: PLAN.version });
	assert.deepEqual(source, before);
	assert.throws(() => nightlyPackageManifest({ ...source, version: "0.7.0-nightly.0" }, PLAN));
	assert.throws(() => nightlyPackageManifest({ ...source, publishConfig: { tag: "latest" } }, PLAN));
});

void test("first nightly preserves historical alpha and identifies its published predecessor", () => {
	assert.deepEqual(validateNightlyRegistryState(initialRegistry(), PLAN), {
		existing: false, latest: ALPHA, predecessor: ALPHA, stableExists: false
	});
});

void test("ordinary nightlies advance only nightly while historical alpha keeps latest", () => {
	const metadata = { versions: [ALPHA, PREVIOUS], "dist-tags": { alpha: ALPHA, nightly: PREVIOUS, latest: ALPHA } };
	assert.equal(validateNightlyRegistryState(metadata, PLAN).predecessor, PREVIOUS);
	assert.equal(validateNightlyRegistryState(metadata, PLAN).latest, ALPHA);
	assert.throws(() => validateNightlyRegistryState({ ...metadata,
		"dist-tags": { ...metadata["dist-tags"], latest: PREVIOUS } }, PLAN), /frozen historical alpha/u);
	assert.throws(() => validateNightlyRegistryState({ ...metadata,
		versions: [...metadata.versions, "0.7.0-nightly.20260912090000.123456790"] }, PLAN), /advance/u);
});

void test("exact candidate resumes after publication with latest still on historical alpha", () => {
	const metadata = { versions: [ALPHA, PLAN.version], "dist-tags": { alpha: ALPHA, nightly: PLAN.version, latest: ALPHA } };
	assert.equal(validateNightlyRegistryState(metadata, PLAN).existing, true);
	metadata["dist-tags"].latest = PLAN.version;
	assert.throws(() => validateNightlyRegistryState(metadata, PLAN), /frozen historical alpha/u);
	metadata["dist-tags"].latest = ALPHA;
	delete metadata["dist-tags"].nightly;
	assert.throws(() => validateNightlyRegistryState(metadata, PLAN), /not selected/u);
});

void test("any stable publication permanently reserves latest for stable", () => {
	const plan = createNightlyPlan({ ...INPUT, baseVersion: "1.1.0-nightly.0" });
	const metadata = { versions: [ALPHA, "1.0.0"], "dist-tags": { alpha: ALPHA, latest: "1.0.0" } };
	assert.equal(validateNightlyRegistryState(metadata, plan).stableExists, true);
	metadata["dist-tags"].latest = ALPHA;
	assert.throws(() => validateNightlyRegistryState(metadata, plan), /belongs to stable/u);
});

void test("missing and malformed registry evidence cannot become an empty release history", () => {
	for (const metadata of [null, {}, { versions: [], "dist-tags": {} },
		{ versions: [ALPHA], "dist-tags": { latest: "missing" } },
		{ versions: ["bad"], "dist-tags": { alpha: "bad", latest: "bad" } }]) {
		assert.throws(() => validateNightlyRegistryState(metadata, PLAN));
	}
});

void test("nightly cannot adopt another prerelease tag as the frozen pre-stable latest", () => {
	const metadata = initialRegistry();
	delete metadata["dist-tags"].alpha;
	metadata["dist-tags"].nightly = PREVIOUS;
	metadata.versions.push(PREVIOUS);
	assert.throws(() => validateNightlyRegistryState(metadata, PLAN), /frozen historical alpha/u);
	metadata["dist-tags"].alpha = PREVIOUS;
	metadata["dist-tags"].latest = PREVIOUS;
	assert.throws(() => validateNightlyRegistryState(metadata, PLAN), /frozen historical alpha/u);
});

void test("nightly Pages binds a generated package version to the exact source and receipt", () => {
	const metadata = { channel: "release", commit: PLAN.sourceCommit, version: PLAN.version };
	const receipt = { schemaVersion: 2, sourceTreeDirty: false, manifestTransform: "version-only",
		sourceVersion: PLAN.baseVersion, sourceCommit: PLAN.sourceCommit, version: PLAN.version, nightly: PLAN };
	assert.deepEqual(validateDeploymentMetadata(metadata, PLAN.baseVersion, receipt), metadata);
	for (const changed of [{ sourceCommit: "b".repeat(40) }, { sourceVersion: "0.7.0-nightly.0" },
		{ sourceTreeDirty: true }, { manifestTransform: "anything" }, { schemaVersion: 1 }]) {
		assert.throws(() => validateDeploymentMetadata(metadata, PLAN.baseVersion, { ...receipt, ...changed }));
	}
	assert.throws(() => validateDeploymentMetadata(metadata, PLAN.baseVersion));
});


void test("recovery selects the original complete same-run artifacts and never rebuilds public state", () => {
	const digest = `sha256:${"a".repeat(64)}`;
	const pair = (attempt) => [
		{ id: attempt * 2, name: `npm-release-bundle-v${PLAN.version}-${PLAN.runId}-${attempt}`, expired: false, digest },
		{ id: attempt * 2 + 1, name: `release-notes-v${PLAN.version}-${PLAN.runId}-${attempt}`, expired: false, digest }
	];
	const first = pair(1);
	const options = { artifacts: [...first, ...pair(2)], plan: PLAN, attempt: 3, hasPublicState: true };
	assert.deepEqual(selectNightlyRecoveryArtifacts(options), { attempt: 1, bundle: first[0], notes: first[1] });
	assert.equal(selectNightlyRecoveryArtifacts({ ...options, artifacts: [], hasPublicState: false }), null);
	assert.throws(() => selectNightlyRecoveryArtifacts({ ...options, artifacts: [] }), /refusing to rebuild/u);
	assert.throws(() => selectNightlyRecoveryArtifacts({ ...options, artifacts: [first[0]] }), /refusing to rebuild/u);
	assert.throws(() => selectNightlyRecoveryArtifacts({ ...options, artifacts: [...first, first[0]] }), /ambiguous/u);
	assert.throws(() => selectNightlyRecoveryArtifacts({ ...options, artifacts: [{ ...first[0], expired: true }, first[1]] }), /expired/u);
	assert.throws(() => selectNightlyRecoveryArtifacts({ ...options, artifacts: [{ ...first[0], digest: null }, first[1]] }), /digest/u);
	assert.throws(() => selectNightlyRecoveryArtifacts({ ...options, attempt: 1 }), /refusing to rebuild/u);
});

void test("restored bundle validation preserves bytes and rejects rewritten source, targets, and payload", async (context) => {
	const directory = await mkdtemp(join(tmpdir(), "lfc-retained-nightly-"));
	context.after(() => rm(directory, { recursive: true, force: true }));
	const hash = (value, algorithm = "sha256", encoding = "hex") => createHash(algorithm).update(value).digest(encoding);
	const targets = resolveBrowserTargets({ date: PLAN.createdAt.slice(0, 10) });
	const source = { name: PLAN.name, version: PLAN.baseVersion, private: false,
		devDependencies: { vite: targets.dataVersions.vite, esbuild: targets.dataVersions.esbuild },
		publishConfig: { access: "public", provenance: true, tag: "nightly" } };
	const bytes = Buffer.from("the original already verified tarball");
	const tarball = `tryagaindev-litefold-calendar-${PLAN.version}.tgz`;
	const receipt = { schemaVersion: 2, name: PLAN.name, version: PLAN.version,
		sourceVersion: PLAN.baseVersion, sourceCommit: PLAN.sourceCommit, sourceTreeDirty: false,
		manifestTransform: "version-only", nightly: PLAN,
		sourceManifestSha256: hash(JSON.stringify(source)),
		publishedManifestSha256: hash(JSON.stringify(nightlyPackageManifest(source, PLAN))),
		sha256: hash(bytes), npmIntegrity: `sha512-${hash(bytes, "sha512", "base64")}`,
		browserTargets: targets, browserTargetsSha256: hash(JSON.stringify(targets)) };
	async function writeBundle(changes = {}, payload = bytes) {
		const files = new Map([[tarball, payload], ["package-verification.json", JSON.stringify({ ...receipt, ...changes })],
			["sbom.spdx.json", "{}"], ["LICENSE", "MIT"]]);
		for (const [name, value] of files) {
			await writeFile(join(directory, name), value);
		}
		await writeFile(join(directory, "SHA256SUMS"), [...files].map(([name, value]) => `${hash(value)}  ${name}\n`).join(""));
	}
	await writeBundle();
	assert.deepEqual(await verifyRestoredNightlyBundle(directory, PLAN, source), receipt);
	assert.deepEqual(await readFile(join(directory, tarball)), bytes);
	await writeFile(join(directory, tarball), "modified without checksum");
	await assert.rejects(verifyRestoredNightlyBundle(directory, PLAN, source), /checksums/u);
	for (const changes of [{ sourceCommit: "b".repeat(40) }, { sourceManifestSha256: "b".repeat(64) },
		{ nightly: { ...PLAN, runId: "999" } }, { browserTargets: { ...targets, resolvedAt: "2026-09-13" } },
		{ browserTargets: { ...targets, query: "baseline widely available" } },
		{ browserTargets: { ...targets, dataVersions: { ...targets.dataVersions, vite: "invalid" } } }]) {
		await writeBundle(changes);
		await assert.rejects(verifyRestoredNightlyBundle(directory, PLAN, source));
	}
	await writeBundle({}, Buffer.from("different payload with rewritten checksums"));
	await assert.rejects(verifyRestoredNightlyBundle(directory, PLAN, source), /receipt/u);
	await writeBundle();
	await writeFile(join(directory, "extra.txt"), "unexpected");
	await assert.rejects(verifyRestoredNightlyBundle(directory, PLAN, source), /exactly five/u);
});
