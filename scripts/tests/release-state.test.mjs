import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import { mkdtemp, readFile, rename, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { promisify } from "node:util";

import { parseReleaseVerificationArguments } from "../check-release-ready.mjs";
import {
	createPreparedReleaseTexts,
	inspectGitReleaseState,
	readReleaseStateTexts,
	validatePreparedReleaseState,
	writeReleaseFilesAtomically
} from "../lib/release-state.mjs";
import { parsePrepareReleaseArguments } from "../prepare-release.mjs";

const execFileAsync = promisify(execFile);

function fixture(overrides = {}) {
	const version = overrides.version ?? "0.2.0-alpha.0";
	const packageJson = {
		name: "@tryagaindev/litefold-calendar",
		version,
		private: false,
		repository: {
			type: "git",
			url: "git+https://github.com/tryagaindev/litefold-calendar.git"
		},
		publishConfig: { access: "public", provenance: true, tag: "alpha" }
	};
	const packageLock = {
		name: packageJson.name,
		version,
		lockfileVersion: 3,
		packages: { "": { name: packageJson.name, version } }
	};
	return {
		changelog: overrides.changelog ?? [
			"# Changelog",
			"",
			"## [Unreleased]",
			"",
			"### Added",
			"",
			"- Added a useful feature.",
			"",
			"## [0.2.0-alpha.0] - 2026-08-25",
			"",
			"- Added the previous feature.",
			""
		].join("\n"),
		packageJson: `${JSON.stringify(packageJson, null, 2)}\n`,
		packageLock: `${JSON.stringify(packageLock, null, 2)}\n`
	};
}

void test("release preparation updates the manifests and rotates changelog notes", () => {
	for (const [bump, expectedVersion] of [
		["prerelease", "0.2.0-alpha.1"],
		["prepatch", "0.2.1-alpha.0"],
		["preminor", "0.3.0-alpha.0"]
	]) {
		const prepared = createPreparedReleaseTexts(fixture(), {
			bump,
			date: "2026-08-26"
		});
		const state = readReleaseStateTexts(prepared.texts);
		assert.equal(prepared.version, expectedVersion);
		assert.equal(state.packageJson.version, expectedVersion);
		assert.equal(state.packageLock.version, expectedVersion);
		assert.equal(state.packageLock.packages[""].version, expectedVersion);
		assert.match(state.changelog.releases[0].body, /Added a useful feature/u);
		assert.doesNotMatch(state.changelog.unreleased.body, /Added a useful feature/u);
		assert.deepEqual(validatePreparedReleaseState(state), {
			tag: `v${expectedVersion}`,
			version: expectedVersion
		});
	}
});

void test("release preparation rejects placeholders and inconsistent state", () => {
	for (const placeholder of ["- TODO", "- TBD: write the release note", "- <!-- add changes -->"]) {
		const texts = fixture({
			changelog: fixture().changelog.replace("- Added a useful feature.", placeholder)
		});
		assert.throws(
			() => createPreparedReleaseTexts(texts, { bump: "prerelease", date: "2026-08-26" }),
			/meaningful bullet/u
		);
	}
	assert.throws(
		() => createPreparedReleaseTexts(fixture({ version: "0.1.0-alpha.0" }), {
			bump: "prerelease",
			date: "2026-08-26"
		}),
		/package version.*newest dated changelog release/iu
	);
	const prepared = createPreparedReleaseTexts(fixture(), {
		bump: "prerelease",
		date: "2026-08-26"
	});
	prepared.texts.packageLock = prepared.texts.packageLock.replace(
		'"version": "0.2.0-alpha.1"',
		'"version": "0.2.0-alpha.0"'
	);
	assert.throws(
		() => validatePreparedReleaseState(readReleaseStateTexts(prepared.texts)),
		/version fields must match/u
	);
});

void test("atomic release writes restore originals after a replacement failure", async (context) => {
	const repositoryRoot = await mkdtemp(join(tmpdir(), "lfc-release-state-test-"));
	context.after(() => rm(repositoryRoot, { force: true, recursive: true }));
	const original = fixture();
	const prepared = createPreparedReleaseTexts(original, {
		bump: "prerelease",
		date: "2026-08-26"
	});
	await Promise.all([
		writeFile(join(repositoryRoot, "CHANGELOG.md"), original.changelog, "utf8"),
		writeFile(join(repositoryRoot, "package-lock.json"), original.packageLock, "utf8"),
		writeFile(join(repositoryRoot, "package.json"), original.packageJson, "utf8")
	]);
	let renameCount = 0;
	await assert.rejects(
		writeReleaseFilesAtomically(repositoryRoot, original, prepared.texts, {
			rename: async (...arguments_) => {
				renameCount += 1;
				if (renameCount === 4) {
					throw new Error("simulated rename failure");
				}
				await rename(...arguments_);
			}
		}),
		/simulated rename failure/u
	);
	assert.deepEqual({
		changelog: await readFile(join(repositoryRoot, "CHANGELOG.md"), "utf8"),
		packageJson: await readFile(join(repositoryRoot, "package.json"), "utf8"),
		packageLock: await readFile(join(repositoryRoot, "package-lock.json"), "utf8")
	}, original);
});

void test("release CLI parsers expose preparation and local verification modes", () => {
	assert.deepEqual(
		parsePrepareReleaseArguments(["--bump", "preminor", "--dry-run", "--json"]),
		{ bump: "preminor", dryRun: true, json: true }
	);
	assert.deepEqual(
		parseReleaseVerificationArguments([
			"--version", "0.3.0-alpha.0",
			"--commit", "a".repeat(40),
			"--tag-state", "absent",
			"--require-clean",
			"--json"
		]),
		{
			expectedCommit: "a".repeat(40),
			expectedVersion: "0.3.0-alpha.0",
			json: true,
			requireClean: true,
			tagState: "absent"
		}
	);
	assert.throws(() => parseReleaseVerificationArguments(["--online"]), /Usage/u);
});

void test("Git verification binds an existing tag to the current commit", async (context) => {
	const repositoryRoot = await mkdtemp(join(tmpdir(), "lfc-release-git-test-"));
	context.after(() => rm(repositoryRoot, { force: true, recursive: true }));
	const git = (...arguments_) => execFileAsync("git", arguments_, { cwd: repositoryRoot });
	await git("init", "--initial-branch=main");
	await git("config", "user.name", "Release Test");
	await git("config", "user.email", "release-test@example.invalid");
	await git("remote", "add", "origin", "https://github.com/tryagaindev/litefold-calendar.git");
	await writeFile(join(repositoryRoot, "fixture.txt"), "fixture\n", "utf8");
	await git("add", "fixture.txt");
	await git("commit", "-m", "test fixture");
	await git("tag", "v0.3.0-alpha.0");
	const state = await inspectGitReleaseState(repositoryRoot, {
		tag: "v0.3.0-alpha.0",
		tagState: "matching"
	});
	assert.equal(state.tagExists, true);
	await assert.rejects(
		inspectGitReleaseState(repositoryRoot, {
			tag: "v0.3.0-alpha.0",
			tagState: "absent"
		}),
		/already exists/u
	);
});
