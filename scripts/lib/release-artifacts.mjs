import { lstat, mkdir, mkdtemp, readdir, realpath, rename, rm } from "node:fs/promises";
import { basename, join, relative, resolve } from "node:path";
import { tmpdir } from "node:os";

const STAGING_PREFIX = ".staging-";
const RESERVATION_SUFFIX = ".lock";

function isMissingPathError(error) {
	return error instanceof Error && "code" in error && error.code === "ENOENT";
}

async function readPathMetadata(path) {
	try {
		return await lstat(path);
	} catch (error) {
		if (isMissingPathError(error)) {
			return null;
		}
		throw error;
	}
}

function removeOwnedDirectory(path) {
	return rm(path, { force: true, maxRetries: 3, recursive: true, retryDelay: 100 });
}

function assertDirectArtifactRoot(repositoryRoot, artifactRoot) {
	const resolvedRepository = resolve(repositoryRoot);
	const resolvedArtifacts = resolve(artifactRoot);
	if (relative(resolvedRepository, resolvedArtifacts) !== ".artifacts") {
		throw new Error(`Refusing to use unsafe artifact root: ${resolvedArtifacts}`);
	}
}

async function assertRealArtifactRoot(repositoryRoot, artifactRoot) {
	assertDirectArtifactRoot(repositoryRoot, artifactRoot);
	const metadata = await readPathMetadata(artifactRoot);
	if (metadata === null) {
		await mkdir(artifactRoot);
	} else if (metadata.isSymbolicLink() || !metadata.isDirectory()) {
		throw new Error(`Refusing to use non-directory or linked artifact root: ${artifactRoot}`);
	}

	const [actualRepository, actualArtifacts] = await Promise.all([
		realpath(repositoryRoot),
		realpath(artifactRoot)
	]);
	const actualRelative = relative(actualRepository, actualArtifacts);
	if (actualRelative !== ".artifacts") {
		throw new Error(`Artifact root resolves outside its repository location: ${actualArtifacts}`);
	}
}

async function assertCompatibleArtifactRoot(artifactRoot) {
	const entries = await readdir(artifactRoot, { withFileTypes: true });
	for (const entry of entries) {
		const path = join(artifactRoot, entry.name);
		const metadata = await lstat(path);
		if (metadata.isSymbolicLink() || !metadata.isDirectory()) {
			throw new Error(
				`Refusing to mix versioned bundles with legacy or linked artifact entry: ${path}`
			);
		}
		if (entry.name.startsWith(STAGING_PREFIX) || entry.name.endsWith(RESERVATION_SUFFIX)) {
			throw new Error(`Incomplete release staging directory requires manual review: ${path}`);
		}
	}
}

async function assertMissingFinalDirectory(finalDirectory) {
	const metadata = await readPathMetadata(finalDirectory);
	if (metadata !== null) {
		throw new Error(
			`Release bundle already exists and will not be replaced: ${finalDirectory}`
		);
	}
}

export function parseReleaseArguments(arguments_) {
	if (!Array.isArray(arguments_) || arguments_.some((argument) => argument !== "--verify-only")) {
		throw new Error("Usage: node scripts/pack-release.mjs [--verify-only]");
	}
	if (arguments_.length > 1) {
		throw new Error("--verify-only may be supplied at most once.");
	}
	return Object.freeze({ verifyOnly: arguments_.length === 1 });
}

export function releaseBundleDirectoryName(packageName, version) {
	const safeName = packageName.startsWith("@")
		? packageName.slice(1).replaceAll("/", "-")
		: packageName;
	const name = `${safeName}-${version}`;
	if (name.length === 0 || basename(name) !== name || name === "." || name === "..") {
		throw new Error(`Package identity produced an unsafe release bundle name: ${name}`);
	}
	return name;
}

export async function createArtifactWorkspace({
	artifactRoot,
	bundleDirectoryName,
	repositoryRoot,
	temporaryRoot = tmpdir(),
	verifyOnly
}) {
	if (verifyOnly) {
		const artifactDirectory = await mkdtemp(join(temporaryRoot, "lfc-release-verify-"));
		return {
			artifactDirectory,
			cleanupDirectory: artifactDirectory,
			finalDirectory: null,
			reservationCleanupWarning: null,
			reservationDirectory: null
		};
	}

	if (basename(bundleDirectoryName) !== bundleDirectoryName ||
		bundleDirectoryName === "." || bundleDirectoryName === "..") {
		throw new Error(`Unsafe release bundle directory name: ${bundleDirectoryName}`);
	}

	await assertRealArtifactRoot(repositoryRoot, artifactRoot);
	await assertCompatibleArtifactRoot(artifactRoot);
	const finalDirectory = join(artifactRoot, bundleDirectoryName);
	await assertMissingFinalDirectory(finalDirectory);
	const reservationDirectory = `${finalDirectory}${RESERVATION_SUFFIX}`;
	try {
		await mkdir(reservationDirectory);
	} catch (error) {
		if (error instanceof Error && "code" in error && error.code === "EEXIST") {
			throw new Error(`Release bundle creation is already reserved: ${finalDirectory}`, { cause: error });
		}
		throw error;
	}
	try {
		const artifactDirectory = await mkdtemp(join(artifactRoot, STAGING_PREFIX));
		return {
			artifactDirectory,
			cleanupDirectory: artifactDirectory,
			finalDirectory,
			reservationCleanupWarning: null,
			reservationDirectory
		};
	} catch (error) {
		await removeOwnedDirectory(reservationDirectory);
		throw error;
	}
}

export async function finalizeArtifactWorkspace(workspace, options = {}) {
	if (workspace.finalDirectory === null) {
		return workspace;
	}

	await assertMissingFinalDirectory(workspace.finalDirectory);
	await rename(workspace.artifactDirectory, workspace.finalDirectory);
	const removeReservation = options.removeReservation ?? removeOwnedDirectory;
	let reservationCleanupWarning = null;
	try {
		await removeReservation(workspace.reservationDirectory);
	} catch (error) {
		const detail = error instanceof Error ? error.message : String(error);
		reservationCleanupWarning =
			`Release bundle committed at ${workspace.finalDirectory}, but reservation cleanup requires ` +
			`manual review at ${workspace.reservationDirectory}: ${detail}`;
	}
	return {
		artifactDirectory: workspace.finalDirectory,
		cleanupDirectory: null,
		finalDirectory: workspace.finalDirectory,
		reservationCleanupWarning,
		reservationDirectory: null
	};
}

export async function cleanupArtifactWorkspace(workspace) {
	if (typeof workspace.cleanupDirectory === "string") {
		await removeOwnedDirectory(workspace.cleanupDirectory);
	}
	if (typeof workspace.reservationDirectory === "string") {
		await removeOwnedDirectory(workspace.reservationDirectory);
	}
}
