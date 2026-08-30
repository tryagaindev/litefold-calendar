const ALLOWED_BOUNDARY_PREFIXES = ["my-", "lfc-"];
const ALLOWED_DATA_NAMES = ["data-litefold-calendar"];
const ALLOWED_DATA_PREFIXES = ["data-my-", "data-lfc-", "data-test-"];
const DOCUMENTATION_LANGUAGES = new Set([
	"css",
	"html",
	"javascript",
	"js",
	"jsx",
	"mjs",
	"scss",
	"ts",
	"tsx",
	"typescript"
]);
const CSS_LANGUAGES = new Set(["css", "scss"]);
const MARKUP_LANGUAGES = new Set(["html"]);
const SOURCE_EXTENSIONS = new Set([".css", ".html", ".js", ".mjs", ".ts", ".tsx"]);
const PATH_EXTENSION_PATTERN = /^\.(?:css|html|js|json|md|mjs|mts|scss|ts|tsx)\b/iu;
const RETIRED_FAKE_LFC_PREFIX_PATTERN = /^lfc-(?:developer|pages|responsive-test|test)(?:-|$)/u;
const BARE_PAGE_IDENTIFIERS = new Set([
	"copy-status",
	"deployment-summary",
	"install-command",
	"lfc-pages-content",
	"main-preview",
	"main-preview-link",
	"main-preview-source-link",
	"primary-browse-link",
	"primary-run-link",
	"quick-start-link",
	"release-history",
	"selected-channel",
	"selected-commit",
	"selected-version",
	"setup-code",
	"setup-html"
]);
const CONSUMER_ID_EXCEPTIONS = new Set(["release-demos"]);
const RETIRED_TEST_BOUNDARY_IDENTIFIERS = new Set(["lfc-swipe-fixture"]);
const RETIRED_IDENTIFIER_PATTERNS = [
	/(?<![a-z0-9-])data-(?:advanced-example|application-calendar|example)(?:-[a-z0-9]+)*\b/giu,
	/(?<![a-z0-9-])data-calendar\b/giu,
	/(?<![\w-])--(?:advanced(?:-example)?|application-calendar|example|lfc-(?:developer|pages|responsive-test|test))(?:-[a-z0-9]+)+\b/giu,
	/@layer\s+(?:advanced-example|example|lfc-pages)(?:\.[a-z0-9]+(?:-[a-z0-9]+)*)*/giu,
	/(?<![\w-])(?:advanced-example|application-calendar|example|lfc-(?:developer|pages|responsive-test|test))-[a-z0-9](?:[a-z0-9-]*[a-z0-9])?\b/giu,
	/(?<![\w-])(?:litefold-advanced|public-calendar|team-schedule)(?:-(?:get-events|navigate))?\b/giu
];

/**
 * Returns whether an application-owned identifier uses an accepted namespace.
 *
 * @param {string} value Identifier without selector punctuation.
 * @returns {boolean} Whether the identifier is namespaced.
 */
function isAllowedBoundaryIdentifier(value) {
	return value === "litefold-calendar" ||
		ALLOWED_BOUNDARY_PREFIXES.some((prefix) => value.startsWith(prefix)) &&
		!RETIRED_FAKE_LFC_PREFIX_PATTERN.test(value);
}

/**
 * Returns whether a data attribute belongs to the application, package, or test probe namespace.
 *
 * @param {string} value Attribute name.
 * @returns {boolean} Whether the attribute is namespaced.
 */
function isAllowedDataName(value) {
	return ALLOWED_DATA_NAMES.includes(value) ||
		ALLOWED_DATA_PREFIXES.some((prefix) => value.startsWith(prefix)) &&
		!/^data-lfc-(?:developer|pages|responsive-test|test)(?:-|$)/u.test(value);
}

/**
 * Calculates a one-based source location.
 *
 * @param {string} source Complete source.
 * @param {number} index Zero-based source offset.
 * @param {number} lineOffset Lines preceding this source fragment.
 * @returns {{ column: number, line: number }} Source location.
 */
function sourceLocation(source, index, lineOffset) {
	const before = source.slice(0, index);
	const lines = before.split("\n");
	return {
		column: (lines.at(-1)?.length ?? 0) + 1,
		line: lineOffset + lines.length
	};
}

/**
 * Reports one violation for a source range.
 *
 * @param {object} state Scanner state.
 * @param {number} index Token offset.
 * @param {string} token Token to report.
 * @param {string} reason Diagnostic reason.
 */
function addViolation(state, index, token, reason) {
	const end = index + token.length;
	if (state.reported.some((range) => index < range.end && end > range.start)) {
		return;
	}
	state.reported.push({ end, start: index });
	state.violations.push({
		...sourceLocation(state.source, index, state.lineOffset),
		path: state.path,
		reason,
		token
	});
}

