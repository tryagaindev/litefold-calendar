import assert from "node:assert/strict";
import test, { type TestContext } from "node:test";

import {
	createCalendar,
	type Calendar,
	LitefoldCalendarError
} from "../src/index.js";
import {
	createDom,
	dispatchClick,
	dispatchKey,
	installDom,
	isPopoverOpen,
	waitFor
} from "./helpers/dom.js";

void test("spillover day clicks stop quietly at supported month boundaries", async (context) => {
	const { dom, host } = setupDom(context);
	const uncaughtErrors: unknown[] = [];
	const selectedDates: string[] = [];
	dom.window.addEventListener("error", (errorEvent) => {
		uncaughtErrors.push(errorEvent.error);
		errorEvent.preventDefault();
	});
	const calendar = createCalendar(host, {
		events: [],
		firstDay: 0,
		initialDate: "0001-02-15",
		onDaySelect: ({ dateString }) => {
			selectedDates.push(dateString);
		}
	});
	calendar.render();
	await waitForPhase(calendar, "ready");
	const boundaryDay = host.querySelector<HTMLButtonElement>("[data-lfc-date='0001-01-28']");
	assert.ok(boundaryDay);

	dispatchClick(dom, boundaryDay);

	assert.deepEqual(uncaughtErrors, []);
	assert.deepEqual(calendar.getState().displayedMonth, { day: 1, month: 2, year: 1 });
	assert.deepEqual(calendar.getState().selectedDate, { day: 15, month: 2, year: 1 });
	assert.deepEqual(selectedDates, []);
});

void test("an integration-node lease conflict is recoverable after its owner is destroyed", async (context) => {
	const { dom, host } = setupDom(
		context,
		'<div id="calendar"></div><div id="waiting-calendar"></div>'
	);
	const waitingHost = dom.window.document.querySelector<HTMLElement>("#waiting-calendar");
	assert.ok(waitingHost);
	const toolbarEnd = dom.window.document.createElement("div");
	const owner = createCalendar(host, {
		events: [],
		initialDate: "2026-07-14",
		toolbarEnd
	});
	const waiting = createCalendar(waitingHost, {
		events: [],
		initialDate: "2026-07-14",
		toolbarEnd
	});

	owner.render();
	await waitForPhase(owner, "ready");
	assert.throws(
		() => { waiting.render(); },
		(error: unknown) => error instanceof LitefoldCalendarError &&
			error.code === "invalid-state" && error.hook === "render" && error.recoverable &&
			/unavailable to this calendar host/i.test(error.message)
	);
	assert.equal(waitingHost.childElementCount, 0);

	owner.destroy();
	waiting.render();
	await waitForPhase(waiting, "ready");
	assert.equal(waitingHost.contains(toolbarEnd), true);
});

void test("public and built-in month navigation stop quietly at both supported boundaries", async (context) => {
	const { dom, host } = setupDom(context);
	const uncaughtErrors: unknown[] = [];
	const observedErrors: LitefoldCalendarError[] = [];
	dom.window.addEventListener("error", (errorEvent) => {
		uncaughtErrors.push(errorEvent.error);
		errorEvent.preventDefault();
	});
	const lowerCalendar = createCalendar(host, {
		events: [],
		firstDay: 0,
		initialDate: "0001-02-15",
		onError: (error) => { observedErrors.push(error); }
	});
	lowerCalendar.render();
	await waitForPhase(lowerCalendar, "ready");
	const lowerSelected = host.querySelector<HTMLButtonElement>("[data-lfc-date='0001-02-15']");
	const previous = host.querySelector<HTMLButtonElement>(".lfc-calendar-nav-button-previous");
	assert.ok(lowerSelected);
	assert.ok(previous);

	lowerCalendar.prev();
	dispatchClick(dom, previous);
	dispatchKey(dom, lowerSelected, "PageUp");
	assert.deepEqual(lowerCalendar.getState().displayedMonth, { day: 1, month: 2, year: 1 });
	assert.deepEqual(lowerCalendar.getState().selectedDate, { day: 15, month: 2, year: 1 });
	assert.deepEqual(lowerCalendar.getState().issues, []);
	lowerCalendar.destroy();

	const upperCalendar = createCalendar(host, {
		events: [],
		firstDay: 0,
		initialDate: "9999-11-15",
		onError: (error) => { observedErrors.push(error); }
	});
	upperCalendar.render();
	await waitForPhase(upperCalendar, "ready");
	const upperSelected = host.querySelector<HTMLButtonElement>("[data-lfc-date='9999-11-15']");
	const next = host.querySelector<HTMLButtonElement>(".lfc-calendar-nav-button-next");
	assert.ok(upperSelected);
	assert.ok(next);

	upperCalendar.next();
	dispatchClick(dom, next);
	dispatchKey(dom, upperSelected, "PageDown");
	assert.deepEqual(upperCalendar.getState().displayedMonth, { day: 1, month: 11, year: 9999 });
	assert.deepEqual(upperCalendar.getState().selectedDate, { day: 15, month: 11, year: 9999 });
	assert.deepEqual(upperCalendar.getState().issues, []);
	assert.deepEqual(observedErrors, []);
	assert.deepEqual(uncaughtErrors, []);
});

