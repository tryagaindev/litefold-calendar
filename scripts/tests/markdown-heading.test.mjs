import assert from "node:assert/strict";
import test from "node:test";

import {
	githubHeadingSlug,
	githubMarkdownHeadingSlugs,
	markdownExplicitAnchors,
	markdownVisibleText,
	maskMarkdownNonProse
} from "../lib/markdown-heading.mjs";

void test("GitHub heading slugs preserve the visible labels of autolinks", () => {
	assert.equal(githubHeadingSlug("Contact <https://example.com>"), "contact-httpsexamplecom");
	assert.equal(githubHeadingSlug("Email <operator@example.com>"), "email-operatorexamplecom");
	assert.equal(githubHeadingSlug("Local <operator@localhost>"), "local-operatorlocalhost");
});

void test("GitHub heading slugs strip raw HTML through quoted greater-than characters", () => {
	assert.equal(githubHeadingSlug("A <span title=\"> hidden\">B</span>"), "a-b");
	assert.equal(markdownVisibleText("Before <em data-note='a > b'>inside</em> after"), "Before inside after");
});

void test("GitHub heading slugs distinguish CommonMark declarations from visible pseudo-tags", () => {
	assert.equal(githubHeadingSlug("A <!DOCTYPE html> B"), "a--b");
	assert.equal(githubHeadingSlug("A <?target value?> B"), "a--b");
	assert.equal(githubHeadingSlug("A <![CDATA[ignored]]> B"), "a--b");
	assert.equal(githubHeadingSlug("A <!not-html> B"), "a-not-html-b");
	assert.equal(githubHeadingSlug("A <?not-html> B"), "a-not-html-b");
	assert.equal(githubHeadingSlug("A <!DOCTYPE> B"), "a-doctype-b");
});

void test("GitHub heading slugs use rendered CommonMark text", () => {
	assert.equal(githubHeadingSlug("A <!-- hidden --> B"), "a--b");
	assert.equal(githubHeadingSlug("A <!--> B"), "a----b");
	assert.equal(githubHeadingSlug("A <!---> B"), "a-----b");
	assert.equal(githubHeadingSlug("A <broken B <em>C</em>"), "a-broken-b-c");
	assert.equal(githubHeadingSlug("[x [y]](z)"), "x-y");
	assert.equal(githubHeadingSlug("A &amp; B"), "a--b");
	assert.equal(githubHeadingSlug("A  B"), "a--b");
	assert.equal(githubHeadingSlug("A\tB"), "ab");
	assert.equal(githubHeadingSlug("A <script> B"), "a-script-b");
});

void test("inline visible text uses heading-equivalent leading delimiter context", () => {
	assert.equal(githubHeadingSlug("_here_"), "here");
	assert.equal(githubHeadingSlug("__proto__"), "proto");
	assert.deepEqual(githubMarkdownHeadingSlugs("# __proto__"), [githubHeadingSlug("__proto__")]);
	assert.equal(markdownVisibleText("# here"), "# here");
	assert.equal(markdownVisibleText("<https://example.com>"), "https://example.com");
	assert.equal(markdownVisibleText("<em>here</em>"), "here");
});

void test("literal and unterminated angle brackets retain their visible text", () => {
	assert.equal(githubHeadingSlug("Values < limits"), "values--limits");
	assert.equal(githubHeadingSlug("Open <span title='unfinished'"), "open-span-titleunfinished");
	assert.equal(githubHeadingSlug("Broken <span <https://example.com>"), "broken-span-httpsexamplecom");
	assert.equal(githubHeadingSlug("Invalid <span @>"), "invalid-span-");
});

void test("duplicate headings use globally unique GitHub-style suffixes", () => {
	assert.deepEqual(
		githubMarkdownHeadingSlugs("# A\n\n# A-1\n\n# A\n\n# A\n"),
		["a", "a-1", "a-2", "a-3"]
	);
});

