import assert from "node:assert/strict";
import test, { type TestContext } from "node:test";

import {
	createCalendar,
	LitefoldCalendarError,
	type Calendar,
	type CalendarEventActivation,
	type CalendarEventContextMenu,
	type CalendarEventContextMenuAvailability,
	type CalendarEventInput,
	type CalendarEventSurface,
	type CalendarEventTimeDisplay
} from "../src/index.js";
import { createDom, deferred, dispatchClick, dispatchKey, installDom, waitFor } from "./helpers/dom.js";

void test("native event actions preserve semantic grid, list, and time markup without nested controls", async (context) => {
	const { dom, host } = setupDom(
		context,
		'<p id="consumer-help">Consumer help</p><div id="calendar" aria-describedby="consumer-help"></div><div id="static"></div>'
	);
	const activations: Readonly<CalendarEventActivation>[] = [];
	let daySelections = 0;
	const calendar = createCalendar(host, {
		events: [
			{
				id: "linked",
				start: "2026-07-14T09:00",
				title: "Linked event",
				url: "/events/linked?from=calendar#details"
			},
			{ id: "activated", start: "2026-07-14T10:00", title: "Activated event" }
		],
		initialDate: "2026-07-14",
		onDaySelect: () => { daySelections += 1; },
		onEventActivate: (activation) => {
			activation.nativeEvent.preventDefault();
			activations.push(activation);
		}
	});
	calendar.render();
	await waitForReady(calendar);

	const grid = requireElement(host, "[role='grid']");
	const instructions = requireElement(host, ".lfc-calendar-grid-instructions");
	assert.ok((instructions.textContent ?? "").trim().length > 0);
	assert.deepEqual(grid.getAttribute("aria-describedby")?.split(/\s+/u), [
		"consumer-help",
		instructions.id
	]);
	assert.equal(grid.querySelectorAll("button[data-lfc-date][tabindex='0']").length, 1);

	const dayButton = findDayButton(host, "2026-07-14");
	const cell = dayButton.parentElement;
	assert.ok(cell);
	const gridLink = cell.querySelector<HTMLAnchorElement>(
		":scope > .lfc-calendar-day-summaries a[data-lfc-event-id='linked']"
	);
	assert.ok(gridLink);
	assert.equal(dayButton.contains(gridLink), false);
	assert.equal(gridLink.getAttribute("href"), "/events/linked?from=calendar#details");
	assert.equal(gridLink.getAttribute("data-lfc-surface"), "grid-summary");
	const dayTime = dayButton.querySelector("time");
	assert.ok(dayTime instanceof dom.window.HTMLTimeElement);
	assert.equal(dayTime.dateTime, "2026-07-14");
	const gridEventTime = gridLink.querySelector("time");
	assert.ok(gridEventTime instanceof dom.window.HTMLTimeElement);
	assert.equal(gridEventTime.dateTime, "2026-07-14T09:00");

	const agendaList = host.querySelector<HTMLOListElement>("section[aria-labelledby] > ol");
	assert.ok(agendaList);
	const agendaLink = agendaList.querySelector<HTMLAnchorElement>(
		":scope > li > a[data-lfc-event-id='linked']"
	);
	assert.ok(agendaLink);
	assert.equal(agendaLink.getAttribute("data-lfc-surface"), "agenda");
	const gridButton = cell.querySelector<HTMLButtonElement>(
		":scope > .lfc-calendar-day-summaries > button[data-lfc-event-id='activated']"
	);
	const agendaButton = agendaList.querySelector<HTMLButtonElement>(
		":scope > li > button[data-lfc-event-id='activated']"
	);
	assert.ok(gridButton);
	assert.ok(agendaButton);
	dispatchClick(dom, gridLink);
	dispatchClick(dom, agendaLink);
	dispatchClick(dom, gridButton);
	dispatchClick(dom, agendaButton);
	assert.deepEqual(activations.map((activation) => activation.surface), [
		"grid-summary",
		"agenda",
		"grid-summary",
		"agenda"
	]);
	assert.ok(activations.slice(0, 2).every(
		(activation) => activation.element instanceof dom.window.HTMLAnchorElement
	));
	assert.ok(activations.slice(2).every(
		(activation) => activation.element instanceof dom.window.HTMLButtonElement
	));
	assert.equal(daySelections, 0, "Direct event activation must never select its day.");

	const staticHost = requireElement(dom.window.document, "#static");
	const staticCalendar = createCalendar(staticHost, {
		events: [{ id: "static", start: "2026-07-14", title: "Static event" }],
		initialDate: "2026-07-14"
	});
	staticCalendar.render();
	await waitForReady(staticCalendar);
	assert.ok(staticHost.querySelector(".lfc-calendar-event-summary[data-lfc-event-id='static']") instanceof dom.window.HTMLSpanElement);
	assert.ok(staticHost.querySelector(".lfc-calendar-agenda-event[data-lfc-event-id='static']") instanceof dom.window.HTMLDivElement);
	assert.equal(staticHost.querySelectorAll("[data-lfc-event-id='static']:is(a, button)").length, 0);
});

