import assert from "node:assert/strict";
import test, { type TestContext } from "node:test";

import type { Calendar, CalendarEventInput } from "../src/index.js";
import {
	ComponentLifecycleDynamicFixture,
	createFixtureSignal,
	type DynamicFixtureConfiguration,
	type DynamicFixtureData,
	PlainTypeScriptDynamicFixture,
	ProgressiveEnhancementDynamicFixture,
	ReactiveLifecycleDynamicFixture
} from "./fixtures/dynamic-update-integrations.js";
import { createDom, deferred, dispatchClick, installDom, waitFor } from "./helpers/dom.js";

void test("plain TypeScript recreation applies static data and construction-time settings", async (context) => {
	const { dom, host } = setupDom(context);
	const oldRequest = deferred<readonly CalendarEventInput[]>();
	let oldSignal: AbortSignal | undefined;
	const instant = new Date("2026-08-01T00:30:00Z");
	const fixture = new PlainTypeScriptDynamicFixture(host, {
		configuration: {
			initialDate: instant,
			locale: "en-US",
			timeZone: "America/Chicago"
		},
		data: {
			events: ({ signal }) => {
				oldSignal = signal;
				return oldRequest.promise;
			}
		}
	});
	context.after(() => { fixture.destroy(); });
	assert.ok(oldSignal);
	const oldCalendar = fixture.calendar;
	const oldFocusedDay = findDayButton(host, "2026-07-31");
	oldFocusedDay.focus();

	fixture.replaceConfiguration({
		initialDate: instant,
		locale: "fr-FR",
		maxDate: "2026-08-31",
		minDate: "2026-08-01",
		timeZone: "UTC"
	}, {
		events: [{ id: "replacement", start: "2026-08-01", title: "Événement remplacé" }]
	});

	assert.equal(oldSignal.aborted, true);
	assert.equal(oldCalendar.getState().phase, "destroyed");
	await waitForPhase(fixture.calendar, "ready");
	assert.deepEqual(fixture.calendar.getState().selectedDate, { day: 1, month: 8, year: 2026 });
	assert.match(host.textContent ?? "", /août 2026/iu);
	assert.match(host.textContent ?? "", /Événement remplacé/u);
	assert.equal(dom.window.document.activeElement, findDayButton(host, "2026-08-01"));

	oldRequest.resolve([{ id: "stale", start: "2026-07-31", title: "Stale result" }]);
	await Promise.resolve();
	await Promise.resolve();
	assert.doesNotMatch(host.textContent ?? "", /Stale result/u);
});

void test("component lifecycle keeps one instance for filters and superseded source requests", async (context) => {
	const { dom, host } = setupDom(context);
	const configuration = Object.freeze({
		agendaPageSize: 10,
		initialDate: "2026-08-06"
	}) satisfies DynamicFixtureConfiguration;
	const initialEvents = Object.freeze([
		Object.freeze({
			id: "keep",
			start: "2026-08-06T09:00",
			title: "Keep event",
			url: "/events/keep"
		}),
		Object.freeze({ id: "drop", start: "2026-08-06T10:00", title: "Drop event" }),
		...Array.from({ length: 10 }, (_, index) => Object.freeze({
			id: `later-${index.toString()}`,
			start: `2026-08-06T${(index + 11).toString().padStart(2, "0")}:00`,
			title: `Later event ${index.toString()}`
		}))
	] satisfies readonly CalendarEventInput[]);
	const fixture = new ComponentLifecycleDynamicFixture(host);
	fixture.commit({ configuration, data: { events: initialEvents } });
	context.after(() => { fixture.unmount(); });
	await waitForPhase(fixture.calendar, "ready");
	const calendar = fixture.calendar;
	const more = host.querySelector<HTMLButtonElement>(".lfc-calendar-agenda-more");
	assert.ok(more);
	dispatchClick(dom, more);
	assert.equal(agendaEvents(host).length, 12);
	const focusedEvent = findAgendaEvent(host, "keep");
	focusedEvent.focus();

	fixture.commit({
		configuration,
		data: {
			events: initialEvents,
			filter: (event) => event.id !== "drop"
		}
	});
	await waitForPhase(fixture.calendar, "ready");
	assert.equal(fixture.calendar, calendar);
	assert.equal(agendaEvents(host).length, 11, "setEvents() must not collapse revealed agenda content.");
	assert.doesNotMatch(host.textContent ?? "", /Drop event/u);
	assert.equal(dom.window.document.activeElement, findAgendaEvent(host, "keep"));

	const slowRequest = deferred<readonly CalendarEventInput[]>();
	let slowSignal: AbortSignal | undefined;
	fixture.commit({
		configuration,
		data: {
			events: ({ signal }) => {
				slowSignal = signal;
				return slowRequest.promise;
			}
		}
	});
	assert.ok(slowSignal);
	fixture.commit({
		configuration,
		data: {
			events: [{ id: "fresh", start: "2026-08-06", title: "Fresh snapshot" }]
		}
	});
	assert.equal(slowSignal.aborted, true);
	await waitForPhase(fixture.calendar, "ready");
	slowRequest.resolve([{ id: "late", start: "2026-08-06", title: "Late snapshot" }]);
	await Promise.resolve();
	await Promise.resolve();
	assert.match(host.textContent ?? "", /Fresh snapshot/u);
	assert.doesNotMatch(host.textContent ?? "", /Late snapshot/u);

	fixture.unmount();
	assert.equal(calendar.getState().phase, "destroyed");
	assert.equal(host.childElementCount, 0);
});

