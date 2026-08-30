import assert from "node:assert/strict";
import test, { type TestContext } from "node:test";

import { createCalendar, type CalendarEventInput } from "../src/index.js";
import { createDom, installDom } from "./helpers/dom.js";

void test("renders without recursive integrity snapshots when no render hooks are configured", (context) => {
	const { dom, host } = setupDom(context);
	let attributeSnapshots = 0;
	const elementPrototype = dom.window.Element.prototype;
	const getAttributeNamesDescriptor = Object.getOwnPropertyDescriptor(elementPrototype, "getAttributeNames");
	assert.ok(getAttributeNamesDescriptor);
	const getAttributeNames = getAttributeNamesDescriptor.value as () => string[];
	elementPrototype.getAttributeNames = function getCountedAttributeNames(): string[] {
		attributeSnapshots += 1;
		return Reflect.apply(getAttributeNames, this, []);
	};
	context.after(() => {
		Object.defineProperty(elementPrototype, "getAttributeNames", getAttributeNamesDescriptor);
	});

	const calendar = createCalendar(host, {
		events: [allDayEvent("initial")],
		firstDay: 0,
		initialDate: "2026-08-15",
		now: () => new Date("2026-08-15T12:00:00Z"),
		swipe: false
	});
	calendar.render();
	calendar.focusDate("2026-08-16");

	assert.equal(attributeSnapshots, 0);
	calendar.destroy();
});

void test("retains recursive integrity validation whenever a render-hook set is configured", (context) => {
	const { dom, host } = setupDom(context);
	let attributeSnapshots = 0;
	const elementPrototype = dom.window.Element.prototype;
	const getAttributeNamesDescriptor = Object.getOwnPropertyDescriptor(elementPrototype, "getAttributeNames");
	assert.ok(getAttributeNamesDescriptor);
	const getAttributeNames = getAttributeNamesDescriptor.value as () => string[];
	elementPrototype.getAttributeNames = function getCountedAttributeNames(): string[] {
		attributeSnapshots += 1;
		return Reflect.apply(getAttributeNames, this, []);
	};
	context.after(() => {
		Object.defineProperty(elementPrototype, "getAttributeNames", getAttributeNamesDescriptor);
	});

	const calendar = createCalendar(host, {
		events: [allDayEvent("hooked")],
		firstDay: 0,
		initialDate: "2026-08-15",
		now: () => new Date("2026-08-15T12:00:00Z"),
		renderHooks: [{ id: "my-integrity-path-probe" }],
		swipe: false
	});
	calendar.render();

	assert.ok(attributeSnapshots > 0);
	calendar.destroy();
});

void test("shares decimal number formatting and initializes optional formatters on demand", (context) => {
	const { host } = setupDom(context);
	const dateTimeFormatDescriptor = Object.getOwnPropertyDescriptor(Intl, "DateTimeFormat");
	const numberFormatDescriptor = Object.getOwnPropertyDescriptor(Intl, "NumberFormat");
	assert.ok(dateTimeFormatDescriptor);
	assert.ok(numberFormatDescriptor);
	const DateTimeFormatConstructor = Intl.DateTimeFormat;
	const NumberFormatConstructor = Intl.NumberFormat;
	let dateTimeFormatConstructions = 0;
	let numberFormatConstructions = 0;
	Object.defineProperty(Intl, "DateTimeFormat", {
		...dateTimeFormatDescriptor,
		value: new Proxy(DateTimeFormatConstructor, {
			construct: (target, argumentsList) => {
				dateTimeFormatConstructions += 1;
				return Reflect.construct(target, argumentsList) as Intl.DateTimeFormat;
			}
		})
	});
	Object.defineProperty(Intl, "NumberFormat", {
		...numberFormatDescriptor,
		value: new Proxy(NumberFormatConstructor, {
			construct: (target, argumentsList) => {
				numberFormatConstructions += 1;
				return Reflect.construct(target, argumentsList) as Intl.NumberFormat;
			}
		})
	});
	context.after(() => {
		Object.defineProperty(Intl, "DateTimeFormat", dateTimeFormatDescriptor);
		Object.defineProperty(Intl, "NumberFormat", numberFormatDescriptor);
	});

	const calendar = createCalendar(host, {
		events: [allDayEvent("initial")],
		firstDay: 0,
		initialDate: "2026-08-15",
		locale: "en-US",
		now: () => new Date("2026-08-15T12:00:00Z"),
		swipe: false
	});
	const constructionDateTimeFormats = dateTimeFormatConstructions;
	const constructionNumberFormats = numberFormatConstructions;
	assert.equal(constructionNumberFormats, 1);

	calendar.render();
	assert.equal(dateTimeFormatConstructions, constructionDateTimeFormats);
	assert.equal(numberFormatConstructions, constructionNumberFormats);

	calendar.setEvents([{
		id: "timed",
		start: "2026-08-15T09:00",
		title: "Timed"
	}]);
	assert.equal(dateTimeFormatConstructions, constructionDateTimeFormats + 1);
	assert.equal(numberFormatConstructions, constructionNumberFormats);

	calendar.setEvents([allDayEvent("first"), allDayEvent("second")]);
	assert.equal(dateTimeFormatConstructions, constructionDateTimeFormats + 1);
	assert.equal(numberFormatConstructions, constructionNumberFormats + 1);
	calendar.destroy();
});

interface TestDom {
	readonly dom: ReturnType<typeof createDom>;
	readonly host: HTMLElement;
}

function setupDom(context: TestContext): TestDom {
	const dom = createDom('<div id="calendar"></div>');
	const restore = installDom(dom);
	context.after(restore);
	const host = dom.window.document.querySelector<HTMLElement>("#calendar");
	assert.ok(host);
	return { dom, host };
}

function allDayEvent(id: string): CalendarEventInput {
	return { id, start: "2026-08-15", title: id };
}
