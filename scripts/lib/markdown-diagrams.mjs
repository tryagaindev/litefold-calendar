import { markdownFencedCodeBlocks } from "./markdown-heading.mjs";

const HTML_ELEMENT_NAMES = new Set([
	"a",
	"abbr",
	"article",
	"aside",
	"audio",
	"b",
	"blockquote",
	"body",
	"br",
	"button",
	"canvas",
	"caption",
	"cite",
	"code",
	"col",
	"colgroup",
	"data",
	"datalist",
	"dd",
	"del",
	"details",
	"dfn",
	"dialog",
	"div",
	"dl",
	"dt",
	"em",
	"embed",
	"fieldset",
	"figcaption",
	"figure",
	"footer",
	"form",
	"h1",
	"h2",
	"h3",
	"h4",
	"h5",
	"h6",
	"head",
	"header",
	"hgroup",
	"hr",
	"html",
	"i",
	"iframe",
	"img",
	"input",
	"ins",
	"kbd",
	"label",
	"legend",
	"li",
	"link",
	"main",
	"map",
	"mark",
	"menu",
	"meta",
	"meter",
	"nav",
	"noscript",
	"object",
	"ol",
	"optgroup",
	"option",
	"output",
	"p",
	"picture",
	"pre",
	"progress",
	"q",
	"rp",
	"rt",
	"ruby",
	"s",
	"samp",
	"script",
	"search",
	"section",
	"select",
	"slot",
	"small",
	"source",
	"span",
	"strong",
	"style",
	"sub",
	"summary",
	"sup",
	"table",
	"tbody",
	"td",
	"template",
	"textarea",
	"tfoot",
	"th",
	"thead",
	"time",
	"title",
	"tr",
	"track",
	"u",
	"ul",
	"var",
	"video",
	"wbr"
]);
const HTML_TAG_PATTERN = /<\/?([A-Za-z][A-Za-z\d-]*)(?=[\t\n\f\r />])[^<>]*>/gu;
const ACCESSIBLE_TITLE_PATTERN = /^\s*accTitle\s*:\s*(.*?)\s*$/u;
const ACCESSIBLE_DESCRIPTION_PATTERN = /^\s*accDescr\s*:\s*(.*?)\s*$/u;
const ACCESSIBLE_DESCRIPTION_BLOCK_PATTERN = /^\s*accDescr\s*\{\s*$/u;

function isMermaidComment(value) {
	return value.startsWith("%%") && !value.startsWith("%%{");
}

function containsEmbeddedHtml(value) {
	if (value.includes("<!--")) {
		return true;
	}
	for (const match of value.matchAll(HTML_TAG_PATTERN)) {
		const tagName = (match[1] ?? "").toLowerCase();
		if (tagName.includes("-") || HTML_ELEMENT_NAMES.has(tagName)) {
			return true;
		}
	}
	return false;
}

function containsClickDirective(value) {
	let quoted = false;
	let statementStart = 0;
	for (let index = 0; index < value.length; index += 1) {
		const character = value[index] ?? "";
		if (character === "\"") {
			quoted = !quoted;
			continue;
		}
		if (quoted) {
			continue;
		}
		if (character === "%" && value[index + 1] === "%") {
			return /^\s*click(?:\s|$)/u.test(value.slice(statementStart, index));
		}
		if (character === ";") {
			if (/^\s*click(?:\s|$)/u.test(value.slice(statementStart, index))) {
				return true;
			}
			statementStart = index + 1;
		}
	}
	return /^\s*click(?:\s|$)/u.test(value.slice(statementStart));
}

function collectAccessibilityDirectives(lines) {
	const titles = [];
	const descriptions = [];
	const metadataLines = new Set();
	for (let index = 0; index < lines.length; index += 1) {
		const line = lines[index] ?? "";
		const trimmed = line.trimStart();
		if (isMermaidComment(trimmed)) {
			continue;
		}

		const titleMatch = ACCESSIBLE_TITLE_PATTERN.exec(line);
		if (titleMatch !== null) {
			titles.push((titleMatch[1] ?? "").trim());
			metadataLines.add(index);
			continue;
		}

		const descriptionMatch = ACCESSIBLE_DESCRIPTION_PATTERN.exec(line);
		if (descriptionMatch !== null) {
			descriptions.push((descriptionMatch[1] ?? "").trim());
			metadataLines.add(index);
			continue;
		}

		if (!ACCESSIBLE_DESCRIPTION_BLOCK_PATTERN.test(line)) {
			continue;
		}
		metadataLines.add(index);
		const fragments = [];
		let closingIndex = index + 1;
		while (closingIndex < lines.length && (lines[closingIndex] ?? "").trim() !== "}") {
			fragments.push(lines[closingIndex] ?? "");
			metadataLines.add(closingIndex);
			closingIndex += 1;
		}
		const closed = closingIndex < lines.length;
		if (closed) {
			metadataLines.add(closingIndex);
			index = closingIndex;
		} else {
			index = lines.length;
		}
		descriptions.push(closed ? fragments.join("\n").trim() : "");
	}
	return { descriptions, metadataLines, titles };
}

function validateMermaidBlock(block) {
	const violations = [];
	const lines = block.content.split(/\r?\n/u);
	if ((lines[0] ?? "").trim() === "---") {
		violations.push({
			line: block.line + 1,
			message: "Mermaid frontmatter is prohibited; use accessibility directives and renderer defaults."
		});
	}
	const { descriptions, metadataLines, titles } = collectAccessibilityDirectives(lines);
	if (titles.length !== 1 || titles[0]?.length === 0) {
		violations.push({
			line: block.line,
			message: "Mermaid diagrams require exactly one non-empty accTitle directive."
		});
	}
	if (descriptions.length !== 1 || descriptions[0]?.length === 0) {
		violations.push({
			line: block.line,
			message: "Mermaid diagrams require exactly one non-empty accDescr directive."
		});
	}

	for (const [index, line] of lines.entries()) {
		const trimmed = line.trimStart();
		if (metadataLines.has(index) || isMermaidComment(trimmed)) {
			continue;
		}
		const lineNumber = block.line + index + 1;
		if (trimmed.startsWith("%%{")) {
			violations.push({
				line: lineNumber,
				message: "Mermaid configuration and initialization directives are prohibited; use renderer defaults."
			});
		}
		if (containsClickDirective(line)) {
			violations.push({
				line: lineNumber,
				message: "Mermaid click directives are prohibited; put navigation in validated Markdown links."
			});
		}
		if (containsEmbeddedHtml(line)) {
			violations.push({
				line: lineNumber,
				message: "Embedded HTML is prohibited in Mermaid diagrams; use plain Mermaid labels."
			});
		}
	}
	return violations;
}

/**
 * Finds accessibility and repository-policy violations in Mermaid code fences.
 *
 * This intentionally does not emulate Mermaid parsing. GitHub owns the renderer,
 * while this guard enforces stable rules that are independent of renderer version.
 *
 * @param {string} source Complete Markdown source.
 * @returns {Array<{ line: number, message: string }>} Violations in document order.
 */
export function findMermaidDiagramViolations(source) {
	const violations = [];
	for (const block of markdownFencedCodeBlocks(source)) {
		if (block.language.toLowerCase() === "mermaid") {
			violations.push(...validateMermaidBlock(block));
		}
	}
	return violations;
}
