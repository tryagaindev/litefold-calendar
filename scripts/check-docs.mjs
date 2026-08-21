import { readFile, readdir, stat } from "node:fs/promises";
import { dirname, extname, isAbsolute, join, relative, resolve, sep } from "node:path";

import { REPOSITORY_ROOT } from "./lib/process.mjs";

const API_DOCUMENT_PATH = join(REPOSITORY_ROOT, "docs", "api.md");
const ROOT_EXPORT_PATH = join(REPOSITORY_ROOT, "src", "index.ts");
const EXCLUDED_DIRECTORIES = new Set([
	".artifacts",
	".git",
	".test-dist",
	"dist",
	"node_modules"
]);
const VAGUE_LINK_LABELS = new Set([
	"learn more",
	"link",
	"more",
	"read more",
	"this link"
]);
const errors = [];
const anchorCache = new Map();

function addError(message) {
	errors.push(message);
}

function displayPath(path) {
	return relative(REPOSITORY_ROOT, path).replaceAll(sep, "/");
}

function lineNumberAt(source, index) {
	let line = 1;
	for (let position = 0; position < index; position += 1) {
		if (source[position] === "\n") {
			line += 1;
		}
	}
	return line;
}

function maskCharacters(value) {
	return value.replace(/[^\r\n]/gu, " ");
}

