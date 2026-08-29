import assert from "node:assert/strict";
import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { tmpdir } from "node:os";
import test from "node:test";
import { JSDOM } from "jsdom";

import { assemblePagesSnapshot } from "../assemble-pages.mjs";
import {
	assertNoRemoteRuntimeAssets,
	buildPagesArtifact,
	validateDeploymentMetadata
} from "../build-pages.mjs";
import { serializeExampleMetadata } from "../lib/example-metadata.mjs";
import { REPOSITORY_ROOT } from "../lib/process.mjs";
import {
	findForbiddenRuntimeLiterals,
	formatForbiddenRuntimeLiteral
} from "../lib/runtime-literals.mjs";
import {
	copyCode,
	renderDeploymentManifest,
	renderDeployments,
	selectPrimaryDeployment,
	validateManifest
} from "../pages-site/site.js";

const FIRST_COMMIT = "0123456789abcdef0123456789abcdef01234567";
const SECOND_COMMIT = "89abcdef0123456789abcdef0123456789abcdef";
const SHELL_DIRECTORY = join(REPOSITORY_ROOT, "scripts", "pages-site");
const SHELL_MARK_FILENAME = "litefold-calendar-mark.svg";
const SHELL_MARK_FIXTURE = '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1 1"><path d="M0 0h1v1H0z"/></svg>\n';

void test("runtime literal policy allows only the exact SVG namespace URL", () => {
	assert.deepEqual(
		findForbiddenRuntimeLiterals('const namespace = "http://www.w3.org/2000/svg";'),
		[]
	);
	assert.equal(
		findForbiddenRuntimeLiterals('const endpoint = "http://[::1]:4173/calendar";')[0]?.value,
		"http://[::1]:4173/calendar"
	);
	assert.deepEqual(
		findForbiddenRuntimeLiterals([
			'const external = "https://cdn.invalid/calendar.js";',
			'const nearMiss = "http://www.w3.org/2000/svg/extra";',
			'const address = "192.0.2.25";',
			'const loopback = "http://127.0.0.1:4173/calendar";'
		].join("\n")),
		[
			{
				column: 19,
				index: 18,
				kind: "URL",
				line: 1,
				value: "https://cdn.invalid/calendar.js"
			},
			{
				column: 19,
				index: 70,
				kind: "URL",
				line: 2,
				value: "http://www.w3.org/2000/svg/extra"
			},
			{
				column: 18,
				index: 122,
				kind: "IPv4",
				line: 3,
				value: "192.0.2.25"
			},
			{
				column: 19,
				index: 153,
				kind: "URL",
				line: 4,
				value: "http://127.0.0.1:4173/calendar"
			}
		]
	);
});

void test("runtime literal policy reports precise CRLF locations and valid IPv4 addresses", () => {
	const findings = findForbiddenRuntimeLiterals('safe\r\n198.51.100.7\r\n999.1.2.3');
	assert.deepEqual(
		findings,
		[
			{
				column: 1,
				index: 6,
				kind: "IPv4",
				line: 2,
				value: "198.51.100.7"
			}
		]
	);
	assert.equal(
		formatForbiddenRuntimeLiteral("dist/index.js.map", findings[0]),
		'dist/index.js.map:2:1 contains prohibited runtime IPv4 literal "198.51.100.7".'
	);
});

function deploymentEntry(channel, version, commit = FIRST_COMMIT) {
	return {
		channel,
		commit,
		path: channel === "main" ? "main/examples/" : `releases/${version}/examples/`,
		version
	};
}

async function createShellDom() {
	return new JSDOM(await readFile(join(SHELL_DIRECTORY, "index.html"), "utf8"), {
		url: "https://tryagaindev.github.io/litefold-calendar/"
	});
}

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
		unsafeMark = false,
		version = "1.0.0"
	} = options;
	const root = await mkdtemp(join(tmpdir(), "lfc-pages-source-"));
	context.after(() => rm(root, { force: true, recursive: true }));
	await writeFixtureFile(root, "package.json", `${JSON.stringify({
		repository: {
			type: "git",
			url: "git+https://github.com/tryagaindev/litefold-calendar.git"
		},
		version
	}, null, 2)}\n`);
	await writeFixtureFile(root, "dist/index.js", "export const ready = true;\n");
	await writeFixtureFile(root, "dist/internal/runtime.js", "export const runtime = true;\n");
	await writeFixtureFile(root, "dist/index.d.ts", "export declare const ready: true;\n");
	await writeFixtureFile(root, "dist/index.js.map", "{}\n");
	await writeFixtureFile(root, "dist/styles.css", ".calendar { display: block; }\n");
	await writeFixtureFile(
		root,
		`docs/assets/${SHELL_MARK_FILENAME}`,
		unsafeMark
			? '<svg xmlns="http://www.w3.org/2000/svg"><image href="https://cdn.invalid/mark.png"/></svg>\n'
			: SHELL_MARK_FIXTURE
	);
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