void test("current-date navigation stops quietly when the configured clock month cannot render", async (context) => {
	const { dom, host } = setupDom(context);
	const uncaughtErrors: unknown[] = [];
	const observedErrors: LitefoldCalendarError[] = [];
	dom.window.addEventListener("error", (errorEvent) => {
		uncaughtErrors.push(errorEvent.error);
		errorEvent.preventDefault();
	});
	const calendar = createCalendar(host, {
		events: [],
		firstDay: 0,
		initialDate: "0001-02-15",
		now: () => new Date("0001-01-15T12:00:00.000Z"),
		onError: (error) => { observedErrors.push(error); }
	});
	calendar.render();
	await waitForPhase(calendar, "ready");
	const today = host.querySelector<HTMLButtonElement>(".lfc-calendar-today-button");
	assert.ok(today);

	calendar.today();
	calendar.focusToday();
	dispatchClick(dom, today);

	assert.deepEqual(calendar.getState().displayedMonth, { day: 1, month: 2, year: 1 });
	assert.deepEqual(calendar.getState().selectedDate, { day: 15, month: 2, year: 1 });
	assert.deepEqual(calendar.getState().issues, []);
	assert.deepEqual(observedErrors, []);
	assert.deepEqual(uncaughtErrors, []);
});

void test("inclusive configured bounds constrain every package and public navigation path", async (context) => {
	const { dom, host } = setupDom(context);
	const ranges: Readonly<{ readonly end: string; readonly start: string }>[] = [];
	const selectedDates: string[] = [];
	const observedErrors: LitefoldCalendarError[] = [];
	const calendar = createCalendar(host, {
		events: (range) => {
			ranges.push(range);
			return [];
		},
		firstDay: 0,
		initialDate: "2026-07-15",
		maxDate: "2026-09-20",
		minDate: "2026-07-10",
		now: () => new Date("2026-06-15T12:00:00Z"),
		onDaySelect: ({ dateString }) => {
			selectedDates.push(dateString);
		},
		onError: (error) => {
			observedErrors.push(error);
		}
	});
	calendar.render();
	await waitForPhase(calendar, "ready");
	calendar.focusDate("2026-07-10");

	const previous = host.querySelector<HTMLButtonElement>(".lfc-calendar-nav-button-previous");
	const next = host.querySelector<HTMLButtonElement>(".lfc-calendar-nav-button-next");
	const today = host.querySelector<HTMLButtonElement>(".lfc-calendar-today-button");
	const lowerDay = host.querySelector<HTMLButtonElement>("[data-lfc-date='2026-07-09']");
	const minimumDay = host.querySelector<HTMLButtonElement>("[data-lfc-date='2026-07-10']");
	const pager = installPagerGeometry(host);
	assert.ok(previous);
	assert.ok(next);
	assert.ok(today);
	assert.ok(lowerDay);
	assert.ok(minimumDay);
	assert.equal(previous.disabled, false);
	assert.equal(previous.getAttribute("aria-disabled"), "true");
	assert.equal(next.hasAttribute("aria-disabled"), false);
	assert.equal(today.disabled, false);
	assert.equal(today.getAttribute("aria-disabled"), "true");
	assert.equal(lowerDay.disabled, true);
	assert.equal(minimumDay.disabled, false);
	assert.deepEqual(ranges.map(({ end, start }) => ({ end, start })), [{
		end: "2026-08-09",
		start: "2026-06-28"
	}]);

	const before = calendar.getState();
	assert.throws(
		() => { calendar.gotoDate("2026-07-09"); },
		(error: unknown) => error instanceof LitefoldCalendarError && error.code === "invalid-argument"
	);
	assert.throws(
		() => { calendar.focusDate("2026-09-21"); },
		(error: unknown) => error instanceof LitefoldCalendarError && error.code === "invalid-argument"
	);
	calendar.prev();
	calendar.today();
	calendar.focusToday();
	dispatchClick(dom, previous);
	dispatchClick(dom, today);
	dispatchClick(dom, lowerDay);
	lowerDay.dispatchEvent(new dom.window.MouseEvent("contextmenu", {
		bubbles: true,
		button: 2,
		cancelable: true
	}));
	minimumDay.focus();
	dispatchKey(dom, minimumDay, "ArrowLeft");
	dispatchKey(dom, minimumDay, "PageUp");
	dispatchKey(dom, minimumDay, "PageUp", true);
	assert.equal(pager.previousLane.hasAttribute("data-lfc-page-available"), false);
	dispatchPagerEvent(dom, pager, "scroll", pager.previousOffset);
	assert.equal(host.getAttribute("data-lfc-swipe-state"), "scrolling");
	dispatchPagerEvent(dom, pager, "scrollend");

	assert.deepEqual(calendar.getState(), before);
	assert.equal(pager.viewport.scrollLeft, pager.centerOffset);
	assert.equal(host.hasAttribute("data-lfc-swipe-state"), false);
	assert.equal(dom.window.document.activeElement, minimumDay);
	assert.equal(ranges.length, 1);
	assert.deepEqual(selectedDates, []);
	assert.deepEqual(observedErrors, []);
	assert.deepEqual(calendar.getState().issues, []);
});