function maskFencedContent(source) {
	let masked = source.replace(/<!--[\s\S]*?-->/gu, (comment) => maskCharacters(comment));
	const lines = masked.split(/(?<=\n)/u);
	let fenceMarker;
	masked = lines.map((line) => {
		const fence = /^\s{0,3}(`{3,}|~{3,})/u.exec(line);
		if (fenceMarker === undefined) {
			if (fence === null) {
				return line;
			}
			fenceMarker = fence[1];
			return maskCharacters(line);
		}
		if (fence !== null &&
			fenceMarker !== undefined &&
			fence[1]?.[0] === fenceMarker[0] &&
			(fence[1]?.length ?? 0) >= fenceMarker.length) {
			fenceMarker = undefined;
		}
		return maskCharacters(line);
	}).join("");

	return masked;
}

function maskNonProse(source) {
	return maskFencedContent(source)
		.replace(/(`+)([^\r\n]*?)\1/gu, (code) => maskCharacters(code));
}

async function collectMarkdownFiles(directory) {
	const entries = await readdir(directory, { withFileTypes: true });
	const files = [];
	for (const entry of entries.sort((left, right) => left.name.localeCompare(right.name))) {
		const path = join(directory, entry.name);
		if (entry.isDirectory() && !EXCLUDED_DIRECTORIES.has(entry.name)) {
			files.push(...await collectMarkdownFiles(path));
		} else if (entry.isFile() && extname(entry.name).toLowerCase() === ".md") {
			files.push(path);
		}
	}
	return files;
}

function findClosingBracket(source, start) {
	let depth = 0;
	for (let index = start; index < source.length; index += 1) {
		const character = source[index];
		if (character === "\\") {
			index += 1;
		} else if (character === "[") {
			depth += 1;
		} else if (character === "]") {
			depth -= 1;
			if (depth === 0) {
				return index;
			}
		}
	}
	return -1;
}

function parseInlineDestination(source, start) {
	let index = start;
	while (/\s/u.test(source[index] ?? "")) {
		index += 1;
	}
	if (source[index] === ")") {
		return { destination: "", end: index };
	}
	if (source[index] === "<") {
		const destinationEnd = source.indexOf(">", index + 1);
		if (destinationEnd === -1) {
			return undefined;
		}
		const close = source.indexOf(")", destinationEnd + 1);
		if (close === -1) {
			return undefined;
		}
		return {
			destination: source.slice(index + 1, destinationEnd),
			end: close
		};
	}

	const destinationStart = index;
	let parenthesisDepth = 0;
	for (; index < source.length; index += 1) {
		const character = source[index];
		if (character === "\\") {
			index += 1;
		} else if (character === "(") {
			parenthesisDepth += 1;
		} else if (character === ")") {
			if (parenthesisDepth === 0) {
				return {
					destination: source.slice(destinationStart, index),
					end: index
				};
			}
			parenthesisDepth -= 1;
		} else if (/\s/u.test(character ?? "") && parenthesisDepth === 0) {
			const close = source.indexOf(")", index);
			if (close === -1) {
				return undefined;
			}
			return {
				destination: source.slice(destinationStart, index),
				end: close
			};
		}
	}
	return undefined;
}

function extractInlineLinks(source) {
	const links = [];
	for (let index = 0; index < source.length; index += 1) {
		if (source[index] !== "[" || source[index - 1] === "\\") {
			continue;
		}
		const labelEnd = findClosingBracket(source, index);
		if (labelEnd === -1 || source[labelEnd + 1] !== "(") {
			continue;
		}
		const parsed = parseInlineDestination(source, labelEnd + 2);
		if (parsed === undefined) {
			continue;
		}
		links.push({
			destination: parsed.destination,
			image: source[index - 1] === "!",
			index,
			label: source.slice(index + 1, labelEnd)
		});
		index = parsed.end;
	}
	return links;
}

function normalizeReferenceLabel(label) {
	return label.trim().replace(/\s+/gu, " ").toLowerCase();
}

function extractReferenceLinks(source) {
	const definitions = new Map();
	const links = [];
	const definitionPattern = /^\s{0,3}\[([^\]\r\n]+)\]:\s*(?:<([^>\r\n]+)>|(\S+))/gmu;
	for (const match of source.matchAll(definitionPattern)) {
		const label = match[1] ?? "";
		const destination = match[2] ?? match[3] ?? "";
		definitions.set(normalizeReferenceLabel(label), { destination, index: match.index });
		links.push({ destination, image: true, index: match.index, label });
	}

	const usagePattern = /(!?)\[([^\]\r\n]+)\]\[([^\]\r\n]*)\]/gu;
	for (const match of source.matchAll(usagePattern)) {
		const label = match[2] ?? "";
		const reference = normalizeReferenceLabel(match[3]?.length ? match[3] : label);
		const definition = definitions.get(reference);
		if (definition === undefined) {
			links.push({
				destination: undefined,
				image: match[1] === "!",
				index: match.index,
				label,
				missingReference: reference
			});
			continue;
		}
		links.push({
			destination: undefined,
			image: match[1] === "!",
			index: match.index,
			label
		});
	}

	const shortcutPattern = /(!?)\[([^\]\r\n]+)\]/gu;
	for (const match of source.matchAll(shortcutPattern)) {
		const label = match[2] ?? "";
		if (!definitions.has(normalizeReferenceLabel(label))) {
			continue;
		}
		const end = match.index + match[0].length;
		if (source[match.index - 1] === "]" || ["(", "[", ":"].includes(source[end] ?? "")) {
			continue;
		}
		links.push({
			destination: undefined,
			image: match[1] === "!",
			index: match.index,
			label
		});
	}
	return links;
}

function normalizeLinkLabel(label) {
	return label
		.replace(/<[^>]*>/gu, " ")
		.replace(/[`*_~]/gu, "")
		.replace(/\s+/gu, " ")
		.trim()
		.replace(/[.!?:;]+$/gu, "")
		.toLowerCase();
}

function isVagueLinkLabel(label) {
	const normalized = normalizeLinkLabel(label);
	return VAGUE_LINK_LABELS.has(normalized) || /^(?:click\s+)?here(?:\b|$)/u.test(normalized);
}

function isExternalDestination(destination) {
	return /^[a-z][a-z\d+.-]*:/iu.test(destination) || destination.startsWith("//");
}

function targetUsesExcludedDirectory(path) {
	const parts = relative(REPOSITORY_ROOT, path).split(/[\\/]/u);
	return parts.some((part) => EXCLUDED_DIRECTORIES.has(part));
}

function decodeLinkPart(value, sourcePath, line, kind) {
	try {
		return decodeURIComponent(value);
	} catch {
		addError(`${displayPath(sourcePath)}:${String(line)} has an invalid percent-encoded ${kind}.`);
		return undefined;
	}
}

function githubSlug(value) {
	return value
		.replace(/<[^>]*>/gu, "")
		.replace(/\[([^\]]+)\]\([^)]*\)/gu, "$1")
		.replace(/[`*_~]/gu, "")
		.trim()
		.toLowerCase()
		.replace(/[^\p{L}\p{M}\p{N} _-]/gu, "")
		.replace(/\s+/gu, "-");
}

