import assert from "node:assert/strict";
import test, { type TestContext } from "node:test";

import {
	createCalendar,
	LitefoldCalendarError,
	type Calendar,
	type CalendarEventInput,
	type CalendarEventOverflowActivation,
	type CalendarEventOverflowContext,
	type CalendarGridEventDisplay
} from "../src/index.js";
import { createDom, dispatchClick, getHost, installDom, waitFor } from "./helpers/dom.js";

const TARGET_DATE = "2026-07-14";
const MODES = ["events", "count", "count-when-multiple"] as const;

void test("grid event display defaults count multiple compact events and preserve wide summaries", async (context) => {
	const { host } = setupDom(context);
	const contexts: CalendarEventOverflowContext[] = [];
	const calendar = createCalendar(host, {
		events: [...eventsForDate(TARGET_DATE, 2), ...eventsForDate("2026-07-15", 1)],
		initialDate: TARGET_DATE,
		renderHooks: [{
			id: "default-counts",
			renderEventOverflow: (value) => { contexts.push(value); return undefined; }
		}]
	});
	calendar.render();
	await ready(calendar);

	assert.equal(contexts.find((value) => value.dateString === TARGET_DATE && value.variant === "compact")?.display, "count");
	assert.equal(contexts.some((value) => value.variant === "wide" && value.display === "count"), false);
	assert.equal(contexts.some((value) => value.dateString === "2026-07-15" && value.display === "count"), false);
	assert.equal(getCountButton(host, TARGET_DATE).getAttribute("type"), "button");
	assert.equal(getDay(host, "2026-07-16").querySelector(".lfc-calendar-grid-more"), null);
});

for (const mode of MODES) {
	for (const cap of [0, 1, 3]) {
		void test(`${mode} counts honor zero, singleton, multiple and cap boundaries with summary cap ${cap.toString()}`, async (context) => {
			const { host } = setupDom(context);
			const contexts: CalendarEventOverflowContext[] = [];
			const calendar = createCalendar(host, {
				events: [1, 2, 3, 4].flatMap((count) => eventsForDate(`2026-07-${(13 + count).toString()}`, count)),
				gridEventDisplay: { compact: mode, wide: mode },
				initialDate: TARGET_DATE,
				maxGridEventsPerDay: cap,
				onEventActivate: () => undefined,
				renderHooks: [{
					id: "mode-matrix",
					renderEventOverflow: (value) => { contexts.push(value); return undefined; }
				}]
			});
			calendar.render();
			await ready(calendar);

			assert.equal(getDay(host, "2026-07-13").querySelector(".lfc-calendar-grid-more"), null);
			for (const count of [1, 2, 3, 4]) {
				const dateString = `2026-07-${(13 + count).toString()}`;
				const isCount = mode === "count" || (mode === "count-when-multiple" && count > 1);
				const countContexts = contexts.filter((value) => value.dateString === dateString && value.display === "count");
				assert.deepEqual(countContexts.map((value) => value.variant).sort(), isCount ? ["compact", "wide"] : []);
				for (const value of countContexts) {
					assert.equal(value.eventCount, count);
					assert.equal(value.visibleEventCount, 0);
					assert.equal(value.overflowCount, count);
				}
				if (isCount) {
					assert.match(getCountButton(host, dateString).getAttribute("aria-label") ?? "", new RegExp(count.toString()));
				}
				if (cap === 0) {
					assert.equal(getDay(host, dateString).querySelectorAll("[data-lfc-event-id]").length, 0);
				}
			}
		});
	}
}

void test("compact and wide display settings are independent", async (context) => {
	const { host } = setupDom(context);
	const contexts: CalendarEventOverflowContext[] = [];
	const calendar = createCalendar(host, {
		events: eventsForDate(TARGET_DATE, 3),
		gridEventDisplay: { compact: "events", wide: "count" },
		initialDate: TARGET_DATE,
		maxGridEventsPerDay: 1,
		onEventActivate: () => undefined,
		renderHooks: [{
			id: "independent-display",
			renderEventOverflow: (value) => { contexts.push(value); return undefined; }
		}]
	});
	calendar.render();
	await ready(calendar);

	assert.equal(contexts.find((value) => value.variant === "compact")?.display, "overflow");
	assert.equal(contexts.find((value) => value.variant === "wide")?.display, "count");
	assert.equal(contexts.find((value) => value.variant === "compact")?.text, "+2");
	assert.equal(contexts.find((value) => value.variant === "wide")?.text, "3 events");
});