void test("month navigation reaches partial boundary months and clamps the selected day", async (context) => {
	const { dom, host } = setupDom(context);
	const ranges: Readonly<{ readonly end: string; readonly start: string }>[] = [];
	const selectedDates: string[] = [];
	const calendar = createCalendar(host, {
		events: (range) => {
			ranges.push(range);
			return [];
		},
		firstDay: 0,
		initialDate: "2026-06-30",
		maxDate: "2026-07-15",
		minDate: "2026-06-01",
		onDaySelect: ({ dateString }) => {
			selectedDates.push(dateString);
		}
	});
	calendar.render();
	await waitForPhase(calendar, "ready");
	const next = host.querySelector<HTMLButtonElement>(".lfc-calendar-nav-button-next");
	assert.ok(next);
	assert.equal(next.hasAttribute("aria-disabled"), false);

	dispatchClick(dom, next);
	await waitForPhase(calendar, "ready");
	assert.deepEqual(calendar.getState().displayedMonth, { day: 1, month: 7, year: 2026 });
	assert.deepEqual(calendar.getState().selectedDate, { day: 15, month: 7, year: 2026 });
	assert.deepEqual(ranges.at(-1) === undefined ? null : {
		end: ranges.at(-1)?.end,
		start: ranges.at(-1)?.start
	}, {
		end: "2026-08-09",
		start: "2026-06-28"
	});
	const upperDay = host.querySelector<HTMLButtonElement>("[data-lfc-date='2026-07-16']");
	const maximumDay = host.querySelector<HTMLButtonElement>("[data-lfc-date='2026-07-15']");
	assert.ok(upperDay);
	assert.ok(maximumDay);
	assert.equal(upperDay.disabled, true);
	assert.equal(maximumDay.disabled, false);
	assert.equal(
		host.querySelector<HTMLButtonElement>(".lfc-calendar-nav-button-next")?.getAttribute("aria-disabled"),
		"true"
	);
	assert.equal(
		host.querySelector<HTMLButtonElement>(".lfc-calendar-nav-button-previous")?.hasAttribute("aria-disabled"),
		false
	);
	const currentNext = host.querySelector<HTMLButtonElement>(".lfc-calendar-nav-button-next");
	const pager = installPagerGeometry(host);
	assert.ok(currentNext);
	const upperState = calendar.getState();
	const upperRangeCount = ranges.length;
	calendar.next();
	dispatchClick(dom, currentNext);
	maximumDay.focus();
	dispatchKey(dom, maximumDay, "ArrowRight");
	dispatchKey(dom, maximumDay, "End");
	dispatchKey(dom, maximumDay, "PageDown");
	dispatchKey(dom, maximumDay, "PageDown", true);
	assert.equal(pager.nextLane.hasAttribute("data-lfc-page-available"), false);
	dispatchPagerEvent(dom, pager, "scroll", pager.nextOffset);
	dispatchPagerEvent(dom, pager, "scrollend");
	assert.deepEqual(calendar.getState(), upperState);
	assert.equal(pager.viewport.scrollLeft, pager.centerOffset);
	assert.equal(host.hasAttribute("data-lfc-swipe-state"), false);
	assert.equal(dom.window.document.activeElement, maximumDay);
	assert.equal(ranges.length, upperRangeCount);

	calendar.gotoDate("2026-06-30");
	await waitForPhase(calendar, "ready");
	const juneDay = host.querySelector<HTMLButtonElement>("[data-lfc-date='2026-06-30']");
	assert.ok(juneDay);
	calendar.focusDate("2026-06-30");
	dispatchKey(dom, host.querySelector<HTMLButtonElement>("[data-lfc-date='2026-06-30']") ?? juneDay, "PageDown");
	await waitForPhase(calendar, "ready");
	assert.deepEqual(calendar.getState().selectedDate, { day: 15, month: 7, year: 2026 });
	assert.equal(dom.window.document.activeElement?.getAttribute("data-lfc-date"), "2026-07-15");
	assert.deepEqual(selectedDates, []);
});

void test("one-sided bounds preserve leap-day preferences and clamp at the open range edge", async (context) => {
	const { host } = setupDom(context);
	const lowerBounded = createCalendar(host, {
		events: [],
		firstDay: 0,
		initialDate: "2024-02-29",
		minDate: "2024-02-29"
	});
	lowerBounded.render();
	await waitForPhase(lowerBounded, "ready");
	assert.equal(
		host.querySelector<HTMLButtonElement>(".lfc-calendar-nav-button-previous")?.getAttribute("aria-disabled"),
		"true"
	);
	lowerBounded.next();
	await waitForPhase(lowerBounded, "ready");
	assert.deepEqual(lowerBounded.getState().selectedDate, { day: 29, month: 3, year: 2024 });
	lowerBounded.destroy();

	const upperBounded = createCalendar(host, {
		events: [],
		firstDay: 0,
		initialDate: "2024-01-31",
		maxDate: "2024-02-29"
	});
	upperBounded.render();
	await waitForPhase(upperBounded, "ready");
	upperBounded.next();
	await waitForPhase(upperBounded, "ready");
	assert.deepEqual(upperBounded.getState().selectedDate, { day: 29, month: 2, year: 2024 });
	assert.equal(
		host.querySelector<HTMLButtonElement>(".lfc-calendar-nav-button-next")?.getAttribute("aria-disabled"),
		"true"
	);
});