async function markdownAnchors(path) {
	const cached = anchorCache.get(path);
	if (cached !== undefined) {
		return cached;
	}
	const source = await readFile(path, "utf8");
	const prose = maskFencedContent(source);
	const anchors = new Set();
	const occurrences = new Map();
	const addHeading = (heading) => {
		const base = githubSlug(heading);
		const occurrence = occurrences.get(base) ?? 0;
		occurrences.set(base, occurrence + 1);
		anchors.add(occurrence === 0 ? base : `${base}-${String(occurrence)}`);
	};

	for (const match of prose.matchAll(/^\s{0,3}#{1,6}\s+(.+?)\s*#*\s*$/gmu)) {
		addHeading(match[1] ?? "");
	}
	for (const match of prose.matchAll(/^([^\r\n]+)\r?\n\s{0,3}(?:=+|-+)\s*$/gmu)) {
		addHeading(match[1] ?? "");
	}
	for (const match of prose.matchAll(/<(?:a|[^>]+)\s+(?:id|name)\s*=\s*["']([^"']+)["'][^>]*>/giu)) {
		anchors.add(match[1] ?? "");
	}
	anchorCache.set(path, anchors);
	return anchors;
}

async function validateDestination(sourcePath, source, link) {
	if (link.destination === undefined) {
		return;
	}
	const line = lineNumberAt(source, link.index);
	const rawDestination = link.destination.trim();
	if (isExternalDestination(rawDestination) || rawDestination.startsWith("/")) {
		return;
	}
	const hashIndex = rawDestination.indexOf("#");
	const beforeHash = hashIndex === -1 ? rawDestination : rawDestination.slice(0, hashIndex);
	const fragmentValue = hashIndex === -1 ? undefined : rawDestination.slice(hashIndex + 1);
	const questionIndex = beforeHash.indexOf("?");
	const pathValue = questionIndex === -1 ? beforeHash : beforeHash.slice(0, questionIndex);
	const decodedPath = decodeLinkPart(pathValue, sourcePath, line, "path");
	const fragment = fragmentValue === undefined
		? undefined
		: decodeLinkPart(fragmentValue, sourcePath, line, "anchor");
	if (decodedPath === undefined || fragment === undefined && fragmentValue !== undefined) {
		return;
	}

	const targetPath = decodedPath.length === 0
		? sourcePath
		: resolve(dirname(sourcePath), decodedPath);
	const repositoryRelative = relative(REPOSITORY_ROOT, targetPath);
	if (repositoryRelative.startsWith(`..${sep}`) || repositoryRelative === ".." || isAbsolute(repositoryRelative)) {
		addError(`${displayPath(sourcePath)}:${String(line)} links outside the repository: ${rawDestination}.`);
		return;
	}
	if (targetUsesExcludedDirectory(targetPath)) {
		return;
	}

	let targetStat;
	try {
		targetStat = await stat(targetPath);
	} catch (error) {
		if (error instanceof Error && "code" in error && error.code === "ENOENT") {
			addError(`${displayPath(sourcePath)}:${String(line)} links to missing path ${rawDestination}.`);
			return;
		}
		throw error;
	}
	if (fragment === undefined || fragment.length === 0) {
		return;
	}

	const markdownPath = targetStat.isDirectory() ? join(targetPath, "README.md") : targetPath;
	if (extname(markdownPath).toLowerCase() !== ".md") {
		addError(`${displayPath(sourcePath)}:${String(line)} links to anchor #${fragment} in a non-Markdown file.`);
		return;
	}
	try {
		const anchors = await markdownAnchors(markdownPath);
		if (!anchors.has(fragment)) {
			addError(`${displayPath(sourcePath)}:${String(line)} links to missing anchor #${fragment} in ${displayPath(markdownPath)}.`);
		}
	} catch (error) {
		if (error instanceof Error && "code" in error && error.code === "ENOENT") {
			addError(`${displayPath(sourcePath)}:${String(line)} links to missing path ${displayPath(markdownPath)}.`);
			return;
		}
		throw error;
	}
}

async function validateMarkdownFile(path) {
	const source = await readFile(path, "utf8");
	const prose = maskNonProse(source);
	const links = [...extractInlineLinks(prose), ...extractReferenceLinks(prose)];
	for (const link of links) {
		const line = lineNumberAt(source, link.index);
		if (link.missingReference !== undefined) {
			addError(
				`${displayPath(path)}:${String(line)} uses undefined link reference ${JSON.stringify(link.missingReference)}.`
			);
		}
		if (!link.image && isVagueLinkLabel(link.label)) {
			addError(`${displayPath(path)}:${String(line)} uses vague link label ${JSON.stringify(link.label)}.`);
		}
		await validateDestination(path, source, link);
	}
}

function parseNamedRootExports(source) {
	const withoutComments = source
		.replace(/\/\*[\s\S]*?\*\//gu, "")
		.replace(/\/\/[^\r\n]*/gu, "");
	const names = [];
	for (const match of withoutComments.matchAll(/export\s+(?:type\s+)?\{([\s\S]*?)\}\s+from\s+["'][^"']+["']/gu)) {
		for (const rawSpecifier of (match[1] ?? "").split(",")) {
			const specifier = rawSpecifier.trim().replace(/^type\s+/u, "");
			if (specifier.length === 0) {
				continue;
			}
			const parts = specifier.split(/\s+as\s+/u);
			const name = parts.at(-1)?.trim();
			if (name !== undefined && /^[$A-Z_a-z][$\w]*$/u.test(name)) {
				names.push(name);
			}
		}
	}
	for (const match of withoutComments.matchAll(/export\s+\*\s+as\s+([$A-Z_a-z][$\w]*)\s+from\s+["'][^"']+["']/gu)) {
		names.push(match[1] ?? "");
	}
	for (const match of withoutComments.matchAll(/export\s+(?:declare\s+)?(?:abstract\s+)?(?:class|enum|function|interface|namespace|type)\s+([$A-Z_a-z][$\w]*)/gu)) {
		names.push(match[1] ?? "");
	}
	for (const match of withoutComments.matchAll(/export\s+(?:declare\s+)?(?:const|let|var)\s+([$A-Z_a-z][$\w]*)/gu)) {
		names.push(match[1] ?? "");
	}
	return names.filter((name) => name.length > 0);
}

async function validateRootExportDocumentation() {
	const [indexSource, apiDocument] = await Promise.all([
		readFile(ROOT_EXPORT_PATH, "utf8"),
		readFile(API_DOCUMENT_PATH, "utf8")
	]);
	const exportNames = parseNamedRootExports(indexSource);
	const seen = new Set();
	for (const name of exportNames) {
		if (seen.has(name)) {
			addError(`${displayPath(ROOT_EXPORT_PATH)} exports ${name} more than once.`);
			continue;
		}
		seen.add(name);
		const escapedName = name.replace(/[.*+?^${}()|[\]\\]/gu, "\\$&");
		const exactName = new RegExp(`(?<![$\\p{L}\\p{M}\\p{N}_])${escapedName}(?![$\\p{L}\\p{M}\\p{N}_])`, "u");
		if (!exactName.test(apiDocument)) {
			addError(`${displayPath(API_DOCUMENT_PATH)} does not name root export ${name}.`);
		}
	}
	return seen.size;
}

const markdownFiles = await collectMarkdownFiles(REPOSITORY_ROOT);
for (const path of markdownFiles) {
	await validateMarkdownFile(path);
}
const rootExportCount = await validateRootExportDocumentation();

if (errors.length > 0) {
	for (const error of errors.sort()) {
		console.error(`- ${error}`);
	}
	console.error(`Documentation check failed with ${String(errors.length)} violation(s).`);
	process.exitCode = 1;
} else {
	console.log(
		`Documentation check passed: ${String(markdownFiles.length)} Markdown files and ${String(rootExportCount)} named root exports.`
	);
}
