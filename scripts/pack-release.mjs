import { createHash } from "node:crypto";
import {
	copyFile,
	mkdtemp,
	readFile,
	readdir,
	realpath,
	rm,
	writeFile
} from "node:fs/promises";
import { gunzipSync } from "node:zlib";
import { tmpdir } from "node:os";
import { basename, join, posix } from "node:path";
import { pathToFileURL } from "node:url";

import {
	assertSupportedNodeVersion,
	SUPPORTED_NODE_RANGE
} from "./lib/node-version.mjs";
import { normalizeNpmPackResult } from "./lib/npm-pack-result.mjs";
import { REPOSITORY_ROOT, run, runNpm, runTsc } from "./lib/process.mjs";
import { verifyPackedBrowserInteraction } from "./lib/packed-browser-verification.mjs";
import {
	cleanupArtifactWorkspace,
	createArtifactWorkspace,
	finalizeArtifactWorkspace,
	parseReleaseArguments,
	releaseBundleDirectoryName
} from "./lib/release-artifacts.mjs";

const ARTIFACT_ROOT = join(REPOSITORY_ROOT, ".artifacts");
const BUILD_SCRIPT = join(REPOSITORY_ROOT, "scripts", "build-package.mjs");
const POLICY_SCRIPT = join(REPOSITORY_ROOT, "scripts", "check-package-policy.mjs");
const SBOM_SCRIPT = join(REPOSITORY_ROOT, "scripts", "check-sbom.mjs");
const RECEIPT_FILENAME = "package-verification.json";
const SBOM_FILENAME = "sbom.spdx.json";
const LICENSE_FILENAME = "LICENSE";
const CHECKSUM_FILENAME = "SHA256SUMS";
const SHA256_PATTERN = /^[0-9a-f]{64}$/u;
const FULL_GIT_SHA_PATTERN = /^[0-9a-f]{40}$/u;
const NPM_PACKAGE_MANAGER_PATTERN = /^npm@(\d+\.\d+\.\d+)$/u;
const SAFE_MODE = 0o644;

function hash(buffer, algorithm, encoding) {
	return createHash(algorithm).update(buffer).digest(encoding);
}

function sha256(buffer) {
	return hash(buffer, "sha256", "hex");
}

function parseTarOctal(bytes, description) {
	const source = bytes.toString("ascii").replaceAll("\0", "").trim();
	if (!/^[0-7]+$/u.test(source)) {
		throw new Error(`Tar ${description} is not a canonical octal value.`);
	}
	const value = Number.parseInt(source, 8);
	if (!Number.isSafeInteger(value) || value < 0) {
		throw new Error(`Tar ${description} is outside the safe integer range.`);
	}
	return value;
}

function readTarText(bytes) {
	const end = bytes.indexOf(0);
	return bytes.subarray(0, end < 0 ? bytes.length : end).toString("utf8");
}

function assertSafePackagePath(path, description) {
	if (typeof path !== "string" || path.length === 0 || path.includes("\\") ||
		[...path].some((character) => {
			const codePoint = character.codePointAt(0);
			return codePoint !== undefined && (codePoint <= 0x1f || codePoint === 0x7f);
		}) || posix.isAbsolute(path)) {
		throw new Error(`${description} has an unsafe package path: ${JSON.stringify(path)}.`);
	}
	const segments = path.split("/");
	if (segments.some((segment) => segment.length === 0 || segment === "." || segment === "..") ||
		posix.normalize(path) !== path) {
		throw new Error(`${description} has a non-canonical package path: ${JSON.stringify(path)}.`);
	}
}

