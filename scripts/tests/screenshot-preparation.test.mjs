import assert from "node:assert/strict";
import { mkdtemp, mkdir, readFile, rename, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";

import { prepareScreenshots, replaceScreenshotBatch, validateScreenshotBatch,
	writeScreenshotReview } from "../lib/screenshot-preparation.mjs";

void test("current evidence skips builds and capture; stale evidence builds once before capture", async () => {
	const calls = [];
	const options = { checkCurrent: async () => true, ci: false,
		build: async () => { calls.push("build"); }, capture: async () => { calls.push("capture"); },
		verify: async () => { calls.push("verify"); } };
	assert.equal(await prepareScreenshots(options), "current");
	assert.deepEqual(calls, []);
	assert.equal(await prepareScreenshots({ ...options, checkCurrent: async () => false }), "updated");
	assert.deepEqual(calls, ["build", "capture", "verify"]);
});

void test("CI cannot accept stale or forced evidence, and failed builds never capture", async () => {
	let captures = 0;
	const options = { checkCurrent: async () => false, ci: true,
		build: async () => { throw new Error("build failed"); },
		capture: async () => { captures++; }, verify: async () => {} };
	await assert.rejects(prepareScreenshots(options), /CI cannot accept/u);
	await assert.rejects(prepareScreenshots({ ...options, force: true }), /CI cannot accept/u);
	await assert.rejects(prepareScreenshots({ ...options, ci: false }), /build failed/u);
	assert.equal(captures, 0);
});

async function fixture(t) {
	const root = await mkdtemp(join(tmpdir(), "calendar-screenshots-"));
	t.after(() => rm(root, { recursive: true, force: true }));
	const canonical = join(root, "canonical");
	const staging = join(root, "staging");
	await mkdir(canonical);
	await mkdir(staging);
	const manifestPath = join(root, "manifest.json");
	await writeFile(manifestPath, "old manifest");
	for (const name of ["one.png", "two.png"]) {
		await writeFile(join(canonical, name), `old ${name}`);
		await writeFile(join(staging, name), `new ${name}`);
	}
	const manifest = { scenes: ["one", "two"].map((id) => ({ id,
		output: `docs/screenshots/${id}.png`, viewport: { width: 390, height: 844 },
		alt: `Calendar scene ${id}`, sha256: `new-${id}` })) };
	return { root, canonical, staging, manifestPath, manifest };
}

void test("failed replacement restores all old images and manifest", async (t) => {
	const f = await fixture(t);
	await assert.rejects(replaceScreenshotBatch({ stagingDirectory: f.staging,
		screenshotDirectory: f.canonical, manifestPath: f.manifestPath, manifest: f.manifest,
		renameFile: async (from, to) => {
			if (from === join(f.staging, "two.png")) { throw new Error("disk failure"); }
			await rename(from, to);
		} }), /disk failure/u);
	assert.equal(await readFile(f.manifestPath, "utf8"), "old manifest");
	for (const name of ["one.png", "two.png"]) {
		assert.equal(await readFile(join(f.canonical, name), "utf8"), `old ${name}`);
	}
});

void test("successful replacement commits manifest after the complete image batch", async (t) => {
	const f = await fixture(t);
	await replaceScreenshotBatch({ stagingDirectory: f.staging, screenshotDirectory: f.canonical,
		manifestPath: f.manifestPath, manifest: f.manifest, renameFile: async (from, to) => {
			if (to === f.manifestPath) {
				assert.equal(await readFile(join(f.canonical, "two.png"), "utf8"), "new two.png");
			}
			await rename(from, to);
		} });
	assert.deepEqual(JSON.parse(await readFile(f.manifestPath, "utf8")), f.manifest);
});

void test("batch validation rejects incomplete or mismatched captures before replacement", async (t) => {
	const f = await fixture(t);
	await assert.rejects(validateScreenshotBatch({ directory: f.staging, manifest: f.manifest,
		readDimensions: async () => ({ width: 390, height: 844 }),
		hashFile: async () => "wrong-hash" }), /SHA-256/u);
	assert.equal(await readFile(f.manifestPath, "utf8"), "old manifest");
});

void test("review gallery records changed scenes and preserves before and after bytes", async (t) => {
	const f = await fixture(t);
	const review = join(f.root, "review");
	const previousManifest = structuredClone(f.manifest);
	previousManifest.scenes[0].sha256 = "old-one";
	const report = await writeScreenshotReview({ directory: review, beforeDirectory: f.canonical,
		afterDirectory: f.staging, manifest: f.manifest, previousManifest });
	assert.deepEqual(report.changed, ["one"]);
	assert.equal(await readFile(join(review, "before", "one.png"), "utf8"), "old one.png");
	assert.equal(await readFile(join(review, "after", "one.png"), "utf8"), "new one.png");
	assert.match(await readFile(join(review, "index.html"), "utf8"), /Before: Calendar scene one/u);
});
