import {
	copyFile,
	lstat,
	mkdir,
	mkdtemp,
	readFile,
	readdir,
	rename,
	rm,
	writeFile
} from "node:fs/promises";
import { dirname, join, relative, resolve, sep } from "node:path";
import { fileURLToPath } from "node:url";
import { isDeepStrictEqual } from "node:util";

import { JSDOM } from "jsdom";

import {
	assertNoRemoteRuntimeAssets,
	CONTENT_SECURITY_POLICY
} from "./build-pages.mjs";
import { parseExampleMetadata, serializeExampleMetadata } from "./lib/example-metadata.mjs";
import { compareSemVer, parseSemVer } from "./lib/semver.mjs";
import { renderDeploymentManifest } from "./pages-site/site.js";

const SCRIPT_PATH = fileURLToPath(import.meta.url);
const SHELL_MARK_FILENAME = "litefold-calendar-mark.svg";
const PREVIOUS_REQUIRED_SHELL_FILES = Object.freeze(["index.html", "site.css", "site.js"]);
const SHELL_FILES = Object.freeze([
	"index.html",
	SHELL_MARK_FILENAME,
	"site.css",
	"site.js"
]);
const STAGED_SHELL_FILES = Object.freeze(["deployment-details.css", ...SHELL_FILES]);

function isSemanticVersion(value) {
	try {
		parseSemVer(value);
		return true;
	} catch {
		return false;
	}
}

function displayPath(path, root) {
	return relative(root, path).replaceAll(sep, "/");
}

async function pathExists(path) {
	try {
		await lstat(path);
		return true;
	} catch (error) {
		if (error instanceof Error && "code" in error && error.code === "ENOENT") {
			return false;
		}
		throw error;
	}
}

async function listTree(directory, root = directory) {
	if (!await pathExists(directory)) {
		return [];
	}
	const entries = await readdir(directory, { withFileTypes: true });
	const files = [];
	for (const entry of entries.sort((left, right) => left.name.localeCompare(right.name, "en"))) {
		const path = join(directory, entry.name);
		if (entry.isSymbolicLink()) {
			throw new Error(`${displayPath(path, root)} must not be a symbolic link.`);
		}
		if (entry.isDirectory()) {
			files.push(...await listTree(path, root));
		} else if (entry.isFile()) {
			files.push(path);
		} else {
			throw new Error(`${displayPath(path, root)} must be a regular file or directory.`);
		}
	}
	return files;
}

async function copyTree(sourceDirectory, destinationDirectory) {
	for (const sourcePath of await listTree(sourceDirectory)) {
		const destinationPath = join(destinationDirectory, relative(sourceDirectory, sourcePath));
		await mkdir(dirname(destinationPath), { recursive: true });
		await copyFile(sourcePath, destinationPath);
	}
}

async function treesEqual(leftDirectory, rightDirectory) {
	const leftFiles = await listTree(leftDirectory);
	const rightFiles = await listTree(rightDirectory);
	const leftRelative = leftFiles.map((path) => displayPath(path, leftDirectory));
	const rightRelative = rightFiles.map((path) => displayPath(path, rightDirectory));
	if (JSON.stringify(leftRelative) !== JSON.stringify(rightRelative)) {
		return false;
	}
	for (let index = 0; index < leftFiles.length; index += 1) {
		const [left, right] = await Promise.all([
			readFile(leftFiles[index]),
			readFile(rightFiles[index])
		]);
		if (!left.equals(right)) {
			return false;
		}
	}
	return true;
}

async function readMetadata(path, expectedChannel, expectedVersion) {
	const metadata = parseExampleMetadata(JSON.parse(await readFile(path, "utf8")));
	if (metadata.channel !== expectedChannel) {
		throw new Error(`${path} must use the ${expectedChannel} channel.`);
	}
	if (!isSemanticVersion(metadata.version)) {
		throw new Error(`${path} must use a path-safe semantic version.`);
	}
	if (expectedVersion !== undefined && metadata.version !== expectedVersion) {
		throw new Error(`${path} version must match its immutable release directory.`);
	}
	return metadata;
}

