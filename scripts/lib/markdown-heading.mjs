import { fromMarkdown } from "mdast-util-from-markdown";
import { parseFragment } from "parse5";

const MAX_MARKDOWN_INPUT_LENGTH = 262_144;
const MAX_ANGLE_OPENERS = 512;
const MAX_EMPHASIS_MARKERS = 4_096;
const FILTERED_HTML_TAG_NAMES = new Set([
	"iframe",
	"noembed",
	"noframes",
	"plaintext",
	"script",
	"style",
	"textarea",
	"title",
	"xmp"
]);
const HTML_TAG_PATTERN = /<\/?([a-z][a-z\d-]*)(?=[\t\n\f\r />])/giu;
const HTML_TAG_PREFIX_PATTERN = /^<\/?([a-z][a-z\d-]*)(?=[\t\n\f\r />])/iu;

function maskCharacters(value) {
	return value.replace(/[^\r\n]/g, " ");
}

function assertMarkdownBounds(source) {
	if (source.length > MAX_MARKDOWN_INPUT_LENGTH) {
		throw new Error(`Markdown input exceeds ${String(MAX_MARKDOWN_INPUT_LENGTH)} UTF-16 code units.`);
	}
	let openers = 0;
	let emphasisMarkers = 0;
	for (let cursor = 0; cursor < source.length; cursor += 1) {
		const character = source[cursor];
		if (character === "<") {
			openers += 1;
			if (openers > MAX_ANGLE_OPENERS) {
				throw new Error(`Markdown input contains more than ${String(MAX_ANGLE_OPENERS)} angle-bracket openers.`);
			}
		} else if (character === "*" || character === "_") {
			emphasisMarkers += 1;
			if (emphasisMarkers > MAX_EMPHASIS_MARKERS) {
				throw new Error(`Markdown input contains more than ${String(MAX_EMPHASIS_MARKERS)} emphasis markers.`);
			}
		}
	}
}

function parseMarkdown(source) {
	assertMarkdownBounds(source);
	return fromMarkdown(source);
}

function isGfmHtmlComment(value) {
	if (!value.startsWith("<!--") || !value.endsWith("-->") || value.length < 7) {
		return false;
	}
	const body = value.slice(4, -3);
	return !body.startsWith(">") && !body.startsWith("->") &&
		!body.endsWith("-") && !body.includes("--");
}

function gfmHtmlCommentRanges(source) {
	const ranges = [];
	let cursor = 0;
	while (cursor < source.length) {
		const start = source.indexOf("<!--", cursor);
		if (start === -1) {
			break;
		}
		const close = source.indexOf("-->", start + 4);
		if (close === -1) {
			break;
		}
		const end = close + 3;
		if (isGfmHtmlComment(source.slice(start, end))) {
			ranges.push([start, end]);
			cursor = end;
		} else {
			cursor = start + 4;
		}
	}
	return ranges;
}

function maskRanges(source, ranges) {
	const mergedRanges = [];
	for (const range of ranges.sort((left, right) => left[0] - right[0] || right[1] - left[1])) {
		const previous = mergedRanges.at(-1);
		if (previous !== undefined && range[0] <= previous[1]) {
			previous[1] = Math.max(previous[1], range[1]);
		} else {
			mergedRanges.push([...range]);
		}
	}

	const fragments = [];
	let cursor = 0;
	for (const [start, end] of mergedRanges) {
		fragments.push(source.slice(cursor, start));
		fragments.push(maskCharacters(source.slice(start, end)));
		cursor = end;
	}
	fragments.push(source.slice(cursor));
	return fragments.join("");
}

function beginsWithGfmFilteredHtmlTag(value) {
	const match = HTML_TAG_PREFIX_PATTERN.exec(value);
	return match !== null && FILTERED_HTML_TAG_NAMES.has(match[1].toLowerCase());
}

function applyGfmTagfilter(markup) {
	return markup.replace(HTML_TAG_PATTERN, (tag, tagName) =>
		FILTERED_HTML_TAG_NAMES.has(tagName.toLowerCase()) ? `&lt;${tag.slice(1)}` : tag);
}

function explicitAnchorsFromHtml(markup) {
	const anchors = [];
	const stack = [...(parseFragment(applyGfmTagfilter(markup)).childNodes ?? [])].reverse();
	while (stack.length > 0) {
		const node = stack.pop();
		if (node === undefined) {
			continue;
		}
		const tagName = typeof node.tagName === "string" ? node.tagName.toLowerCase() : "";
		for (const attribute of node.attrs ?? []) {
			const name = attribute.name.toLowerCase();
			if (name === "id" || name === "name" && tagName === "a") {
				anchors.push(attribute.value);
			}
		}
		stack.push(...[...(node.childNodes ?? [])].reverse());
	}
	return anchors;
}