void test("Pages staging includes self-contained assets and commit-pinned developer navigation", async (context) => {
	const artifact = await buildFixtureArtifact(context);
	const nestedHtml = await readFile(join(artifact, "content", "examples", "basic", "index.html"), "utf8");
	assert.match(nestedHtml, /Rolling main preview/u);
	assert.match(nestedHtml, new RegExp(FIRST_COMMIT, "u"));
	assert.match(nestedHtml, /href="\.\.\/\.\.\/deployment-details\.css"/u);
	assert.match(nestedHtml, /class="lfc-developer-footer"/u);
	assert.match(nestedHtml, /aria-label="Developer resources"/u);
	assert.match(nestedHtml, /href="\.\.\/">All examples<\/a>/u);
	assert.match(
		nestedHtml,
		new RegExp(`https://github\\.com/tryagaindev/litefold-calendar/tree/${FIRST_COMMIT}/examples/basic/`, "u")
	);
	assert.match(
		nestedHtml,
		new RegExp(`https://github\\.com/tryagaindev/litefold-calendar/blob/${FIRST_COMMIT}/docs/api\\.md`, "u")
	);
	assert.match(
		nestedHtml,
		new RegExp(
			`https://github\\.com/tryagaindev/litefold-calendar/blob/${FIRST_COMMIT}/docs/integration-guide\\.md`,
			"u"
		)
	);
	assert.match(
		nestedHtml,
		new RegExp(`href="https://github\\.com/tryagaindev/litefold-calendar/commit/${FIRST_COMMIT}"`, "u")
	);
	assert.match(nestedHtml, /http-equiv="Content-Security-Policy"/u);
	assert.match(nestedHtml, /default-src 'self'; base-uri 'none'; connect-src 'self'/u);
	assert.doesNotMatch(
		await readFile(join(artifact, "content", "examples", "index.html"), "utf8"),
		/lfc-developer-footer/u
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
	assert.equal(
		await readFile(join(artifact, "shell", SHELL_MARK_FILENAME), "utf8"),
		SHELL_MARK_FIXTURE
	);
	assert.match(
		shellHtml,
		/http-equiv="Content-Security-Policy"/u
	);
	assert.match(shellHtml, /class="lfc-pages-mark"/u);
	assert.match(shellHtml, /src="\.\/litefold-calendar-mark\.svg"/u);
	assert.match(shellHtml, /alt="" width="48" height="48"/u);
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
	for (const source of [
		'<svg xmlns="http://www.w3.org/2000/svg"><script>alert(1)</script></svg>',
		'<svg xmlns="http://www.w3.org/2000/svg"><use href="https://cdn.invalid/symbol.svg#mark"/></svg>'
	]) {
		assert.throws(
			() => assertNoRemoteRuntimeAssets(source, "mark.svg"),
			/self-contained, script-free SVG/u
		);
	}

	const repositoryRoot = await createSourceFixture(context, { remoteAsset: true });
	const output = await snapshotOutput(context);
	await assert.rejects(
		buildPagesArtifact({ outputDirectory: output, repositoryRoot, shellDirectory: SHELL_DIRECTORY }),
		/loads a remote runtime asset/u
	);
	const unsafeMarkRoot = await createSourceFixture(context, { unsafeMark: true });
	await assert.rejects(
		buildPagesArtifact({
			outputDirectory: await snapshotOutput(context),
			repositoryRoot: unsafeMarkRoot,
			shellDirectory: SHELL_DIRECTORY
		}),
		/self-contained, script-free SVG/u
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
	const releaseFirstManifest = JSON.parse(
		await readFile(join(firstSnapshot, "site", "site-manifest.json"), "utf8")
	);
	assert.equal(releaseFirstManifest.main, null);
	assert.deepEqual(releaseFirstManifest.releases.map((entry) => entry.version), ["1.0.0"]);
	const releaseFirstHtml = await readFile(join(firstSnapshot, "site", "index.html"), "utf8");
	assert.match(releaseFirstHtml, /<!doctype html>/iu);
	const releaseFirstDom = new JSDOM(releaseFirstHtml, {
		url: "https://tryagaindev.github.io/litefold-calendar/"
	});
	const releaseFirstDocument = releaseFirstDom.window.document;
	assert.equal(
		releaseFirstDocument.querySelector("#primary-run-link")?.getAttribute("href"),
		"./releases/1.0.0/examples/basic/"
	);
	assert.equal(
		releaseFirstDocument.querySelector("#primary-browse-link")?.getAttribute("href"),
		"./releases/1.0.0/examples/"
	);
	assert.equal(
		releaseFirstDocument.querySelector("#install-command")?.textContent,
		"npm install @tryagaindev/litefold-calendar@1.0.0"
	);
	assert.equal(releaseFirstDocument.querySelector("#selected-version")?.textContent, "1.0.0");
	assert.equal(releaseFirstDocument.querySelector("#selected-channel")?.textContent, "Immutable release");
	assert.equal(releaseFirstDocument.querySelector("#selected-commit code")?.textContent, FIRST_COMMIT);
	for (const [selector, expected] of [
		["#primary-source-link", `/tree/${FIRST_COMMIT}/examples/basic`],
		["#api-link", `/blob/${FIRST_COMMIT}/docs/api.md`],
		["#integration-link", `/blob/${FIRST_COMMIT}/docs/integration-guide.md`],
		["#quick-start-link", `/blob/${FIRST_COMMIT}/README.md#quick-start`],
		["#selected-commit", `/commit/${FIRST_COMMIT}`]
	]) {
		assert.ok(
			releaseFirstDocument.querySelector(selector)?.getAttribute("href")?.endsWith(expected),
			`${selector} should be pinned in the static shell`
		);
	}
	assert.equal(releaseFirstDocument.querySelectorAll("#release-history li").length, 1);
	assert.match(releaseFirstDocument.querySelector("#main-preview")?.textContent ?? "", /not available/u);
	assert.equal(
		[...releaseFirstDocument.querySelectorAll('a[href^="./main/"]')].length,
		0,
		"A release-only shell must not retain runnable main links."
	);
	assert.ok(releaseFirstDocument.querySelector('meta[http-equiv="Content-Security-Policy"]'));
	assert.ok(
		releaseFirstHtml.indexOf("Content-Security-Policy") < releaseFirstHtml.indexOf('<link rel="stylesheet"'),
		"Static shell stamping must keep the CSP before resource-bearing elements."
	);
	assert.equal(
		releaseFirstDocument.querySelector('link[rel="stylesheet"]')?.getAttribute("href"),
		"./site.css"
	);
	assert.equal(
		releaseFirstDocument.querySelector('script[src]')?.getAttribute("src"),
		"./site.js"
	);

	const stampedState = releaseFirstDocument.documentElement.outerHTML;
	await assert.rejects(
		renderDeployments(releaseFirstDocument, async (input, init) => {
			assert.equal(input, "./site-manifest.json");
			assert.deepEqual(init, { cache: "no-store", credentials: "same-origin" });
			return { ok: false, status: 503 };
		}),
		/failed with 503/u
	);
	assert.equal(releaseFirstDocument.documentElement.outerHTML, stampedState);
	await assert.rejects(
		renderDeployments(releaseFirstDocument, async () => ({
			json: async () => ({ main: null, releases: [{}], schemaVersion: 1 }),
			ok: true
		})),
		/Invalid release deployment metadata/u
	);
	assert.equal(releaseFirstDocument.documentElement.outerHTML, stampedState);
	releaseFirstDom.window.close();
	assert.equal(
		await readFile(join(firstSnapshot, "site", SHELL_MARK_FILENAME), "utf8"),
		SHELL_MARK_FIXTURE
	);
	const immutableBytes = await readFile(
		join(firstSnapshot, "site", "releases", "1.0.0", "examples", "basic", "main.js"),
		"utf8"
	);
	await rm(join(firstSnapshot, "site", SHELL_MARK_FILENAME));
	await assert.rejects(
		assemblePagesSnapshot({
			channelDirectory: firstReleaseArtifact,
			outputDirectory: await snapshotOutput(context),
			previousDirectory: join(firstSnapshot, "site")
		}),
		/references missing litefold-calendar-mark\.svg/u
	);
	const legacyIndexPath = join(firstSnapshot, "site", "index.html");
	await writeFile(
		legacyIndexPath,
		(await readFile(legacyIndexPath, "utf8"))
			.replace(/\t{4}<img class="lfc-pages-mark"[^>]*>\r?\n/u, ""),
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
	assert.equal(
		await readFile(join(mainSnapshot, "site", SHELL_MARK_FILENAME), "utf8"),
		SHELL_MARK_FIXTURE
	);
	assert.match(
		await readFile(join(mainSnapshot, "site", "index.html"), "utf8"),
		/src="\.\/litefold-calendar-mark\.svg"/u
	);

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

void test("release assembly upgrades a retained shell that the current renderer cannot stamp", async (context) => {
	const empty = await emptyPreviousDirectory(context);
	const previousArtifact = await buildFixtureArtifact(context, {
		channel: "release",
		version: "1.0.0"
	});
	const previousSnapshot = await snapshotOutput(context);
	await assemblePagesSnapshot({
		channelDirectory: previousArtifact,
		outputDirectory: previousSnapshot,
		previousDirectory: empty
	});
	const previousSite = join(previousSnapshot, "site");
	const previousIndexPath = join(previousSite, "index.html");
	await writeFile(
		previousIndexPath,
		(await readFile(previousIndexPath, "utf8")).replace('id="release-history"', 'id="release-demos"'),
		"utf8"
	);

	const nextArtifact = await buildFixtureArtifact(context, {
		channel: "release",
		commit: SECOND_COMMIT,
		version: "1.1.0"
	});
	const nextSnapshot = await snapshotOutput(context);
	await assemblePagesSnapshot({
		channelDirectory: nextArtifact,
		outputDirectory: nextSnapshot,
		previousDirectory: previousSite
	});
	const migratedIndex = await readFile(join(nextSnapshot, "site", "index.html"), "utf8");
	assert.match(migratedIndex, /id="release-history"/u);
	assert.doesNotMatch(migratedIndex, /id="release-demos"/u);
	const dom = new JSDOM(migratedIndex);
	assert.equal(dom.window.document.querySelectorAll("#release-history li").length, 2);
	dom.window.close();
});

void test("site manifests sort full Semantic Versions newest first", async (context) => {
	let previousDirectory = await emptyPreviousDirectory(context);
	for (const [index, version] of [
		"1.0.0-alpha.2",
		"1.0.0-alpha.10",
		"1.0.0",
		"1.0.0+build.2",
		"1.0.0+build.10",
		"2.0.0-alpha.0"
	].entries()) {
		const commit = index % 2 === 0 ? FIRST_COMMIT : SECOND_COMMIT;
		const artifact = await buildFixtureArtifact(context, {
			channel: "release",
			commit,
			marker: `release-${String(index)}`,
			version
		});
		const snapshot = await snapshotOutput(context);
		await assemblePagesSnapshot({
			channelDirectory: artifact,
			outputDirectory: snapshot,
			previousDirectory
		});
		previousDirectory = join(snapshot, "site");
	}

	const manifest = JSON.parse(await readFile(join(previousDirectory, "site-manifest.json"), "utf8"));
	assert.deepEqual(manifest.releases.map((entry) => entry.version), [
		"2.0.0-alpha.0",
		"1.0.0+build.10",
		"1.0.0+build.2",
		"1.0.0",
		"1.0.0-alpha.10",
		"1.0.0-alpha.2"
	]);
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
	assert.equal(
		await readFile(join(rerunSnapshot, "site", "index.html"), "utf8"),
		await readFile(join(firstSnapshot, "site", "index.html"), "utf8")
	);

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
	const secondDom = new JSDOM(
		await readFile(join(secondSnapshot, "site", "index.html"), "utf8"),
		{ url: "https://tryagaindev.github.io/litefold-calendar/" }
	);
	assert.equal(
		secondDom.window.document.querySelector("#primary-run-link")?.getAttribute("href"),
		"./releases/2.0.0/examples/basic/"
	);
	assert.equal(secondDom.window.document.querySelector("#selected-version")?.textContent, "2.0.0");
	secondDom.window.close();
	assert.equal(
		await readFile(join(secondSnapshot, "site", "releases", "1.0.0", "examples", "basic", "main.js"), "utf8"),
		'export const marker = "release-one";\n'
	);
	await writeFile(
		join(firstArtifact, "shell", "index.html"),
		(await readFile(join(firstArtifact, "shell", "index.html"), "utf8"))
			.replace('id="release-history"', 'id="release-demos"'),
		"utf8"
	);
	const oldReleaseRerun = await snapshotOutput(context);
	await assemblePagesSnapshot({
		channelDirectory: firstArtifact,
		outputDirectory: oldReleaseRerun,
		previousDirectory: join(secondSnapshot, "site")
	});
	for (const file of ["index.html", "site-manifest.json", "site.css", "site.js"]) {
		assert.equal(
			await readFile(join(oldReleaseRerun, "site", file), "utf8"),
			await readFile(join(secondSnapshot, "site", file), "utf8"),
			`An old release rerun must preserve retained ${file}.`
		);
	}
});

void test("a missing older release backfills without replacing a compatible retained shell", async (context) => {
	const empty = await emptyPreviousDirectory(context);
	const newerArtifact = await buildFixtureArtifact(context, {
		channel: "release",
		commit: SECOND_COMMIT,
		version: "2.0.0"
	});
	const newerSnapshot = await snapshotOutput(context);
	await assemblePagesSnapshot({
		channelDirectory: newerArtifact,
		outputDirectory: newerSnapshot,
		previousDirectory: empty
	});
	const retainedSite = join(newerSnapshot, "site");
	const retainedScript = await readFile(join(retainedSite, "site.js"), "utf8");
	const olderArtifact = await buildFixtureArtifact(context, {
		channel: "release",
		version: "1.0.0"
	});
	await writeFile(join(olderArtifact, "shell", "site.js"), "throw new Error('older shell');\n", "utf8");
	const backfilledSnapshot = await snapshotOutput(context);
	await assemblePagesSnapshot({
		channelDirectory: olderArtifact,
		outputDirectory: backfilledSnapshot,
		previousDirectory: retainedSite
	});
	assert.equal(await readFile(join(backfilledSnapshot, "site", "site.js"), "utf8"), retainedScript);
	const manifest = JSON.parse(
		await readFile(join(backfilledSnapshot, "site", "site-manifest.json"), "utf8")
	);
	assert.deepEqual(manifest.releases.map((release) => release.version), ["2.0.0", "1.0.0"]);
	const dom = new JSDOM(await readFile(join(backfilledSnapshot, "site", "index.html"), "utf8"));
	assert.equal(dom.window.document.querySelectorAll("#release-history li").length, 2);
	dom.window.close();
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

void test("developer shell trusts canonical release order and pins commands and source links", async () => {
	const dom = await createShellDom();
	const manifest = {
		main: deploymentEntry("main", "2.0.0-alpha.0", SECOND_COMMIT),
		releases: [
			deploymentEntry("release", "1.0.0"),
			deploymentEntry("release", "1.0.0-alpha.10", SECOND_COMMIT),
			deploymentEntry("release", "1.0.0-alpha.2")
		],
		schemaVersion: 1
	};
	const validated = validateManifest(manifest);
	assert.equal(selectPrimaryDeployment(validated)?.version, "1.0.0");

	renderDeploymentManifest(dom.window.document, manifest);
	assert.equal(
		dom.window.document.querySelector("#primary-run-link")?.getAttribute("href"),
		"./releases/1.0.0/examples/basic/"
	);
	assert.equal(
		dom.window.document.querySelector("#install-command")?.textContent,
		"npm install @tryagaindev/litefold-calendar@1.0.0"
	);
	for (const [selector, expected] of [
		["#primary-source-link", `/tree/${FIRST_COMMIT}/examples/basic`],
		["#api-link", `/blob/${FIRST_COMMIT}/docs/api.md`],
		["#integration-link", `/blob/${FIRST_COMMIT}/docs/integration-guide.md`],
		["#quick-start-link", `/blob/${FIRST_COMMIT}/README.md#quick-start`],
		["#selected-commit", `/commit/${FIRST_COMMIT}`]
	]) {
		assert.ok(
			dom.window.document.querySelector(selector)?.getAttribute("href")?.endsWith(expected),
			`${selector} should pin ${expected}`
		);
	}
	assert.equal(dom.window.document.querySelectorAll("#release-history li").length, 3);
	dom.window.close();
});

void test("developer shell falls back to main and keeps static links on metadata failure", async () => {
	const dom = await createShellDom();
	const main = deploymentEntry("main", "2.0.0-alpha.0", SECOND_COMMIT);
	await renderDeployments(dom.window.document, async () => ({
		json: async () => ({ main, releases: [], schemaVersion: 1 }),
		ok: true
	}));
	assert.equal(
		dom.window.document.querySelector("#primary-run-link")?.getAttribute("href"),
		"./main/examples/basic/"
	);
	assert.equal(
		dom.window.document.querySelector("#install-command")?.textContent,
		"npm install @tryagaindev/litefold-calendar@alpha"
	);
	assert.match(dom.window.document.querySelector("#main-preview")?.textContent ?? "", new RegExp(SECOND_COMMIT, "u"));

	renderDeploymentManifest(dom.window.document, {
		main: null,
		releases: [deploymentEntry("release", "2.0.0", FIRST_COMMIT)],
		schemaVersion: 1
	});
	assert.match(dom.window.document.querySelector("#main-preview")?.textContent ?? "", /not available/u);
	renderDeploymentManifest(dom.window.document, {
		main,
		releases: [],
		schemaVersion: 1
	});
	assert.equal(
		dom.window.document.querySelector("#main-preview-link")?.getAttribute("href"),
		"./main/examples/"
	);

	const fallbackDom = await createShellDom();
	const staticRunHref = fallbackDom.window.document
		.querySelector("#primary-run-link")?.getAttribute("href");
	await assert.rejects(
		renderDeployments(fallbackDom.window.document, async () => ({ ok: false, status: 503 })),
		/failed with 503/u
	);
	assert.equal(
		fallbackDom.window.document.querySelector("#primary-run-link")?.getAttribute("href"),
		staticRunHref
	);
	assert.equal(
		fallbackDom.window.document.querySelector("#install-command")?.textContent,
		"npm install @tryagaindev/litefold-calendar@alpha"
	);
	dom.window.close();
	fallbackDom.window.close();
});

void test("developer shell keeps repository links usable for an empty manifest", async () => {
	const dom = await createShellDom();
	await renderDeployments(dom.window.document, async () => ({
		json: async () => ({ main: null, releases: [], schemaVersion: 1 }),
		ok: true
	}));
	const runLink = dom.window.document.querySelector("#primary-run-link");
	const browseLink = dom.window.document.querySelector("#primary-browse-link");
	assert.equal(runLink?.textContent, "Browse basic source");
	assert.equal(
		runLink?.getAttribute("href"),
		"https://github.com/tryagaindev/litefold-calendar/tree/main/examples/basic"
	);
	assert.equal(browseLink?.textContent, "Browse examples source");
	assert.equal(
		browseLink?.getAttribute("href"),
		"https://github.com/tryagaindev/litefold-calendar/tree/main/examples"
	);
	dom.window.close();
});

void test("developer shell announces copy success and selects code when clipboard access fails", async () => {
	const dom = await createShellDom();
	const documentReference = dom.window.document;
	const button = documentReference.querySelector('[data-copy-target="install-command"]');
	assert.ok(button instanceof dom.window.HTMLButtonElement);
	let copied = "";
	assert.equal(await copyCode(button, documentReference, {
		clipboard: { writeText: async (value) => { copied = value; } }
	}), "copied");
	assert.equal(copied, "npm install @tryagaindev/litefold-calendar@alpha");
	assert.equal(documentReference.querySelector("#copy-status")?.textContent, "Install command copied.");

	assert.equal(await copyCode(button, documentReference, {
		clipboard: { writeText: async () => { throw new Error("Denied"); } }
	}), "selected");
	assert.equal(
		documentReference.defaultView?.getSelection()?.toString(),
		"npm install @tryagaindev/litefold-calendar@alpha"
	);
	assert.match(documentReference.querySelector("#copy-status")?.textContent ?? "", /selected.*Ctrl\+C/u);
	dom.window.close();
});