/**
 * Returns whether a retired-looking token is part of a route or tooling filename.
 *
 * @param {string} source Complete source.
 * @param {number} index Token offset.
 * @param {number} length Token length.
 * @returns {boolean} Whether the token is path-like.
 */
function isPathLikeReference(source, index, length) {
	const previous = source[index - 1] ?? "";
	const after = source.slice(index + length, index + length + 8);
	const lineStart = source.lastIndexOf("\n", index) + 1;
	const lineEnd = source.indexOf("\n", index);
	const line = source.slice(lineStart, lineEnd === -1 ? source.length : lineEnd);
	return previous === "/" || source[index + length] === "/" || PATH_EXTENSION_PATTERN.test(after) ||
		/\b(?:mkdtemp|tmpdir)\b/u.test(line);
}

/**
 * Detects retired ownership families in any scanned code surface.
 *
 * @param {object} state Scanner state.
 */
function scanRetiredIdentifiers(state) {
	for (const pattern of RETIRED_IDENTIFIER_PATTERNS) {
		for (const match of state.source.matchAll(pattern)) {
			const index = match.index ?? 0;
			const token = match[0];
			if (isPathLikeReference(state.source, index, token.length)) {
				continue;
			}
			addViolation(state, index, token, "uses a retired application ownership identifier; use my-*.");
		}
	}
}

/**
 * Detects unnamespaced data attributes.
 *
 * @param {object} state Scanner state.
 */
function scanDataAttributes(state) {
	for (const match of state.source.matchAll(/(?<![a-z0-9-])data-[a-z][a-z0-9-]*\b/giu)) {
		const token = match[0].toLowerCase();
		if (!isAllowedDataName(token)) {
			addViolation(
				state,
				match.index ?? 0,
				token,
				"uses an unnamespaced application data attribute; use data-my-* or data-test-* for a repository probe."
			);
		}
	}
}

/**
 * Detects dataset keys whose corresponding data attribute lacks an ownership namespace.
 *
 * @param {object} state Scanner state.
 */