void test("count display includes normalized multiday occurrences despite suppressed markers and paged agenda", async (context) => {
	const { host } = setupDom(context);
	const contexts: CalendarEventOverflowContext[] = [];
	const calendar = createCalendar(host, {
		agendaPageSize: 10,
		events: [
			{ id: "spanning", start: TARGET_DATE, end: "2026-07-17", title: "Spanning" },
			...eventsForDate(TARGET_DATE, 12),
			...eventsForDate("2026-07-15", 1)
		],
		gridEventDisplay: { compact: "count", wide: "count" },
		initialDate: TARGET_DATE,
		maxGridEventsPerDay: 1,
		renderHooks: [{
			id: "missing-markers",
			renderEventMarker: () => null,
			renderEventOverflow: (value) => { contexts.push(value); return undefined; }
		}]
	});
	calendar.render();
	await ready(calendar);

	assert.deepEqual(contexts.filter((value) => value.variant === "compact").map((value) => [value.dateString, value.eventCount]), [
		[TARGET_DATE, 13], ["2026-07-15", 2], ["2026-07-16", 1]
	]);
	assert.equal(host.querySelectorAll(".lfc-calendar-agenda-event").length, 10);
	assert.equal(getDay(host, "2026-07-17").querySelector(".lfc-calendar-grid-more"), null);
});

void test("count labels localize the full total without an overflow plus sign", async (context) => {
	const { host } = setupDom(context);
	const contexts: CalendarEventOverflowContext[] = [];
	const calendar = createCalendar(host, {
		events: eventsForDate(TARGET_DATE, 12),
		gridEventDisplay: { compact: "count", wide: "count" },
		initialDate: TARGET_DATE,
		locale: "ar-EG",
		renderHooks: [{
			id: "localized-counts",
			renderEventOverflow: (value) => { contexts.push(value); return undefined; }
		}]
	});
	calendar.render();
	await ready(calendar);

	const localized = new Intl.NumberFormat("ar-EG").format(12);
	assert.equal(contexts.find((value) => value.variant === "compact")?.text, localized);
	assert.equal(getCountButton(host, TARGET_DATE).getAttribute("aria-label")?.includes(localized), true);
	assert.ok(contexts.every((value) => !value.text.includes("+")));
});

void test("count actions survive null and failing overflow hooks", async (context) => {
	const { host } = setupDom(context);
	for (const result of ["null", "throw"] as const) {
		const errors: LitefoldCalendarError[] = [];
		const calendar = createCalendar(host, {
			events: eventsForDate(TARGET_DATE, 2),
			gridEventDisplay: { compact: "count", wide: "count" },
			initialDate: TARGET_DATE,
			onError: (error) => { errors.push(error); },
			renderHooks: [{
				id: "required-count",
				renderEventOverflow: () => {
					if (result === "throw") { throw new Error("private count render failure"); }
					return null;
				}
			}]
		});
		calendar.render();
		await waitFor(() => calendar.getState().phase === (result === "throw" ? "degraded" : "ready"));
		const action = getCountButton(host, TARGET_DATE);
		assert.equal(action.querySelector(".lfc-is-compact .lfc-event-overflow-default-content")?.textContent, "2");
		assert.equal(action.querySelector(".lfc-is-wide .lfc-event-overflow-default-content")?.textContent, "2 events");
		assert.equal(errors.length, result === "throw" ? 1 : 0);
		assert.doesNotMatch(host.textContent ?? "", /private count render failure/u);
		calendar.destroy();
	}
});

