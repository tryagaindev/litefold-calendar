import assert from "node:assert/strict";
import { mkdir, mkdtemp, readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import test from "node:test";

import {
	cleanupArtifactWorkspace,
	createArtifactWorkspace,
	finalizeArtifactWorkspace,
	parseReleaseArguments,
	releaseBundleDirectoryName
} from "../lib/release-artifacts.mjs";

async function createRepository() {
	return mkdtemp(join(tmpdir(), "lfc-release-artifacts-test-"));
}

void test("release arguments accept only one optional verify-only flag", () => {
	assert.deepEqual(parseReleaseArguments([]), { verifyOnly: false });
	assert.deepEqual(parseReleaseArguments(["--verify-only"]), { verifyOnly: true });
	assert.throws(() => parseReleaseArguments(["--unknown"]), /Usage/u);
	assert.throws(
		() => parseReleaseArguments(["--verify-only", "--verify-only"]),
		/at most once/u
	);
});

void test("bundle directory names are versioned and filesystem-safe", () => {
	assert.equal(
		releaseBundleDirectoryName("litefold-calendar", "0.1.0-alpha.0"),
		"litefold-calendar-0.1.0-alpha.0"
	);
	assert.equal(
		releaseBundleDirectoryName("@tryagaindev/litefold-calendar", "0.1.0-alpha.1"),
		"tryagaindev-litefold-calendar-0.1.0-alpha.1"
	);
});

void test("transient verification never reads or changes retained artifacts", async (context) => {
	const repositoryRoot = await createRepository();
	context.after(async () => cleanupArtifactWorkspace({ cleanupDirectory: repositoryRoot }));
	const artifactRoot = join(repositoryRoot, ".artifacts");
	await mkdir(artifactRoot);
	const sentinelPath = join(artifactRoot, "legacy-sentinel.txt");
	await writeFile(sentinelPath, "retained bytes\n", "utf8");

	const workspace = await createArtifactWorkspace({
		artifactRoot,
		bundleDirectoryName: "litefold-calendar-0.1.0-alpha.0",
		repositoryRoot,
		verifyOnly: true
	});
	assert.notEqual(workspace.artifactDirectory, artifactRoot);
	await writeFile(join(workspace.artifactDirectory, "temporary.txt"), "temporary\n", "utf8");
	await cleanupArtifactWorkspace(workspace);

	assert.equal(await readFile(sentinelPath, "utf8"), "retained bytes\n");
	await assert.rejects(readFile(join(workspace.artifactDirectory, "temporary.txt")), /ENOENT/u);
});

void test("persistent bundles finalize once and preserve older versions", async (context) => {
	const repositoryRoot = await createRepository();
	context.after(async () => cleanupArtifactWorkspace({ cleanupDirectory: repositoryRoot }));
	const artifactRoot = join(repositoryRoot, ".artifacts");
	const firstName = "litefold-calendar-0.1.0-alpha.0";
	let workspace = await createArtifactWorkspace({
		artifactRoot,
		bundleDirectoryName: firstName,
		repositoryRoot,
		verifyOnly: false
	});
	await writeFile(join(workspace.artifactDirectory, "bundle.txt"), "first bytes\n", "utf8");
	workspace = await finalizeArtifactWorkspace(workspace);
	assert.equal(await readFile(join(workspace.artifactDirectory, "bundle.txt"), "utf8"), "first bytes\n");
	await cleanupArtifactWorkspace(workspace);
	assert.equal(await readFile(join(workspace.artifactDirectory, "bundle.txt"), "utf8"), "first bytes\n");

	await assert.rejects(
		createArtifactWorkspace({
			artifactRoot,
			bundleDirectoryName: firstName,
			repositoryRoot,
			verifyOnly: false
		}),
		/will not be replaced/u
	);
	assert.equal(
		await readFile(join(artifactRoot, firstName, "bundle.txt"), "utf8"),
		"first bytes\n"
	);

	const secondName = "litefold-calendar-0.1.0-alpha.1";
	let secondWorkspace = await createArtifactWorkspace({
		artifactRoot,
		bundleDirectoryName: secondName,
		repositoryRoot,
		verifyOnly: false
	});
	await writeFile(join(secondWorkspace.artifactDirectory, "bundle.txt"), "second bytes\n", "utf8");
	secondWorkspace = await finalizeArtifactWorkspace(secondWorkspace);
	assert.equal(
		await readFile(join(secondWorkspace.artifactDirectory, "bundle.txt"), "utf8"),
		"second bytes\n"
	);
});

void test("post-commit reservation cleanup failures preserve the final bundle and block retries", async (context) => {
	const repositoryRoot = await createRepository();
	context.after(async () => cleanupArtifactWorkspace({ cleanupDirectory: repositoryRoot }));
	const artifactRoot = join(repositoryRoot, ".artifacts");
	const bundleDirectoryName = "litefold-calendar-0.1.0-alpha.0";
	const workspace = await createArtifactWorkspace({
		artifactRoot,
		bundleDirectoryName,
		repositoryRoot,
		verifyOnly: false
	});
	await writeFile(join(workspace.artifactDirectory, "bundle.txt"), "committed bytes\n", "utf8");
	const finalized = await finalizeArtifactWorkspace(workspace, {
		removeReservation: () => {
			throw new Error("simulated reservation handle");
		}
	});
	assert.equal(
		await readFile(join(finalized.artifactDirectory, "bundle.txt"), "utf8"),
		"committed bytes\n"
	);
	assert.match(finalized.reservationCleanupWarning, /committed.*manual review.*simulated/u);
	await assert.rejects(
		createArtifactWorkspace({
			artifactRoot,
			bundleDirectoryName,
			repositoryRoot,
			verifyOnly: false
		}),
		/Incomplete release staging directory/u
	);
});

void test("persistent packaging rejects legacy files and incomplete staging directories", async (context) => {
	const repositoryRoot = await createRepository();
	context.after(async () => cleanupArtifactWorkspace({ cleanupDirectory: repositoryRoot }));
	const artifactRoot = join(repositoryRoot, ".artifacts");
	await mkdir(artifactRoot);
	await writeFile(join(artifactRoot, "SHA256SUMS"), "legacy\n", "utf8");

	await assert.rejects(
		createArtifactWorkspace({
			artifactRoot,
			bundleDirectoryName: "litefold-calendar-0.1.0-alpha.0",
			repositoryRoot,
			verifyOnly: false
		}),
		/legacy or linked artifact entry/u
	);

	await cleanupArtifactWorkspace({ cleanupDirectory: artifactRoot });
	await mkdir(join(artifactRoot, ".staging-interrupted"), { recursive: true });
	await assert.rejects(
		createArtifactWorkspace({
			artifactRoot,
			bundleDirectoryName: "litefold-calendar-0.1.0-alpha.0",
			repositoryRoot,
			verifyOnly: false
		}),
		/Incomplete release staging directory/u
	);
});

void test("persistent packaging rejects non-directory artifact roots", async (context) => {
	const repositoryRoot = await createRepository();
	context.after(async () => cleanupArtifactWorkspace({ cleanupDirectory: repositoryRoot }));
	const artifactRoot = join(repositoryRoot, ".artifacts");
	await writeFile(artifactRoot, "not a directory\n", "utf8");

	await assert.rejects(
		createArtifactWorkspace({
			artifactRoot,
			bundleDirectoryName: "litefold-calendar-0.1.0-alpha.0",
			repositoryRoot,
			verifyOnly: false
		}),
		/non-directory or linked artifact root/u
	);
});

void test("a finalization collision preserves both the retained bundle and staging workspace", async (context) => {
	const repositoryRoot = await createRepository();
	context.after(async () => cleanupArtifactWorkspace({ cleanupDirectory: repositoryRoot }));
	const artifactRoot = join(repositoryRoot, ".artifacts");
	const bundleDirectoryName = "litefold-calendar-0.1.0-alpha.0";
	const workspace = await createArtifactWorkspace({
		artifactRoot,
		bundleDirectoryName,
		repositoryRoot,
		verifyOnly: false
	});
	await writeFile(join(workspace.artifactDirectory, "candidate.txt"), "candidate\n", "utf8");
	await mkdir(workspace.finalDirectory);
	await writeFile(join(workspace.finalDirectory, "retained.txt"), "retained\n", "utf8");

	await assert.rejects(finalizeArtifactWorkspace(workspace), /will not be replaced/u);
	assert.equal(await readFile(join(workspace.finalDirectory, "retained.txt"), "utf8"), "retained\n");
	assert.equal(await readFile(join(workspace.artifactDirectory, "candidate.txt"), "utf8"), "candidate\n");
	await cleanupArtifactWorkspace(workspace);
	assert.equal(await readFile(join(workspace.finalDirectory, "retained.txt"), "utf8"), "retained\n");
});
