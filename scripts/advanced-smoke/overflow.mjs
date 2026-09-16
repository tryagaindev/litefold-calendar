import assert from "node:assert/strict";

import { requireElement } from "./helpers.mjs";

export function verifyAdvancedOverflowPresentation({ document, dom, selectedCell }) {
	const selectedOverflowAction = requireElement(
		selectedCell,
		":scope .lfc-calendar-grid-more",
		dom.window.HTMLButtonElement
	);
	assert.equal(selectedCell.querySelectorAll(".lfc-calendar-grid-more").length, 1,
		"Compact counts and wide overflow must share one native action.");
	const compactOverflow = requireElement(
		selectedOverflowAction,
		":scope > .lfc-calendar-event-overflow.lfc-is-compact",
		dom.window.HTMLSpanElement
	);
	assert.equal(
		compactOverflow.getAttribute("aria-hidden"),
		"true",
		"The compact total visual must remain outside the accessibility tree of its named action."
	);
	assert.equal(
		compactOverflow.classList.contains("lfc-has-custom-event-overflow"),
		true,
		"Expected the unified hook to expose its custom compact state."
	);
	const compactOverflowContent = requireElement(
		compactOverflow,
		":scope > .lfc-calendar-event-overflow-content " +
			"> .my-event-overflow-compact",
		dom.window.HTMLSpanElement
	);
	assert.equal(compactOverflowContent.textContent, "53");
	assert.equal(compactOverflowContent.ownerDocument, document);
	assert.equal(
		compactOverflow.querySelector(".lfc-event-overflow-default-content"),
		null,
		"Expected custom compact DOM to replace only the variant's package visual."
	);
	assert.equal(
		compactOverflowContent.querySelector("a, button, input, select, textarea, [tabindex]"),
		null,
		"Custom count content must remain noninteractive inside the package-owned action."
	);
	assert.deepEqual(
		{
			actionBacked: compactOverflowContent.dataset["testActionBacked"],
			date: compactOverflowContent.dataset["testDate"],
			display: compactOverflowContent.dataset["testDisplay"],
			eventCount: compactOverflowContent.dataset["testEventCount"],
			overflowCount: compactOverflowContent.dataset["testOverflowCount"],
			surface: compactOverflowContent.dataset["testSurface"],
			variant: compactOverflowContent.dataset["testVariant"],
			visibleEventCount: compactOverflowContent.dataset["testVisibleEventCount"]
		},
		{
			actionBacked: "true",
			date: "2026-08-06",
			display: "count",
			eventCount: "53",
			overflowCount: "53",
			surface: "day",
			variant: "compact",
			visibleEventCount: "0"
		},
		"Expected the compact branch to receive the authoritative adaptive count context."
	);
	assert.ok(
		selectedCell.querySelector(
			'[data-test-event-surface="grid-summary"] .my-event-marker'
		) instanceof dom.window.HTMLSpanElement,
		"Pre-rendered wide event summaries must retain their custom markers."
	);
	const wideOverflow = requireElement(
		selectedOverflowAction,
		":scope > .lfc-calendar-event-overflow.lfc-is-wide",
		dom.window.HTMLSpanElement
	);
	const wideOverflowContent = requireElement(
		wideOverflow,
		":scope > .lfc-calendar-event-overflow-content",
		dom.window.HTMLSpanElement
	);
	const customOverflowContent = requireElement(
		wideOverflowContent,
		":scope > .my-event-overflow-wide",
		dom.window.HTMLSpanElement
	);
	assert.equal(
		wideOverflowContent.querySelector(".lfc-event-overflow-default-content"),
		null,
		"Expected custom wide DOM to replace only the variant's package visual."
	);
	assert.equal(wideOverflow.getAttribute("aria-hidden"), "true");
	assert.equal(customOverflowContent.ownerDocument, document);
	assert.equal(customOverflowContent.textContent, "51 additionalin agenda");
	assert.equal(
		customOverflowContent.querySelector(
			":scope > .my-event-overflow-wide-count"
		)?.textContent,
		"51 additional"
	);
	assert.equal(
		customOverflowContent.querySelector(
			":scope > .my-event-overflow-wide-destination"
		)?.textContent,
		"in agenda"
	);
	assert.deepEqual(
		{
			actionBacked: customOverflowContent.dataset["testActionBacked"],
			date: customOverflowContent.dataset["testDate"],
			display: customOverflowContent.dataset["testDisplay"],
			eventCount: customOverflowContent.dataset["testEventCount"],
			overflowCount: customOverflowContent.dataset["testOverflowCount"],
			surface: customOverflowContent.dataset["testSurface"],
			variant: customOverflowContent.dataset["testVariant"],
			visibleEventCount: customOverflowContent.dataset["testVisibleEventCount"]
		},
		{
			actionBacked: "true",
			date: "2026-08-06",
			display: "overflow",
			eventCount: "53",
			overflowCount: "51",
			surface: "grid-summary",
			variant: "wide",
			visibleEventCount: "2"
		},
		"Expected the wide branch to receive the authoritative adaptive count context."
	);
	assert.equal(
		customOverflowContent.querySelector("a, button, input, select, textarea, [tabindex]"),
		null,
		"Custom overflow content must remain noninteractive."
	);
	assert.equal(
		wideOverflow.classList.contains("lfc-has-custom-event-overflow"),
		true,
		"Expected the wide variant root to expose its custom-content state."
	);
	assert.equal(
		selectedOverflowAction.getAttribute("aria-label") ?? "",
		"View 53 items for Thursday, August 6, 2026, 51 additional",
		"The shared action must retain the full count and date plus the wide visible label."
	);
}
