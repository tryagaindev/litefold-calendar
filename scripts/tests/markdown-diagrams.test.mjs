import assert from "node:assert/strict";
import test from "node:test";

import { findMermaidDiagramViolations } from "../lib/markdown-diagrams.mjs";
import { markdownFencedCodeBlocks } from "../lib/markdown-heading.mjs";

function diagram(body) {
	return `# Diagram\n\n\`\`\`mermaid\n${body}\n\`\`\`\n`;
}

void test("fenced-code discovery uses the Markdown AST and preserves source locations", () => {
	assert.deepEqual(markdownFencedCodeBlocks([
		"# Example",
		"",
		"    indented code",
		"",
		"```ts metadata",
		"const value = true;",
		"```",
		"",
		"~~~mermaid",
		"flowchart LR",
		"~~~"
	].join("\n")), [
		{ content: "const value = true;", language: "ts", line: 5 },
		{ content: "flowchart LR", language: "mermaid", line: 9 }
	]);
});

void test("accessible Mermaid diagrams accept single-line and block descriptions", () => {
	assert.deepEqual(findMermaidDiagramViolations(diagram([
		"flowchart LR",
		"  accTitle: Source lifecycle",
		"  accDescr: A source is normalized before its events render.",
		"  Source --> Normalize --> Render"
	].join("\n"))), []);
	assert.deepEqual(findMermaidDiagramViolations(diagram([
		"sequenceDiagram",
		"  accTitle: Asynchronous source lifecycle",
		"  accDescr {",
		"    The application returns a PromiseLike. The calendar renders loading,",
		"    then commits the current result.",
		"  }",
		"  Application->>Calendar: PromiseLike",
		"  Calendar-->>Application: ready"
	].join("\n"))), []);
});

void test("Mermaid diagrams require exactly one non-empty accessible title and description", () => {
	const missing = findMermaidDiagramViolations(diagram("flowchart LR\n  A --> B"));
	assert.deepEqual(missing, [
		{ line: 3, message: "Mermaid diagrams require exactly one non-empty accTitle directive." },
		{ line: 3, message: "Mermaid diagrams require exactly one non-empty accDescr directive." }
	]);

	const duplicated = findMermaidDiagramViolations(diagram([
		"flowchart LR",
		"  accTitle:",
		"  accTitle: Duplicate",
		"  accDescr: First",
		"  accDescr: Second",
		"  A --> B"
	].join("\n")));
	assert.deepEqual(duplicated, [
		{ line: 3, message: "Mermaid diagrams require exactly one non-empty accTitle directive." },
		{ line: 3, message: "Mermaid diagrams require exactly one non-empty accDescr directive." }
	]);

	const unterminated = findMermaidDiagramViolations(diagram([
		"flowchart LR",
		"  accTitle: Incomplete description",
		"  accDescr {",
		"    This block never closes."
	].join("\n")));
	assert.deepEqual(unterminated, [
		{ line: 3, message: "Mermaid diagrams require exactly one non-empty accDescr directive." }
	]);
});

void test("Mermaid policy rejects renderer configuration, clicks, and embedded HTML", () => {
	const violations = findMermaidDiagramViolations(diagram([
		"%%{init: { 'theme': 'dark' }}%%",
		"flowchart LR",
		"  accTitle: Unsafe diagram",
		"  accDescr: A diagram containing prohibited renderer-specific features.",
		"  A[<strong>Open</strong>] --> B",
		"  click A \"https://example.test\""
	].join("\n")));
	assert.deepEqual(violations, [
		{
			line: 4,
			message: "Mermaid configuration and initialization directives are prohibited; use renderer defaults."
		},
		{
			line: 8,
			message: "Embedded HTML is prohibited in Mermaid diagrams; use plain Mermaid labels."
		},
		{
			line: 9,
			message: "Mermaid click directives are prohibited; put navigation in validated Markdown links."
		}
	]);
});

void test("Mermaid policy rejects leading frontmatter without confusing label text", () => {
	const violations = findMermaidDiagramViolations(diagram([
		"---",
		"config:",
		"  theme: dark",
		"---",
		"flowchart LR",
		"  accTitle: Configured diagram",
		"  accDescr: A diagram with renderer configuration in YAML frontmatter.",
		"  A --> B"
	].join("\n")));
	assert.deepEqual(violations, [
		{
			line: 4,
			message: "Mermaid frontmatter is prohibited; use accessibility directives and renderer defaults."
		}
	]);

	assert.deepEqual(findMermaidDiagramViolations(diagram([
		"flowchart LR",
		"  accTitle: Separator label",
		"  accDescr: Three dashes inside an ordinary label are not frontmatter.",
		"  A[\"---\"] --> B"
	].join("\n"))), []);
});

void test("Mermaid click policy handles semicolon statements without scanning quoted labels", () => {
	const accepted = diagram([
		"flowchart LR",
		"  accTitle: Quoted label",
		"  accDescr: Semicolons and click words inside quoted labels remain ordinary text.",
		"  A[\"text; click here\"] --> B",
		"  B --> C; %% click C callback"
	].join("\n"));
	assert.deepEqual(findMermaidDiagramViolations(accepted), []);

	const rejected = diagram([
		"flowchart LR",
		"  accTitle: Hidden click directive",
		"  accDescr: A semicolon starts another valid Mermaid statement on the same line.",
		"  A[Developer's API] --> B; click A \"https://example.test\"",
		String.raw`  B["label\"] --> C; click B "https://example.test"`
	].join("\n"));
	assert.deepEqual(findMermaidDiagramViolations(rejected), [
		{
			line: 7,
			message: "Mermaid click directives are prohibited; put navigation in validated Markdown links."
		},
		{
			line: 8,
			message: "Mermaid click directives are prohibited; put navigation in validated Markdown links."
		}
	]);
});

void test("Mermaid policy ignores comments, non-Mermaid fences, and generic type labels", () => {
	const source = `${diagram([
		"flowchart LR",
		"  accTitle: Type flow",
		"  accDescr: PromiseLike values enter source classification.",
		"  %% click A callback",
		"  A[PromiseLike<T>] --> B[CalendarEvent<T>]"
	].join("\n"))}\n\`\`\`html\n<strong>Not a Mermaid label</strong>\n\`\`\`\n`;
	assert.deepEqual(findMermaidDiagramViolations(source), []);
});
