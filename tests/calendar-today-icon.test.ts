import assert from "node:assert/strict";
import test from "node:test";

import { createCalendar, LitefoldCalendarError, type CalendarOptions } from "../src/index.js";
import { createDom, getHost, installDom } from "./helpers/dom.js";

void test("Today keeps its localized text when no compact icon is configured", (context) => {
	const dom = createDom();
	context.after(installDom(dom));
	const host = getHost(dom);
	const calendar = createCalendar(host, { events: [], messages: { today: "Go to today" } });
	context.after(() => { calendar.destroy(); });
	calendar.render();

	const button = host.querySelector<HTMLButtonElement>(".lfc-calendar-today-button");
	assert.ok(button);
	assert.equal(button.textContent, "Go to today");
	assert.equal(button.querySelector(".lfc-calendar-today-icon"), null);
});

void test("Today mounts one compact icon while preserving its label, action and node identity", (context) => {
	const dom = createDom();
	context.after(installDom(dom));
	const host = getHost(dom);
	const icon = host.ownerDocument.createElementNS("http://www.w3.org/2000/svg", "svg");
	let factoryCalls = 0;
	const calendar = createCalendar(host, {
		events: [],
		icons: { today: (document) => {
			assert.equal(document, host.ownerDocument);
			factoryCalls += 1;
			return icon;
		} },
		initialDate: "2026-08-04",
		messages: { today: "Go to today" },
		now: () => new Date("2026-08-09T12:00:00Z"),
		timeZone: "UTC"
	});
	context.after(() => { calendar.destroy(); });
	assert.equal(icon.parentNode, null);
	calendar.render();

	const button = host.querySelector<HTMLButtonElement>(".lfc-calendar-today-button");
	assert.ok(button);
	assert.equal(button.type, "button");
	assert.equal(button.getAttribute("aria-label"), "Go to today");
	assert.equal(button.querySelector(".lfc-calendar-today-label")?.textContent, "Go to today");
	assert.equal(button.querySelector(".lfc-calendar-today-icon")?.firstChild, icon);
	assert.equal(icon.parentElement?.getAttribute("aria-hidden"), "true");
	button.focus();
	calendar.next();
	assert.equal(host.querySelector(".lfc-calendar-today-button"), button);
	assert.equal(button.querySelector(".lfc-calendar-today-icon")?.firstChild, icon);
	assert.equal(dom.window.document.activeElement, button);
	button.click();
	assert.deepEqual(calendar.getState().selectedDate, { day: 9, month: 8, year: 2026 });
	assert.equal(factoryCalls, 1);
	calendar.destroy();
	assert.equal(icon.parentNode, null);
});

void test("a compact Today icon respects disabled bounds without losing keyboard focus", (context) => {
	const dom = createDom();
	context.after(installDom(dom));
	const host = getHost(dom);
	const calendar = createCalendar(host, {
		events: [],
		icons: { today: (document) => document.createTextNode("Target") },
		initialDate: "2026-08-04",
		minDate: "2026-08-01",
		now: () => new Date("2026-07-09T12:00:00Z"),
		timeZone: "UTC"
	});
	context.after(() => { calendar.destroy(); });
	calendar.render();
	const button = host.querySelector<HTMLButtonElement>(".lfc-calendar-today-button");
	assert.ok(button);
	assert.equal(button.getAttribute("aria-disabled"), "true");
	assert.equal(button.disabled, false);
	button.focus();
	button.click();
	assert.deepEqual(calendar.getState().selectedDate, { day: 4, month: 8, year: 2026 });
	assert.equal(dom.window.document.activeElement, button);
});

const INVALID_TODAY_ICONS: readonly {
	readonly name: string;
	readonly icons: (document: Document) => CalendarOptions["icons"];
}[] = [
	{ name: "non-factory", icons: () => ({ today: null as never }) },
	{ name: "throwing factory", icons: () => ({ today: () => { throw new Error("Factory failed"); } }) },
	{ name: "non-node result", icons: () => ({ today: () => null as never }) },
	{ name: "asynchronous result", icons: (document) => ({
		today: () => Promise.resolve(document.createElement("span")) as never
	}) },
	{ name: "cross-document result", icons: (document) => ({
		today: () => document.implementation.createHTMLDocument().createElement("span")
	}) },
	{ name: "parented result", icons: (document) => {
		const parent = document.createElement("div");
		const icon = document.createElement("span");
		parent.append(icon);
		return { today: () => icon };
	} },
	{ name: "interactive result", icons: (document) => ({ today: () => {
		const icon = document.createElement("span");
		icon.append(document.createElement("button"));
		return icon;
	} }) },
	{ name: "node reused from Previous", icons: (document) => {
		const icon = document.createElement("span");
		return { previous: () => icon, today: () => icon };
	} },
	{ name: "node reused from Next", icons: (document) => {
		const icon = document.createElement("span");
		return { next: () => icon, today: () => icon };
	} }
];

for (const { icons, name } of INVALID_TODAY_ICONS) {
	void test(`Today rejects ${name} before modifying the host`, (context) => {
		const dom = createDom('<div id="calendar">Original content</div>');
		context.after(installDom(dom));
		const host = getHost(dom);
		const options = icons(host.ownerDocument);
		assert.throws(
			() => createCalendar(host, { events: [], ...(options === undefined ? {} : { icons: options }) }),
			(error: unknown) => error instanceof LitefoldCalendarError && error.code === "invalid-configuration"
		);
		assert.equal(host.innerHTML, "Original content");
	});
}

void test("Today icon leases prevent competing mounts and release for another calendar", (context) => {
	const dom = createDom('<div id="calendar"></div><div id="other">Original content</div>');
	context.after(installDom(dom));
	const host = getHost(dom);
	const otherHost = host.ownerDocument.querySelector<HTMLElement>("#other");
	assert.ok(otherHost);
	const icon = host.ownerDocument.createElement("span");
	const options: CalendarOptions = { events: [], icons: { today: () => icon } };
	const first = createCalendar(host, options);
	const second = createCalendar(otherHost, options);
	context.after(() => { first.destroy(); second.destroy(); });
	first.render();
	assert.throws(
		() => { second.render(); },
		(error: unknown) => error instanceof LitefoldCalendarError && error.code === "invalid-state"
	);
	assert.equal(otherHost.innerHTML, "Original content");
	first.destroy();
	assert.equal(icon.parentNode, null);
	second.render();
	assert.equal(otherHost.contains(icon), true);

	const applicationParent = host.ownerDocument.createElement("div");
	host.ownerDocument.body.append(applicationParent);
	applicationParent.append(icon);
	second.destroy();
	assert.equal(icon.parentNode, applicationParent);
});

void test("a Today icon reparented before render rejects the mount and permits retry", (context) => {
	const dom = createDom('<div id="calendar">Original content</div>');
	context.after(installDom(dom));
	const host = getHost(dom);
	const icon = host.ownerDocument.createElement("span");
	const calendar = createCalendar(host, { events: [], icons: { today: () => icon } });
	context.after(() => { calendar.destroy(); });
	host.ownerDocument.body.append(icon);
	assert.throws(
		() => { calendar.render(); },
		(error: unknown) => error instanceof LitefoldCalendarError && error.code === "invalid-state"
	);
	assert.equal(host.innerHTML, "Original content");
	assert.equal(icon.parentNode, host.ownerDocument.body);
	icon.remove();
	calendar.render();
	assert.equal(host.contains(icon), true);
});
