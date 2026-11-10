import assert from "node:assert/strict";
import test from "node:test";

import { createCalendar } from "../src/index.js";
import { createDom, getHost, installDom, isPopoverOpen, waitFor } from "./helpers/dom.js";
import { getMonthYearPicker } from "./helpers/month-picker.js";

void test("a handled fatal error preserves focus on visible application-owned error UI", async (context) => {
	const dom = createDom([
		'<div id="calendar"></div>',
		'<div role="alert" aria-atomic="true">',
		'<h2 id="application-error" tabindex="-1" hidden></h2>',
		"</div>"
	].join(""));
	context.after(installDom(dom));
	const host = getHost(dom);
	const applicationError = dom.window.document.querySelector<HTMLHeadingElement>("#application-error");
	assert.ok(applicationError);
	let failClock = false;
	const calendar = createCalendar(host, {
		events: [],
		initialDate: "2026-07-14",
		now: () => {
			if (failClock) {
				throw new Error("clock failed while the picker was open");
			}
			return new Date("2026-07-14T12:00:00.000Z");
		},
		onError: () => {
			applicationError.textContent = "Calendar unavailable.";
			applicationError.hidden = false;
			applicationError.focus();
			return "handled";
		}
	});
	calendar.render();
	await waitFor(() => calendar.getState().phase === "ready", "ready calendar state");
	const picker = getMonthYearPicker(host);
	picker.trigger.click();
	assert.equal(dom.window.document.activeElement, picker.month);

	failClock = true;
	calendar.focusDate("2026-07-15");

	assert.equal(calendar.getState().phase, "unavailable");
	assert.equal(isPopoverOpen(picker.popover), false);
	assert.equal(applicationError.hidden, false);
	assert.equal(applicationError.textContent, "Calendar unavailable.");
	assert.equal(dom.window.document.activeElement, applicationError);
	const panel = host.querySelector<HTMLDivElement>(".lfc-calendar-status-panel");
	assert.ok(panel);
	assert.equal(panel.hidden, true);
});
