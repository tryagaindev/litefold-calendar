import assert from "node:assert/strict";
import test, { type TestContext } from "node:test";

import { createCalendar, type Calendar, type LitefoldCalendarError } from "../src/index.js";
import { createDom, dispatchClick, installDom, isPopoverOpen, waitFor } from "./helpers/dom.js";

void test("an aria-disabled Today control stays silent when the clock changes or throws", async (context) => {
	const { dom, host } = setupDom(context);
	const observedErrors: LitefoldCalendarError[] = [];
	let clockCalls = 0;
	let clockInstant = new Date("2026-06-15T12:00:00.000Z");
	let clockThrows = false;
	let requests = 0;
	const calendar = createCalendar(host, {
		events: () => {
			requests += 1;
			return [];
		},
		initialDate: "2026-07-15",
		maxDate: "2026-08-31",
		minDate: "2026-07-01",
		now: () => {
			clockCalls += 1;
			if (clockThrows) {
				throw new Error("disabled clock must not be read");
			}
			return clockInstant;
		},
		onError: (error) => { observedErrors.push(error); }
	});
	calendar.render();
	await waitForPhase(calendar, "ready");
	const today = host.querySelector<HTMLButtonElement>(".lfc-calendar-today-button");
	assert.ok(today);
	assert.equal(today.getAttribute("aria-disabled"), "true");
	const beforeState = calendar.getState();
	const beforeClockCalls = clockCalls;
	const beforeRequests = requests;

	clockInstant = new Date("2026-08-12T12:00:00.000Z");
	dispatchClick(dom, today);
	clockThrows = true;
	dispatchClick(dom, today);

	assert.deepEqual(calendar.getState(), beforeState);
	assert.equal(clockCalls, beforeClockCalls);
	assert.equal(requests, beforeRequests);
	assert.deepEqual(observedErrors, []);
});

void test("a canceled month-picker opening clears its pending interaction state", async (context) => {
	const { host } = setupDom(context);
	const calendar = createCalendar(host, { events: [], initialDate: "2026-07-14" });
	calendar.render();
	await waitForPhase(calendar, "ready");
	const picker = host.querySelector<HTMLElement>(".lfc-calendar-month-picker");
	const trigger = host.querySelector<HTMLButtonElement>(".lfc-calendar-title-button");
	assert.ok(picker);
	assert.ok(trigger);
	picker.addEventListener("beforetoggle", (event) => { event.preventDefault(); }, { once: true });
	trigger.click();
	assert.equal(isPopoverOpen(picker), false);
	await waitFor(() => trigger.getAttribute("aria-expanded") === "false", "canceled picker cleanup");
});

function setupDom(context: TestContext): {
	readonly dom: ReturnType<typeof createDom>;
	readonly host: HTMLElement;
} {
	const dom = createDom();
	context.after(installDom(dom));
	const host = dom.window.document.querySelector<HTMLElement>("#calendar");
	assert.ok(host);
	return { dom, host };
}

async function waitForPhase(calendar: Calendar, phase: ReturnType<Calendar["getState"]>["phase"]): Promise<void> {
	await waitFor(() => calendar.getState().phase === phase, `${phase} calendar state`);
}