void test("eventTimeDisplay changes only visual time presentation across both event surfaces", async (context) => {
	const { host } = setupDom(context);
	const cases = [
		{ agendaHidden: false, gridHidden: false, name: "default", value: null },
		{ agendaHidden: false, gridHidden: false, name: "all", value: "all" },
		{ agendaHidden: true, gridHidden: false, name: "grid", value: "grid" },
		{ agendaHidden: false, gridHidden: true, name: "agenda", value: "agenda" },
		{ agendaHidden: true, gridHidden: true, name: "none", value: "none" }
	] as const satisfies readonly {
		readonly agendaHidden: boolean;
		readonly gridHidden: boolean;
		readonly name: string;
		readonly value: CalendarEventTimeDisplay | null;
	}[];

	for (const testCase of cases) {
		const mounted: {
			readonly dateString: string;
			readonly eventId: string;
			readonly hidden: boolean;
			readonly surface: CalendarEventSurface;
			readonly timeText: string;
		}[] = [];
		const calendar = createCalendar(host, {
			events: [
				linkedEvent("timed", "2026-07-14T09:00", "Timed event"),
				{ id: "all-day", start: "2026-07-14", title: "All-day event" },
				{
					end: "2026-07-15T11:00",
					id: "continuation",
					start: "2026-07-13T11:00",
					title: "Continuation event"
				}
			],
			...(testCase.value === null ? {} : { eventTimeDisplay: testCase.value }),
			renderHooks: [{
				eventDidMount: ({ dateString, elements, event, surface, timeText }) => {
					mounted.push({
						dateString,
						eventId: event.id,
						hidden: elements.time.classList.contains("lfc-visually-hidden"),
						surface,
						timeText
					});
				},
				id: "observe-time-presentation"
			}],
			initialDate: "2026-07-14",
			isEventContextMenuAvailable: ({ event }) => event.id === "all-day",
			locale: "en-US",
			onEventContextMenu: () => undefined
		});
		calendar.render();
		await waitForReady(calendar);

		const gridTimedRoot = requireElement(
			host,
			".lfc-calendar-event-summary[data-lfc-event-id='timed']"
		);
		const agendaTimedRoot = requireElement(
			host,
			".lfc-calendar-agenda-event[data-lfc-event-id='timed']"
		);
		const gridTime = gridTimedRoot.querySelector("time");
		const agendaTime = agendaTimedRoot.querySelector("time");
		assert.ok(gridTime, `${testCase.name}: expected the grid time element.`);
		assert.ok(agendaTime, `${testCase.name}: expected the agenda time element.`);
		for (const time of [gridTime, agendaTime]) {
			assert.equal(time.dateTime, "2026-07-14T09:00", `${testCase.name}: datetime changed.`);
			assert.equal(time.textContent, "9:00 AM", `${testCase.name}: localized time changed.`);
			assert.equal(time.hidden, false, `${testCase.name}: semantic time received hidden.`);
			assert.equal(time.getAttribute("aria-hidden"), null, `${testCase.name}: semantic time left the accessibility tree.`);
		}
		assert.equal(
			gridTime.classList.contains("lfc-visually-hidden"),
			testCase.gridHidden,
			`${testCase.name}: grid visual state.`
		);
		assert.equal(
			agendaTime.classList.contains("lfc-visually-hidden"),
			testCase.agendaHidden,
			`${testCase.name}: agenda visual state.`
		);
		assert.match(
			gridTimedRoot.getAttribute("aria-label") ?? "",
			/Timed event, 9:00 AM, Tuesday, July 14, 2026/u,
			`${testCase.name}: hidden grid time must remain in the action's accessible name.`
		);
		const selectedDateMounts = mounted.filter(({ dateString }) => dateString === "2026-07-14");
		assert.equal(selectedDateMounts.length, 6, `${testCase.name}: selected occurrence mount count.`);
		for (const surface of ["grid-summary", "agenda"] as const) {
			assert.equal(
				selectedDateMounts.find(({ eventId, surface: mountedSurface }) =>
					eventId === "timed" && mountedSurface === surface)?.timeText,
				"9:00 AM",
				`${testCase.name}: timed render-hook text on ${surface}.`
			);
			assert.equal(
				selectedDateMounts.find(({ eventId, surface: mountedSurface }) =>
					eventId === "all-day" && mountedSurface === surface)?.timeText,
				"All day",
				`${testCase.name}: all-day render-hook text on ${surface}.`
			);
			assert.equal(
				selectedDateMounts.find(({ eventId, surface: mountedSurface }) =>
					eventId === "continuation" && mountedSurface === surface)?.timeText,
				"",
				`${testCase.name}: continuation render-hook text on ${surface}.`
			);
		}
		assert.ok(mounted.every(({ hidden, surface }) => hidden === (
			surface === "grid-summary" ? testCase.gridHidden : testCase.agendaHidden
		)), `${testCase.name}: render-hook time element visual state did not match its surface.`);

		const window = host.ownerDocument.defaultView;
		assert.ok(window);
		assert.ok(gridTimedRoot instanceof window.HTMLAnchorElement);
		assert.ok(requireElement(
			host,
			".lfc-calendar-event-summary[data-lfc-event-id='all-day']"
		) instanceof window.HTMLButtonElement);
		assert.ok(requireElement(
			host,
			".lfc-calendar-event-summary[data-lfc-event-id='continuation']"
		) instanceof window.HTMLSpanElement);
		calendar.destroy();
	}
});