void test("reactive watchers replace data, recreate configuration, and stop before teardown", async (context) => {
	const { dom, host } = setupDom(context);
	const instant = new Date("2026-08-01T00:30:00Z");
	const configuration = createFixtureSignal<DynamicFixtureConfiguration>({
		initialDate: instant,
		timeZone: "UTC"
	});
	const data = createFixtureSignal<Readonly<DynamicFixtureData>>({
		events: [{ id: "initial", start: "2026-08-01", title: "Initial reactive event" }]
	});
	const fixture = new ReactiveLifecycleDynamicFixture(host, configuration, data);
	await waitForPhase(fixture.calendar, "ready");
	const initialCalendar = fixture.calendar;

	data.set({
		events: [{ id: "updated", start: "2026-08-01", title: "Updated reactive event" }]
	});
	await waitForPhase(fixture.calendar, "ready");
	assert.equal(fixture.calendar, initialCalendar);
	assert.match(host.textContent ?? "", /Updated reactive event/u);
	findDayButton(host, "2026-08-01").focus();

	configuration.set({
		initialDate: instant,
		locale: "es-MX",
		maxDate: "2026-07-31",
		minDate: "2026-07-01",
		timeZone: "America/Chicago"
	});
	assert.equal(initialCalendar.getState().phase, "destroyed");
	await waitForPhase(fixture.calendar, "ready");
	assert.deepEqual(fixture.calendar.getState().selectedDate, { day: 31, month: 7, year: 2026 });
	assert.match(host.textContent ?? "", /julio(?: de)? 2026/iu);
	assert.equal(dom.window.document.activeElement, findDayButton(host, "2026-07-31"));

	const finalCalendar = fixture.calendar;
	fixture.dispose();
	assert.equal(finalCalendar.getState().phase, "destroyed");
	data.set({ events: [] });
	configuration.set({ initialDate: "2027-01-01" });
	assert.equal(host.childElementCount, 0, "Disposed watchers must not remount or reload.");
});

void test("progressive enhancement retains fallback state for replacement and restores it for recreation", async (context) => {
	const { host } = setupDom(
		context,
		'<section id="fallback">Server schedule</section><div id="calendar"></div>'
	);
	const fallback = host.ownerDocument.querySelector<HTMLElement>("#fallback");
	assert.ok(fallback);
	const fixture = new ProgressiveEnhancementDynamicFixture(
		host,
		fallback,
		{ initialDate: "2026-08-06" },
		{ events: [{ id: "initial", start: "2026-08-06", title: "Initial event" }] }
	);
	context.after(() => { fixture.destroy(); });
	await waitForPhase(fixture.calendar, "ready");
	assert.equal(fallback.hidden, true);

	const refresh = deferred<readonly CalendarEventInput[]>();
	let refreshSignal: AbortSignal | undefined;
	fixture.replaceData({
		events: ({ signal }) => {
			refreshSignal = signal;
			return refresh.promise;
		}
	});
	assert.ok(refreshSignal);
	assert.equal(fallback.hidden, true, "A retained snapshot must keep fallback content hidden.");
	fixture.replaceData({
		events: [{ id: "fresh", start: "2026-08-06", title: "Fresh event" }]
	});
	assert.equal(refreshSignal.aborted, true);
	await waitForPhase(fixture.calendar, "ready");
	assert.equal(fallback.hidden, true);

	const replacement = deferred<readonly CalendarEventInput[]>();
	let replacementSignal: AbortSignal | undefined;
	fixture.replaceConfiguration({
		initialDate: "2026-08-06",
		locale: "de-DE"
	}, {
		events: ({ signal }) => {
			replacementSignal = signal;
			return replacement.promise;
		}
	});
	assert.ok(replacementSignal);
	assert.equal(fallback.hidden, false, "Recreation has no retained snapshot and restores the fallback.");

	fixture.destroy();
	assert.equal(replacementSignal.aborted, true);
	assert.equal(fallback.hidden, false);
	assert.equal(host.childElementCount, 0);
	refresh.resolve([]);
	replacement.resolve([]);
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
	assert.ok(button, `Expected a day button for ${date}.`);
	return button;
}

function findAgendaEvent(host: HTMLElement, id: string): HTMLElement {
	const event = host.querySelector<HTMLElement>(
		`.lfc-calendar-agenda-event[data-lfc-event-id='${id}']`
	);
	assert.ok(event, `Expected agenda event ${id}.`);
	return event;
}

function agendaEvents(host: HTMLElement): readonly HTMLElement[] {
	return [...host.querySelectorAll<HTMLElement>(".lfc-calendar-agenda-event")];
}

async function waitForPhase(
	calendar: Calendar,
	phase: ReturnType<Calendar["getState"]>["phase"]
): Promise<void> {
	await waitFor(() => calendar.getState().phase === phase, `${phase} fixture state`);
}
