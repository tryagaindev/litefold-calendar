import assert from "node:assert/strict";
import test, { type TestContext } from "node:test";

import { resolveTextDirection } from "../src/internal/dom/environment.js";
import { createCalendar, type Calendar } from "../src/index.js";
import { createDom, dispatchKey, installDom, waitFor } from "./helpers/dom.js";

void test("RTL calendars mirror spatial navigation and isolate event text", async (context) => {
	const { dom, host } = setupDom(context, '<div id="shell" dir="ltr"><div id="calendar"></div></div>');
	const shell = dom.window.document.querySelector<HTMLElement>("#shell");
	assert.ok(shell);
	const calendar = createCalendar(host, {
		events: [{ id: "mixed", start: "2026-07-14T09:00", title: "Design review — اجتماع" }],
		initialDate: "2026-07-14"
	});
	calendar.render();
	await waitForPhase(calendar, "ready");
	shell.dir = "rtl";

	const icons = [...host.querySelectorAll<HTMLElement>(".lfc-calendar-navigation-icon")];
	assert.equal(icons.length, 2);
	assert.equal(icons.every((icon) => icon.dir === "ltr"), true);
	const eventText = [...host.querySelectorAll<HTMLElement>(".lfc-calendar-time, .lfc-calendar-event-title")];
	assert.equal(eventText.length, 4);
	assert.equal(eventText.every((element) => element.dir === "auto"), true);

	const original = findDayButton(host, "2026-07-14");
	original.focus();
	const left = dispatchKey(dom, original, "ArrowLeft");
	assert.equal(left.defaultPrevented, true);
	assert.equal(dom.window.document.activeElement, findDayButton(host, "2026-07-15"));

	const right = dispatchKey(dom, findDayButton(host, "2026-07-15"), "ArrowRight");
	assert.equal(right.defaultPrevented, true);
	assert.equal(dom.window.document.activeElement, original);
});

void test("direction fallback respects the nearest semantic boundary", () => {
	const dom = createDom('<div dir="rtl"><div id="calendar" dir="ltr"></div></div>');
	const host = dom.window.document.querySelector<HTMLElement>("#calendar");
	assert.ok(host);
	assert.equal(resolveTextDirection(null, host), "ltr");
	host.removeAttribute("dir");
	assert.equal(resolveTextDirection(null, host), "rtl");
});

interface TestDom {
	readonly dom: ReturnType<typeof createDom>;
	readonly host: HTMLElement;
}

function setupDom(context: TestContext, markup = '<div id="calendar"></div>'): TestDom {
	const dom = createDom(markup);
	const restore = installDom(dom);
	context.after(restore);
	const host = dom.window.document.querySelector<HTMLElement>("#calendar");
	assert.ok(host);
	return { dom, host };
}

function findDayButton(host: HTMLElement, date: string): HTMLButtonElement {
	const button = host.querySelector<HTMLButtonElement>(`button[data-lfc-date='${date}']`);
	assert.ok(button);
	return button;
}

async function waitForPhase(calendar: Calendar, phase: ReturnType<Calendar["getState"]>["phase"]): Promise<void> {
	await waitFor(() => calendar.getState().phase === phase, `${phase} calendar state`);
}
