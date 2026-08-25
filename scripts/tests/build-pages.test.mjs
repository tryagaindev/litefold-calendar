import assert from "node:assert/strict";
import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { tmpdir } from "node:os";
import test from "node:test";

import { assemblePagesSnapshot } from "../assemble-pages.mjs";
import {
	assertNoRemoteRuntimeAssets,
	buildPagesArtifact,
	validateDeploymentMetadata
} from "../build-pages.mjs";
import { serializeExampleMetadata } from "../lib/example-metadata.mjs";
import { REPOSITORY_ROOT } from "../lib/process.mjs";

const FIRST_COMMIT = "0123456789abcdef0123456789abcdef01234567";
const SECOND_COMMIT = "89abcdef0123456789abcdef0123456789abcdef";
const WORKFLOW_PATH = join(REPOSITORY_ROOT, ".github", "workflows", "deploy-examples.yml");
const SHELL_DIRECTORY = join(REPOSITORY_ROOT, "scripts", "pages-site");

async function writeFixtureFile(root, path, contents) {
	const destination = join(root, ...path.split("/"));
	await mkdir(dirname(destination), { recursive: true });
	await writeFile(destination, contents, "utf8");
}

async function createSourceFixture(context, options = {}) {
	const {
		channel = "main",
		commit = FIRST_COMMIT,
		marker = "first",
		remoteAsset = false,
		version = "1.0.0"
	} = options;
	const root = await mkdtemp(join(tmpdir(), "lfc-pages-source-"));
	context.after(() => rm(root, { force: true, recursive: true }));
	await writeFixtureFile(root, "package.json", `${JSON.stringify({ version }, null, 2)}\n`);
	await writeFixtureFile(root, "dist/index.js", "export const ready = true;\n");
	await writeFixtureFile(root, "dist/internal/runtime.js", "export const runtime = true;\n");
	await writeFixtureFile(root, "dist/index.d.ts", "export declare const ready: true;\n");
	await writeFixtureFile(root, "dist/index.js.map", "{}\n");
	await writeFixtureFile(root, "dist/styles.css", ".calendar { display: block; }\n");
	await writeFixtureFile(root, "examples/index.html", [
		"<!doctype html>",
		'<html lang="en">',
		"<head>",
		'\t<meta charset="utf-8">',
		"\t<title>Examples</title>",
		"</head>",
		"<body>",
		"\t<h1>Examples</h1>",
		'\t<script type="module" src="./index.js"></script>',
		"</body>",
		"</html>",
		""
	].join("\n"));
	await writeFixtureFile(root, "examples/index.js", 'fetch("./metadata.json");\n');
	await writeFixtureFile(root, "examples/index.css", "body { margin: 0; }\n");
	await writeFixtureFile(root, "examples/metadata.json", serializeExampleMetadata({
		channel,
		commit,
		version
	}));
	await writeFixtureFile(root, "examples/README.md", "Authoring notes.\n");
	await writeFixtureFile(root, "examples/basic/main.ts", "export {};\n");
	await writeFixtureFile(root, "examples/basic/main.js", `export const marker = "${marker}";\n`);
	await writeFixtureFile(root, "examples/basic/index.html", [
		"<!doctype html>",
		'<html lang="en">',
		"<head>",
		'\t<meta charset="utf-8">',
		"\t<title>Basic example</title>",
		remoteAsset ? '\t<script src="https://cdn.invalid/tracker.js"></script>' : "",
		"</head>",
		"<body>",
		"\t<h1>Basic example</h1>",
		'\t<script type="module" src="./main.js"></script>',
		"</body>",
		"</html>",
		""
	].filter((line) => line.length > 0).join("\n"));
	return root;
}

async function buildFixtureArtifact(context, options = {}) {
	const repositoryRoot = await createSourceFixture(context, options);
	const outputDirectory = join(await mkdtemp(join(tmpdir(), "lfc-pages-artifact-parent-")), "artifact");
	context.after(() => rm(dirname(outputDirectory), { force: true, recursive: true }));
	await buildPagesArtifact({
		outputDirectory,
		repositoryRoot,
		shellDirectory: SHELL_DIRECTORY
	});
	return outputDirectory;
}