function scanDatasetKeys(state) {
	const patterns = [
		/\.dataset\.([A-Za-z_$][\w$]*)/gu,
		/\.dataset\s*\[\s*(["'])([A-Za-z_$][\w$]*)\1\s*\]/gu
	];
	for (const pattern of patterns) {
		for (const match of state.source.matchAll(pattern)) {
			const token = match.at(-1) ?? "";
			const dataName = `data-${token.replace(/[A-Z]/gu, (character) => `-${character.toLowerCase()}`)}`;
			if (isAllowedDataName(dataName)) {
				continue;
			}
			addViolation(
				state,
				(match.index ?? 0) + match[0].lastIndexOf(token),
				token,
				"uses an unnamespaced dataset key; use the data-my-* or data-test-* namespace."
			);
		}
	}
}

/**
 * Reports a bare ID or ID reference.
 *
 * @param {object} state Scanner state.
 * @param {number} index Token offset.
 * @param {string} token Identifier.
 */
function reportId(state, index, token) {
	if (isAllowedBoundaryIdentifier(token)) {
		if (!RETIRED_TEST_BOUNDARY_IDENTIFIERS.has(token)) {
			return;
		}
	}
	if (!state.strict && CONSUMER_ID_EXCEPTIONS.has(token)) {
		return;
	}
	addViolation(state, index, token, "uses an unnamespaced application ID; use my-*.");
}

/**
 * Detects IDs and IDREFs in markup.
 *
 * @param {object} state Scanner state.
 */
function scanMarkupIdentifiers(state) {
	for (const tagMatch of state.source.matchAll(/<[^>]+>/gu)) {
		const tag = tagMatch[0];
		const tagIndex = tagMatch.index ?? 0;
		for (const attributeMatch of tag.matchAll(
			/\b(?:aria-activedescendant|aria-controls|aria-describedby|aria-details|aria-errormessage|aria-labelledby|for|id)\s*=\s*(["'])([^"']+)\1/giu
		)) {
			const values = (attributeMatch[2] ?? "").split(/\s+/u).filter(Boolean);
			const valueStart = tagIndex + (attributeMatch.index ?? 0) + attributeMatch[0].indexOf(attributeMatch[2] ?? "");
			let consumed = 0;
			for (const value of values) {
				reportId(state, valueStart + consumed, value);
				consumed += value.length + 1;
			}
		}
		for (const hrefMatch of tag.matchAll(/\bhref\s*=\s*(["'])#([a-z][a-z0-9-]*)\1/giu)) {
			const token = hrefMatch[2] ?? "";
			reportId(
				state,
				tagIndex + (hrefMatch.index ?? 0) + hrefMatch[0].indexOf(token),
				token
			);
		}
		for (const targetMatch of tag.matchAll(/\bdata-(?:my-)?copy-target\s*=\s*(["'])([a-z][a-z0-9-]*)\1/giu)) {
			const token = targetMatch[2] ?? "";
			reportId(
				state,
				tagIndex + (targetMatch.index ?? 0) + targetMatch[0].lastIndexOf(token),
				token
			);
		}
		for (const classMatch of tag.matchAll(/\bclass\s*=\s*(["'])([^"']+)\1/giu)) {
			const value = classMatch[2] ?? "";
			const valueStart = tagIndex + (classMatch.index ?? 0) + classMatch[0].indexOf(value);
			let consumed = 0;
			for (const token of value.split(/\s+/u).filter(Boolean)) {
				if (!isAllowedBoundaryIdentifier(token)) {
					addViolation(state, valueStart + consumed, token, "uses an unnamespaced application class; use my-*.");
				}
				consumed += token.length + 1;
			}
		}
	}
}

/**
 * Detects CSS-owned names that are not package names or my-* names.
 *
 * @param {object} state Scanner state.
 */
function scanCssIdentifiers(state) {
	for (const match of state.source.matchAll(/(?<![\w-])\.([a-z][a-z0-9_-]*)/giu)) {
		const token = match[1] ?? "";
		if (!isAllowedBoundaryIdentifier(token)) {
			addViolation(state, (match.index ?? 0) + 1, token, "uses an unnamespaced application class; use my-*.");
		}
	}
	for (const match of state.source.matchAll(/(?<![\w-])--([a-z][a-z0-9-]*)/giu)) {
		const token = match[1] ?? "";
		if (!isAllowedBoundaryIdentifier(token)) {
			addViolation(state, match.index ?? 0, `--${token}`, "uses an unnamespaced application custom property; use --my-*.");
		}
	}
	for (const match of state.source.matchAll(/@layer\s+([a-z][a-z0-9.-]*)/giu)) {
		const token = match[1] ?? "";
		const root = token.split(".")[0] ?? "";
		if (root !== "my" && token !== "lfc") {
			addViolation(state, (match.index ?? 0) + match[0].indexOf(token), token, "uses an unnamespaced application layer; use my or my.*.");
		}
	}
}

/**
 * Detects ID-producing DOM operations and selector consumers.
 *
 * @param {object} state Scanner state.
 */
function scanScriptIdentifiers(state) {
	const directPatterns = [
		/\.id\s*=\s*(["'])([a-z][a-z0-9-]*)\1/giu,
		/getElementById\s*\(\s*(["'])([a-z][a-z0-9-]*)\1/giu,
		/setAttribute\s*\(\s*(["'])id\1\s*,\s*(["'])([a-z][a-z0-9-]*)\2/giu
	];
	for (const pattern of directPatterns) {
		for (const match of state.source.matchAll(pattern)) {
			const token = match.at(-1) ?? "";
			reportId(state, (match.index ?? 0) + match[0].lastIndexOf(token), token);
		}
	}
	if (state.strict) {
		for (const match of state.source.matchAll(
			/\b(?:const|let|var)\s+([A-Za-z_$][\w$]*)\s*(?::[^=\n]+)?=\s*(?:Object\.freeze\s*\(\s*)?(?:\[\s*)?\{\s*id\s*:\s*(["'])([a-z][a-z0-9-]*)\2/giu
		)) {
			if (!/hook/iu.test(match[1] ?? "")) {
				continue;
			}
			const token = match[3] ?? "";
			reportId(state, (match.index ?? 0) + match[0].lastIndexOf(token), token);
		}
		for (const match of state.source.matchAll(
			/\brenderHooks\s*:\s*(?:Object\.freeze\s*\(\s*)?\[\s*\{\s*id\s*:\s*(["'])([a-z][a-z0-9-]*)\1/gu
		)) {
			const token = match[2] ?? "";
			reportId(state, (match.index ?? 0) + match[0].lastIndexOf(token), token);
		}
	}

	const classPatterns = [
		/\.className\s*=\s*(["'])([^"']+)\1/gu,
		/\.classList\.(?:add|contains|remove|replace|toggle)\s*\(\s*(["'])([^"']+)\1/gu
	];
	for (const pattern of classPatterns) {
		for (const match of state.source.matchAll(pattern)) {
			const value = match[2] ?? "";
			const valueStart = (match.index ?? 0) + match[0].lastIndexOf(value);
			let consumed = 0;
			for (const token of value.split(/\s+/u).filter(Boolean)) {
				if (!isAllowedBoundaryIdentifier(token)) {
					addViolation(state, valueStart + consumed, token, "uses an unnamespaced application class; use my-*.");
				}
				consumed += token.length + 1;
			}
		}
	}

	for (const callMatch of state.source.matchAll(
		/(?:closest|locator|matches|querySelector(?:All)?(?:<[^>]+>)?)\s*\(\s*(["'])([^"']+)\1/giu
	)) {
		const selector = callMatch[2] ?? "";
		const selectorStart = (callMatch.index ?? 0) + callMatch[0].indexOf(selector);
		for (const idMatch of selector.matchAll(/(?:^|[\s>+~,(])#([a-z][a-z0-9-]*)/giu)) {
			const token = idMatch[1] ?? "";
			reportId(state, selectorStart + (idMatch.index ?? 0) + idMatch[0].lastIndexOf(token), token);
		}
	}
	for (const match of state.source.matchAll(/\bdata-(?:my-)?copy-target\s*=\s*(["'])([a-z][a-z0-9-]*)\1/giu)) {
		const token = match[2] ?? "";
		reportId(state, (match.index ?? 0) + match[0].lastIndexOf(token), token);
	}
	for (const match of state.source.matchAll(/(["'])([a-z][a-z0-9-]*)\1/giu)) {
		const token = match[2] ?? "";
		if (BARE_PAGE_IDENTIFIERS.has(token)) {
			reportId(state, (match.index ?? 0) + 1, token);
		}
	}

	for (const match of state.source.matchAll(/\btoolNamePrefix\s*:\s*(["'])([a-z0-9_.-]+)\1/giu)) {
		const token = match[2] ?? "";
		if (token !== "litefold-calendar" && !token.startsWith("my-")) {
			addViolation(
				state,
				(match.index ?? 0) + match[0].lastIndexOf(token),
				token,
				"uses an application WebMCP prefix outside the my-* namespace."
			);
		}
	}
}

/**
 * Scans one code fragment for ownership-boundary violations.
 *
 * @param {string} source Code source.
 * @param {{ language?: string, lineOffset?: number, path?: string, strict?: boolean }} [options] Scan options.
 * @returns {Array<{ column: number, line: number, path: string, reason: string, token: string }>} Violations.
 */
export function findOwnershipViolations(source, options = {}) {
	const language = options.language?.toLowerCase() ?? "";
	const strict = options.strict ?? true;
	const state = {
		language,
		lineOffset: options.lineOffset ?? 0,
		path: options.path ?? "<source>",
		reported: [],
		source,
		strict,
		violations: []
	};

	scanRetiredIdentifiers(state);
	scanDataAttributes(state);
	scanDatasetKeys(state);
	scanScriptIdentifiers(state);
	if (strict) {
		if (MARKUP_LANGUAGES.has(language) || language === "") {
			scanMarkupIdentifiers(state);
		}
		if (CSS_LANGUAGES.has(language) || language === "") {
			scanCssIdentifiers(state);
		}
	}

	return state.violations.sort((left, right) => left.line - right.line || left.column - right.column);
}

/**
 * Extracts fenced Markdown blocks with line offsets for diagnostics.
 *
 * @param {string} source Markdown source.
 * @returns {Array<{ language: string, lineOffset: number, source: string }>} Code blocks.
 */
export function markdownCodeBlocks(source) {
	const lines = source.split(/\r?\n/u);
	const blocks = [];
	for (let index = 0; index < lines.length; index += 1) {
		const opening = /^ {0,3}(`{3,}|~{3,})\s*([^\s{]*)[^\r\n]*$/u.exec(lines[index] ?? "");
		if (opening === null) {
			continue;
		}
		const marker = opening[1] ?? "";
		const closingPattern = new RegExp(`^ {0,3}${marker[0]}{${String(marker.length)},}\\s*$`, "u");
		const contentStart = index + 1;
		let closing = contentStart;
		while (closing < lines.length && !closingPattern.test(lines[closing] ?? "")) {
			closing += 1;
		}
		if (closing >= lines.length) {
			break;
		}
		blocks.push({
			language: (opening[2] ?? "").toLowerCase(),
			lineOffset: contentStart,
			source: lines.slice(contentStart, closing).join("\n")
		});
		index = closing;
	}
	return blocks;
}

/**
 * Returns whether a Markdown language is part of the ownership contract.
 *
 * @param {string} language Fence language.
 * @returns {boolean} Whether to scan the block.
 */
export function isOwnershipDocumentationLanguage(language) {
	return DOCUMENTATION_LANGUAGES.has(language.toLowerCase());
}

/**
 * Returns whether a source extension is scanned as runnable application code.
 *
 * @param {string} extension Lowercase path extension.
 * @returns {boolean} Whether the extension is supported.
 */
export function isOwnershipSourceExtension(extension) {
	return SOURCE_EXTENSIONS.has(extension.toLowerCase());
}