function isGfmRawHtml(value) {
	if (beginsWithGfmFilteredHtmlTag(value)) {
		return false;
	}
	if (value.startsWith("<!--")) {
		return isGfmHtmlComment(value);
	}
	if (value.startsWith("<?")) {
		return value.endsWith("?>");
	}
	if (value.startsWith("<![CDATA[")) {
		return value.endsWith("]]>");
	}
	if (value.startsWith("<!")) {
		return /^<![A-Z]+[\t\n\f\r ][^>]*>$/u.test(value);
	}
	return true;
}

function visibleText(root) {
	const fragments = [];
	const stack = [root];
	while (stack.length > 0) {
		const node = stack.pop();
		if (node === undefined) {
			continue;
		}
		if (node.type === "text" || node.type === "inlineCode") {
			fragments.push(typeof node.value === "string" ? node.value : "");
			continue;
		}
		if (node.type === "image" || node.type === "imageReference") {
			fragments.push(typeof node.alt === "string" ? node.alt : "");
			continue;
		}
		if (node.type === "html") {
			fragments.push(typeof node.value === "string" && !isGfmRawHtml(node.value) ? node.value : "");
			continue;
		}
		if (node.type === "code" || node.type === "definition" || !Array.isArray(node.children)) {
			continue;
		}
		for (let index = node.children.length - 1; index >= 0; index -= 1) {
			stack.push(node.children[index]);
		}
	}
	return fragments.join("");
}

function slugVisibleText(value) {
	return value
		.trim()
		.toLowerCase()
		.replace(/[^\p{L}\p{M}\p{N} _-]/gu, "")
		.replaceAll(" ", "-");
}

class GitHubSlugger {
	#used = new Set();
	#nextSuffixes = new Map();

	slug(value) {
		const base = slugVisibleText(value);
		let suffix = this.#nextSuffixes.get(base) ?? 0;
		let candidate = suffix === 0 ? base : `${base}-${String(suffix)}`;
		while (this.#used.has(candidate)) {
			suffix += 1;
			candidate = `${base}-${String(suffix)}`;
		}
		this.#used.add(candidate);
		this.#nextSuffixes.set(base, suffix + 1);
		return candidate;
	}
}

function visit(root, callback) {
	const stack = [root];
	while (stack.length > 0) {
		const node = stack.pop();
		if (node === undefined) {
			continue;
		}
		callback(node);
		if (Array.isArray(node.children)) {
			for (let index = node.children.length - 1; index >= 0; index -= 1) {
				stack.push(node.children[index]);
			}
		}
	}
}

export function markdownVisibleText(value) {
	assertMarkdownBounds(value);
	return visibleText(fromMarkdown(`> x\u00a0${value}`)).slice(2);
}

export function githubHeadingSlug(value) {
	return slugVisibleText(markdownVisibleText(value));
}

export function githubMarkdownHeadingSlugs(source) {
	const slugs = [];
	const slugger = new GitHubSlugger();
	visit(parseMarkdown(source), (node) => {
		if (node.type === "heading") {
			slugs.push(slugger.slug(visibleText(node)));
		}
	});
	return slugs;
}

export function markdownExplicitAnchors(source) {
	const anchors = [];
	visit(parseMarkdown(source), (node) => {
		if (node.type !== "html" || typeof node.value !== "string" ||
			!isGfmRawHtml(node.value) && !beginsWithGfmFilteredHtmlTag(node.value) ||
			/^(?:<!--|<!\[CDATA\[|<\?|<!)/u.test(node.value)) {
			return;
		}
		anchors.push(...explicitAnchorsFromHtml(node.value));
	});
	return anchors;
}

export function maskMarkdownNonProse(source, options = {}) {
	const ranges = gfmHtmlCommentRanges(source);
	visit(parseMarkdown(source), (node) => {
		const htmlMarkup = node.type === "html" && typeof node.value === "string" &&
			(isGfmRawHtml(node.value) || beginsWithGfmFilteredHtmlTag(node.value));
		const hidden = node.type === "code" || htmlMarkup ||
			options.inlineCode === true && node.type === "inlineCode";
		const start = node.position?.start.offset;
		const end = node.position?.end.offset;
		if (hidden && Number.isInteger(start) && Number.isInteger(end)) {
			ranges.push([start, end]);
		}
	});

	return maskRanges(source, ranges);
}
