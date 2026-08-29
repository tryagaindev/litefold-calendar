import { randomUUID } from "node:crypto";
import { readFile, rename, rm, writeFile } from "node:fs/promises";
import { join, relative, resolve, sep } from "node:path";

import {
	compareSemVerPrecedence,
	isAlphaVersion,
	nextAlphaVersion,
	parseSemVer
} from "./semver.mjs";
import { REPOSITORY_ROOT, run } from "./process.mjs";

export const EXPECTED_PACKAGE_NAME = "@tryagaindev/litefold-calendar";
export const EXPECTED_REPOSITORY = "git+https://github.com/tryagaindev/litefold-calendar.git";
export const EXPECTED_GITHUB_REPOSITORY = "tryagaindev/litefold-calendar";
export const RELEASE_STATE_FILES = Object.freeze([
	"CHANGELOG.md",
	"package-lock.json",
	"package.json"
]);

const EMPTY_UNRELEASED = "<!-- Add user-visible changes under an appropriate Keep a Changelog category. -->";
const CHANGELOG_HEADING_PATTERN = /^## \[([^\]]+)\](?: - (\d{4}-\d{2}-\d{2}))?[ \t]*$/gmu;
const FULL_COMMIT_PATTERN = /^[0-9a-f]{40}$/u;
const PLACEHOLDER_PATTERN = /^(?:-|\*|\s)*(?:n\/?a|none|nothing|tbd\b.*|todo\b.*|add (?:release notes|changes).*)[.!]?(?:\s*)$/iu;

function parseJson(text, name) {
	try {
		return JSON.parse(text);
	} catch (error) {
		throw new Error(`${name} must contain valid JSON.`, { cause: error });
	}
}

function serializeJsonLike(original, value) {
	const newline = original.includes("\r\n") ? "\r\n" : "\n";
	const indent = /^([ \t]+)"/mu.exec(original)?.[1] ?? "\t";
	return `${JSON.stringify(value, null, indent).replaceAll("\n", newline)}${newline}`;
}

function repositoryUrl(packageJson) {
	return typeof packageJson.repository === "string"
		? packageJson.repository
		: packageJson.repository?.url;
}

function findLineEnd(text, start) {
	const newline = text.indexOf("\n", start);
	return newline === -1 ? text.length : newline + 1;
}

function isValidUtcDate(value) {
	if (!/^\d{4}-\d{2}-\d{2}$/u.test(value)) {
		return false;
	}
	const date = new Date(`${value}T00:00:00.000Z`);
	return !Number.isNaN(date.getTime()) && date.toISOString().slice(0, 10) === value;
}

function maskCharacters(value) {
	return value.replace(/[^\r\n]/g, " ");
}

function maskHtmlComments(source) {
	const fragments = [];
	let cursor = 0;
	while (cursor < source.length) {
		const commentStart = source.indexOf("<!--", cursor);
		if (commentStart === -1) {
			fragments.push(source.slice(cursor));
			break;
		}
		fragments.push(source.slice(cursor, commentStart));
		const commentEnd = source.indexOf("-->", commentStart + 4);
		if (commentEnd === -1) {
			throw new Error("CHANGELOG.md contains an unterminated HTML comment.");
		}
		const afterComment = commentEnd + 3;
		fragments.push(maskCharacters(source.slice(commentStart, afterComment)));
		cursor = afterComment;
	}
	return fragments.join("");
}

function hasMeaningfulNotes(body) {
	const source = maskHtmlComments(body).trim();
	if (source.length === 0 || PLACEHOLDER_PATTERN.test(source)) {
		return false;
	}
	return source.split(/\r?\n/u).some((line) =>
		/^\s*[-*]\s+\S/u.test(line) && !PLACEHOLDER_PATTERN.test(line.trim())
	);
}

function isEmptyUnreleased(body) {
	return maskHtmlComments(body).trim().length === 0;
}

function displayPath(path, root) {
	return relative(root, path).replaceAll(sep, "/");
}

async function captureGit(arguments_, repositoryRoot, allowFailure = false) {
	try {
		const result = await run("git", arguments_, { capture: true, cwd: repositoryRoot });
		return { exists: true, value: result.stdout.trim() };
	} catch (error) {
		if (allowFailure) {
			return { exists: false, value: "" };
		}
		throw error;
	}
}

function normalizeOriginUrl(value) {
	return value
		.replace(/^git@github\.com:/iu, "https://github.com/")
		.replace(/^git\+https:/iu, "https:")
		.replace(/\.git\/?$/iu, "")
		.replace(/\/$/u, "")
		.toLowerCase();
}