void test("eventTimeDisplay rejects unsupported values before committing DOM", (context) => {
	const { host } = setupDom(context);

	assert.throws(
		() => createCalendar(host, { events: [], eventTimeDisplay: "visible" as never }),
		(error: unknown) => {
			assert.ok(error instanceof LitefoldCalendarError);
			assert.equal(error.code, "invalid-configuration");
			assert.equal(error.phase, "configuration");
			assert.equal(error.recoverable, false);
			return true;
		}
	);
	assert.equal(host.childElementCount, 0);
});

void test("F2 action mode is non-wrapping and exits to the day proxy or agenda heading", async (context) => {
	const { dom, host } = setupDom(context);
	let daySelections = 0;
	const calendar = createCalendar(host, {
		events: [
			linkedEvent("one", "2026-07-14", "One"),
			linkedEvent("two", "2026-07-14", "Two"),
			linkedEvent("three", "2026-07-14", "Three")
		],
		initialDate: "2026-07-14",
		locale: "ar-EG",
		maxGridEventsPerDay: 2,
		messages: { gridMoreLabel: "Open {count} {eventLabel} on {date}" },
		onDaySelect: () => { daySelections += 1; },
		onEventActivate: (activation) => { activation.nativeEvent.preventDefault(); }
	});
	calendar.render();
	await waitForReady(calendar);

	const dayButton = findDayButton(host, "2026-07-14");
	const cell = dayButton.parentElement;
	assert.ok(cell);
	const actions = [...cell.querySelectorAll<HTMLElement>(
		":scope > .lfc-calendar-day-summaries :is(a, button)"
	)];
	assert.equal(actions.length, 3, "Two capped events and the overflow action must be reachable.");
	assert.equal(actions[0]?.classList.contains("lfc-is-compact-primary"), true);
	assert.ok(actions.every((action) => action.tabIndex === -1));

	dayButton.focus();
	assert.equal(dispatchKey(dom, dayButton, "F2").defaultPrevented, true);
	assert.equal(dom.window.document.activeElement, actions[0]);
	assert.equal(actions[0]?.tabIndex, -1);
	assert.equal(dayButton.tabIndex, 0);
	assert.equal(dispatchKey(dom, actions[0] as Element, "ArrowDown").defaultPrevented, true);
	assert.equal(dom.window.document.activeElement, actions[1]);
	dispatchKey(dom, actions[1] as Element, "ArrowDown");
	assert.equal(dom.window.document.activeElement, actions[2]);
	dispatchKey(dom, actions[2] as Element, "ArrowDown");
	assert.equal(dom.window.document.activeElement, actions[2], "Down Arrow must not wrap.");
	dispatchKey(dom, actions[2] as Element, "ArrowUp");
	assert.equal(dom.window.document.activeElement, actions[1]);
	assert.ok(actions.every((action) => action.tabIndex === -1));
	dispatchKey(dom, actions[1] as Element, "Tab", true);
	assert.equal(dom.window.document.activeElement, dayButton);
	assert.equal(dayButton.tabIndex, 0);

	dispatchKey(dom, dayButton, "F2");
	dispatchKey(dom, actions[0], "Escape");
	assert.equal(dom.window.document.activeElement, dayButton);
	dispatchKey(dom, dayButton, "F2");
	dispatchKey(dom, actions[0], "F2");
	assert.equal(dom.window.document.activeElement, dayButton);
	dispatchKey(dom, dayButton, "F2");
	dispatchKey(dom, actions[0], "Tab");
	const agendaTitle = host.querySelector<HTMLHeadingElement>(".lfc-calendar-agenda-title");
	assert.ok(agendaTitle);
	assert.equal(dom.window.document.activeElement, agendaTitle);

	assert.match(
		actions[2]?.getAttribute("aria-label") ?? "",
		new RegExp(`^Open ${new Intl.NumberFormat("ar-EG").format(1)} event`, "u")
	);
	actions[2]?.focus();
	dispatchClick(dom, actions[2] as Element);
	assert.equal(daySelections, 0, "The overflow action must not invoke onDaySelect.");
	assert.equal(dom.window.document.activeElement, host.querySelector(".lfc-calendar-agenda-title"));
	assert.equal(findDayButton(host, "2026-07-14").tabIndex, 0);
	assert.ok([...host.querySelectorAll<HTMLElement>(
		".lfc-calendar-day-summaries :is(a, button)"
	)].every((action) => action.tabIndex === -1));
});