void test("count activation supplies immutable snapshots before selection and resets agenda paging", async (context) => {
	const { dom, host } = setupDom(context);
	let activation: CalendarEventOverflowActivation | undefined;
	let selectedInsideAction: number | undefined;
	let connectedInsideAction: boolean | undefined;
	let daySelections = 0;
	const calendar = createCalendar(host, {
		agendaPageSize: 10,
		events: [...eventsForDate(TARGET_DATE, 13), ...eventsForDate("2026-07-15", 12)],
		gridEventDisplay: { compact: "count", wide: "count" },
		initialDate: TARGET_DATE,
		onDaySelect: () => { daySelections += 1; },
		onEventOverflowActivate: (value) => {
			activation = value;
			selectedInsideAction = calendar.getState().selectedDate.day;
			connectedInsideAction = value.element.isConnected;
		}
	});
	calendar.render();
	await ready(calendar);
	const more = host.querySelector<HTMLButtonElement>(".lfc-calendar-agenda-more");
	assert.ok(more);
	dispatchClick(dom, more);
	assert.equal(host.querySelectorAll(".lfc-calendar-agenda-event").length, 13);
	const action = getCountButton(host, "2026-07-15");
	dispatchClick(dom, action);

	assert.ok(activation);
	assert.equal(Object.isFrozen(activation), true);
	assert.equal(Object.isFrozen(activation.date), true);
	assert.equal(Object.isFrozen(activation.events), true);
	assert.ok(activation.events.every(Object.isFrozen));
	assert.equal(activation.dateString, "2026-07-15");
	assert.deepEqual(activation.date, { day: 15, month: 7, year: 2026 });
	assert.equal(activation.eventCount, 12);
	assert.deepEqual(activation.events.map((event) => event.id).sort(), eventsForDate("2026-07-15", 12).map((event) => event.id).sort());
	assert.equal(activation.element, action);
	assert.equal(activation.nativeEvent.type, "click");
	assert.equal(selectedInsideAction, 14);
	assert.equal(connectedInsideAction, true);
	assert.equal(calendar.getState().selectedDate.day, 15);
	assert.equal(host.querySelectorAll(".lfc-calendar-agenda-event").length, 10);
	assert.equal(dom.window.document.activeElement, host.querySelector(".lfc-calendar-agenda-title"));
	assert.equal(daySelections, 0);
});

void test("synchronous cancellation preserves selection and application focus ownership", async (context) => {
	const { dom, host } = setupDom(context);
	const appButton = dom.window.document.createElement("button");
	appButton.textContent = "Application dialog action";
	dom.window.document.body.append(appButton);
	const calendar = createCalendar(host, {
		events: eventsForDate("2026-07-15", 2),
		initialDate: TARGET_DATE,
		onEventOverflowActivate: ({ nativeEvent }) => {
			nativeEvent.preventDefault();
			appButton.focus();
		}
	});
	calendar.render();
	await ready(calendar);
	const action = getCountButton(host, "2026-07-15");
	dispatchClick(dom, action);

	assert.equal(calendar.getState().selectedDate.day, 14);
	assert.equal(getCountButton(host, "2026-07-15"), action);
	assert.equal(dom.window.document.activeElement, appButton);
});

for (const failure of ["throw", "reject"] as const) {
	void test(`overflow action ${failure} reports a safe action error`, async (context) => {
		const { dom, host } = setupDom(context);
		const errors: LitefoldCalendarError[] = [];
		const calendar = createCalendar(host, {
			events: eventsForDate(TARGET_DATE, 2),
			initialDate: TARGET_DATE,
			onError: (error) => { errors.push(error); },
			onEventOverflowActivate: ({ nativeEvent }) => {
				nativeEvent.preventDefault();
				if (failure === "throw") { throw new Error("private count action failure"); }
				return Promise.reject(new Error("private count action failure"));
			}
		});
		calendar.render();
		await ready(calendar);
		dispatchClick(dom, getCountButton(host, TARGET_DATE));
		await waitFor(() => errors.some((error) => error.code === "action-failed"));
		assert.doesNotMatch(host.textContent ?? "", /private count action failure/u);
	});
}

void test("destroying the calendar during overflow activation cannot restore stale selection or DOM", async (context) => {
	const { dom, host } = setupDom(context);
	const calendar = createCalendar(host, {
		events: eventsForDate("2026-07-15", 2),
		initialDate: TARGET_DATE,
		onEventOverflowActivate: () => { calendar.destroy(); }
	});
	calendar.render();
	await ready(calendar);
	dispatchClick(dom, getCountButton(host, "2026-07-15"));
	assert.equal(calendar.getState().phase, "destroyed");
	assert.equal(host.childElementCount, 0);
});