/** Parses and validates the release sections in CHANGELOG.md. */
export function parseChangelog(text) {
	const visibleText = maskHtmlComments(text);
	for (const line of visibleText.split(/\r?\n/u)) {
		if (/^[ \t]{0,3}##[ \t]*\[/u.test(line) &&
			!/^## \[[^\]]+\](?: - \d{4}-\d{2}-\d{2})?[ \t]*$/u.test(line)) {
			throw new Error(`Malformed bracketed changelog heading: ${line}`);
		}
	}

	const headings = [];
	for (const match of visibleText.matchAll(CHANGELOG_HEADING_PATTERN)) {
		headings.push({
			bodyStart: findLineEnd(text, match.index + match[0].length),
			date: match[2] ?? null,
			headingEnd: match.index + match[0].length,
			headingStart: match.index,
			name: match[1]
		});
	}
	for (let index = 0; index < headings.length; index += 1) {
		headings[index].bodyEnd = headings[index + 1]?.headingStart ?? text.length;
		headings[index].body = text.slice(headings[index].bodyStart, headings[index].bodyEnd);
	}

	const unreleased = headings.filter((entry) => entry.name === "Unreleased");
	if (unreleased.length !== 1 || unreleased[0].date !== null || headings[0] !== unreleased[0]) {
		throw new Error("CHANGELOG.md must begin with exactly one undated [Unreleased] section.");
	}
	const releases = headings.filter((entry) => entry.name !== "Unreleased");
	const seen = new Set();
	for (const release of releases) {
		parseSemVer(release.name);
		if (release.date === null || !isValidUtcDate(release.date)) {
			throw new Error(`Changelog release ${release.name} must have a valid YYYY-MM-DD date.`);
		}
		if (seen.has(release.name)) {
			throw new Error(`CHANGELOG.md contains duplicate release ${release.name}.`);
		}
		seen.add(release.name);
	}
	for (let index = 1; index < releases.length; index += 1) {
		if (compareSemVerPrecedence(releases[index - 1].name, releases[index].name) <= 0) {
			throw new Error("Dated changelog releases must be in strictly descending SemVer order.");
		}
	}
	return { headings, releases, unreleased: unreleased[0] };
}

/** Parses the three versioned release-state files. */
export function readReleaseStateTexts(texts) {
	return {
		changelog: parseChangelog(texts.changelog),
		packageJson: parseJson(texts.packageJson, "package.json"),
		packageLock: parseJson(texts.packageLock, "package-lock.json"),
		texts
	};
}

function validatePackageMetadata(packageJson) {
	if (packageJson.name !== EXPECTED_PACKAGE_NAME || packageJson.private !== false) {
		throw new Error(`Release publishing requires public package ${EXPECTED_PACKAGE_NAME}.`);
	}
	if (!isAlphaVersion(packageJson.version)) {
		throw new Error("Release publishing requires a 0.x.y-alpha.N version.");
	}
	if (repositoryUrl(packageJson) !== EXPECTED_REPOSITORY) {
		throw new Error(`Release repository must be ${EXPECTED_REPOSITORY}.`);
	}
	if (packageJson.publishConfig?.access !== "public" ||
		packageJson.publishConfig?.provenance !== true ||
		packageJson.publishConfig?.tag !== "alpha") {
		throw new Error("Release publishConfig must require public access, provenance, and the alpha dist-tag.");
	}
}

function validateLockfile(packageJson, packageLock) {
	if (packageLock.name !== packageJson.name || packageLock.packages?.[""]?.name !== packageJson.name) {
		throw new Error("package-lock.json package names must match package.json.");
	}
	if (packageLock.version !== packageJson.version ||
		packageLock.packages?.[""]?.version !== packageJson.version) {
		throw new Error("package.json and both package-lock.json version fields must match exactly.");
	}
}

/** Validates a release-ready manifest, lockfile, and changelog. */
export function validatePreparedReleaseState(state, options = {}) {
	validatePackageMetadata(state.packageJson);
	validateLockfile(state.packageJson, state.packageLock);
	const version = state.packageJson.version;
	if (options.expectedVersion !== undefined && version !== options.expectedVersion) {
		throw new Error(`Release version must be ${options.expectedVersion}; received ${version}.`);
	}
	const tag = `v${version}`;
	if (options.expectedTag !== undefined && tag !== options.expectedTag) {
		throw new Error(`Release tag must be ${tag}; received ${options.expectedTag}.`);
	}
	if (state.changelog.releases[0]?.name !== version ||
		!hasMeaningfulNotes(state.changelog.releases[0]?.body ?? "")) {
		throw new Error(`The newest changelog release must be meaningful [${version}].`);
	}
	if (options.requireEmptyUnreleased !== false && !isEmptyUnreleased(state.changelog.unreleased.body)) {
		throw new Error("The [Unreleased] section must be empty before publishing.");
	}
	return { tag, version };
}