function inspectTarball(tarball, reportedFiles) {
	let archive;
	try {
		archive = gunzipSync(tarball);
	} catch (error) {
		throw new Error("Packed artifact is not a valid gzip-compressed tar archive.", { cause: error });
	}

	const entries = new Map();
	let offset = 0;
	let foundEndMarker = false;
	while (offset + 512 <= archive.length) {
		const header = archive.subarray(offset, offset + 512);
		if (header.every((byte) => byte === 0)) {
			foundEndMarker = true;
			break;
		}

		const expectedChecksum = parseTarOctal(header.subarray(148, 156), "header checksum");
		let actualChecksum = 0;
		for (let index = 0; index < header.length; index += 1) {
			actualChecksum += index >= 148 && index < 156 ? 0x20 : header[index];
		}
		if (actualChecksum !== expectedChecksum) {
			throw new Error("Packed artifact contains a tar header with an invalid checksum.");
		}

		const name = readTarText(header.subarray(0, 100));
		const prefix = readTarText(header.subarray(345, 500));
		const archivePath = prefix.length > 0 ? `${prefix}/${name}` : name;
		assertSafePackagePath(archivePath, "Tar entry");
		if (!archivePath.startsWith("package/")) {
			throw new Error(`Tar entry must be rooted under package/: ${archivePath}.`);
		}
		const packagePath = archivePath.slice("package/".length);
		assertSafePackagePath(packagePath, "Tar entry");

		const type = header[156];
		if (type !== 0 && type !== 0x30) {
			throw new Error(`Tar entry ${packagePath} must be a regular file.`);
		}
		const mode = parseTarOctal(header.subarray(100, 108), `${packagePath} mode`);
		if (mode !== SAFE_MODE) {
			throw new Error(`Tar entry ${packagePath} must use mode 0644; found ${mode.toString(8)}.`);
		}
		const size = parseTarOctal(header.subarray(124, 136), `${packagePath} size`);
		if (entries.has(packagePath.toLowerCase())) {
			throw new Error(`Packed artifact contains a duplicate or case-colliding path: ${packagePath}.`);
		}
		entries.set(packagePath.toLowerCase(), { path: packagePath, size });

		const paddedSize = Math.ceil(size / 512) * 512;
		offset += 512 + paddedSize;
		if (offset > archive.length) {
			throw new Error(`Tar entry ${packagePath} extends beyond the packed archive.`);
		}
	}

	if (!foundEndMarker) {
		throw new Error("Packed artifact is missing its tar end marker.");
	}
	if (archive.subarray(offset).some((byte) => byte !== 0)) {
		throw new Error("Packed artifact contains non-zero data after its tar end marker.");
	}

	const reported = new Map();
	for (const file of reportedFiles) {
		const path = file?.path;
		assertSafePackagePath(path, "npm pack result");
		if (!Number.isSafeInteger(file?.size) || file.size < 0) {
			throw new Error(`npm pack reported an invalid size for ${String(path)}.`);
		}
		if (file.mode !== SAFE_MODE) {
			throw new Error(`npm pack reported a non-0644 mode for ${path}.`);
		}
		const key = path.toLowerCase();
		if (reported.has(key)) {
			throw new Error(`npm pack reported a duplicate or case-colliding path: ${path}.`);
		}
		reported.set(key, { path, size: file.size });
	}

	if (entries.size !== reported.size) {
		throw new Error(
			`Tar entry count ${String(entries.size)} does not match npm pack count ${String(reported.size)}.`
		);
	}
	for (const [key, entry] of entries) {
		const expected = reported.get(key);
		if (expected === undefined || expected.path !== entry.path || expected.size !== entry.size) {
			throw new Error(`Tar entry does not match npm pack metadata: ${entry.path}.`);
		}
	}

	return {
		entryCount: entries.size,
		unpackedSize: [...entries.values()].reduce((total, entry) => total + entry.size, 0)
	};
}

async function repositoryState() {
	const rootResult = await run("git", ["rev-parse", "--show-toplevel"], { capture: true });
	const actualRoot = await realpath(rootResult.stdout.trim());
	const expectedRoot = await realpath(REPOSITORY_ROOT);
	const rootsMatch = process.platform === "win32"
		? actualRoot.toLowerCase() === expectedRoot.toLowerCase()
		: actualRoot === expectedRoot;
	if (!rootsMatch) {
		throw new Error(`Release command must run in repository root ${expectedRoot}; Git reported ${actualRoot}.`);
	}

	const commitResult = await run("git", ["rev-parse", "--verify", "HEAD^{commit}"], { capture: true });
	const commit = commitResult.stdout.trim().toLowerCase();
	if (!FULL_GIT_SHA_PATTERN.test(commit)) {
		throw new Error(`Git HEAD must resolve to a full 40-character commit SHA; found ${commit}.`);
	}

	const statusResult = await run(
		"git",
		["status", "--porcelain=v1", "--untracked-files=all"],
		{ capture: true }
	);
	const status = statusResult.stdout.trim();
	if (status.length > 0) {
		const preview = status.split(/\r?\n/u).slice(0, 12).join("\n");
		throw new Error(`Release packaging requires a clean tracked and untracked source tree:\n${preview}`);
	}

	return { commit, root: expectedRoot };
}

function repositoryUrl(packageJson) {
	const value = typeof packageJson.repository === "string"
		? packageJson.repository
		: packageJson.repository?.url;
	if (typeof value !== "string" || value.trim() !== value || value.length === 0) {
		throw new Error("package.json repository must provide a non-empty canonical source URL.");
	}
	return value;
}