async function validateIncomingArtifact(channelDirectory) {
	const entries = (await readdir(channelDirectory, { withFileTypes: true }))
		.map((entry) => entry.name)
		.sort((left, right) => left.localeCompare(right, "en"));
	if (JSON.stringify(entries) !== JSON.stringify(["channel.json", "content", "shell"])) {
		throw new Error("A staged Pages channel must contain exactly channel.json, content, and shell.");
	}
	await listTree(channelDirectory);
	const shellEntries = (await readdir(join(channelDirectory, "shell"), { withFileTypes: true }))
		.map((entry) => entry.name)
		.sort((left, right) => left.localeCompare(right, "en"));
	if (!isDeepStrictEqual(shellEntries, [...STAGED_SHELL_FILES].sort())) {
		throw new Error("A staged Pages channel has an unexpected deployment shell.");
	}
	for (const shellFile of STAGED_SHELL_FILES) {
		if (!await pathExists(join(channelDirectory, "shell", shellFile))) {
			throw new Error(`A staged Pages channel is missing shell/${shellFile}.`);
		}
	}
	const metadata = parseExampleMetadata(
		JSON.parse(await readFile(join(channelDirectory, "channel.json"), "utf8"))
	);
	const contentMetadata = parseExampleMetadata(
		JSON.parse(await readFile(join(channelDirectory, "content", "examples", "metadata.json"), "utf8"))
	);
	if (JSON.stringify(metadata) !== JSON.stringify(contentMetadata)) {
		throw new Error("Staged channel and example metadata must identify the same deployment.");
	}
	if ((metadata.channel !== "main" && metadata.channel !== "release") ||
		!isSemanticVersion(metadata.version)) {
		throw new Error("A staged Pages channel must use a deployable channel and semantic version.");
	}
	return metadata;
}

async function validatePreviousSnapshot(siteDirectory) {
	const files = await listTree(siteDirectory);
	if (files.length === 0) {
		return { main: null, releases: [], schemaVersion: 1 };
	}
	const entries = await readdir(siteDirectory, { withFileTypes: true });
	const expectedNames = new Set([
		"main",
		"releases",
		"site-manifest.json",
		...SHELL_FILES
	]);
	for (const entry of entries) {
		if (!expectedNames.has(entry.name)) {
			throw new Error(`Unexpected previous Pages snapshot entry ${entry.name}.`);
		}
	}
	for (const shellFile of PREVIOUS_REQUIRED_SHELL_FILES) {
		if (!await pathExists(join(siteDirectory, shellFile))) {
			throw new Error(`The previous Pages snapshot is missing ${shellFile}.`);
		}
	}
	const previousIndex = await readFile(join(siteDirectory, "index.html"), "utf8");
	if (previousIndex.includes(`src="./${SHELL_MARK_FILENAME}"`) &&
		!await pathExists(join(siteDirectory, SHELL_MARK_FILENAME))) {
		throw new Error(`The previous Pages snapshot references missing ${SHELL_MARK_FILENAME}.`);
	}
	if (!await pathExists(join(siteDirectory, "site-manifest.json"))) {
		throw new Error("The previous Pages snapshot is missing site-manifest.json.");
	}
	if (await pathExists(join(siteDirectory, "main"))) {
		await readMetadata(join(siteDirectory, "main", "examples", "metadata.json"), "main");
	}
	const releasesDirectory = join(siteDirectory, "releases");
	if (await pathExists(releasesDirectory)) {
		const releases = await readdir(releasesDirectory, { withFileTypes: true });
		for (const release of releases) {
			if (!release.isDirectory() || !isSemanticVersion(release.name)) {
				throw new Error(`Unexpected immutable release entry ${release.name}.`);
			}
			await readMetadata(
				join(releasesDirectory, release.name, "examples", "metadata.json"),
				"release",
				release.name
			);
		}
	}
	const actualManifest = JSON.parse(await readFile(join(siteDirectory, "site-manifest.json"), "utf8"));
	const expectedManifest = await collectSiteManifest(siteDirectory);
	if (!isDeepStrictEqual(actualManifest, expectedManifest)) {
		throw new Error("The previous Pages manifest does not match its retained channel trees.");
	}
	return actualManifest;
}