void test("a single-date range keeps one selectable grid day and suppresses out-of-range events", async (context) => {
	const { host } = setupDom(context);
	const ranges: Readonly<{ readonly end: string; readonly start: string }>[] = [];
	const calendar = createCalendar(host, {
		events: (range) => {
			ranges.push(range);
			return [
				{ id: "outside", start: "2026-07-13", title: "Outside event" },
				{ id: "inside", start: "2026-07-14", title: "Inside event" }
			];
		},
		firstDay: 0,
		initialDate: "2026-07-14",
		maxDate: "2026-07-14",
		minDate: "2026-07-14",
		now: () => new Date("2026-07-14T12:00:00Z")
	});
	calendar.render();
	await waitForPhase(calendar, "ready");

	const dayButtons = [
		...host.querySelectorAll<HTMLButtonElement>(".lfc-calendar-grid button[data-lfc-date]")
	];
	const selected = host.querySelector<HTMLButtonElement>("[data-lfc-date='2026-07-14']");
	const outside = host.querySelector<HTMLButtonElement>("[data-lfc-date='2026-07-13']");
	assert.ok(selected);
	assert.ok(outside);
	assert.equal(dayButtons.length, 42);
	assert.equal(dayButtons.filter((button) => !button.disabled).length, 1);
	assert.equal(selected.disabled, false);
	assert.equal(outside.disabled, true);
	assert.equal(outside.getAttribute("aria-label"), "Monday, July 13, 2026");
	assert.doesNotMatch(outside.closest("[role='gridcell']")?.textContent ?? "", /Outside event/u);
	assert.match(selected.closest("[role='gridcell']")?.textContent ?? "", /Inside event/u);
	assert.equal(
		host.querySelector<HTMLButtonElement>(".lfc-calendar-nav-button-previous")?.getAttribute("aria-disabled"),
		"true"
	);
	assert.equal(
		host.querySelector<HTMLButtonElement>(".lfc-calendar-nav-button-next")?.getAttribute("aria-disabled"),
		"true"
	);
	assert.equal(
		host.querySelector<HTMLButtonElement>(".lfc-calendar-today-button")?.hasAttribute("aria-disabled"),
		false
	);
	assert.deepEqual(ranges.map(({ end, start }) => ({ end, start })), [{
		end: "2026-08-09",
		start: "2026-06-28"
	}]);
});

