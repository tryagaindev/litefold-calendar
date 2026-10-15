import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { access, copyFile, mkdtemp, mkdir, readFile, rename, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";

import { finalizeScreenshotCapture, prepareScreenshots, replaceScreenshotBatch, validateScreenshotBatch,
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

void test("CI candidate preparation builds and captures without verifying canonical freshness", async () => {
	const calls = [];
	const options = { candidate: true, ci: true, checkCurrent: async () => false,
		build: async () => { calls.push("build"); },
		capture: async (mode) => { calls.push(mode); },
		verify: async () => { throw new Error("Canonical evidence must stay stale."); } };
	assert.equal(await prepareScreenshots(options), "candidate");
	assert.deepEqual(calls, ["build", { candidate: true }]);
	calls.length = 0;
	assert.equal(await prepareScreenshots({ ...options, checkCurrent: async () => true }), "current");
	assert.deepEqual(calls, []);
	assert.equal(await prepareScreenshots({ ...options, force: true,
		checkCurrent: async () => { throw new Error("Forced capture must not check freshness."); } }), "candidate");
	assert.deepEqual(calls, ["build", { candidate: true }]);
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

async function hashFile(path) {
	return createHash("sha256").update(await readFile(path)).digest("hex");
}

async function captureFixture(t, { changed = false } = {}) {
	const f = await fixture(t);
	const previousManifest = structuredClone(f.manifest);
	for (const scene of previousManifest.scenes) {
		scene.sha256 = await hashFile(join(f.canonical, `${scene.id}.png`));
		if (!changed || scene.id !== "one") {
			await copyFile(join(f.canonical, `${scene.id}.png`), join(f.staging, `${scene.id}.png`));
		}
	}
	for (const scene of f.manifest.scenes) {
		scene.sha256 = await hashFile(join(f.staging, `${scene.id}.png`));
	}
	f.manifest.sourceFingerprint = "captured-source";
	const options = { cacheDirectory: join(f.root, "cache"), stagingDirectory: f.staging,
		screenshotDirectory: f.canonical, manifestPath: f.manifestPath, previousManifest,
		manifest: f.manifest, readDimensions: async () => ({ width: 390, height: 844 }), hashFile,
		computeSourceFingerprint: async () => f.manifest.sourceFingerprint };
	return { ...f, options };
}

void test("CI candidates retain complete changed and unchanged galleries without replacing canonical files", async (t) => {
	for (const changed of [false, true]) {
		const f = await captureFixture(t, { changed });
		let replacements = 0;
		const { directory, review } = await finalizeScreenshotCapture({ ...f.options,
			candidate: true, ci: true, replaceBatch: async () => { replacements++; } });
		assert.equal(replacements, 0);
		assert.equal(directory, join(f.options.cacheDirectory, "candidate"));
		assert.deepEqual(review.changed, changed ? ["one"] : []);
		assert.equal(await readFile(f.manifestPath, "utf8"), "old manifest");
		assert.deepEqual(JSON.parse(await readFile(join(directory, "screenshots.manifest.json"), "utf8")), f.manifest);
		assert.deepEqual(JSON.parse(await readFile(join(directory, "changes.json"), "utf8")), review);
		for (const scene of f.manifest.scenes) {
			const filename = `${scene.id}.png`;
			assert.equal(await readFile(join(f.canonical, filename), "utf8"), `old ${filename}`);
			assert.equal(await readFile(join(directory, "before", filename), "utf8"), `old ${filename}`);
			assert.equal(await hashFile(join(directory, "after", filename)), scene.sha256);
			assert.equal(review.scenes.find((capture) => capture.id === scene.id).after, `after/${filename}`);
		}
	}
});

void test("CI rejects canonical finalization before writing a gallery or replacing evidence", async (t) => {
	const f = await captureFixture(t);
	let replacements = 0;
	await assert.rejects(finalizeScreenshotCapture({ ...f.options, ci: true,
		replaceBatch: async () => { replacements++; } }), /canonical captures can only be prepared locally/u);
	assert.equal(replacements, 0);
	assert.equal(await readFile(f.manifestPath, "utf8"), "old manifest");
	await assert.rejects(access(join(f.options.cacheDirectory, "review")), { code: "ENOENT" });
});

void test("source drift and invalid batches do not publish candidate evidence or replace canonical files", async (t) => {
	for (const invalidBatch of [false, true]) {
		const f = await captureFixture(t, { changed: true });
		await assert.rejects(finalizeScreenshotCapture({ ...f.options, candidate: true, ci: true,
			...(invalidBatch ? { hashFile: async () => "incorrect-hash" } :
				{ computeSourceFingerprint: async () => "modified-source" }) }),
		invalidBatch ? /SHA-256/u : /sources changed during capture/u);
		assert.equal(await readFile(f.manifestPath, "utf8"), "old manifest");
		assert.equal(await readFile(join(f.canonical, "one.png"), "utf8"), "old one.png");
		assert.equal(await readFile(join(f.staging, "one.png"), "utf8"), "new one.png");
		await assert.rejects(access(join(f.options.cacheDirectory, "candidate")), { code: "ENOENT" });
	}
});