void test("context availability is per occurrence, fails closed, and preserves native link menus", async (context) => {
	const { dom, host } = setupDom(context, '<div id="calendar"></div><div id="failure"></div>');
	const availability: Readonly<CalendarEventContextMenuAvailability>[] = [];
	const contexts: Readonly<CalendarEventContextMenu>[] = [];
	const calendar = createCalendar(host, {
		events: [
			{ id: "eligible", start: "2026-07-14", title: "Eligible" },
			linkedEvent("native", "2026-07-14", "Native link")
		],
		initialDate: "2026-07-14",
		isEventContextMenuAvailable: (candidate) => {
			availability.push(candidate);
			return candidate.event.id === "eligible" && candidate.surface === "agenda";
		},
		onEventContextMenu: (candidate) => { contexts.push(candidate); }
	});
	calendar.render();
	await waitForReady(calendar);
	assert.ok(availability.some((candidate) => candidate.surface === "grid-summary"));
	assert.ok(availability.some((candidate) => candidate.surface === "agenda"));
	assert.ok(availability.every((candidate) => Object.isFrozen(candidate) && Object.isFrozen(candidate.date)));
	assert.equal(
		host.querySelector(".lfc-calendar-event-summary[data-lfc-event-id='eligible']")?.tagName,
		"SPAN"
	);
	const eligible = host.querySelector<HTMLButtonElement>(
		".lfc-calendar-agenda-event[data-lfc-event-id='eligible']"
	);
	assert.ok(eligible);
	const contextEvent = new dom.window.MouseEvent("contextmenu", { bubbles: true, cancelable: true });
	eligible.dispatchEvent(contextEvent);
	assert.equal(contextEvent.defaultPrevented, true);
	assert.equal(contexts[0]?.surface, "agenda");
	assert.equal(contexts[0]?.event.id, "eligible");

	const nativeLink = host.querySelector<HTMLAnchorElement>(
		".lfc-calendar-agenda-event[data-lfc-event-id='native']"
	);
	assert.ok(nativeLink);
	const nativeContextEvent = new dom.window.MouseEvent("contextmenu", { bubbles: true, cancelable: true });
	nativeLink.dispatchEvent(nativeContextEvent);
	assert.equal(nativeContextEvent.defaultPrevented, false);
	assert.equal(contexts.length, 1);

	const errors: LitefoldCalendarError[] = [];
	const failureHost = requireElement(dom.window.document, "#failure");
	const results = new Map<string, unknown>([
		["throw", new Error("availability failed")],
		["object", { available: true }],
		["thenable", Promise.resolve(true)]
	]);
	const failureCalendar = createCalendar(failureHost, {
		events: [...results.keys()].map((id) => ({ id, start: "2026-07-14", title: id })),
		initialDate: "2026-07-14",
		isEventContextMenuAvailable: (candidate) => {
			const result = results.get(candidate.event.id);
			if (result instanceof Error) {
				throw result;
			}
			return result as boolean;
		},
		onError: (error) => {
			errors.push(error);
			return "handled";
		},
		onEventContextMenu: () => undefined
	});
	failureCalendar.render();
	await waitFor(() => failureHost.getAttribute("aria-busy") !== "true", "failed-closed render");
	assert.equal(failureHost.querySelectorAll("[data-lfc-event-id]:is(a, button)").length, 0);
	assert.equal(errors.length, 1);
	assert.equal(errors[0]?.code, "host-integration-failed");
	assert.equal(errors[0]?.hook, "isEventContextMenuAvailable");
	assert.equal(errors[0]?.recoverable, true);
});