async function emptyPreviousDirectory(context) {
	const directory = await mkdtemp(join(tmpdir(), "lfc-pages-previous-"));
	context.after(() => rm(directory, { force: true, recursive: true }));
	return directory;
}

async function snapshotOutput(context) {
	const parent = await mkdtemp(join(tmpdir(), "lfc-pages-snapshot-parent-"));
	context.after(() => rm(parent, { force: true, recursive: true }));
	return join(parent, "snapshot");
}

void test("Pages staging includes only self-contained runtime assets and visible deployment identity", async (context) => {
	const artifact = await buildFixtureArtifact(context);
	const nestedHtml = await readFile(join(artifact, "content", "examples", "basic", "index.html"), "utf8");
	assert.match(nestedHtml, /Rolling main preview/u);
	assert.match(nestedHtml, new RegExp(FIRST_COMMIT, "u"));
	assert.match(nestedHtml, /href="\.\.\/\.\.\/deployment-details\.css"/u);
	assert.match(nestedHtml, /aria-label="Deployment details"/u);
	assert.match(nestedHtml, /http-equiv="Content-Security-Policy"/u);
	assert.match(nestedHtml, /default-src 'self'; base-uri 'none'; connect-src 'self'/u);
	assert.doesNotMatch(
		await readFile(join(artifact, "content", "examples", "index.html"), "utf8"),
		/lfc-deployment-details/u
	);
	assert.match(
		await readFile(join(artifact, "content", "examples", "index.html"), "utf8"),
		/http-equiv="Content-Security-Policy"/u
	);
	const landingHtml = await readFile(join(artifact, "content", "examples", "index.html"), "utf8");
	assert.ok(
		landingHtml.indexOf("Content-Security-Policy") < landingHtml.indexOf('<script type="module"'),
		"Content Security Policy must precede resource-bearing elements"
	);
	const shellHtml = await readFile(join(artifact, "shell", "index.html"), "utf8");
	assert.match(
		shellHtml,
		/http-equiv="Content-Security-Policy"/u
	);
	assert.ok(
		shellHtml.indexOf("Content-Security-Policy") < shellHtml.indexOf('<link rel="stylesheet"'),
		"Shell Content Security Policy must precede stylesheets"
	);
	assert.equal(await readFile(join(artifact, "content", "examples", "basic", "main.js"), "utf8"),
		'export const marker = "first";\n');
	await assert.rejects(readFile(join(artifact, "content", "examples", "README.md")), /ENOENT/u);
	await assert.rejects(readFile(join(artifact, "content", "examples", "basic", "main.ts")), /ENOENT/u);
	await assert.rejects(readFile(join(artifact, "content", "dist", "index.d.ts")), /ENOENT/u);
	await assert.rejects(readFile(join(artifact, "content", "dist", "index.js.map")), /ENOENT/u);
	assert.deepEqual(
		JSON.parse(await readFile(join(artifact, "channel.json"), "utf8")),
		{ channel: "main", commit: FIRST_COMMIT, version: "1.0.0" }
	);
});

void test("Pages staging rejects ambiguous identity and remote runtime assets", async (context) => {
	assert.throws(
		() => validateDeploymentMetadata({ channel: "local", commit: null, version: "1.0.0" }, "1.0.0"),
		/main or release/u
	);
	assert.throws(
		() => validateDeploymentMetadata({
			channel: "release",
			commit: FIRST_COMMIT,
			version: "1.0.1"
		}, "1.0.0"),
		/must match the package version/u
	);
	assert.throws(
		() => assertNoRemoteRuntimeAssets('fetch("https://tracker.invalid/hit");', "example.js"),
		/requests a remote runtime resource/u
	);
	assert.doesNotThrow(() => assertNoRemoteRuntimeAssets(
		'const namespace = "http://www.w3.org/2000/svg";\n',
		"example.js"
	));
	for (const [source, path] of [
		['import "https://cdn.invalid/module.js";', "example.js"],
		['<script src=https://cdn.invalid/script.js></script>', "example.html"],
		['<img srcset="./local.png 1x, https://cdn.invalid/image.png 2x" alt="">', "example.html"],
		['<base href="https://cdn.invalid/">', "example.html"],
		['<meta http-equiv="refresh" content="0; url=https://cdn.invalid/">', "example.html"],
		['.hero { background-image: image-set("https://cdn.invalid/image.png" 1x); }', "example.css"]
	]) {
		assert.throws(
			() => assertNoRemoteRuntimeAssets(source, path),
			/remote runtime/u,
			`${path} should reject ${source}`
		);
	}

	const repositoryRoot = await createSourceFixture(context, { remoteAsset: true });
	const output = await snapshotOutput(context);
	await assert.rejects(
		buildPagesArtifact({ outputDirectory: output, repositoryRoot, shellDirectory: SHELL_DIRECTORY }),
		/loads a remote runtime asset/u
	);
});