async function collectSiteManifest(siteDirectory) {
	let main = null;
	if (await pathExists(join(siteDirectory, "main"))) {
		main = {
			...await readMetadata(join(siteDirectory, "main", "examples", "metadata.json"), "main"),
			path: "main/examples/"
		};
	}

	const releases = [];
	const releasesDirectory = join(siteDirectory, "releases");
	if (await pathExists(releasesDirectory)) {
		const entries = await readdir(releasesDirectory, { withFileTypes: true });
		for (const entry of entries) {
			if (!entry.isDirectory() || !isSemanticVersion(entry.name)) {
				throw new Error(`Unexpected immutable release entry ${entry.name}.`);
			}
			releases.push({
				...await readMetadata(
					join(releasesDirectory, entry.name, "examples", "metadata.json"),
					"release",
					entry.name
				),
				path: `releases/${entry.name}/examples/`
			});
		}
	}
	releases.sort((left, right) => compareSemVer(right.version, left.version));

	return { schemaVersion: 1, main, releases };
}

async function writeSiteManifest(siteDirectory, manifest) {
	await writeFile(
		join(siteDirectory, "site-manifest.json"),
		`${JSON.stringify(manifest, null, "\t")}\n`,
		"utf8"
	);
}

async function stampSiteIndex(siteDirectory, manifest) {
	const indexPath = join(siteDirectory, "index.html");
	const dom = new JSDOM(await readFile(indexPath, "utf8"), {
		url: "https://tryagaindev.github.io/litefold-calendar/"
	});
	try {
		renderDeploymentManifest(dom.window.document, manifest);
		await writeFile(indexPath, dom.serialize(), "utf8");
	} finally {
		dom.window.close();
	}
}

async function validateSiteRuntimePolicy(siteDirectory) {
	for (const shellFile of SHELL_FILES) {
		const shellPath = join(siteDirectory, shellFile);
		assertNoRemoteRuntimeAssets(
			await readFile(shellPath, "utf8"),
			displayPath(shellPath, siteDirectory)
		);
	}

	const indexPath = join(siteDirectory, "index.html");
	const dom = new JSDOM(await readFile(indexPath, "utf8"));
	try {
		const policies = [...dom.window.document.querySelectorAll("meta[http-equiv]")]
			.filter((meta) =>
				meta.getAttribute("http-equiv")?.toLowerCase() === "content-security-policy");
		if (policies.length !== 1 ||
			policies[0].parentElement !== dom.window.document.head ||
			policies[0].getAttribute("content") !== CONTENT_SECURITY_POLICY) {
			throw new Error("The retained Pages shell must declare the exact Content Security Policy once in head.");
		}
		const firstRuntimeResource = dom.window.document.head?.querySelector(
			"base[href], embed[src], iframe[src], img[src], link[href], object[data], script[src], source[src], style"
		);
		if (firstRuntimeResource !== null &&
			(policies[0].compareDocumentPosition(firstRuntimeResource) &
				dom.window.Node.DOCUMENT_POSITION_FOLLOWING) === 0) {
			throw new Error("The retained Pages Content Security Policy must precede runtime resources.");
		}
	} finally {
		dom.window.close();
	}
}

async function retainedShellSupportsCurrentRenderer(siteDirectory) {
	const indexPath = join(siteDirectory, "index.html");
	if (!await pathExists(indexPath)) {
		return false;
	}
	const dom = new JSDOM(await readFile(indexPath, "utf8"), {
		url: "https://tryagaindev.github.io/litefold-calendar/"
	});
	try {
		renderDeploymentManifest(dom.window.document, {
			main: null,
			releases: [],
			schemaVersion: 1
		});
		return true;
	} catch {
		return false;
	} finally {
		dom.window.close();
	}
}