void test("progressive fallback visibility and its exclusive lease are reversible and mutation-safe", async (context) => {
	const { dom, host } = setupDom(
		context,
		'<div id="fallback">Server fallback</div><div id="calendar"></div><div id="second"></div>' +
		'<div id="failure-fallback">Failure fallback</div><div id="failure-calendar"></div>' +
		'<div id="fatal-fallback">Fatal fallback</div><div id="fatal-calendar"></div>'
	);
	const fallback = requireElement(dom.window.document, "#fallback");
	const firstRequest = deferred<readonly CalendarEventInput[]>();
	const refreshRequest = deferred<readonly CalendarEventInput[]>();
	let requestCount = 0;
	const calendar = createCalendar(host, {
		events: () => {
			requestCount += 1;
			return requestCount === 1 ? firstRequest.promise : refreshRequest.promise;
		},
		fallbackElement: fallback,
		initialDate: "2026-07-14",
		onError: () => undefined
	});
	calendar.render();
	assert.equal(fallback.hidden, false, "Initial fallback visibility must remain unchanged while loading.");
	firstRequest.resolve([]);
	await waitForReady(calendar);
	assert.equal(fallback.hidden, true, "A usable empty snapshot hides the progressive fallback.");
	calendar.refetchEvents();
	refreshRequest.reject(new Error("refresh failed"));
	await waitFor(() => calendar.getState().phase === "degraded", "retained refresh failure");
	assert.equal(fallback.hidden, true, "A retained usable snapshot keeps the fallback hidden.");

	const secondHost = requireElement(dom.window.document, "#second");
	const second = createCalendar(secondHost, {
		events: [],
		fallbackElement: fallback,
		initialDate: "2026-07-14"
	});
	assert.throws(
		() => { second.render(); },
		(error: unknown) => error instanceof LitefoldCalendarError && error.code === "invalid-state"
	);
	calendar.destroy();
	assert.equal(fallback.hidden, false);
	assert.doesNotThrow(() => { second.render(); });
	await waitForReady(second);
	second.destroy();

	fallback.hidden = true;
	const mutationSafe = createCalendar(host, {
		events: [],
		fallbackElement: fallback,
		initialDate: "2026-07-14"
	});
	mutationSafe.render();
	await waitForReady(mutationSafe);
	assert.equal(fallback.hidden, true);
	fallback.hidden = false;
	mutationSafe.destroy();
	assert.equal(fallback.hidden, false, "Destroy must preserve an application visibility mutation.");

	const failureFallback = requireElement(dom.window.document, "#failure-fallback");
	const failureHost = requireElement(dom.window.document, "#failure-calendar");
	let failureRequests = 0;
	const recovers = createCalendar(failureHost, {
		events: () => {
			failureRequests += 1;
			return failureRequests === 1 ? Promise.reject(new Error("first load failed")) : [];
		},
		fallbackElement: failureFallback,
		initialDate: "2026-07-14",
		onError: () => undefined
	});
	recovers.render();
	await waitFor(() => recovers.getState().phase === "unavailable", "unavailable first load");
	assert.equal(failureFallback.hidden, false);
	const retry = [...failureHost.querySelectorAll<HTMLButtonElement>("button")]
		.find((button) => button.textContent === "Retry" && button.closest("[hidden]") === null);
	assert.ok(retry);
	dispatchClick(dom, retry);
	await waitForReady(recovers);
	assert.equal(failureFallback.hidden, true);
	recovers.destroy();
	assert.equal(failureFallback.hidden, false);

	const fatalFallback = requireElement(dom.window.document, "#fatal-fallback");
	const fatalHost = requireElement(dom.window.document, "#fatal-calendar");
	let clockFails = false;
	const fatalCalendar = createCalendar(fatalHost, {
		events: [],
		fallbackElement: fatalFallback,
		initialDate: "2026-07-14",
		now: () => {
			if (clockFails) {
				throw new Error("clock failed");
			}
			return new Date("2026-07-14T12:00:00Z");
		},
		onError: () => undefined
	});
	fatalCalendar.render();
	await waitForReady(fatalCalendar);
	assert.equal(fatalFallback.hidden, true);
	clockFails = true;
	fatalCalendar.today();
	assert.equal(fatalCalendar.getState().phase, "unavailable");
	assert.equal(fatalFallback.hidden, false);
	fatalCalendar.destroy();
	assert.equal(fatalFallback.hidden, false);

	assert.throws(
		() => createCalendar(host, { events: [], fallbackElement: host }),
		(error: unknown) => error instanceof LitefoldCalendarError && error.code === "invalid-configuration"
	);
	assert.throws(
		() => createCalendar(host, { events: [], fallbackElement: dom.window.document.body }),
		(error: unknown) => error instanceof LitefoldCalendarError && error.code === "invalid-configuration" &&
			error.message.includes("neither contains nor is contained")
	);
	const otherDocumentFallback = createDom('<div id="calendar"></div>').window.document.body;
	assert.throws(
		() => createCalendar(host, { events: [], fallbackElement: otherDocumentFallback }),
		(error: unknown) => error instanceof LitefoldCalendarError && error.code === "invalid-configuration"
	);
});