/** Calculates deterministic release-state file content without writing it. */
export function createPreparedReleaseTexts(texts, options) {
	if (!isValidUtcDate(options.date)) {
		throw new Error("Release preparation requires a valid UTC date in YYYY-MM-DD form.");
	}
	const state = readReleaseStateTexts(texts);
	validatePackageMetadata(state.packageJson);
	validateLockfile(state.packageJson, state.packageLock);
	if (state.changelog.releases[0]?.name !== state.packageJson.version) {
		throw new Error(
			`Current package version ${state.packageJson.version} must match the newest dated changelog release.`
		);
	}
	if (!hasMeaningfulNotes(state.changelog.unreleased.body)) {
		throw new Error("The [Unreleased] section must contain at least one meaningful bullet note.");
	}
	const version = nextAlphaVersion(state.packageJson.version, options.bump);
	if (state.changelog.releases.some((entry) => entry.name === version)) {
		throw new Error(`Changelog release ${version} already exists.`);
	}
	if (state.changelog.releases.some((entry) => compareSemVerPrecedence(version, entry.name) <= 0)) {
		throw new Error(`Next release ${version} must be greater than existing changelog releases.`);
	}

	const packageJson = structuredClone(state.packageJson);
	packageJson.version = version;
	const packageLock = structuredClone(state.packageLock);
	packageLock.version = version;
	packageLock.packages[""].version = version;
	const notes = state.changelog.unreleased.body.trim();
	const prefix = texts.changelog.slice(0, state.changelog.unreleased.headingEnd);
	const suffix = texts.changelog.slice(state.changelog.unreleased.bodyEnd).trimStart();
	const changelog = `${prefix}\n\n${EMPTY_UNRELEASED}\n\n## [${version}] - ${options.date}\n\n${notes}\n\n${suffix}`
		.trimEnd() + "\n";
	const preparedTexts = {
		changelog,
		packageJson: serializeJsonLike(texts.packageJson, packageJson),
		packageLock: serializeJsonLike(texts.packageLock, packageLock)
	};
	validatePreparedReleaseState(readReleaseStateTexts(preparedTexts), { expectedVersion: version });
	return { tag: `v${version}`, texts: preparedTexts, version };
}

/** Reads all release-state files from a repository root. */
export async function readReleaseTexts(repositoryRoot = REPOSITORY_ROOT) {
	const root = resolve(repositoryRoot);
	const [changelog, packageJson, packageLock] = await Promise.all([
		readFile(join(root, "CHANGELOG.md"), "utf8"),
		readFile(join(root, "package.json"), "utf8"),
		readFile(join(root, "package-lock.json"), "utf8")
	]);
	return { changelog, packageJson, packageLock };
}

/** Replaces the release-state files and restores originals on replacement failure. */
export async function writeReleaseFilesAtomically(repositoryRoot, originalTexts, nextTexts, operations = {}) {
	const root = resolve(repositoryRoot);
	const renameFile = operations.rename ?? rename;
	const removeFile = operations.rm ?? rm;
	const write = operations.writeFile ?? writeFile;
	const transaction = randomUUID();
	const entries = [
		{ name: "CHANGELOG.md", original: originalTexts.changelog, value: nextTexts.changelog },
		{ name: "package-lock.json", original: originalTexts.packageLock, value: nextTexts.packageLock },
		{ name: "package.json", original: originalTexts.packageJson, value: nextTexts.packageJson }
	].map((entry) => ({
		...entry,
		backup: join(root, `${entry.name}.release-${transaction}.bak`),
		path: join(root, entry.name),
		temporary: join(root, `${entry.name}.release-${transaction}.tmp`)
	}));
	const backedUp = [];
	let completed = false;
	try {
		for (const entry of entries) {
			if (await readFile(entry.path, "utf8") !== entry.original) {
				throw new Error(`${displayPath(entry.path, root)} changed during release preparation.`);
			}
			await write(entry.temporary, entry.value, { encoding: "utf8", flag: "wx" });
		}
		for (const entry of entries) {
			await renameFile(entry.path, entry.backup);
			backedUp.push(entry);
			await renameFile(entry.temporary, entry.path);
		}
		completed = true;
	} catch (error) {
		const rollbackErrors = [];
		for (const entry of [...backedUp].reverse()) {
			try {
				await removeFile(entry.path, { force: true });
				await renameFile(entry.backup, entry.path);
			} catch (rollbackError) {
				rollbackErrors.push(rollbackError);
			}
		}
		if (rollbackErrors.length > 0) {
			throw new AggregateError(
				rollbackErrors,
				"Release preparation failed and rollback was incomplete.",
				{ cause: error }
			);
		}
		throw error;
	} finally {
		await Promise.all(entries.map((entry) => removeFile(entry.temporary, { force: true })));
		if (completed) {
			await Promise.all(entries.map((entry) => removeFile(entry.backup, { force: true })));
		}
	}
}