void test("grid display settings are snapshotted and invalid modes are rejected before mounting", async (context) => {
	const { host } = setupDom(context);
	const display: { compact: CalendarGridEventDisplay; wide: CalendarGridEventDisplay } = { compact: "count", wide: "count" };
	const calendar = createCalendar(host, { events: eventsForDate(TARGET_DATE, 1), gridEventDisplay: display, initialDate: TARGET_DATE });
	display.compact = "events";
	display.wide = "events";
	calendar.render();
	await ready(calendar);
	assert.equal(getCountButton(host, TARGET_DATE).querySelectorAll(".lfc-is-count").length, 2);
	calendar.destroy();

	for (const invalid of [null, "count", [], { compact: "total" }, { wide: "total" }, { compact: null }]) {
		assert.throws(() => createCalendar(host, { events: [], gridEventDisplay: invalid } as never),
			(error: unknown) => error instanceof LitefoldCalendarError && error.code === "invalid-configuration");
		assert.equal(host.childElementCount, 0);
	}
});

for (const boundary of [
	{ initialDate: "0001-02-15", outsideDate: "0001-01-28", supportedDate: "0001-02-14" },
	{ initialDate: "9999-11-15", outsideDate: "9999-12-01", supportedDate: "9999-11-14" }
]) {
	void test(`count activation preserves supported month bounds at ${boundary.outsideDate}`, async (context) => {
		const { dom, host } = setupDom(context);
		const uncaughtErrors: unknown[] = [];
		const activations: string[] = [];
		dom.window.addEventListener("error", (event) => {
			uncaughtErrors.push(event.error);
			event.preventDefault();
		});
		const calendar = createCalendar(host, {
			events: [...eventsForDate(boundary.outsideDate, 2), ...eventsForDate(boundary.supportedDate, 2)],
			firstDay: 0,
			initialDate: boundary.initialDate,
			onEventOverflowActivate: ({ dateString }) => { activations.push(dateString); }
		});
		calendar.render();
		await ready(calendar);
		const before = calendar.getState();
		dispatchClick(dom, getCountButton(host, boundary.outsideDate));
		assert.deepEqual(uncaughtErrors, []);
		assert.deepEqual(calendar.getState().displayedMonth, before.displayedMonth);
		assert.deepEqual(calendar.getState().selectedDate, before.selectedDate);
		assert.deepEqual(activations, [boundary.outsideDate]);
		dispatchClick(dom, getCountButton(host, boundary.supportedDate));
		assert.equal(calendar.getState().selectedDate.day, 14);
		assert.deepEqual(activations, [boundary.outsideDate, boundary.supportedDate]);
		assert.equal(dom.window.document.activeElement, host.querySelector(".lfc-calendar-agenda-title"));
	});
}

function setupDom(context: TestContext): { dom: ReturnType<typeof createDom>; host: HTMLElement } {
	const dom = createDom();
	context.after(installDom(dom));
	return { dom, host: getHost(dom) };
}

function eventsForDate(dateString: string, count: number): CalendarEventInput[] {
	return Array.from({ length: count }, (_, index) => ({
		id: `${dateString}-${index.toString()}`,
		start: `${dateString}T09:00`,
		title: `Event ${index.toString()}`
	}));
}

function getDay(host: HTMLElement, dateString: string): HTMLElement {
	const cell = host.querySelector(`.lfc-calendar-day-button[data-lfc-date='${dateString}']`)?.closest<HTMLElement>("[role='gridcell']");
	assert.ok(cell, `Expected the ${dateString} day cell.`);
	return cell;
}

function getCountButton(host: HTMLElement, dateString: string): HTMLButtonElement {
	const button = getDay(host, dateString).querySelector<HTMLButtonElement>(".lfc-calendar-grid-more");
	assert.ok(button, `Expected the ${dateString} count action.`);
	return button;
}

async function ready(calendar: Calendar): Promise<void> {
	await waitFor(() => calendar.getState().phase === "ready", "ready calendar");
}