void test("focus tokens restore an exact multi-day occurrence and stale controls remain inert", async (context) => {
	const { dom, host } = setupDom(context);
	const requests: ReturnType<typeof deferred<readonly CalendarEventInput[]>>[] = [];
	const activations: Readonly<CalendarEventActivation>[] = [];
	const multiEvent = {
		end: "2026-07-16",
		id: "multi",
		start: "2026-07-14",
		title: "Multi-day",
		url: "/events/multi"
	} as const;
	let selections = 0;
	const calendar = createCalendar(host, {
		events: () => {
			const request = deferred<readonly CalendarEventInput[]>();
			requests.push(request);
			return request.promise;
		},
		initialDate: "2026-07-14",
		onDaySelect: () => { selections += 1; },
		onEventActivate: (activation) => {
			activation.nativeEvent.preventDefault();
			activations.push(activation);
		}
	});
	calendar.render();
	requests[0]?.resolve([multiEvent]);
	await waitForReady(calendar);
	const oldDay = findDayButton(host, "2026-07-15");
	const oldAction = findGridAction(host, "2026-07-15", "multi");
	oldAction.focus();
	calendar.refetchEvents();
	requests[1]?.resolve([multiEvent]);
	await waitFor(() => !oldAction.isConnected, "event rerender");
	await waitForReady(calendar);
	const restored = findGridAction(host, "2026-07-15", "multi");
	assert.equal(dom.window.document.activeElement, restored);
	assert.equal(restored.tabIndex, -1);
	assert.equal(findDayButton(host, "2026-07-15").tabIndex, 0);

	const staleClick = new dom.window.MouseEvent("click", { bubbles: true, cancelable: true });
	oldAction.dispatchEvent(staleClick);
	assert.equal(staleClick.defaultPrevented, true);
	dispatchClick(dom, oldDay);
	dispatchKey(dom, oldDay, "Enter");
	assert.equal(activations.length, 0);
	assert.equal(selections, 0);

	calendar.refetchEvents();
	requests[2]?.resolve([]);
	await waitFor(() => !restored.isConnected, "grid event removal");
	await waitForReady(calendar);
	assert.equal(dom.window.document.activeElement, findDayButton(host, "2026-07-15"));
	assert.equal(findDayButton(host, "2026-07-15").tabIndex, 0);
	assert.equal(findDayButton(host, "2026-07-14").tabIndex, -1);

	calendar.refetchEvents();
	requests[3]?.resolve([multiEvent]);
	await waitForReady(calendar);
	const agendaAction = host.querySelector<HTMLAnchorElement>(
		".lfc-calendar-agenda-event[data-lfc-event-id='multi']"
	);
	assert.ok(agendaAction);
	agendaAction.focus();
	calendar.refetchEvents();
	requests[4]?.resolve([multiEvent]);
	await waitFor(() => !agendaAction.isConnected, "agenda event rerender");
	await waitForReady(calendar);
	const restoredAgenda = host.querySelector<HTMLAnchorElement>(
		".lfc-calendar-agenda-event[data-lfc-event-id='multi']"
	);
	assert.ok(restoredAgenda);
	assert.equal(dom.window.document.activeElement, restoredAgenda);
	assert.notEqual(dom.window.document.activeElement, findGridAction(host, "2026-07-15", "multi"));

	calendar.refetchEvents();
	requests[5]?.resolve([]);
	await waitFor(() => !restoredAgenda.isConnected, "event removal");
	await waitForReady(calendar);
	assert.equal(dom.window.document.activeElement, findDayButton(host, "2026-07-14"));
});

