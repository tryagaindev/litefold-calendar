import assert from "node:assert/strict";
import test from "node:test";

import {
	findOwnershipViolations,
	markdownCodeBlocks
} from "../lib/ownership.mjs";

function tokens(source, options = {}) {
	return findOwnershipViolations(source, {
		language: options.language ?? "html",
		path: "fixture.html",
		strict: options.strict ?? true
	}).map((violation) => violation.token);
}

void test("ownership checker accepts application, Litefold Calendar, and test-probe namespaces", () => {
	const source = `
<a class="my-action lfc-calendar-action" id="my-run" href="#my-content" data-my-calendar></a>
<div class="litefold-calendar" data-litefold-calendar data-lfc-date="2026-08-30" data-test-ready></div>
`;
	assert.deepEqual(tokens(source), []);
	assert.deepEqual(tokens(`
@layer my.fixture {
	.my-calendar { --my-accent: var(--lfc-accent-color); }
	.litefold-calendar .lfc-calendar-grid { color: var(--my-accent); }
}
`, { language: "css" }), []);
	assert.deepEqual(tokens('webMcp({ toolNamePrefix: "my-schedule" });', { language: "ts" }), []);
});

void test("ownership checker rejects every retired identifier family", () => {
	const source = `
<div class="example-shell advanced-example-calendar application-calendar-marker--appointment lfc-pages-code-block"
	data-example-calendar data-calendar></div>
<style>
	@layer example.fixture { .example-shell { color: var(--example-color); } }
</style>
`;
	const actual = tokens(source);
	for (const expected of [
		"example-shell",
		"advanced-example-calendar",
		"application-calendar-marker--appointment",
		"lfc-pages-code-block",
		"data-example-calendar",
		"data-calendar",
		"@layer example.fixture",
		"--example-color"
	]) {
		assert.ok(actual.includes(expected), `Expected a violation for ${expected}.`);
	}
});

void test("ownership checker rejects bare boundary hooks and WebMCP prefixes", () => {
	const source = `
<label for="calendar">Schedule</label>
<div id="calendar" class="schedule-theme" data-controls aria-describedby="calendar-help"></div>
<p id="calendar-help"></p>
`;
	const actual = tokens(source);
	for (const expected of ["calendar", "schedule-theme", "data-controls", "calendar-help"]) {
		assert.ok(actual.includes(expected), `Expected a violation for ${expected}.`);
	}
	assert.deepEqual(
		tokens('const host = document.querySelector("#calendar");\nwebMcp({ toolNamePrefix: "team-schedule" });', { language: "ts" }),
		["calendar", "team-schedule"]
	);
});

void test("ownership checker covers generated classes, hook IDs, dataset keys, and IDREF data", () => {
	const source = `
const hooks = { id: "external-event-label", renderEventTrailing() {} };
label.className = "calendar-external-event";
document.documentElement.dataset.examplePhase = "ready";
host.dataset["responsiveDisclosure"] = "";
const selector = '[data-my-copy-target="install-command"]';
`;
	const actual = tokens(source, { language: "ts" });
	for (const expected of [
		"external-event-label",
		"calendar-external-event",
		"examplePhase",
		"responsiveDisclosure",
		"install-command"
	]) {
		assert.ok(actual.includes(expected), `Expected a violation for ${expected}.`);
	}
});

void test("ownership checker distinguishes render-hook set IDs from nearby event IDs", () => {
	const source = `
const EVENTS = [{
	id: "async-demo",
	title: "Open async details"
}];
const EVENT_DETAILS_RENDER_HOOKS = {
	id: "external-event-label",
	renderEventDetails() {}
};
`;
	assert.deepEqual(tokens(source, { language: "js" }), ["external-event-label"]);
});

void test("ownership checker rejects application identifiers disguised as Litefold Calendar hooks", () => {
	const source = `
element.className = "lfc-developer-footer";
element.classList.add("lfc-test-toolbar-action");
const marker = document.querySelector(".lfc-responsive-test-marker");
const fixture = document.querySelector("#lfc-swipe-fixture");
`;
	const actual = tokens(source, { language: "js", strict: false });
	for (const expected of [
		"lfc-developer-footer",
		"lfc-test-toolbar-action",
		"lfc-responsive-test-marker",
		"lfc-swipe-fixture"
	]) {
		assert.ok(actual.includes(expected), `Expected a violation for ${expected}.`);
	}
});

void test("Markdown scanning ignores prose and checks code fences with original line numbers", () => {
	const markdown = `A prose reference to example-shell and data-calendar is not executable.

\`\`\`html
<div data-calendar></div>
\`\`\`
`;
	const [block] = markdownCodeBlocks(markdown);
	assert.ok(block);
	const violations = findOwnershipViolations(block.source, {
		language: block.language,
		lineOffset: block.lineOffset,
		path: "guide.md"
	});
	assert.equal(violations.length, 1);
	assert.equal(violations[0]?.line, 4);
	assert.equal(violations[0]?.path, "guide.md");
});

void test("ownership checker ignores routes, tooling filenames, package namespaces, and test probes", () => {
	const source = `
const guide = "docs/example-deployment.md";
const tooling = "scripts/lib/advanced-example-build.mjs";
const route = "/examples/example-preview/";
const packageRoot = ".litefold-calendar";
const packageHook = "data-lfc-event-id";
const ownership = "data-litefold-calendar";
const probe = "data-test-calendar-ready";
const errorCode = "event-data-invalid";
const fragmentRoute = "/events/review#details";
const retainedMigrationFixture = document.querySelector("#release-demos");
`;
	assert.deepEqual(tokens(source, { language: "ts", strict: false }), []);
});