void test("the month title opens a localized native popover and jumps with day clamping", async (context) => {
	const { dom, host } = setupDom(context);
	const ranges: Readonly<{ readonly end: string; readonly start: string }>[] = [];
	const selectedDates: string[] = [];
	const calendar = createCalendar(host, {
		events: (range) => {
			ranges.push(range);
			return [];
		},
		headingLevel: 3,
		initialDate: "2026-07-31",
		locale: "en-US",
		maxDate: "2027-09-20",
		messages: {
			cancel: "Cancel month change",
			chooseMonthYear: "Choose reporting month, currently {date}",
			jump: "Show month",
			jumpToMonthYear: "Jump to reporting month and year",
			month: "Reporting month",
			year: "Reporting year"
		},
		minDate: "2025-03-10",
		onDaySelect: ({ dateString }) => {
			selectedDates.push(dateString);
		}
	});
	calendar.render();
	await waitForPhase(calendar, "ready");

	const picker = getMonthYearPicker(host, {
		cancel: "Cancel month change",
		jump: "Show month",
		month: "Reporting month",
		year: "Reporting year"
	});
	assert.equal(picker.heading.tagName, "H3");
	assert.equal(getAccessibleName(getGrid(host)), "July 2026");
	const gridLabelId = getGrid(host).getAttribute("aria-labelledby");
	assert.ok(gridLabelId !== null && gridLabelId.length > 0);
	assert.equal(picker.heading.contains(dom.window.document.getElementById(gridLabelId)), true);
	assert.equal(picker.trigger.type, "button");
	assert.equal(picker.trigger.textContent, "July 2026");
	assert.equal(picker.trigger.getAttribute("aria-label"), "Choose reporting month, currently July 2026");
	assert.equal(picker.popover.getAttribute("popover"), "auto");
	assert.equal(picker.popover.getAttribute("role"), "dialog");
	assert.equal(getAccessibleName(picker.popover), "Jump to reporting month and year");
	assert.equal(isPopoverOpen(picker.popover), false);
	assert.equal(picker.trigger.getAttribute("aria-expanded"), "false");
	assert.equal(picker.month.autofocus, true);

	picker.trigger.click();
	assert.equal(isPopoverOpen(picker.popover), true);
	assert.equal(picker.trigger.getAttribute("aria-expanded"), "true");
	assert.equal(dom.window.document.activeElement, picker.month);
	assert.equal(picker.month.selectedOptions[0]?.textContent, "July");
	assert.equal(picker.year.value, "2026");
	assert.equal(picker.year.min, "2025");
	assert.equal(picker.year.max, "2027");
	picker.year.value = "2025";
	picker.year.dispatchEvent(new dom.window.Event("input", { bubbles: true }));
	const january = [...picker.month.options].find((option) => option.textContent === "January");
	const march = [...picker.month.options].find((option) => option.textContent === "March");
	assert.ok(january);
	assert.ok(march);
	assert.equal(january.disabled, true);
	assert.equal(march.disabled, false);
	picker.cancel.click();
	assert.equal(isPopoverOpen(picker.popover), false);
	assert.equal(picker.trigger.getAttribute("aria-expanded"), "false");
	assert.equal(dom.window.document.activeElement, picker.trigger);
	assert.equal(ranges.length, 1);

	picker.trigger.click();
	const sameMonthState = calendar.getState();
	picker.jump.click();
	assert.equal(isPopoverOpen(picker.popover), false);
	assert.equal(picker.trigger.getAttribute("aria-expanded"), "false");
	assert.equal(dom.window.document.activeElement, picker.trigger);
	assert.deepEqual(calendar.getState(), sameMonthState);
	assert.equal(ranges.length, 1);

	picker.trigger.click();
	picker.year.value = "2024";
	picker.year.dispatchEvent(new dom.window.Event("input", { bubbles: true }));
	picker.month.value = january.value;
	picker.month.dispatchEvent(new dom.window.Event("change", { bubbles: true }));
	picker.jump.click();
	assert.equal(isPopoverOpen(picker.popover), true);
	assert.equal(picker.trigger.getAttribute("aria-expanded"), "true");
	assert.deepEqual(calendar.getState().selectedDate, { day: 31, month: 7, year: 2026 });
	assert.equal(ranges.length, 1);
	picker.year.value = "2025";
	picker.year.dispatchEvent(new dom.window.Event("input", { bubbles: true }));
	picker.month.value = january.value;
	picker.month.dispatchEvent(new dom.window.Event("change", { bubbles: true }));
	picker.jump.click();
	assert.equal(isPopoverOpen(picker.popover), true);
	assert.equal(picker.month.value, january.value);
	assert.deepEqual(calendar.getState().selectedDate, { day: 31, month: 7, year: 2026 });
	assert.equal(ranges.length, 1);

	const february = [...picker.month.options].find((option) => option.textContent === "February");
	assert.ok(february);
	picker.month.value = february.value;
	picker.month.dispatchEvent(new dom.window.Event("change", { bubbles: true }));
	picker.year.value = "2027";
	picker.year.dispatchEvent(new dom.window.Event("input", { bubbles: true }));
	const october = [...picker.month.options].find((option) => option.textContent === "October");
	assert.ok(october);
	assert.equal(october.disabled, true);
	assert.equal(february.disabled, false);
	picker.jump.click();
	await waitForPhase(calendar, "ready");

	assert.deepEqual(calendar.getState().displayedMonth, { day: 1, month: 2, year: 2027 });
	assert.deepEqual(calendar.getState().selectedDate, { day: 28, month: 2, year: 2027 });
	assert.deepEqual(ranges.at(-1) === undefined ? null : {
		end: ranges.at(-1)?.end,
		start: ranges.at(-1)?.start
	}, {
		end: "2027-03-14",
		start: "2027-01-31"
	});
	assert.equal(ranges.length, 2);
	assert.deepEqual(selectedDates, []);
	assert.equal(isPopoverOpen(picker.popover), false);
	assert.equal(picker.trigger.getAttribute("aria-expanded"), "false");
	assert.equal(dom.window.document.activeElement, picker.trigger);
	assert.equal(picker.trigger.textContent, "February 2027");
	assert.equal(picker.trigger.getAttribute("aria-label"), "Choose reporting month, currently February 2027");
});

void test("Escape restores the month-title trigger while light-dismiss preserves outside focus", async (context) => {
	const { dom, host } = setupDom(context);
	const calendar = createCalendar(host, {
		events: [],
		initialDate: "2026-07-14"
	});
	calendar.render();
	await waitForPhase(calendar, "ready");
	const picker = getMonthYearPicker(host);
	const next = host.querySelector<HTMLButtonElement>(".lfc-calendar-nav-button-next");
	assert.ok(next);

	picker.trigger.click();
	next.focus();
	dispatchKey(dom, next, "Escape");
	assert.equal(isPopoverOpen(picker.popover), false);
	assert.equal(dom.window.document.activeElement, picker.trigger);

	picker.trigger.click();
	host.addEventListener("click", (event) => {
		if (event.target === picker.cancel) {
			event.preventDefault();
		}
	}, { capture: true, once: true });
	picker.cancel.click();
	assert.equal(isPopoverOpen(picker.popover), true);
	next.focus();
	picker.popover.hidePopover();
	assert.equal(dom.window.document.activeElement, next);

	picker.trigger.click();
	next.focus();
	picker.popover.hidePopover();
	assert.equal(isPopoverOpen(picker.popover), false);
	assert.equal(dom.window.document.activeElement, next);
});