void test("retained snapshots preserve releases, replace main, and reject release overwrites", async (context) => {
	const empty = await emptyPreviousDirectory(context);
	const firstReleaseArtifact = await buildFixtureArtifact(context, {
		channel: "release",
		commit: FIRST_COMMIT,
		marker: "release-one",
		version: "1.0.0"
	});
	const firstSnapshot = await snapshotOutput(context);
	await assemblePagesSnapshot({
		channelDirectory: firstReleaseArtifact,
		outputDirectory: firstSnapshot,
		previousDirectory: empty
	});
	const immutableBytes = await readFile(
		join(firstSnapshot, "site", "releases", "1.0.0", "examples", "basic", "main.js"),
		"utf8"
	);

	const mainArtifact = await buildFixtureArtifact(context, {
		channel: "main",
		commit: SECOND_COMMIT,
		marker: "rolling-main",
		version: "1.1.0"
	});
	const mainSnapshot = await snapshotOutput(context);
	await assemblePagesSnapshot({
		channelDirectory: mainArtifact,
		outputDirectory: mainSnapshot,
		previousDirectory: join(firstSnapshot, "site")
	});
	assert.equal(
		await readFile(join(mainSnapshot, "site", "releases", "1.0.0", "examples", "basic", "main.js"), "utf8"),
		immutableBytes
	);
	assert.equal(
		await readFile(join(mainSnapshot, "site", "main", "examples", "basic", "main.js"), "utf8"),
		'export const marker = "rolling-main";\n'
	);
	const manifest = JSON.parse(await readFile(join(mainSnapshot, "site", "site-manifest.json"), "utf8"));
	assert.equal(manifest.main.commit, SECOND_COMMIT);
	assert.deepEqual(manifest.releases.map((entry) => entry.version), ["1.0.0"]);

	const changedReleaseArtifact = await buildFixtureArtifact(context, {
		channel: "release",
		commit: FIRST_COMMIT,
		marker: "changed-release-bytes",
		version: "1.0.0"
	});
	const rejectedSnapshot = await snapshotOutput(context);
	await assert.rejects(
		assemblePagesSnapshot({
			channelDirectory: changedReleaseArtifact,
			outputDirectory: rejectedSnapshot,
			previousDirectory: join(mainSnapshot, "site")
		}),
		/Immutable release 1\.0\.0 cannot be overwritten/u
	);
});

void test("exact release reruns are no-ops while later releases retain earlier paths", async (context) => {
	const empty = await emptyPreviousDirectory(context);
	const firstArtifact = await buildFixtureArtifact(context, {
		channel: "release",
		commit: FIRST_COMMIT,
		marker: "release-one",
		version: "1.0.0"
	});
	const firstSnapshot = await snapshotOutput(context);
	await assemblePagesSnapshot({
		channelDirectory: firstArtifact,
		outputDirectory: firstSnapshot,
		previousDirectory: empty
	});
	const rerunSnapshot = await snapshotOutput(context);
	await assemblePagesSnapshot({
		channelDirectory: firstArtifact,
		outputDirectory: rerunSnapshot,
		previousDirectory: join(firstSnapshot, "site")
	});

	const secondArtifact = await buildFixtureArtifact(context, {
		channel: "release",
		commit: SECOND_COMMIT,
		marker: "release-two",
		version: "2.0.0"
	});
	const secondSnapshot = await snapshotOutput(context);
	await assemblePagesSnapshot({
		channelDirectory: secondArtifact,
		outputDirectory: secondSnapshot,
		previousDirectory: join(rerunSnapshot, "site")
	});
	const manifest = JSON.parse(await readFile(join(secondSnapshot, "site", "site-manifest.json"), "utf8"));
	assert.deepEqual(manifest.releases.map((entry) => entry.version), ["2.0.0", "1.0.0"]);
	assert.equal(
		await readFile(join(secondSnapshot, "site", "releases", "1.0.0", "examples", "basic", "main.js"), "utf8"),
		'export const marker = "release-one";\n'
	);
});