void test("a reentrant context-availability callback cannot commit a superseded grid", async (context) => {
	const { host } = setupDom(context);
	const augustRequest = deferred<readonly CalendarEventInput[]>();
	let requestCount = 0;
	let redirected = false;
	const availabilityCalls: string[] = [];
	const calendar: Calendar = createCalendar(host, {
		events: () => {
			requestCount += 1;
			return requestCount === 1
				? [
					{ id: "redirect-first", start: "2026-07-14", title: "Redirect A" },
					{ id: "redirect-second", start: "2026-07-14", title: "Redirect B" }
				]
				: augustRequest.promise;
		},
		initialDate: "2026-07-14",
		isEventContextMenuAvailable: (candidate) => {
			availabilityCalls.push(candidate.event.id);
			if (!redirected) {
				redirected = true;
				calendar.gotoDate("2026-08-10");
			}
			return false;
		},
		onEventContextMenu: () => undefined
	});
	calendar.render();
	await waitFor(() => redirected, "reentrant navigation");
	assert.match(host.querySelector(".lfc-calendar-title-label-full")?.textContent ?? "", /August 2026/u);
	assert.ok(host.querySelector("button[data-lfc-date='2026-08-10']"));
	assert.deepEqual(availabilityCalls, ["redirect-first"]);
	assert.equal(host.querySelector("[data-lfc-event-id^='redirect-']"), null);
	augustRequest.resolve([]);
	await waitForReady(calendar);
});

interface TestDom {
	readonly dom: ReturnType<typeof createDom>;
	readonly host: HTMLElement;
}

function setupDom(
	context: TestContext,
	markup = '<div id="calendar"></div>'
): TestDom {
	const dom = createDom(markup);
	const restore = installDom(dom);
	context.after(restore);
	const host = requireElement(dom.window.document, "#calendar");
	return { dom, host };
}

function requireElement(container: ParentNode, selector: string): HTMLElement {
	const element = container.querySelector<HTMLElement>(selector);
	assert.ok(element, `Expected ${selector}.`);
	return element;
}

function findDayButton(host: HTMLElement, date: string): HTMLButtonElement {
	const button = host.querySelector<HTMLButtonElement>(
		`[role='gridcell'] > button[data-lfc-date='${date}']`
	);
	assert.ok(button, `Expected the ${date} day button.`);
	return button;
}

function findGridAction(host: HTMLElement, date: string, eventId: string): HTMLAnchorElement | HTMLButtonElement {
	const action = host.querySelector<HTMLAnchorElement | HTMLButtonElement>(
		`.lfc-calendar-event-summary[data-lfc-date='${date}'][data-lfc-event-id='${eventId}']:is(a, button)`
	);
	assert.ok(action, `Expected grid action ${eventId} on ${date}.`);
	return action;
}

function linkedEvent(id: string, start: string, title: string): CalendarEventInput {
	return { id, start, title, url: `/events/${id}` };
}

async function waitForReady(calendar: Calendar): Promise<void> {
	await waitFor(() => calendar.getState().phase === "ready", "ready calendar state");
}