void test("the month picker uses the native numeric value for exponent-form years", async (context) => {
	const { dom, host } = setupDom(context);
	const calendar = createCalendar(host, {
		events: [],
		initialDate: "2026-07-31",
		maxDate: "2100-12-31",
		minDate: "1900-01-01"
	});
	calendar.render();
	await waitForPhase(calendar, "ready");
	const picker = getMonthYearPicker(host);
	picker.trigger.click();
	picker.month.value = "2";
	picker.year.value = "2e3";
	picker.year.dispatchEvent(new dom.window.Event("input", { bubbles: true }));
	assert.equal(picker.year.checkValidity(), true);
	assert.equal(picker.year.valueAsNumber, 2000);
	picker.jump.click();
	await waitForPhase(calendar, "ready");
	assert.deepEqual(calendar.getState().selectedDate, { day: 29, month: 2, year: 2000 });
});

void test("date bounds and localized picker messages are snapshotted and validated", async (context) => {
	const { host } = setupDom(context);
	const minDate = { day: 10, month: 7, year: 2026 };
	let minDateReads = 0;
	const options = {
		events: [],
		initialDate: "2026-07-14",
		maxDate: "2026-07-20"
	} as Record<PropertyKey, unknown>;
	Object.defineProperty(options, "minDate", {
		enumerable: true,
		get: () => {
			minDateReads += 1;
			if (minDateReads > 1) {
				throw new Error("minDate was read twice");
			}
			return minDate;
		}
	});
	const calendar = createCalendar(host, options as never);
	minDate.day = 12;
	calendar.render();
	await waitForPhase(calendar, "ready");

	assert.equal(minDateReads, 1);
	assert.equal(host.querySelector<HTMLButtonElement>("[data-lfc-date='2026-07-09']")?.disabled, true);
	assert.equal(host.querySelector<HTMLButtonElement>("[data-lfc-date='2026-07-10']")?.disabled, false);
	calendar.destroy();
	assert.throws(
		() => createCalendar(host, { events: [], messages: { chooseMonthYear: "Choose {month}" } }),
		(error: unknown) => error instanceof LitefoldCalendarError && error.code === "invalid-configuration"
	);
});

void test("invalid bounds reject construction while an omitted initial date clamps to a bound", async (context) => {
	const { dom, host } = setupDom(context);
	for (const invalid of [
		{ events: [], minDate: "not-a-date" },
		{ events: [], maxDate: "2026-02-30" },
		{ events: [], minDate: "2026-08-01", maxDate: "2026-07-31" },
		{ events: [], initialDate: "2026-07-14", minDate: "2026-07-15" },
		{ events: [], initialDate: "2026-07-14", maxDate: "2026-07-13" },
		{ events: [], firstDay: 0 as const, minDate: "0001-01-01", maxDate: "0001-01-31" },
		{ events: [], minDate: "9999-12-01", maxDate: "9999-12-31" }
	]) {
		assert.throws(
			() => createCalendar(host, invalid),
			(error: unknown) => error instanceof LitefoldCalendarError && error.code === "invalid-configuration"
		);
	}
	assert.equal(dom.window.document.querySelector("[data-litefold-calendar]"), null);
	assert.throws(
		() => createCalendar(host, {
			events: [],
			minDate: new Date("0001-01-01T00:00:00.000Z"),
			timeZone: "America/Los_Angeles"
		}),
		(error: unknown) => error instanceof LitefoldCalendarError && error.code === "invalid-configuration"
	);

	const lowerAbsolute = createCalendar(host, {
		events: [],
		firstDay: 0,
		now: () => new Date("0001-01-15T00:00:00.000Z"),
		timeZone: "UTC"
	});
	assert.deepEqual(lowerAbsolute.getState().selectedDate, { day: 1, month: 2, year: 1 });
	lowerAbsolute.destroy();
	const upperAbsolute = createCalendar(host, {
		events: [],
		firstDay: 0,
		now: () => new Date("9999-12-15T00:00:00.000Z"),
		timeZone: "UTC"
	});
	assert.deepEqual(upperAbsolute.getState().selectedDate, { day: 30, month: 11, year: 9_999 });
	upperAbsolute.destroy();

	const exactDateCalendar = createCalendar(host, {
		events: [],
		initialDate: "2026-07-14",
		maxDate: "2026-07-14",
		minDate: "2026-07-14"
	});
	assert.deepEqual(exactDateCalendar.getState().selectedDate, { day: 14, month: 7, year: 2026 });
	exactDateCalendar.destroy();
	const ranges: Readonly<{ readonly end: string; readonly start: string }>[] = [];
	const calendar = createCalendar(host, {
		events: (range) => {
			ranges.push(range);
			return [];
		},
		maxDate: "2026-08-20",
		minDate: "2026-07-15",
		now: () => new Date("2026-06-01T12:00:00Z")
	});
	assert.deepEqual(calendar.getState().displayedMonth, { day: 1, month: 7, year: 2026 });
	assert.deepEqual(calendar.getState().selectedDate, { day: 15, month: 7, year: 2026 });
	calendar.render();
	await waitForPhase(calendar, "ready");
	assert.deepEqual(ranges.map(({ end, start }) => ({ end, start })), [{
		end: "2026-08-09",
		start: "2026-06-28"
	}]);
});