function expectedTarballName(name, version) {
	const safeName = name.startsWith("@") ? name.slice(1).replaceAll("/", "-") : name;
	return `${safeName}-${version}.tgz`;
}

function inspectPackResult(value, packageJson) {
	const result = normalizeNpmPackResult(value, packageJson.name);
	if (result?.name !== packageJson.name || result?.version !== packageJson.version) {
		throw new Error("npm pack result name and version must match package.json.");
	}
	const expectedFilename = expectedTarballName(packageJson.name, packageJson.version);
	if (result.filename !== expectedFilename || basename(result.filename) !== result.filename) {
		throw new Error(`npm pack returned unsafe or unexpected filename ${String(result.filename)}.`);
	}
	if (!Array.isArray(result.files) || result.files.length === 0) {
		throw new Error("npm pack must report every packaged file.");
	}
	if (result.entryCount !== result.files.length) {
		throw new Error("npm pack entryCount must match its reported file list.");
	}
	if (!Array.isArray(result.bundled) || result.bundled.length !== 0) {
		throw new Error("Release tarball must not bundle dependencies.");
	}
	if (typeof result.integrity !== "string" || !/^sha512-[A-Za-z0-9+/]+={0,2}$/u.test(result.integrity)) {
		throw new Error("npm pack must return a valid SHA-512 integrity value.");
	}
	if (typeof result.shasum !== "string" || !/^[0-9a-f]{40}$/u.test(result.shasum)) {
		throw new Error("npm pack must return a valid SHA-1 compatibility digest.");
	}
	return result;
}

async function validateFlatBundle(artifactDirectory, expectedNames) {
	const entries = await readdir(artifactDirectory, { withFileTypes: true });
	const actualNames = entries.map((entry) => entry.name).sort((left, right) => left.localeCompare(right, "en"));
	const sortedExpected = [...expectedNames].sort((left, right) => left.localeCompare(right, "en"));
	if (JSON.stringify(actualNames) !== JSON.stringify(sortedExpected) || entries.some((entry) => !entry.isFile())) {
		throw new Error(`Release bundle must contain only flat regular files: ${sortedExpected.join(", ")}.`);
	}
}

async function verifyChecksums(artifactDirectory, orderedNames) {
	const checksumPath = join(artifactDirectory, CHECKSUM_FILENAME);
	const contents = await readFile(checksumPath, "utf8");
	const expectedLines = [];
	for (const name of orderedNames) {
		const digest = sha256(await readFile(join(artifactDirectory, name)));
		if (!SHA256_PATTERN.test(digest)) {
			throw new Error(`Invalid SHA-256 digest generated for ${name}.`);
		}
		expectedLines.push(`${digest}  ${name}`);
	}
	const expected = `${expectedLines.join("\n")}\n`;
	if (contents !== expected) {
		throw new Error("SHA256SUMS does not match the deterministic artifact order or artifact bytes.");
	}
}

const releaseArguments = parseReleaseArguments(process.argv.slice(2));
const packageJson = JSON.parse(await readFile(join(REPOSITORY_ROOT, "package.json"), "utf8"));
const configuredNodeRange = packageJson.devEngines?.runtime?.version;
if (configuredNodeRange !== SUPPORTED_NODE_RANGE) {
	throw new Error(`Release packaging requires package.json to declare Node ${SUPPORTED_NODE_RANGE}.`);
}
assertSupportedNodeVersion("Release packaging");
const packageManagerMatch = NPM_PACKAGE_MANAGER_PATTERN.exec(String(packageJson.packageManager));
if (packageManagerMatch === null) {
	throw new Error("Release packaging requires packageManager to select an exact npm semantic version.");
}
const requiredNpmVersion = packageManagerMatch[1];
const npmVersion = (await runNpm(["--version"], { capture: true })).stdout.trim();
if (requiredNpmVersion !== npmVersion) {
	throw new Error(
		`Release packaging requires exact npm ${requiredNpmVersion}; running ${npmVersion}.`
	);
}
const initialRepository = await repositoryState();

