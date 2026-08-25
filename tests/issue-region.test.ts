import assert from "node:assert/strict";
import test from "node:test";

import type { CalendarIssue } from "../src/errors.js";
import {
	presentCalendarIssue,
	type CalendarIssuePresentation,
	type CalendarIssueRegionElements
} from "../src/internal/dom/issue-region.js";
import { createDom, installDom } from "./helpers/dom.js";

void test("issue presentation replaces and clears safe content without replacing Retry", (context) => {
	const dom = createDom();
	const restore = installDom(dom);
	context.after(restore);
	const elements = createIssueElements(dom.window.document);
	const retry = elements.retryButton;

	presentCalendarIssue(elements, presentation(issue("error", "First title", "First message"), true));
	retry.focus();
	presentCalendarIssue(elements, presentation(issue("warning", "Second title", "Second message"), true));

	assert.equal(elements.panel.hidden, false);
	assert.equal(elements.panel.dataset["lfcCode"], "event-source-failed");
	assert.equal(elements.panel.dataset["lfcSeverity"], "warning");
	assert.equal(elements.panelTitle.textContent, "Second title");
	assert.equal(elements.panelMessage.textContent, "Second message");
	assert.equal(elements.retryButton, retry);
	assert.equal(dom.window.document.activeElement, retry);

	presentCalendarIssue(elements, presentation(null, false));
	assert.equal(elements.panel.hidden, true);
	assert.equal(elements.panel.hasAttribute("data-lfc-code"), false);
	assert.equal(elements.panel.hasAttribute("data-lfc-severity"), false);
	assert.equal(elements.panelIcon.textContent, "");
	assert.equal(elements.panelTitle.textContent, "");
	assert.equal(elements.panelMessage.textContent, "");
	assert.equal(elements.panelActions.hidden, true);
	assert.equal(elements.retryButton.hidden, true);
	assert.equal(elements.retryButton, retry);
});

void test("Retry updates in place and remains focusable while guarded", (context) => {
	const dom = createDom();
	const restore = installDom(dom);
	context.after(restore);
	const elements = createIssueElements(dom.window.document);
	const retry = elements.retryButton;

	presentCalendarIssue(elements, presentation(issue("error", "Unavailable", "Try again"), true));
	retry.focus();
	presentCalendarIssue(elements, presentation(issue("error", "Unavailable", "Try again"), true, true));

	assert.equal(elements.retryButton, retry);
	assert.equal(elements.retryButton.disabled, false);
	assert.equal(elements.retryButton.getAttribute("aria-disabled"), "true");
	assert.equal(elements.retryButton.textContent, "Retrying");
	assert.equal(dom.window.document.activeElement, retry);

	presentCalendarIssue(elements, presentation(issue("error", "Unavailable", "Try again"), true));
	assert.equal(elements.retryButton.getAttribute("aria-disabled"), "false");
	assert.equal(elements.retryButton.textContent, "Retry");
	assert.equal(dom.window.document.activeElement, retry);
});

void test("hostile issue text is rendered only as text", (context) => {
	const dom = createDom();
	const restore = installDom(dom);
	context.after(restore);
	const elements = createIssueElements(dom.window.document);
	const hostileTitle = '<img src="x" onerror="globalThis.compromised=true">';
	const hostileMessage = "</p><script>globalThis.compromised=true</script>";

	presentCalendarIssue(
		elements,
		presentation(issue("fatal", hostileTitle, hostileMessage), false)
	);

	assert.equal(elements.panelTitle.textContent, hostileTitle);
	assert.equal(elements.panelMessage.textContent, hostileMessage);
	assert.equal(elements.panel.querySelector("img, script"), null);
	assert.equal(Reflect.get(globalThis, "compromised"), undefined);
});

function createIssueElements(document: Document): CalendarIssueRegionElements {
	const panel = document.createElement("div");
	const panelActions = document.createElement("div");
	const panelIcon = document.createElement("span");
	const panelMessage = document.createElement("p");
	const panelTitle = document.createElement("h2");
	const retryButton = document.createElement("button");
	retryButton.type = "button";
	panelActions.append(retryButton);
	panel.append(panelIcon, panelTitle, panelMessage, panelActions);
	document.body.append(panel);
	return { panel, panelActions, panelIcon, panelMessage, panelTitle, retryButton };
}

function issue(
	severity: CalendarIssue["severity"],
	title: string,
	message: string
): Readonly<CalendarIssue> {
	return Object.freeze({
		code: "event-source-failed",
		message,
		recoverable: severity !== "fatal",
		severity,
		title
	});
}

function presentation(
	value: Readonly<CalendarIssue> | null,
	retryable: boolean,
	retrying = false
): CalendarIssuePresentation {
	return {
		issue: value,
		retryable,
		retrying,
		retryingText: "Retrying",
		retryText: "Retry"
	};
}