void test("destroy closes the month chooser and makes retained picker controls inert", async (context) => {
	const { dom, host } = setupDom(context);
	let requests = 0;
	const calendar = createCalendar(host, {
		events: () => {
			requests += 1;
			return [];
		},
		initialDate: "2026-07-14",
		maxDate: "2027-12-31",
		minDate: "2025-01-01"
	});
	calendar.render();
	await waitForPhase(calendar, "ready");
	const picker = getMonthYearPicker(host);

	picker.trigger.click();
	assert.equal(isPopoverOpen(picker.popover), true);
	picker.year.focus();
	calendar.destroy();
	assert.equal(isPopoverOpen(picker.popover), false);
	picker.month.value = picker.month.options[0]?.value ?? "1";
	picker.year.value = "2025";
	picker.month.dispatchEvent(new dom.window.Event("change", { bubbles: true }));
	picker.year.dispatchEvent(new dom.window.Event("input", { bubbles: true }));
	dispatchClick(dom, picker.jump);
	dispatchClick(dom, picker.cancel);
	dispatchClick(dom, picker.trigger);

	assert.equal(calendar.getState().phase, "destroyed");
	assert.equal(host.childElementCount, 0);
	assert.equal(requests, 1);
	assert.equal(isPopoverOpen(picker.popover), false);
});

void test("package-owned navigation controls ignore reentrant and stale lifecycle events", async (context) => {
	const { dom, host } = setupDom(context);
	const uncaughtErrors: unknown[] = [];
	dom.window.addEventListener("error", (errorEvent) => {
		uncaughtErrors.push(errorEvent.error);
		errorEvent.preventDefault();
	});
	const calendar = createCalendar(host, {
		events: [],
		initialDate: "2026-07-14"
	});
	calendar.render();
	await waitForPhase(calendar, "ready");
	const previous = host.querySelector<HTMLButtonElement>(".lfc-calendar-nav-button-previous");
	const next = host.querySelector<HTMLButtonElement>(".lfc-calendar-nav-button-next");
	const today = host.querySelector<HTMLButtonElement>(".lfc-calendar-today-button");
	assert.ok(previous);
	assert.ok(next);
	assert.ok(today);
	host.addEventListener("click", () => { calendar.destroy(); }, { capture: true, once: true });

	dispatchClick(dom, next);
	dispatchClick(dom, previous);
	dispatchClick(dom, today);

	assert.equal(calendar.getState().phase, "destroyed");
	assert.deepEqual(uncaughtErrors, []);
});

void test("a fatal render cancels pending native pager navigation and disables retained controls", async (context) => {
	const { dom, host } = setupDom(context);
	const uncaughtErrors: unknown[] = [];
	const fatalErrors: LitefoldCalendarError[] = [];
	let failClock = false;
	dom.window.addEventListener("error", (errorEvent) => {
		uncaughtErrors.push(errorEvent.error);
		errorEvent.preventDefault();
	});
	const calendar = createCalendar(host, {
		events: [],
		initialDate: "2026-07-14",
		now: () => {
			if (failClock) {
				throw new Error("clock failed during swipe");
			}
			return new Date("2026-07-14T12:00:00.000Z");
		},
		onError: (error) => {
			fatalErrors.push(error);
			return "handled";
		}
	});
	calendar.render();
	await waitForPhase(calendar, "ready");
	const pager = installPagerGeometry(host);
	const retainedNavigation = [...host.querySelectorAll<HTMLButtonElement>(".lfc-calendar-nav-button")];
	const picker = getMonthYearPicker(host);
	picker.trigger.click();
	assert.equal(isPopoverOpen(picker.popover), true);
	dispatchPagerEvent(dom, pager, "scroll", pager.nextOffset);
	assert.equal(host.getAttribute("data-lfc-swipe-state"), "scrolling");

	failClock = true;
	calendar.focusDate("2026-07-15");
	assert.equal(calendar.getState().phase, "unavailable");
	assert.equal(host.hasAttribute("data-lfc-swipe-state"), false);
	assert.equal(pager.viewport.scrollLeft, pager.centerOffset);
	assert.equal(isPopoverOpen(picker.popover), false);
	assert.equal(picker.trigger.getAttribute("aria-disabled"), "true");
	assert.equal(dom.window.document.activeElement, picker.trigger);
	dispatchPagerEvent(dom, pager, "scrollend");
	for (const control of retainedNavigation) {
		dispatchClick(dom, control);
	}
	dispatchClick(dom, picker.trigger);

	assert.equal(fatalErrors.some((error) => error.code === "internal-error"), true);
	assert.equal(isPopoverOpen(picker.popover), false);
	assert.deepEqual(uncaughtErrors, []);
});

interface TestDom {
	readonly dom: ReturnType<typeof createDom>;
	readonly host: HTMLElement;
}

interface MonthYearPicker {
	readonly cancel: HTMLButtonElement;
	readonly heading: HTMLHeadingElement;
	readonly jump: HTMLButtonElement;
	readonly month: HTMLSelectElement;
	readonly popover: HTMLElement;
	readonly trigger: HTMLButtonElement;
	readonly year: HTMLInputElement;
}