void test("full-document heading parsing resolves references and preserves source order", () => {
	const source = [
		"# [Guide][target]",
		"",
		"[target]: ./guide.md",
		"",
		"# A &amp; B",
		"",
		"# A <!--> B",
		"",
		"> ## A <broken B <em>C</em>"
	].join("\n");
	assert.deepEqual(
		githubMarkdownHeadingSlugs(source),
		["guide", "a--b", "a----b", "a-broken-b-c"]
	);
});

void test("explicit raw-HTML anchors exclude comments and code", () => {
	const source = [
		"<a name=\"foo\"></a>",
		"<div id='bar'></div>",
		"<div title=\" id='fake'\"></div>",
		"<div title=\"> hidden\" id=\"real\"></div>",
		"",
		"<!-- <a id=\"hidden\"></a> -->",
		"",
		"```html",
		"<a id=\"code\"></a>",
		"```"
	].join("\n");
	assert.deepEqual(markdownExplicitAnchors(source), ["foo", "bar", "real"]);
});

void test("explicit raw-HTML anchors apply GFM tagfilter semantics before HTML parsing", () => {
	const filteredTags = [
		"iframe",
		"noembed",
		"noframes",
		"plaintext",
		"script",
		"style",
		"textarea",
		"title",
		"xmp"
	];
	for (const tag of filteredTags) {
		const source = `<div><${tag.toUpperCase()} id="fake"></${tag}><a id="real"></a></div>`;
		assert.deepEqual(markdownExplicitAnchors(source), ["real"]);
		const slashSource = `<div><${tag}/id="fake"></${tag}><a id="real"></a></div>`;
		assert.deepEqual(markdownExplicitAnchors(slashSource), ["real"]);
	}

	const source = [
		"<div id=\"wrapper\">",
		"<script id=\"fake\"><a id=\"inside\"></a></script>",
		"<scripting id=\"near-miss\"></scripting>",
		"<a name=\"after\"></a>",
		"</div>"
	].join("\n");
	assert.deepEqual(markdownExplicitAnchors(source), ["wrapper", "inside", "near-miss", "after"]);
});

void test("Markdown traversal handles deeply nested block quotes without recursion", () => {
	const source = `${"> ".repeat(10_000)}# Deep`;
	assert.deepEqual(githubMarkdownHeadingSlugs(source), ["deep"]);
	assert.equal(markdownVisibleText(`\n${"> ".repeat(10_000)}deep`), "deep");
});

void test("duplicate heading slugs scale while preserving global collisions", () => {
	const source = `${"# Same\n\n".repeat(10_000)}# Same-1\n\n# Same`;
	const slugs = githubMarkdownHeadingSlugs(source);
	assert.equal(slugs.length, 10_002);
	assert.equal(slugs[0], "same");
	assert.equal(slugs[9_999], "same-9999");
	assert.equal(slugs[10_000], "same-1-1");
	assert.equal(slugs[10_001], "same-10000");
});

void test("non-prose masking is linear-parser-backed and preserves UTF-16 offsets", () => {
	const source = "Visible <!-- hidden --> shown <!--> literal 😀\n<div>\n<!-- [bad](missing.md) -->\n</div>\n\n```js\n[x](missing)\n```\n`inline` end";
	const fenced = maskMarkdownNonProse(source);
	const allCode = maskMarkdownNonProse(source, { inlineCode: true });
	assert.equal(fenced.length, source.length);
	assert.deepEqual([...fenced.matchAll(/\n/gu)].map((match) => match.index),
		[...source.matchAll(/\n/gu)].map((match) => match.index));
	assert.doesNotMatch(fenced, /<!-- hidden -->|\[bad\]\(missing\.md\)|\[x\]\(missing\)/u);
	assert.match(fenced, /<!--> literal/u);
	assert.match(fenced, /`inline` end/u);
	assert.doesNotMatch(allCode, /`inline`/u);
	assert.throws(
		() => githubHeadingSlug(`${"<!-- ".repeat(5_000)}Visible`),
		/more than 512 angle-bracket openers/u
	);
	assert.equal(markdownVisibleText(`${"*".repeat(2_048)}x${"*".repeat(2_048)}`), "x");
	assert.throws(
		() => markdownVisibleText(`${"*".repeat(4_097)}x`),
		/more than 4096 emphasis markers/u
	);
});