async function produceReleaseBundle(artifactDirectory) {
	await run(process.execPath, [BUILD_SCRIPT]);
	const postBuildRepository = await repositoryState();
	if (postBuildRepository.commit !== initialRepository.commit) {
		throw new Error("Git HEAD changed while rebuilding release output.");
	}
	await run(process.execPath, [POLICY_SCRIPT, "--built", "--pack"]);

	await copyFile(join(REPOSITORY_ROOT, LICENSE_FILENAME), join(artifactDirectory, LICENSE_FILENAME));
	const sbomResult = await run(process.execPath, [SBOM_SCRIPT, "--json"], { capture: true });
	const sbomBytes = `${JSON.stringify(JSON.parse(sbomResult.stdout), null, 2)}\n`;
	if (sbomResult.stdout !== sbomBytes) {
		throw new Error("SBOM generator did not return canonical JSON bytes.");
	}
	await writeFile(
		join(artifactDirectory, SBOM_FILENAME),
		sbomBytes,
		{ encoding: "utf8", flag: "wx" }
	);

	const pack = await runNpm([
		"pack",
		"--ignore-scripts",
		"--json",
		"--pack-destination",
		artifactDirectory
	], { capture: true });
	const packResult = inspectPackResult(JSON.parse(pack.stdout), packageJson);
	const tarballName = packResult.filename;
	const tarballPath = join(artifactDirectory, tarballName);
	const tarball = await readFile(tarballPath);
	const tarMetadata = inspectTarball(tarball, packResult.files);
	if (packResult.size !== tarball.length || packResult.unpackedSize !== tarMetadata.unpackedSize ||
		packResult.entryCount !== tarMetadata.entryCount) {
		throw new Error("npm pack size/count metadata does not match the inspected tarball bytes.");
	}

	const tarballSha256 = sha256(tarball);
	const npmIntegrity = `sha512-${hash(tarball, "sha512", "base64")}`;
	if (npmIntegrity !== packResult.integrity) {
		throw new Error("npm pack integrity does not match the tarball bytes.");
	}
	if (hash(tarball, "sha1", "hex") !== packResult.shasum) {
		throw new Error("npm pack SHA-1 compatibility digest does not match the tarball bytes.");
	}
	const receipt = {
		schemaVersion: 1,
		name: packageJson.name,
		version: packageJson.version,
		private: packageJson.private,
		filename: tarballName,
		sourceRepository: repositoryUrl(packageJson),
		sourceCommit: initialRepository.commit,
		sourceTreeDirty: false,
		license: packageJson.license,
		npmIntegrity,
		sha256: tarballSha256,
		size: tarball.length,
		unpackedSize: tarMetadata.unpackedSize,
		entryCount: tarMetadata.entryCount,
		toolchain: {
			node: process.versions.node,
			npm: npmVersion,
			packageManager: packageJson.packageManager
		}
	};
	await writeFile(
		join(artifactDirectory, RECEIPT_FILENAME),
		`${JSON.stringify(receipt, null, 2)}\n`,
		{ encoding: "utf8", flag: "wx" }
	);

	const checksumOrder = [tarballName, RECEIPT_FILENAME, SBOM_FILENAME, LICENSE_FILENAME];
	const checksumLines = [];
	for (const name of checksumOrder) {
		checksumLines.push(`${sha256(await readFile(join(artifactDirectory, name)))}  ${name}`);
	}
	await writeFile(
		join(artifactDirectory, CHECKSUM_FILENAME),
		`${checksumLines.join("\n")}\n`,
		{ encoding: "utf8", flag: "wx" }
	);
	await validateFlatBundle(artifactDirectory, [...checksumOrder, CHECKSUM_FILENAME]);
	await verifyChecksums(artifactDirectory, checksumOrder);

	const fixtureDirectory = await mkdtemp(join(tmpdir(), "lfc-package-check-"));
	try {
		await writeFile(
			join(fixtureDirectory, "package.json"),
			'{"name":"lfc-package-check","private":true,"type":"module"}\n',
			"utf8"
		);
		await runNpm([
			"install",
			tarballPath,
			"--cache",
			join(fixtureDirectory, ".npm-cache"),
			"--ignore-scripts",
			"--omit=dev",
			"--package-lock=false",
			"--audit=false",
			"--fund=false",
			"--offline"
		], { cwd: fixtureDirectory });

		const nodeModules = join(fixtureDirectory, "node_modules");
		const installedEntries = (await readdir(nodeModules)).filter((name) => name !== ".package-lock.json");
		const packageSegments = packageJson.name.split("/");
		const expectedRootEntry = packageSegments.length === 2 ? packageSegments[0] : packageJson.name;
		if (installedEntries.length !== 1 || installedEntries[0] !== expectedRootEntry) {
			throw new Error(`Unexpected production install contents: ${installedEntries.join(", ")}`);
		}
		if (packageSegments.length === 2) {
			const scopedEntries = await readdir(join(nodeModules, expectedRootEntry));
			if (scopedEntries.length !== 1 || scopedEntries[0] !== packageSegments[1]) {
				throw new Error(`Unexpected scoped production install contents: ${scopedEntries.join(", ")}`);
			}
		}

		const installedPackage = join(nodeModules, packageJson.name);
		const installedManifest = JSON.parse(await readFile(join(installedPackage, "package.json"), "utf8"));
		if (JSON.stringify(installedManifest) !== JSON.stringify(packageJson)) {
			throw new Error("The packed manifest differs from the policy-checked source manifest.");
		}
		try {
			const nestedEntries = await readdir(join(installedPackage, "node_modules"));
			if (nestedEntries.length > 0) {
				throw new Error(`Runtime dependencies were installed: ${nestedEntries.join(", ")}`);
			}
		} catch (error) {
			if (!(error instanceof Error && "code" in error && error.code === "ENOENT")) {
				throw error;
			}
		}

		await writeFile(
			join(fixtureDirectory, "consumer.ts"),
			[
				`import ${JSON.stringify(`${packageJson.name}/styles.css`)};`,
				"import {",
				"\tcreateCalendar,",
				"\ttype Calendar,",
				"\ttype CalendarEventInput,",
				"\ttype CalendarOptions",
				`} from ${JSON.stringify(packageJson.name)};`,
				"",
				"interface Metadata {",
				"\treadonly sourceId: string;",
				"}",
				"",
				"const events: readonly CalendarEventInput<Metadata>[] = [];",
				"const options: CalendarOptions<Metadata> = { events };",
				"declare const host: HTMLElement;",
				"const calendar: Calendar = createCalendar(host, options);",
				"void calendar.getState();",
				""
			].join("\n"),
			"utf8"
		);
		await writeFile(
			join(fixtureDirectory, "tsconfig.json"),
			`${JSON.stringify({
				compilerOptions: {
					exactOptionalPropertyTypes: true,
					lib: ["ES2022", "DOM", "DOM.Iterable"],
					module: "NodeNext",
					moduleResolution: "NodeNext",
					noEmit: true,
					noUncheckedIndexedAccess: true,
					skipLibCheck: false,
					strict: true,
					target: "ES2022",
					types: []
				},
				files: ["consumer.ts"]
			}, null, 2)}\n`,
			"utf8"
		);
		await runTsc(["-p", "tsconfig.json", "--pretty", "false"], { cwd: fixtureDirectory });

		const verification = [
			`await import(${JSON.stringify(packageJson.name)});`,
			`const style = import.meta.resolve(${JSON.stringify(`${packageJson.name}/styles.css`)});`,
			"if (!style.endsWith('/dist/styles.css')) throw new Error(`Unexpected style export: ${style}`);"
		].join("\n");
		await run(process.execPath, ["--input-type=module", "--eval", verification], { cwd: fixtureDirectory });
		await verifyPackedBrowserInteraction(installedPackage);
	} finally {
		await rm(fixtureDirectory, { force: true, recursive: true });
	}

	const finalRepository = await repositoryState();
	if (finalRepository.commit !== initialRepository.commit) {
		throw new Error("Git HEAD changed while producing the release bundle.");
	}

	return { tarballName, tarballSha256 };
}

const bundleDirectoryName = releaseBundleDirectoryName(packageJson.name, packageJson.version);
let artifactWorkspace = await createArtifactWorkspace({
	artifactRoot: ARTIFACT_ROOT,
	bundleDirectoryName,
	repositoryRoot: REPOSITORY_ROOT,
	verifyOnly: releaseArguments.verifyOnly
});
try {
	const result = await produceReleaseBundle(artifactWorkspace.artifactDirectory);
	if (!releaseArguments.verifyOnly) {
		artifactWorkspace = await finalizeArtifactWorkspace(artifactWorkspace);
		if (typeof artifactWorkspace.reservationCleanupWarning === "string") {
			console.warn(artifactWorkspace.reservationCleanupWarning);
		}
	}
	console.log(
		`Verified ${result.tarballName} (${result.tarballSha256}) from ${initialRepository.commit} ` +
		"with a dependency-free install and packed-byte browser interaction."
	);
	if (releaseArguments.verifyOnly) {
		console.log("Transient artifact bundle verified and removed; .artifacts was not changed.");
	} else {
		console.log(pathToFileURL(join(artifactWorkspace.artifactDirectory, result.tarballName)).href);
	}
} finally {
	await cleanupArtifactWorkspace(artifactWorkspace);
}