/** Inspects the local Git identity used by release preparation and publication. */
export async function inspectGitReleaseState(repositoryRoot, options = {}) {
	const root = resolve(repositoryRoot);
	const topLevel = resolve((await captureGit(["rev-parse", "--show-toplevel"], root)).value);
	if (topLevel !== root) {
		throw new Error(`Release command must run from repository root ${root}.`);
	}
	const head = (await captureGit(["rev-parse", "HEAD"], root)).value.toLowerCase();
	if (options.expectedCommit !== undefined &&
		(!FULL_COMMIT_PATTERN.test(options.expectedCommit) || head !== options.expectedCommit)) {
		throw new Error(`Release commit must be current HEAD ${head}; received ${options.expectedCommit}.`);
	}
	const origin = (await captureGit(["config", "--get", "remote.origin.url"], root)).value;
	if (normalizeOriginUrl(origin) !== "https://github.com/tryagaindev/litefold-calendar") {
		throw new Error("Git origin must be the canonical tryagaindev/litefold-calendar repository.");
	}
	const status = (await captureGit(["status", "--porcelain=v1", "--untracked-files=all"], root)).value;
	if (options.requireClean === true && status.length > 0) {
		throw new Error("Release verification requires a clean Git worktree.");
	}

	const tagState = options.tagState ?? "either";
	if (!new Set(["absent", "either", "matching"]).has(tagState)) {
		throw new Error("Git tag state must be absent, either, or matching.");
	}
	let tagExists = false;
	if (options.tag !== undefined) {
		parseSemVer(options.tag.startsWith("v") ? options.tag.slice(1) : "");
		const reference = await captureGit(
			["show-ref", "--verify", "--hash", `refs/tags/${options.tag}`],
			root,
			true
		);
		tagExists = reference.exists;
		if (tagExists) {
			const tagCommit = await captureGit(["rev-parse", `${options.tag}^{commit}`], root);
			if (tagCommit.value.toLowerCase() !== head) {
				throw new Error(`Existing tag ${options.tag} does not resolve to current HEAD ${head}.`);
			}
		}
		if (tagState === "absent" && tagExists) {
			throw new Error(`Release tag ${options.tag} already exists.`);
		}
		if (tagState === "matching" && !tagExists) {
			throw new Error(`Release tag ${options.tag} does not exist locally.`);
		}
	}
	return { clean: status.length === 0, head, origin, tagExists };
}

/** Verifies local release state without querying mutable hosted services. */
export async function verifyRelease(options = {}) {
	const repositoryRoot = resolve(options.repositoryRoot ?? REPOSITORY_ROOT);
	if (process.env.GITHUB_REPOSITORY !== undefined &&
		process.env.GITHUB_REPOSITORY.toLowerCase() !== EXPECTED_GITHUB_REPOSITORY) {
		throw new Error(`Release workflow must run from ${EXPECTED_GITHUB_REPOSITORY}.`);
	}
	const identity = validatePreparedReleaseState(
		readReleaseStateTexts(await readReleaseTexts(repositoryRoot)),
		{ expectedTag: options.expectedTag, expectedVersion: options.expectedVersion }
	);
	const git = await inspectGitReleaseState(repositoryRoot, {
		expectedCommit: options.expectedCommit,
		requireClean: options.requireClean,
		tag: identity.tag,
		tagState: options.tagState
	});
	return { ...identity, git, status: "ready" };
}

/** Prepares deterministic release state after validating the current clean repository. */
export async function prepareRelease(options) {
	const repositoryRoot = resolve(options.repositoryRoot ?? REPOSITORY_ROOT);
	const originalTexts = await readReleaseTexts(repositoryRoot);
	const prepared = createPreparedReleaseTexts(originalTexts, {
		bump: options.bump,
		date: options.date ?? new Date().toISOString().slice(0, 10)
	});
	const git = await inspectGitReleaseState(repositoryRoot, {
		requireClean: options.requireClean !== false,
		tag: prepared.tag,
		tagState: "absent"
	});
	if (options.dryRun !== true) {
		await writeReleaseFilesAtomically(repositoryRoot, originalTexts, prepared.texts);
	}
	return {
		branch: `release/${prepared.tag}`,
		changedFiles: RELEASE_STATE_FILES,
		dryRun: options.dryRun === true,
		head: git.head,
		status: options.dryRun === true ? "planned" : "prepared",
		tag: prepared.tag,
		version: prepared.version
	};
}