void test("snapshot assembly rejects unexpected retained files and inconsistent manifests", async (context) => {
	const empty = await emptyPreviousDirectory(context);
	const releaseArtifact = await buildFixtureArtifact(context, {
		channel: "release",
		version: "1.0.0"
	});
	const firstSnapshot = await snapshotOutput(context);
	await assemblePagesSnapshot({
		channelDirectory: releaseArtifact,
		outputDirectory: firstSnapshot,
		previousDirectory: empty
	});
	await writeFile(join(firstSnapshot, "site", "stale.js"), "export const stale = true;\n", "utf8");
	await assert.rejects(
		assemblePagesSnapshot({
			channelDirectory: releaseArtifact,
			outputDirectory: await snapshotOutput(context),
			previousDirectory: join(firstSnapshot, "site")
		}),
		/Unexpected previous Pages snapshot entry stale\.js/u
	);

	await rm(join(firstSnapshot, "site", "stale.js"));
	const manifestPath = join(firstSnapshot, "site", "site-manifest.json");
	const manifest = JSON.parse(await readFile(manifestPath, "utf8"));
	manifest.releases[0].commit = SECOND_COMMIT;
	await writeFile(manifestPath, `${JSON.stringify(manifest, null, "\t")}\n`, "utf8");
	await assert.rejects(
		assemblePagesSnapshot({
			channelDirectory: releaseArtifact,
			outputDirectory: await snapshotOutput(context),
			previousDirectory: join(firstSnapshot, "site")
		}),
		/manifest does not match its retained channel trees/u
	);
});

void test("Pages workflow keeps deployment and npm authority separate and restores retained bytes", async () => {
	const workflow = await readFile(WORKFLOW_PATH, "utf8");
	assert.match(workflow, /push:\s*\n\s+branches:\s*\n\s+- main/u);
	assert.match(workflow, /release:\s*\n\s+types:\s*\n\s+- published/u);
	assert.match(workflow, /snapshot_ref:/u);
	assert.match(workflow, /git restore --source "\$\{LFC_SNAPSHOT_REF\}" --staged --worktree -- main/u);
	assert.match(workflow, /git merge-base --is-ancestor "\$\{LFC_SNAPSHOT_REF\}" refs\/remotes\/origin\/pages-content/u);
	assert.match(workflow, /Candidate snapshot removed retained \$\{retained_release\}/u);
	assert.match(workflow, /diff --brief --recursive --no-dereference/u);
	assert.match(workflow, /expected_releases\+=\("releases\/\$\{LFC_VERSION\}"\)/u);
	assert.match(workflow, /Candidate snapshot has unauthorized release additions or removals/u);
	assert.match(workflow, /if: \$\{\{ github\.event_name != 'workflow_dispatch' \}\}/u);
	assert.match(workflow, /environment:\s*\n\s+name: github-pages/u);
	assert.match(workflow, /permissions:\s*\n\s+id-token: write\s*\n\s+pages: write/u);
	assert.doesNotMatch(workflow, /npm publish|NPM_TOKEN|registry\.npmjs\.org/iu);

	for (const match of workflow.matchAll(/^\s*uses:\s+([^@\s]+)@([^\s]+).*$/gmu)) {
		assert.match(match[2] ?? "", /^[0-9a-f]{40}$/u, `${match[1]} must use a full commit SHA`);
	}
});
