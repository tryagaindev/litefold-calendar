import assert from "node:assert/strict";
import test from "node:test";

import {
	CalendarMonthTitleRenderer,
	type CalendarMonthTitleElements
} from "../src/internal/dom/month-title.js";
import { createDom } from "./helpers/dom.js";

void test("month title action names include full and compact dates without duplicating identical labels", (context) => {
	const dom = createDom();
	context.after(() => { dom.window.close(); });
	const elements = createTitleElements(dom.window.document);
	const renderer = new CalendarMonthTitleRenderer({
		chooseMonthYear: "Choose month and year, currently {date}",
		locale: "en-US"
	});

	for (const { compact, full, month, name } of [
		{
			compact: "Aug 2026",
			full: "August 2026",
			month: 8,
			name: "Choose month and year, currently August 2026, Aug 2026"
		},
		{
			compact: "May 2026",
			full: "May 2026",
			month: 5,
			name: "Choose month and year, currently May 2026"
		}
	]) {
		const date = { day: 1, month, year: 2026 };
		renderer.render(elements, date);

		assert.equal(elements.titleButton.getAttribute("aria-label"), name);
		assert.equal(elements.titleLabelFull.textContent, full);
		assert.equal(elements.titleLabelCompact.textContent, compact);
		assert.equal(elements.titleLabelCompact.getAttribute("aria-hidden"), "true");
		assert.equal(renderer.formatFull(date), full);
		assert.equal(renderer.formatCompact(date), compact);
	}
});

void test("compact month aliases preserve application action text and the complete year", (context) => {
	const dom = createDom();
	context.after(() => { dom.window.close(); });
	const elements = createTitleElements(dom.window.document);
	const renderer = new CalendarMonthTitleRenderer({
		chooseMonthYear: "Choose reporting month, currently {date}",
		locale: "en-US"
	});

	renderer.render(elements, { day: 1, month: 2, year: 9999 });

	assert.equal(
		elements.titleButton.getAttribute("aria-label"),
		"Choose reporting month, currently February 9999, Feb 9999"
	);
	assert.equal(elements.titleLabelFull.textContent, "February 9999");
	assert.equal(elements.titleLabelCompact.textContent, "Feb 9999");
});

void test("rendering an unchanged month does not repeat title or action-name mutations", (context) => {
	const dom = createDom();
	context.after(() => { dom.window.close(); });
	const elements = createTitleElements(dom.window.document);
	const renderer = new CalendarMonthTitleRenderer({
		chooseMonthYear: "Choose month and year, currently {date}",
		locale: "en-US"
	});
	const date = { day: 1, month: 8, year: 2026 };
	renderer.render(elements, date);
	const observer = new dom.window.MutationObserver(() => undefined);
	observer.observe(elements.titleButton, { attributes: true, childList: true, subtree: true });

	renderer.render(elements, date);

	assert.deepEqual(observer.takeRecords(), []);
	observer.disconnect();
});

function createTitleElements(document: Document): Readonly<CalendarMonthTitleElements> {
	const titleButton = document.createElement("button");
	const titleLabelFull = document.createElement("span");
	const titleLabelCompact = document.createElement("span");
	titleLabelCompact.setAttribute("aria-hidden", "true");
	titleButton.append(titleLabelFull, titleLabelCompact);
	document.body.append(titleButton);
	return { titleButton, titleLabelCompact, titleLabelFull };
}