interface MonthYearPickerLabels {
	readonly cancel: string;
	readonly jump: string;
	readonly month: string;
	readonly year: string;
}

function setupDom(
	context: TestContext,
	markup = '<div id="calendar"></div>'
): TestDom {
	const dom = createDom(markup);
	const restore = installDom(dom);
	context.after(restore);
	const host = dom.window.document.querySelector<HTMLElement>("#calendar");
	assert.ok(host);
	return { dom, host };
}

async function waitForPhase(
	calendar: Calendar,
	phase: ReturnType<Calendar["getState"]>["phase"]
): Promise<void> {
	await waitFor(() => calendar.getState().phase === phase, `${phase} calendar state`);
}

function getMonthYearPicker(
	host: HTMLElement,
	labels: MonthYearPickerLabels = {
		cancel: "Cancel",
		jump: "Jump",
		month: "Month",
		year: "Year"
	}
): MonthYearPicker {
	const heading = host.querySelector<HTMLHeadingElement>(".lfc-calendar-title");
	const trigger = heading?.querySelector<HTMLButtonElement>("button");
	const popover = host.querySelector<HTMLElement>('[popover="auto"][role="dialog"]');
	const month = popover?.querySelector<HTMLSelectElement>("select");
	const year = popover?.querySelector<HTMLInputElement>('input[type="number"]');
	assert.ok(heading, "Expected the calendar month heading to exist.");
	assert.ok(trigger, "Expected the month heading to contain a native button.");
	assert.ok(popover, "Expected the automatic month-and-year popover to exist.");
	assert.ok(month, "Expected the month chooser to use a native select.");
	assert.ok(year, "Expected the year chooser to use a numeric input.");
	assert.equal(getControlLabel(popover, month), labels.month);
	assert.equal(getControlLabel(popover, year), labels.year);
	const buttons = [...popover.querySelectorAll<HTMLButtonElement>("button")];
	const jump = buttons.find((button) => button.textContent?.trim() === labels.jump);
	const cancel = buttons.find((button) => button.textContent?.trim() === labels.cancel);
	assert.ok(jump, `Expected a ${labels.jump} button in the month-and-year popover.`);
	assert.ok(cancel, `Expected a ${labels.cancel} button in the month-and-year popover.`);
	return { cancel, heading, jump, month, popover, trigger, year };
}

function getAccessibleName(element: HTMLElement): string {
	const labelledBy = element.getAttribute("aria-labelledby")?.trim().split(/\s+/u) ?? [];
	const referenced = labelledBy
		.map((id) => element.ownerDocument.getElementById(id)?.textContent?.trim() ?? "")
		.filter((value) => value.length > 0)
		.join(" ");
	if (referenced.length > 0) {
		return referenced;
	}
	return element.getAttribute("aria-label")?.trim() ?? "";
}

function getControlLabel(root: HTMLElement, control: HTMLElement): string {
	const label = [...root.querySelectorAll<HTMLLabelElement>("label")]
		.find((candidate) => candidate.htmlFor === control.id || candidate.contains(control));
	assert.ok(label, `Expected a label for ${control.localName}.`);
	return label.querySelector(":scope > span")?.textContent?.trim() ?? label.textContent?.trim() ?? "";
}

function getGrid(host: HTMLElement): HTMLElement {
	const grid = host.querySelector<HTMLElement>("[role='grid']");
	assert.ok(grid);
	return grid;
}

function installPagerGeometry(host: HTMLElement) {
	const viewport = host.querySelector<HTMLElement>(".lfc-calendar-swipe-viewport");
	const previousLane = host.querySelector<HTMLElement>(".lfc-calendar-swipe-lane-previous");
	const grid = host.querySelector<HTMLElement>(".lfc-calendar-grid");
	const nextLane = host.querySelector<HTMLElement>(".lfc-calendar-swipe-lane-next");
	assert.ok(viewport && previousLane && grid && nextLane);
	const laneWidth = 96;
	const viewportWidth = 400;
	Object.defineProperty(viewport, "clientWidth", { configurable: true, value: viewportWidth });
	Object.defineProperty(viewport, "scrollWidth", { configurable: true, value: viewportWidth + laneWidth * 2 });
	setElementGeometry(previousLane, 0, laneWidth);
	setElementGeometry(grid, laneWidth, viewportWidth);
	setElementGeometry(nextLane, laneWidth + viewportWidth, laneWidth);
	viewport.scrollLeft = laneWidth;
	return { centerOffset: laneWidth, nextLane, nextOffset: laneWidth * 2, previousLane, previousOffset: 0, viewport };
}

function dispatchPagerEvent(
	dom: ReturnType<typeof createDom>,
	pager: ReturnType<typeof installPagerGeometry>,
	type: "scroll" | "scrollend",
	offset?: number
): void {
	if (offset !== undefined) {
		pager.viewport.scrollLeft = offset;
	}
	pager.viewport.dispatchEvent(new dom.window.Event(type));
}

function setElementGeometry(element: HTMLElement, offsetLeft: number, offsetWidth: number): void {
	Object.defineProperties(element, {
		offsetLeft: { configurable: true, value: offsetLeft },
		offsetWidth: { configurable: true, value: offsetWidth }
	});
}
