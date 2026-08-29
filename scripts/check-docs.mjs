import { readFile, readdir, stat } from "node:fs/promises";
import { dirname, extname, isAbsolute, join, relative, resolve, sep } from "node:path";

import { extractExtensionEntries, readPackageManifest } from "./lib/package-entries.mjs";
import { REPOSITORY_ROOT } from "./lib/process.mjs";

const API_DOCUMENT_PATH = join(REPOSITORY_ROOT, "docs", "api.md");
const DOCUMENTATION_ENTRY_PATH = join(REPOSITORY_ROOT, "docs", "README.md");
const ROOT_EXPORT_PATH = join(REPOSITORY_ROOT, "src", "index.ts");
const DEPRECATED_WEB_MCP_PATTERN = /\bnavigator\s*(?:\?\s*)?\.\s*modelContext\b/gu;
const EXCLUDED_DIRECTORIES = new Set([
	".artifacts",
	".cache",
	".git",
	".test-dist",
	"coverage",
	"dist",
	"node_modules",
	"playwright-report",
	"test-results"
]);
const GUARDED_TEXT_EXTENSIONS = new Set([
	"",
	".cjs",
	".css",
	".html",
	".js",
	".json",
	".jsx",
	".md",
	".mjs",
	".mts",
	".scss",
	".ts",
	".tsx",
	".txt",
	".yaml",
	".yml"
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
const markdownLinkGraph = new Map();

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

async function collectGuardedTextFiles(directory) {
	const entries = await readdir(directory, { withFileTypes: true });
	const files = [];
	for (const entry of entries.sort((left, right) => left.name.localeCompare(right.name))) {
		const path = join(directory, entry.name);
		if (entry.isDirectory() && !EXCLUDED_DIRECTORIES.has(entry.name)) {
			files.push(...await collectGuardedTextFiles(path));
		} else if (entry.isFile() && GUARDED_TEXT_EXTENSIONS.has(extname(entry.name).toLowerCase())) {
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
		return undefined;
	}
	const line = lineNumberAt(source, link.index);
	const rawDestination = link.destination.trim();
	if (isExternalDestination(rawDestination) || rawDestination.startsWith("/")) {
		return undefined;
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
		return undefined;
	}

	const targetPath = decodedPath.length === 0
		? sourcePath
		: resolve(dirname(sourcePath), decodedPath);
	const repositoryRelative = relative(REPOSITORY_ROOT, targetPath);
	if (repositoryRelative.startsWith(`..${sep}`) || repositoryRelative === ".." || isAbsolute(repositoryRelative)) {
		addError(`${displayPath(sourcePath)}:${String(line)} links outside the repository: ${rawDestination}.`);
		return undefined;
	}
	if (targetUsesExcludedDirectory(targetPath)) {
		return undefined;
	}

	let targetStat;
	try {
		targetStat = await stat(targetPath);
	} catch (error) {
		if (error instanceof Error && "code" in error && error.code === "ENOENT") {
			addError(`${displayPath(sourcePath)}:${String(line)} links to missing path ${rawDestination}.`);
			return undefined;
		}
		throw error;
	}
	const markdownPath = targetStat.isDirectory() ? join(targetPath, "README.md") : targetPath;
	if (fragment === undefined || fragment.length === 0) {
		return extname(markdownPath).toLowerCase() === ".md" ? markdownPath : undefined;
	}
	if (extname(markdownPath).toLowerCase() !== ".md") {
		addError(`${displayPath(sourcePath)}:${String(line)} links to anchor #${fragment} in a non-Markdown file.`);
		return undefined;
	}
	try {
		const anchors = await markdownAnchors(markdownPath);
		if (!anchors.has(fragment)) {
			addError(`${displayPath(sourcePath)}:${String(line)} links to missing anchor #${fragment} in ${displayPath(markdownPath)}.`);
		}
	} catch (error) {
		if (error instanceof Error && "code" in error && error.code === "ENOENT") {
			addError(`${displayPath(sourcePath)}:${String(line)} links to missing path ${displayPath(markdownPath)}.`);
			return undefined;
		}
		throw error;
	}
	return markdownPath;
}

async function validateMarkdownFile(path) {
	const source = await readFile(path, "utf8");
	const prose = maskNonProse(source);
	const links = [...extractInlineLinks(prose), ...extractReferenceLinks(prose)];
	const localMarkdownTargets = new Set();
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
		const target = await validateDestination(path, source, link);
		if (target !== undefined) {
			localMarkdownTargets.add(target);
		}
	}
	markdownLinkGraph.set(path, localMarkdownTargets);
}

async function validateDeprecatedWebMcpUsage(paths) {
	for (const path of paths) {
		const source = await readFile(path, "utf8");
		for (const match of source.matchAll(DEPRECATED_WEB_MCP_PATTERN)) {
			addError(
				`${displayPath(path)}:${String(lineNumberAt(source, match.index ?? 0))} uses the deprecated navigator-scoped WebMCP API; use document.modelContext.`
			);
		}
	}
}

function validateMarkdownReachability(markdownFiles) {
	const knownFiles = new Set(markdownFiles);
	const reachable = new Set();
	const pending = [DOCUMENTATION_ENTRY_PATH];
	while (pending.length > 0) {
		const path = pending.pop();
		if (path === undefined || reachable.has(path) || !knownFiles.has(path)) {
			continue;
		}
		reachable.add(path);
		for (const target of markdownLinkGraph.get(path) ?? []) {
			pending.push(target);
		}
	}

	for (const path of markdownFiles) {
		const repositoryPath = displayPath(path);
		if (!repositoryPath.startsWith(".github/") && !reachable.has(path)) {
			addError(`${repositoryPath} is not reachable from docs/README.md through repository-local Markdown links.`);
		}
	}
}

function parseNamedRootExports(source) {
	const withoutComments = source
		.replace(/\/\*[\s\S]*?\*\//gu, "")
		.replace(/\/\/[^\r\n]*/gu, "");
	const exports = [];
	for (const match of withoutComments.matchAll(
		/export\s+(type\s+)?\{([\s\S]*?)\}\s+from\s+["'][^"']+["']/gu
	)) {
		const groupIsTypeOnly = match[1] !== undefined;
		for (const rawSpecifier of (match[2] ?? "").split(",")) {
			const specifierIsTypeOnly = /^\s*type\s+/u.test(rawSpecifier);
			const specifier = rawSpecifier.trim().replace(/^type\s+/u, "");
			if (specifier.length === 0) {
				continue;
			}
			const parts = specifier.split(/\s+as\s+/u);
			const name = parts.at(-1)?.trim();
			if (name !== undefined && /^[$A-Z_a-z][$\w]*$/u.test(name)) {
				exports.push({
					kind: groupIsTypeOnly || specifierIsTypeOnly ? "type" : "runtime",
					name
				});
			}
		}
	}
	for (const match of withoutComments.matchAll(/export\s+\*\s+as\s+([$A-Z_a-z][$\w]*)\s+from\s+["'][^"']+["']/gu)) {
		exports.push({ kind: "runtime", name: match[1] ?? "" });
	}
	for (const match of withoutComments.matchAll(
		/export\s+(?:declare\s+)?(?:abstract\s+)?(class|enum|function|interface|namespace|type)\s+([$A-Z_a-z][$\w]*)/gu
	)) {
		exports.push({
			kind: match[1] === "interface" || match[1] === "type" ? "type" : "runtime",
			name: match[2] ?? ""
		});
	}
	for (const match of withoutComments.matchAll(/export\s+(?:declare\s+)?(?:const|let|var)\s+([$A-Z_a-z][$\w]*)/gu)) {
		exports.push({ kind: "runtime", name: match[1] ?? "" });
	}
	return exports.filter(({ name }) => name.length > 0);
}

function parseDocumentedSymbolCell(cell, kind, description) {
	const names = [...cell.matchAll(/`([^`]+)`/gu)].map((match) => match[1] ?? "");
	const remainder = cell.replace(/`[^`]+`/gu, "").replaceAll(",", "").trim();
	if ((names.length === 0 && remainder !== "—") || (names.length > 0 && remainder !== "")) {
		addError(
			`${displayPath(API_DOCUMENT_PATH)} ${description} has an invalid ${kind} cell: ${cell}.`
		);
		return [];
	}

	return names.filter((name) => {
		if (/^[$A-Z_a-z][$\w]*$/u.test(name)) {
			return true;
		}

		addError(
			`${displayPath(API_DOCUMENT_PATH)} ${description} contains invalid symbol ${name}.`
		);
		return false;
	});
}

function parseDocumentedRootExports(apiDocument) {
	const heading = "## Find a public export";
	const headingIndex = apiDocument.indexOf(heading);
	if (headingIndex === -1) {
		addError(`${displayPath(API_DOCUMENT_PATH)} is missing the ${heading} section.`);
		return [];
	}
	const nextHeadingIndex = apiDocument.indexOf("\n## ", headingIndex + heading.length);
	const section = apiDocument.slice(
		headingIndex + heading.length,
		nextHeadingIndex === -1 ? apiDocument.length : nextHeadingIndex
	);
	const tableLines = section.split(/\r?\n/u).filter((line) => /^\|/u.test(line.trim()));
	if (tableLines.length < 3) {
		addError(`${displayPath(API_DOCUMENT_PATH)} must contain the public export table.`);
		return [];
	}

	const parseCells = (line) => line.trim().split("|").slice(1, -1).map((cell) => cell.trim());
	const headerCells = parseCells(tableLines[0] ?? "");
	if (headerCells.join("|") !== "Area|Runtime values|Types") {
		addError(
			`${displayPath(API_DOCUMENT_PATH)} public export table must use Area, Runtime values, and Types columns.`
		);
	}

	const documented = [];
	for (const [rowIndex, line] of tableLines.slice(2).entries()) {
		const cells = parseCells(line);
		if (cells.length !== 3) {
			addError(
				`${displayPath(API_DOCUMENT_PATH)} public export table row ${String(rowIndex + 1)} must contain three columns.`
			);
			continue;
		}
		for (const [cellIndex, kind] of [[1, "runtime"], [2, "type"]]) {
			const cell = cells[cellIndex] ?? "";
			for (const name of parseDocumentedSymbolCell(
				cell,
				kind,
				"public export table"
			)) {
				documented.push({ kind, name });
			}
		}
	}
	return documented;
}

function parseDocumentedExtensionExports(apiDocument) {
	const heading = "## Find a first-party extension export";
	const headingIndex = apiDocument.indexOf(heading);
	if (headingIndex === -1) {
		addError(`${displayPath(API_DOCUMENT_PATH)} is missing the ${heading} section.`);
		return [];
	}
	const nextHeadingIndex = apiDocument.indexOf("\n## ", headingIndex + heading.length);
	const section = apiDocument.slice(
		headingIndex + heading.length,
		nextHeadingIndex === -1 ? apiDocument.length : nextHeadingIndex
	);
	const tableLines = section.split(/\r?\n/u).filter((line) => /^\|/u.test(line.trim()));
	if (tableLines.length < 3) {
		addError(`${displayPath(API_DOCUMENT_PATH)} must contain the first-party extension export table.`);
		return [];
	}

	const parseCells = (line) => line.trim().split("|").slice(1, -1).map((cell) => cell.trim());
	const headerCells = parseCells(tableLines[0] ?? "");
	if (headerCells.join("|") !== "Module|Runtime values|Types") {
		addError(
			`${displayPath(API_DOCUMENT_PATH)} extension export table must use Module, Runtime values, and Types columns.`
		);
	}

	const documented = [];
	for (const [rowIndex, line] of tableLines.slice(2).entries()) {
		const cells = parseCells(line);
		if (cells.length !== 3) {
			addError(
				`${displayPath(API_DOCUMENT_PATH)} extension export table row ${String(rowIndex + 1)} must contain three columns.`
			);
			continue;
		}

		const moduleCell = cells[0] ?? "";
		const moduleMatch = /^`([^`]+)`$/u.exec(moduleCell);
		if (moduleMatch === null) {
			addError(
				`${displayPath(API_DOCUMENT_PATH)} extension export table has an invalid module cell: ${moduleCell}.`
			);
			continue;
		}

		const importPath = moduleMatch[1] ?? "";
		const symbols = [];
		for (const [cellIndex, kind] of [[1, "runtime"], [2, "type"]]) {
			const cell = cells[cellIndex] ?? "";
			for (const name of parseDocumentedSymbolCell(
				cell,
				kind,
				`extension export table row for ${importPath}`
			)) {
				symbols.push({ kind, name });
			}
		}

		documented.push({ importPath, symbols });
	}

	return documented;
}

async function validateRootExportDocumentation() {
	const [indexSource, apiDocument] = await Promise.all([
		readFile(ROOT_EXPORT_PATH, "utf8"),
		readFile(API_DOCUMENT_PATH, "utf8")
	]);
	const sourceExports = parseNamedRootExports(indexSource);
	const documentedExports = parseDocumentedRootExports(apiDocument);
	const sourceByName = new Map();
	for (const entry of sourceExports) {
		if (sourceByName.has(entry.name)) {
			addError(`${displayPath(ROOT_EXPORT_PATH)} exports ${entry.name} more than once.`);
			continue;
		}
		sourceByName.set(entry.name, entry.kind);
	}

	const documentedByName = new Map();
	for (const entry of documentedExports) {
		if (documentedByName.has(entry.name)) {
			addError(`${displayPath(API_DOCUMENT_PATH)} lists root export ${entry.name} more than once.`);
			continue;
		}
		documentedByName.set(entry.name, entry.kind);
	}

	for (const [name, kind] of sourceByName) {
		const documentedKind = documentedByName.get(name);
		if (documentedKind === undefined) {
			addError(`${displayPath(API_DOCUMENT_PATH)} public export table is missing ${name}.`);
		} else if (documentedKind !== kind) {
			addError(
				`${displayPath(API_DOCUMENT_PATH)} classifies ${name} as ${documentedKind}; expected ${kind}.`
			);
		}
	}
	for (const name of documentedByName.keys()) {
		if (!sourceByName.has(name)) {
			addError(`${displayPath(API_DOCUMENT_PATH)} lists stale root export ${name}.`);
		}
	}
	return sourceByName.size;
}

function isJavaScriptExportTarget(target) {
	if (typeof target === "string") {
		return target.endsWith(".js");
	}

	return target !== null && typeof target === "object" && !Array.isArray(target) &&
		["import", "default"].some((condition) =>
			typeof target[condition] === "string" && target[condition].endsWith(".js")
		);
}

async function validateExtensionExportDocumentation() {
	const [packageJson, apiDocument] = await Promise.all([
		readPackageManifest(),
		readFile(API_DOCUMENT_PATH, "utf8")
	]);

	let extensionEntries;
	try {
		extensionEntries = extractExtensionEntries(packageJson);
	} catch (error) {
		addError(
			error instanceof Error
				? error.message
				: "Package extension exports could not be inspected."
		);
		return { entryCount: 0, exportCount: 0 };
	}

	const supportedJavaScriptExports = new Set([
		".",
		...extensionEntries.map((entry) => entry.exportPath)
	]);
	for (const [exportPath, target] of Object.entries(packageJson.exports ?? {})) {
		if (isJavaScriptExportTarget(target) && !supportedJavaScriptExports.has(exportPath)) {
			addError(
				`package.json JavaScript export ${exportPath} has no source or documentation convention.`
			);
		}
	}

	const documentedRows = parseDocumentedExtensionExports(apiDocument);
	const documentedByPath = new Map();
	for (const row of documentedRows) {
		if (documentedByPath.has(row.importPath)) {
			addError(
				`${displayPath(API_DOCUMENT_PATH)} lists extension module ${row.importPath} more than once.`
			);
			continue;
		}
		documentedByPath.set(row.importPath, row.symbols);
	}

	let exportCount = 0;
	const expectedImportPaths = new Set();
	for (const entry of extensionEntries) {
		const importPath = `${packageJson.name}${entry.exportPath.slice(1)}`;
		expectedImportPaths.add(importPath);
		const sourcePath = join(REPOSITORY_ROOT, entry.sourceEntry);
		const sourceExports = parseNamedRootExports(await readFile(sourcePath, "utf8"));
		exportCount += sourceExports.length;

		const sourceByName = new Map();
		for (const sourceExport of sourceExports) {
			if (sourceByName.has(sourceExport.name)) {
				addError(`${displayPath(sourcePath)} exports ${sourceExport.name} more than once.`);
				continue;
			}
			sourceByName.set(sourceExport.name, sourceExport.kind);
		}

		const documentedSymbols = documentedByPath.get(importPath);
		if (documentedSymbols === undefined) {
			addError(`${displayPath(API_DOCUMENT_PATH)} extension export table is missing ${importPath}.`);
			continue;
		}

		const documentedByName = new Map();
		for (const documentedExport of documentedSymbols) {
			if (documentedByName.has(documentedExport.name)) {
				addError(
					`${displayPath(API_DOCUMENT_PATH)} lists ${importPath} export ${documentedExport.name} more than once.`
				);
				continue;
			}
			documentedByName.set(documentedExport.name, documentedExport.kind);
		}

		for (const [name, kind] of sourceByName) {
			const documentedKind = documentedByName.get(name);
			if (documentedKind === undefined) {
				addError(`${displayPath(API_DOCUMENT_PATH)} ${importPath} export row is missing ${name}.`);
			} else if (documentedKind !== kind) {
				addError(
					`${displayPath(API_DOCUMENT_PATH)} classifies ${importPath} export ${name} as ${documentedKind}; expected ${kind}.`
				);
			}
		}
		for (const name of documentedByName.keys()) {
			if (!sourceByName.has(name)) {
				addError(`${displayPath(API_DOCUMENT_PATH)} lists stale ${importPath} export ${name}.`);
			}
		}
	}

	for (const importPath of documentedByPath.keys()) {
		if (!expectedImportPaths.has(importPath)) {
			addError(`${displayPath(API_DOCUMENT_PATH)} lists stale extension module ${importPath}.`);
		}
	}

	return { entryCount: extensionEntries.length, exportCount };
}

const markdownFiles = await collectMarkdownFiles(REPOSITORY_ROOT);
for (const path of markdownFiles) {
	await validateMarkdownFile(path);
}
validateMarkdownReachability(markdownFiles);
await validateDeprecatedWebMcpUsage(await collectGuardedTextFiles(REPOSITORY_ROOT));
const rootExportCount = await validateRootExportDocumentation();
const extensionDocumentation = await validateExtensionExportDocumentation();

if (errors.length > 0) {
	for (const error of errors.sort()) {
		console.error(`- ${error}`);
	}
	console.error(`Documentation check failed with ${String(errors.length)} violation(s).`);
	process.exitCode = 1;
} else {
	console.log(
		`Documentation check passed: ${String(markdownFiles.length)} Markdown files, ` +
		`${String(rootExportCount)} exact root exports, and ` +
		`${String(extensionDocumentation.exportCount)} exact exports across ` +
		`${String(extensionDocumentation.entryCount)} first-party extension entrypoint(s).`
	);
}