function parseArguments(arguments_) {
	const values = new Map();
	for (let index = 0; index < arguments_.length; index += 2) {
		const name = arguments_[index];
		const value = arguments_[index + 1];
		if (!["--channel", "--output", "--previous"].includes(name ?? "") || value === undefined) {
			throw new Error(
				"Usage: node scripts/assemble-pages.mjs --previous <directory> --channel <directory> --output <directory>"
			);
		}
		if (values.has(name)) {
			throw new Error(`${name} may be provided only once.`);
		}
		values.set(name, resolve(value));
	}
	if (values.size !== 3 || !values.has("--previous") || !values.has("--channel") || !values.has("--output")) {
		throw new Error(
			"Usage: node scripts/assemble-pages.mjs --previous <directory> --channel <directory> --output <directory>"
		);
	}
	return {
		channelDirectory: values.get("--channel"),
		outputDirectory: values.get("--output"),
		previousDirectory: values.get("--previous")
	};
}

export async function assemblePagesSnapshot(options) {
	const {
		channelDirectory,
		outputDirectory,
		previousDirectory
	} = options;
	const resolvedOutput = resolve(outputDirectory);
	if (await pathExists(resolvedOutput)) {
		throw new Error(`Pages snapshot output already exists: ${resolvedOutput}`);
	}

	const metadata = await validateIncomingArtifact(resolve(channelDirectory));
	const previousManifest = await validatePreviousSnapshot(resolve(previousDirectory));
	await mkdir(dirname(resolvedOutput), { recursive: true });
	const stagingDirectory = await mkdtemp(join(dirname(resolvedOutput), ".lfc-pages-snapshot-"));
	try {
		const siteDirectory = join(stagingDirectory, "site");
		await mkdir(siteDirectory);
		await copyTree(resolve(previousDirectory), siteDirectory);

		let exactReleaseRerun = false;
		if (metadata.channel === "main") {
			await rm(join(siteDirectory, "main"), { force: true, recursive: true });
			await copyTree(join(resolve(channelDirectory), "content"), join(siteDirectory, "main"));
		} else {
			const destination = join(siteDirectory, "releases", metadata.version);
			if (await pathExists(destination)) {
				if (!await treesEqual(destination, join(resolve(channelDirectory), "content"))) {
					throw new Error(`Immutable release ${metadata.version} cannot be overwritten.`);
				}
				exactReleaseRerun = true;
			} else {
				await copyTree(join(resolve(channelDirectory), "content"), destination);
			}
		}

		if (!exactReleaseRerun) {
			const retainedShellIsCompatible = await retainedShellSupportsCurrentRenderer(siteDirectory);
			const incomingReleaseIsNewer = metadata.channel === "release" &&
				previousManifest.releases.every((release) =>
					compareSemVer(metadata.version, release.version) > 0) &&
				(previousManifest.main === null ||
					compareSemVer(metadata.version, previousManifest.main.version) >= 0);
			if (metadata.channel === "main" || (!retainedShellIsCompatible && incomingReleaseIsNewer)) {
				for (const shellFile of SHELL_FILES) {
					await copyFile(
						join(resolve(channelDirectory), "shell", shellFile),
						join(siteDirectory, shellFile)
					);
				}
			} else if (!retainedShellIsCompatible) {
				throw new Error(
					`Immutable release ${metadata.version} cannot safely replace a newer retained Pages shell.`
				);
			}
			const manifest = await collectSiteManifest(siteDirectory);
			await stampSiteIndex(siteDirectory, manifest);
			await writeSiteManifest(siteDirectory, manifest);
		}
		await validateSiteRuntimePolicy(siteDirectory);
		await writeFile(
			join(stagingDirectory, "receipt.json"),
			serializeExampleMetadata(metadata),
			"utf8"
		);
		await rename(stagingDirectory, resolvedOutput);
	} catch (error) {
		await rm(stagingDirectory, { force: true, recursive: true });
		throw error;
	}

	console.log(`Assembled retained Pages snapshot for ${metadata.channel} at ${metadata.commit}.`);
	return { metadata, outputDirectory: resolvedOutput };
}

async function main() {
	await assemblePagesSnapshot(parseArguments(process.argv.slice(2)));
}

if (process.argv[1] !== undefined && resolve(process.argv[1]) === SCRIPT_PATH) {
	await main();
}
