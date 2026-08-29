import assert from "node:assert/strict";
import test, { type TestContext } from "node:test";

import {
	createCalendar,
	LitefoldCalendarError,
	type Calendar,
	type CalendarDayContextMenu,
	type CalendarErrorCode,
	type CalendarEvent,
	type CalendarEventActivation,
	type CalendarEventContextMenu,
	type CalendarEventInput,
	type CalendarRenderHooks
} from "../src/index.js";
import {
	createDom,
	deferred,
	dispatchClick,
	dispatchKey,
	installDom,
	waitFor
} from "./helpers/dom.js";

void test("construction rejects invalid configuration before committing generated DOM", (context) => {
	const { dom, host } = setupDom(context);

	assert.throws(
		() => createCalendar(host, {} as never),
		(error: unknown) => isCalendarError(error, "invalid-configuration")
	);
	assert.equal(host.childElementCount, 0);
	assert.equal(host.classList.contains("litefold-calendar"), false);
	assert.equal(host.hasAttribute("data-litefold-calendar"), false);

	assert.throws(
		() => createCalendar(host, {
			events: async () => [],
			sourceEventLimit: 10_001
		}),
		(error: unknown) => isCalendarError(error, "invalid-configuration")
	);
	assert.throws(
		() => createCalendar(host, {
			events: async () => [],
			renderHooks: [{ id: "duplicate" }, { id: "duplicate" }]
		}),
		(error: unknown) => isCalendarError(error, "invalid-configuration")
	);
	assert.throws(
		() => createCalendar(host, {
			events: async () => [],
			renderHooks: [{ id: "invalid-day-badge", renderDayBadge: "invalid" } as never]
		}),
		(error: unknown) => isCalendarError(error, "invalid-configuration")
	);
	for (const hook of [
		"renderEventMarker",
		"renderGridOverflowContent",
		"renderMultipleEventIndicator"
	] as const) {
		const renderHooks = [
			{ id: `first-${hook}`, [hook]: () => null },
			{ id: `second-${hook}`, [hook]: () => null }
		] satisfies CalendarRenderHooks[];
		assert.throws(
			() => createCalendar(host, { events: [], renderHooks }),
			(error: unknown) => isCalendarError(error, "invalid-configuration")
		);
	}
	const staticEventsFailure = new Error("static events getter failure");
	const hostileStaticEvents: CalendarEventInput[] = [];
	Object.defineProperty(hostileStaticEvents, "0", {
		configurable: true,
		enumerable: true,
		get: () => { throw staticEventsFailure; }
	});
	assert.throws(
		() => createCalendar(host, { events: hostileStaticEvents }),
		(error: unknown) => error instanceof LitefoldCalendarError &&
			error.code === "invalid-configuration" && error.cause === staticEventsFailure
	);
	const toolbarFragment = dom.window.document.createDocumentFragment();
	const fragmentedToolbar = dom.window.document.createElement("fieldset");
	toolbarFragment.append(fragmentedToolbar);
	assert.throws(
		() => createCalendar(host, { events: [], toolbarEnd: toolbarFragment as never }),
		(error: unknown) => isCalendarError(error, "invalid-configuration")
	);
	assert.equal(toolbarFragment.firstElementChild, fragmentedToolbar);
	assert.throws(
		() => createCalendar(host, {
			agendaPageSize: 9,
			events: async () => []
		}),
		(error: unknown) => isCalendarError(error, "invalid-configuration")
	);
	assert.throws(
		() => createCalendar(host, {
			events: async () => [],
			maxGridEventsPerDay: 11
		}),
		(error: unknown) => isCalendarError(error, "invalid-configuration")
	);
	assert.doesNotThrow(() => createCalendar(host, {
		events: async () => [],
		maxGridEventsPerDay: 0
	}));
	assert.equal(dom.window.document.querySelector("[data-litefold-calendar]"), null);
});

void test("render creates a valid agenda-first grid and is idempotent", async (context) => {
	const { dom, host } = setupDom(context);
	let requests = 0;
	const calendar = createCalendar(host, {
		events: async () => {
			requests += 1;
			return [event("event-1", "2026-07-14T09:00", "Design review")];
		},
		initialDate: "2026-07-14",
		now: () => new Date("2026-07-14T12:00:00Z")
	});

	calendar.render();
	calendar.render();
	await waitForPhase(calendar, "ready");

	assert.equal(requests, 1);
	assert.equal(host.classList.contains("litefold-calendar"), true);
	assert.equal(host.getAttribute("data-litefold-calendar"), "");
	assert.equal(host.classList.contains(["lfc", "calendar"].join("-")), false);
	assert.equal(host.hasAttribute(["data", "lfc", "calendar"].join("-")), false);
	const grid = getGrid(host);
	assert.equal(grid.getAttribute("aria-readonly"), "true");
	assert.notEqual(grid.getAttribute("aria-labelledby"), null);
	assert.equal(grid.querySelectorAll(":scope [role='columnheader']").length, 7);
	assert.equal(grid.querySelectorAll(":scope [role='gridcell']").length, 42);
	assert.equal(getDayButtons(grid).length, 42);
	assert.equal(grid.querySelectorAll(":scope [role='gridcell'][aria-selected='true']").length, 1);
	assert.equal(grid.querySelectorAll(":scope button[tabindex='0']").length, 1);
	assert.equal(grid.querySelectorAll(":scope button[aria-current='date']").length, 1);

	const selectedCell = findDayButton(host, "2026-07-14").closest("[role='gridcell']");
	assert.equal(selectedCell?.querySelectorAll("button").length, 1, "Grid summaries must not create event controls.");
	const agenda = getAgenda(host);
	const agendaEvent = agenda.querySelector<HTMLElement>(".lfc-calendar-agenda-event");
	assert.ok(agendaEvent);
	assert.equal(agendaEvent.tagName, "DIV", "Events without actions must remain static agenda rows.");
	assert.equal(agendaEvent.classList.contains("lfc-calendar-event-button"), false);
	assert.equal(agendaEvent.tabIndex, -1);
	assert.match(agendaEvent.textContent ?? "", /Design review/);
	assert.notEqual(grid.compareDocumentPosition(agenda) & dom.window.Node.DOCUMENT_POSITION_FOLLOWING, 0);
});

void test("events accepts a static event array", async (context) => {
	const { host } = setupDom(context);
	const calendar = createCalendar(host, {
		events: [event("event-1", "2026-07-14T09:00", "Static event")],
		initialDate: "2026-07-14"
	});

	calendar.render();
	await waitForPhase(calendar, "ready");

	assert.match(getAgenda(host).textContent ?? "", /Static event/);
});

void test("a detached host renders and becomes focusable after insertion", async (context) => {
	const { dom } = setupDom(context);
	const detachedHost = dom.window.document.createElement("div");
	const calendar = createCalendar(detachedHost, {
		events: [event("detached", "2026-07-14", "Detached")], initialDate: "2026-07-14"
	});
	calendar.render();
	await waitForPhase(calendar, "ready");
	dom.window.document.body.append(detachedHost);
	calendar.focusDate("2026-07-14");
	assert.equal(dom.window.document.activeElement?.getAttribute("data-lfc-date"), "2026-07-14");
});

void test("weekday headings keep full accessible names with compact visual labels", async (context) => {
	const { host } = setupDom(context);
	const calendar = createCalendar(host, {
		events: [],
		firstDay: 0,
		initialDate: "2026-07-14",
		locale: "en-US"
	});

	calendar.render();
	await waitForPhase(calendar, "ready");

	const headings = [...host.querySelectorAll<HTMLElement>("[role='columnheader']")];
	assert.deepEqual(
		headings.map((heading) => heading.getAttribute("aria-label")),
		["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"]
	);
	assert.deepEqual(
		headings.map((heading) => heading.querySelector(".lfc-calendar-weekday-short")?.textContent),
		["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"]
	);
	assert.deepEqual(
		headings.map((heading) => heading.querySelector(".lfc-calendar-weekday-narrow")?.textContent),
		["S", "M", "T", "W", "T", "F", "S"]
	);
	assert.ok(headings.every((heading) =>
		[...heading.children].every((label) => label.getAttribute("aria-hidden") === "true")));
});

void test("structured dates round-trip through state and same-month selection emits state", async (context) => {
	const { host } = setupDom(context);
	const states: ReturnType<Calendar["getState"]>[] = [];
	const calendar = createCalendar(host, {
		events: [],
		initialDate: { day: 14, month: 7, year: 2026 },
		onStateChange: (state) => {
			states.push(state);
		}
	});

	calendar.render();
	await waitForPhase(calendar, "ready");
	assert.deepEqual(calendar.getState().displayedMonth, { day: 1, month: 7, year: 2026 });
	assert.deepEqual(calendar.getState().selectedDate, { day: 14, month: 7, year: 2026 });

	states.length = 0;
	calendar.focusDate({ day: 18, month: 7, year: 2026 });

	assert.deepEqual(calendar.getState().displayedMonth, { day: 1, month: 7, year: 2026 });
	assert.deepEqual(calendar.getState().selectedDate, { day: 18, month: 7, year: 2026 });
	assert.equal(states.length, 1);
	assert.deepEqual(states[0]?.selectedDate, { day: 18, month: 7, year: 2026 });
	assert.equal(
		findDayButton(host, "2026-07-18").closest("[role='gridcell']")?.getAttribute("aria-selected"),
		"true"
	);
});

void test("construction snapshots mutable option containers and emits frozen state", async (context) => {
	const { host } = setupDom(context);
	const renderHooks: CalendarRenderHooks[] = [];
	const messages = { agendaEmpty: "Original empty state" };
	const states: ReturnType<Calendar["getState"]>[] = [];
	const options = {
		events: async () => [],
		renderHooks,
		initialDate: "2026-07-14",
		messages,
		onStateChange: (state: ReturnType<Calendar["getState"]>) => {
			states.push(state);
			return undefined;
		}
	};
	const calendar = createCalendar(host, options);
	options.initialDate = "2026-08-20";
	messages.agendaEmpty = "Mutated empty state";
	renderHooks.push({
		id: "late-render-hook",
		renderDayBadge: () => host.ownerDocument.createTextNode("MUTATED EXTENSION")
	});

	calendar.render();
	await waitForPhase(calendar, "ready");
	assert.equal(findDayButton(host, "2026-07-14").closest("[role='gridcell']")?.getAttribute("aria-selected"), "true");
	assert.match(getAgenda(host).textContent ?? "", /Original empty state/);
	assert.doesNotMatch(host.textContent ?? "", /Mutated empty state|MUTATED EXTENSION/);
	assert.ok(states.some((state) => state.phase === "loading"));
	assert.ok(states.some((state) => state.phase === "ready"));
	assert.ok(states.every((state) => Object.isFrozen(state) && Object.isFrozen(state.issues)));
	assert.ok(states.flatMap((state) => state.issues).every((issue) => !("cause" in issue)));
});

void test("strict civil values, duplicate IDs, and a malformed item reject the whole snapshot", async (context) => {
	const { host } = setupDom(context);
	const invalidStarts = [
		"2023-02-29",
		"2026-07-14T24:00",
		"2026-07-14T09:00Z",
		"2026-07-14T09:00-07:00",
		" 2026-07-14",
		"2026-07-14T09",
		"0000-01-01",
		"10000-01-01"
	] as const;

	for (const start of invalidStarts) {
		let captured: LitefoldCalendarError | undefined;
		const calendar = createCalendar(host, {
			events: async () => [event("valid", "2026-07-14", "Valid"), event("invalid", start, "Invalid")],
			initialDate: "2026-07-14",
			onError: (error) => {
				captured = error;
				return "handled";
			}
		});
		calendar.render();
		await waitFor(() => captured !== undefined, `validation error for ${start}`);
		assert.ok(captured);
		assert.equal(captured.code, "event-data-invalid");
		assert.equal(captured.eventIndex, 1);
		assert.equal(calendar.getState().phase, "unavailable");
		assert.doesNotMatch(getAgenda(host).textContent ?? "", /Valid/);
		calendar.destroy();
	}

	let duplicateError: LitefoldCalendarError | undefined;
	const duplicateCalendar = createCalendar(host, {
		events: async () => [event("same", "2026-07-14", "First"), event("same", "2026-07-15", "Second")],
		initialDate: "2026-07-14",
		onError: (error) => {
			duplicateError = error;
			return "handled";
		}
	});
	duplicateCalendar.render();
	await waitFor(() => duplicateError !== undefined, "duplicate-ID error");
	assert.ok(duplicateError);
	assert.equal(duplicateError.code, "event-data-invalid");
	assert.equal(duplicateError.eventIndex, 1);
});

void test("event normalization derives all-day state, exclusive ends, colors, and opaque metadata", async (context) => {
	const { dom, host } = setupDom(context);
	const metadata = { confidential: "metadata-must-not-enter-the-dom" };
	const activated: CalendarEvent<typeof metadata>[] = [];
	const calendar = createCalendar<typeof metadata>(host, {
		onEventActivate: ({ event: activatedEvent }) => {
			activated.push(activatedEvent);
		},
		events: async () => [
			{ ...event("all-day", "2026-07-13", "Two day event", "2026-07-15"), accentColor: "#a1b2c3", metadata },
			{ ...event("point", "2026-07-13T09:30", "Point event"), accentColor: "url(javascript:alert(1))", metadata }
		],
		initialDate: "2026-07-13"
	});
	calendar.render();
	await waitForPhase(calendar, "ready");

	let agenda = getAgenda(host);
	assert.match(agenda.textContent ?? "", /Two day event/);
	assert.match(agenda.textContent ?? "", /Point event/);
	const explicitMarker = agenda.querySelector("[data-lfc-event-id='all-day'] .lfc-calendar-event-accent-shape");
	const fallbackMarker = agenda.querySelector("[data-lfc-event-id='point'] .lfc-calendar-event-accent");
	assert.equal(explicitMarker?.getAttribute("fill"), "#A1B2C3");
	assert.equal(fallbackMarker?.classList.contains("lfc-uses-token"), true);
	assert.equal(host.matches("[style]") || host.querySelector("[style]") !== null, false, "Core rendering must not create inline style attributes.");
	calendar.focusDate("2026-07-14");
	agenda = getAgenda(host);
	assert.match(agenda.textContent ?? "", /Two day event/);
	assert.doesNotMatch(agenda.textContent ?? "", /Point event/);
	calendar.focusDate("2026-07-15");
	assert.doesNotMatch(getAgenda(host).textContent ?? "", /Two day event/);

	calendar.focusDate("2026-07-13");
	for (const button of getAgenda(host).querySelectorAll<HTMLButtonElement>("button")) {
		dispatchClick(dom, button);
	}
	assert.equal(activated.length, 2);
	assert.equal(activated[0]?.isAllDay, true);
	assert.equal(activated[0]?.end, "2026-07-15");
	assert.equal(activated[0]?.accentColor, "#A1B2C3");
	assert.equal(activated[0]?.metadata, metadata);
	assert.equal(activated[1]?.isAllDay, false);
	assert.equal(activated[1]?.end, null);
	assert.equal(activated[1]?.accentColor, null);
	assert.doesNotMatch(host.outerHTML, /metadata-must-not-enter-the-dom/);
	assert.doesNotMatch(host.outerHTML, /javascript:/);
});

void test("event activation identifies the occurrence, native element, and native event", async (context) => {
	const { dom, host } = setupDom(context);
	let activation: Readonly<CalendarEventActivation> | undefined;
	const calendar = createCalendar(host, {
		events: [event("multi-day", "2026-07-13", "Multi-day event", "2026-07-16")],
		initialDate: { day: 14, month: 7, year: 2026 },
		onEventActivate: (contextValue) => {
			activation = contextValue;
		}
	});
	calendar.render();
	await waitForPhase(calendar, "ready");

	const button = getAgenda(host).querySelector<HTMLButtonElement>("button[data-lfc-event-id='multi-day']");
	assert.ok(button);
	const nativeEvent = new dom.window.MouseEvent("click", { bubbles: true, cancelable: true });
	button.dispatchEvent(nativeEvent);

	assert.ok(activation);
	assert.deepEqual(activation.date, { day: 14, month: 7, year: 2026 });
	assert.equal(activation.dateString, "2026-07-14");
	assert.equal(activation.element, button);
	assert.equal(activation.nativeEvent, nativeEvent);
	assert.equal(activation.event.id, "multi-day");
});

void test("day and event context menus expose pointer and keyboard gestures", async (context) => {
	const { dom, host } = setupDom(context);
	const dayContexts: Readonly<CalendarDayContextMenu>[] = [];
	const eventContexts: Readonly<CalendarEventContextMenu>[] = [];
	const calendar = createCalendar(host, {
		events: [event("context-event", "2026-07-14T09:00", "Context event")],
		initialDate: "2026-07-14",
		onDayContextMenu: (contextValue) => {
			dayContexts.push(contextValue);
		},
		onEventContextMenu: (contextValue) => {
			eventContexts.push(contextValue);
		}
	});
	calendar.render();
	await waitForPhase(calendar, "ready");

	const dayButton = findDayButton(host, "2026-07-14");
	const dayPointerEvent = new dom.window.MouseEvent("contextmenu", {
		bubbles: true,
		cancelable: true,
		clientX: 12,
		clientY: 34
	});
	dayButton.dispatchEvent(dayPointerEvent);
	const dayKeyboardEvent = dispatchKey(dom, dayButton, "F10", true);

	assert.equal(dayPointerEvent.defaultPrevented, true);
	assert.equal(dayKeyboardEvent.defaultPrevented, true);
	assert.equal(dayButton.getAttribute("aria-keyshortcuts"), "F2 Shift+F10");
	assert.equal(dayContexts.length, 2);
	assert.equal(dayContexts[0]?.element, dayButton);
	assert.equal(dayContexts[0]?.nativeEvent, dayPointerEvent);
	assert.equal(dayContexts[0]?.clientX, 12);
	assert.equal(dayContexts[0]?.clientY, 34);
	assert.equal(dayContexts[1]?.nativeEvent, dayKeyboardEvent);
	assert.deepEqual(dayContexts[1]?.date, { day: 14, month: 7, year: 2026 });

	const eventButton = getAgenda(host).querySelector<HTMLButtonElement>(
		"button[data-lfc-event-id='context-event']"
	);
	assert.ok(eventButton);
	const eventPointerEvent = new dom.window.MouseEvent("contextmenu", {
		bubbles: true,
		cancelable: true,
		clientX: 56,
		clientY: 78
	});
	eventButton.dispatchEvent(eventPointerEvent);
	const eventKeyboardEvent = dispatchKey(dom, eventButton, "ContextMenu");

	assert.equal(eventPointerEvent.defaultPrevented, true);
	assert.equal(eventKeyboardEvent.defaultPrevented, true);
	assert.equal(eventButton.getAttribute("aria-keyshortcuts"), "Shift+F10");
	assert.equal(eventContexts.length, 2);
	assert.equal(eventContexts[0]?.element, eventButton);
	assert.equal(eventContexts[0]?.nativeEvent, eventPointerEvent);
	assert.equal(eventContexts[0]?.clientX, 56);
	assert.equal(eventContexts[0]?.clientY, 78);
	assert.equal(eventContexts[1]?.nativeEvent, eventKeyboardEvent);
	assert.equal(eventContexts[1]?.event.id, "context-event");
	assert.equal(eventContexts[1]?.dateString, "2026-07-14");
});

void test("source limits fail visibly instead of truncating the snapshot silently", async (context) => {
	const { host } = setupDom(context);
	let captured: LitefoldCalendarError | undefined;
	const calendar = createCalendar(host, {
		events: async () => [
			event("one", "2026-07-14", "One"),
			event("two", "2026-07-14", "Two")
		],
		initialDate: "2026-07-14",
		sourceEventLimit: 1,
		onError: (error) => {
			captured = error;
		}
	});
	calendar.render();
	await waitFor(() => captured !== undefined, "source limit error");
	assert.ok(captured);
	assert.equal(captured.code, "event-limit-exceeded");
	assert.equal(calendar.getState().phase, "unavailable");
	assert.ok(findRetryButton(host));
	assert.doesNotMatch(getAgenda(host).textContent ?? "", /One|Two/);
});

void test("grid summaries and agenda paging stay within configured DOM limits", async (context) => {
	const { dom, host } = setupDom(context);
	const events = Array.from({ length: 65 }, (_, index) => event(
		`event-${index.toString()}`,
		"2026-07-14T09:00",
		`Event ${index.toString().padStart(2, "0")}`
	));
	const calendar = createCalendar(host, {
		agendaDomLimit: 50,
		agendaPageSize: 10,
		events: async () => events,
		initialDate: "2026-07-14",
		maxGridEventsPerDay: 2
	});
	calendar.render();
	await waitForPhase(calendar, "ready");

	const selectedCell = findDayButton(host, "2026-07-14").closest("[role='gridcell']");
	assert.ok(selectedCell);
	assert.equal(selectedCell.querySelectorAll("[data-lfc-event-id]").length, 2);
	const agenda = getAgenda(host);
	assert.equal(agenda.querySelectorAll(".lfc-calendar-agenda-event").length, 10);
	assert.ok((agenda.querySelector(".lfc-calendar-agenda-overflow")?.textContent ?? "").trim().length > 0);

	for (let page = 0; page < 4; page += 1) {
		const more = agenda.querySelector<HTMLButtonElement>(".lfc-calendar-agenda-more");
		assert.ok(more);
		more.focus();
		dispatchClick(dom, more);
		assert.equal(dom.window.document.activeElement, agenda.querySelector(".lfc-calendar-agenda-title"));
	}
	assert.equal(agenda.querySelectorAll(".lfc-calendar-agenda-event").length, 50);
	assert.equal(agenda.querySelector(".lfc-calendar-agenda-more"), null);
	await waitFor(() =>
		(host.querySelector<HTMLElement>("[role='status']")?.textContent?.trim().length ?? 0) > 0,
		"agenda paging announcement"
	);
});

void test("public method misuse throws without changing state or invoking onError", async (context) => {
	const { host } = setupDom(context);
	const errors: LitefoldCalendarError[] = [];
	const calendar = createCalendar(host, {
		events: async () => [],
		initialDate: "2026-07-14",
		onError: (error) => {
			errors.push(error);
			return "handled";
		}
	});
	assert.throws(() => { calendar.refetchEvents(); },
		(error: unknown) => isCalendarError(error, "invalid-state", /requires a rendered calendar/i));
	calendar.render();
	await waitForPhase(calendar, "ready");
	const originalRange = calendar.getState().range;

	assert.throws(() => { calendar.gotoDate("2026-07-14T09:00Z"); },
		(error: unknown) => isCalendarError(error, "invalid-argument", /valid supported civil date/i));
	assert.deepEqual(calendar.getState().range, originalRange);
	calendar.gotoDate("2026-07-14");
	assert.equal(calendar.getState().issues.some((issue) => issue.code === "invalid-argument"), false);
	assert.equal(errors.length, 0);
});

void test("navigation aborts the active source and ignores its stale success", async (context) => {
	const { host } = setupDom(context);
	const requests: {
		readonly pending: ReturnType<typeof deferred<readonly CalendarEventInput[]>>;
		readonly signal: AbortSignal;
	}[] = [];
	const calendar = createCalendar(host, {
		events: ({ signal }) => {
			const pending = deferred<readonly CalendarEventInput[]>();
			requests.push({ pending, signal });
			return pending.promise;
		},
		initialDate: "2026-07-14",
		onError: () => "default"
	});
	calendar.render();
	await waitFor(() => requests.length === 1, "initial source request");
	assert.equal(requests.length, 1);
	calendar.next();
	await waitFor(() => requests.length === 2, "navigated source request");
	assert.equal(requests[0]?.signal.aborted, true);
	assert.equal(requests.length, 2);

	requests[1]?.pending.resolve([event("new", "2026-08-14", "Current event")]);
	await waitForPhase(calendar, "ready");
	requests[0]?.pending.resolve([event("old", "2026-07-14", "Stale event")]);
	await Promise.resolve();
	await Promise.resolve();

	assert.match(host.textContent ?? "", /Current event/);
	assert.doesNotMatch(host.textContent ?? "", /Stale event/);
});

void test("a stale non-abort failure is diagnostic-only while an expected abort is silent", async (context) => {
	const { host } = setupDom(context);
	const requests: ReturnType<typeof deferred<readonly CalendarEventInput[]>>[] = [];
	const errors: LitefoldCalendarError[] = [];
	const calendar = createCalendar(host, {
		events: () => {
			const pending = deferred<readonly CalendarEventInput[]>();
			requests.push(pending);
			return pending.promise;
		},
		initialDate: "2026-07-14",
		onError: (error) => {
			errors.push(error);
			return "default";
		}
	});
	calendar.render();
	await waitFor(() => requests.length === 1, "initial source request");
	calendar.next();
	await waitFor(() => requests.length === 2, "navigated source request");
	requests[1]?.resolve([event("current", "2026-08-14", "Current")]);
	await waitForPhase(calendar, "ready");
	requests[0]?.reject(new Error("late transport failure"));
	await waitFor(() => errors.some((error) => error.stale), "stale diagnostic");
	assert.equal(calendar.getState().phase, "ready");
	assert.equal(findRetryButton(host), undefined);

	calendar.next();
	await waitFor(() => requests.length === 3, "first superseded request");
	calendar.next();
	await waitFor(() => requests.length === 4, "latest source request");
	requests[3]?.resolve([event("latest", "2026-10-14", "Latest")]);
	requests[2]?.reject(new DOMException("Superseded", "AbortError"));
	await waitForPhase(calendar, "ready");
	assert.equal(errors.filter((error) => error.cause instanceof DOMException).length, 0);
});

void test("an AbortError from a current non-aborted source is treated as a load failure", async (context) => {
	const { host } = setupDom(context);
	let sourceSignal: AbortSignal | undefined;
	let captured: LitefoldCalendarError | undefined;
	const calendar = createCalendar(host, {
		events: ({ signal }) => {
			sourceSignal = signal;
			return Promise.reject(new DOMException("Application cancelled", "AbortError"));
		},
		initialDate: "2026-07-14",
		onError: (error) => {
			captured = error;
		}
	});
	calendar.render();
	await waitFor(() => sourceSignal !== undefined, "current source request");
	assert.ok(sourceSignal);
	assert.equal(sourceSignal.aborted, false);
	await waitFor(() => captured !== undefined, "current AbortError presentation");
	assert.ok(captured);
	assert.equal(captured.code, "event-source-failed");
	assert.equal(calendar.getState().phase, "unavailable");
	assert.equal(host.hasAttribute("aria-busy"), false);
	assert.ok(findRetryButton(host));
});

void test("a failed same-range refresh retains data and a successful Retry recovers", async (context) => {
	const { dom, host } = setupDom(context);
	let requestCount = 0;
	const announcements: { readonly message: string; readonly politeness: "assertive" | "polite" }[] = [];
	const calendar = createCalendar(host, {
		onAnnounce: (announcement) => {
			announcements.push(announcement);
		},
		events: async () => {
			requestCount += 1;
			if (requestCount === 1) {
				return [event("retained", "2026-07-14", "Retained event")];
			}
			if (requestCount === 2) {
				throw new Error("offline secret");
			}
			return [event("recovered", "2026-07-14", "Recovered event")];
		},
		initialDate: "2026-07-14",
		onError: () => "default"
	});
	calendar.render();
	await waitForPhase(calendar, "ready");
	const selected = findDayButton(host, "2026-07-14");
	selected.focus();
	calendar.refetchEvents();
	await waitForPhase(calendar, "degraded");

	assert.match(getAgenda(host).textContent ?? "", /Retained event/);
	assert.equal(dom.window.document.activeElement, findDayButton(host, "2026-07-14"));
	assert.deepEqual(announcements, [{
		message: "Calendar may be out of date. The displayed events may be out of date. Try again.",
		politeness: "polite"
	}]);
	assert.equal(host.querySelector<HTMLElement>("[role='status']")?.textContent, "");
	assert.equal(host.querySelector<HTMLElement>("[role='alert']")?.textContent, "");
	const retry = findRetryButton(host);
	assert.ok(retry);
	retry.focus();
	dispatchClick(dom, retry);
	await waitForPhase(calendar, "ready");
	assert.match(getAgenda(host).textContent ?? "", /Recovered event/);
	assert.doesNotMatch(host.textContent ?? "", /offline secret/);
	assert.equal(findRetryButton(host), undefined);
	assert.equal(dom.window.document.activeElement, findDayButton(host, "2026-07-14"));
	assert.deepEqual(announcements.at(-1), {
		message: "Calendar updated",
		politeness: "polite"
	});
	assert.equal(announcements.length, 2, "Each state change must use one announcement route.");
	assert.equal(host.querySelector<HTMLElement>("[role='status']")?.textContent, "");
	assert.equal(host.querySelector<HTMLElement>("[role='alert']")?.textContent, "");
});

void test("default source errors are persistent, safe, and externally observable", async (context) => {
	const { host } = setupDom(context);
	const rawFailure = new Error("https://private.example/token=secret");
	let captured: LitefoldCalendarError | undefined;
	const calendar = createCalendar(host, {
		events: async () => {
			throw rawFailure;
		},
		initialDate: "2026-07-14",
		onError: (error) => {
			captured = error;
		}
	});
	calendar.render();
	await waitFor(() => captured !== undefined, "source error");
	assert.ok(captured);

	assert.equal(captured.code, "event-source-failed");
	assert.equal(captured.cause, rawFailure);
	assert.equal(captured.recoverable, true);
	assert.match(host.textContent ?? "", new RegExp(escapeRegExp(captured.userMessage)));
	assert.doesNotMatch(host.textContent ?? "", /private\.example|token=secret/);
	const retry = findRetryButton(host);
	assert.ok(retry);
	const visiblePanel = retry.closest<HTMLElement>(".lfc-calendar-status-panel");
	assert.ok(visiblePanel);
	assert.equal(visiblePanel.hidden, false);
	const view = host.ownerDocument.defaultView;
	assert.ok(view);
	assert.notEqual(
		visiblePanel.compareDocumentPosition(getGrid(host)) & view.Node.DOCUMENT_POSITION_FOLLOWING,
		0,
		"Persistent errors must be placed before the grid."
	);
	const assertiveRegion = host.querySelector<HTMLElement>("[role='alert'][aria-live='assertive']");
	assert.ok(assertiveRegion);
	assert.match(assertiveRegion.textContent ?? "", new RegExp(escapeRegExp(captured.userMessage)));
	assert.equal(calendar.getState().phase, "unavailable");
	assert.ok(Object.isFrozen(calendar.getState()));
	assert.ok(Object.isFrozen(calendar.getState().issues));
	assert.ok(calendar.getState().issues.every((issue) => !("cause" in issue)));
});

void test("only the exact handled disposition suppresses package presentation", async (context) => {
	const { host } = setupDom(context);
	let captured: LitefoldCalendarError | undefined;
	const calendar = createCalendar(host, {
		events: () => Promise.reject("<img src=x onerror=alert(1)>"),
		initialDate: "2026-07-14",
		onError: (error) => {
			captured = error;
			return "handled";
		}
	});
	calendar.render();
	await waitFor(() => captured !== undefined, "handled source error");
	assert.ok(captured);

	assert.equal(captured.cause, "<img src=x onerror=alert(1)>");
	assert.equal(findRetryButton(host), undefined);
	assert.doesNotMatch(host.textContent ?? "", new RegExp(escapeRegExp(captured.userMessage)));
	assert.equal(host.querySelector("img"), null);
	assert.doesNotMatch(host.innerHTML, /onerror/);
	assert.equal(calendar.getState().phase, "unavailable");
});

void test("an absent or failing onError hook reaches the global error channel", async (context) => {
	const { host } = setupDom(context);
	const globallyReported: unknown[] = [];
	const originalReportError = Object.getOwnPropertyDescriptor(globalThis, "reportError");
	Object.defineProperty(globalThis, "reportError", {
		configurable: true,
		value: (error: unknown) => {
			globallyReported.push(error);
		}
	});
	context.after(() => {
		if (originalReportError === undefined) {
			Reflect.deleteProperty(globalThis, "reportError");
		} else {
			Object.defineProperty(globalThis, "reportError", originalReportError);
		}
	});

	const calendar = createCalendar(host, {
		events: async () => {
			throw new Error("transport failed");
		},
		initialDate: "2026-07-14"
	});
	calendar.render();
	await waitFor(() => globallyReported.length === 1, "global error report");
	assert.ok(globallyReported[0] instanceof LitefoldCalendarError);
	assert.ok(findRetryButton(host));

	calendar.destroy();
	const second = createCalendar(host, {
		events: async () => {
			throw new Error("source failure");
		},
		initialDate: "2026-07-14",
		onError: () => {
			throw new Error("handler failure");
		}
	});
	second.render();
	await waitFor(() => globallyReported.length === 2, "aggregate global error report");
	const aggregate = globallyReported[1];
	assert.ok(aggregate instanceof AggregateError);
	assert.equal(aggregate.errors.length, 2);
	assert.ok(findRetryButton(host));
});

void test("rejected event actions become visible action errors without unhandled rejections", async (context) => {
	const { dom, host } = setupDom(context);
	let captured: LitefoldCalendarError | undefined;
	const calendar = createCalendar(host, {
		onEventActivate: () => Promise.reject("private action rejection"),
		events: async () => [event("action", "2026-07-14T09:00", "Open details")],
		initialDate: "2026-07-14",
		onError: (error) => {
			captured = error;
		}
	});
	calendar.render();
	await waitForPhase(calendar, "ready");
	const button = [...getAgenda(host).querySelectorAll<HTMLButtonElement>("button")]
		.find((candidate) => candidate.textContent?.includes("Open details"));
	assert.ok(button);
	button.focus();
	dispatchClick(dom, button);
	await waitFor(() => captured?.code === "action-failed", "action failure");
	assert.ok(captured);

	assert.equal(captured.cause, "private action rejection");
	assert.equal(dom.window.document.activeElement, button);
	assert.doesNotMatch(host.textContent ?? "", /private action rejection/);
	const visiblePanel = host.querySelector<HTMLElement>(".lfc-calendar-status-panel:not([hidden])");
	assert.ok(visiblePanel);
	assert.match(visiblePanel.textContent ?? "", new RegExp(escapeRegExp(captured.userMessage)));
	const assertiveRegion = host.querySelector<HTMLElement>("[role='alert'][aria-live='assertive']");
	assert.ok(assertiveRegion);
	assert.match(assertiveRegion.textContent ?? "", new RegExp(escapeRegExp(captured.userMessage)));
	assert.equal(calendar.getState().phase, "degraded");
});

void test("day keyboard navigation moves focus separately from selection", async (context) => {
	const { dom, host } = setupDom(context);
	const selectedDates: string[] = [];
	const calendar = createCalendar(host, {
		onDaySelect: ({ dateString }) => {
			selectedDates.push(dateString);
		},
		events: async () => [],
		firstDay: 0,
		initialDate: "2026-07-14"
	});
	calendar.render();
	await waitForPhase(calendar, "ready");

	const original = findDayButton(host, "2026-07-14");
	original.focus();
	const arrow = dispatchKey(dom, original, "ArrowRight");
	const focused = findDayButton(host, "2026-07-15");
	assert.equal(arrow.defaultPrevented, true);
	assert.equal(dom.window.document.activeElement, focused);
	assert.equal(original.closest("[role='gridcell']")?.getAttribute("aria-selected"), "true");
	assert.equal(focused.closest("[role='gridcell']")?.getAttribute("aria-selected"), "false");
	assert.equal(selectedDates.length, 0);

	const enter = dispatchKey(dom, focused, "Enter");
	assert.equal(enter.defaultPrevented, false, "Native buttons own Enter/Space activation.");
	dispatchClick(dom, focused);
	assert.equal(
		findDayButton(host, "2026-07-15").closest("[role='gridcell']")?.getAttribute("aria-selected"),
		"true"
	);
	assert.deepEqual(selectedDates, ["2026-07-15"]);

	dispatchKey(dom, findDayButton(host, "2026-07-15"), "Home");
	assert.equal(dom.window.document.activeElement, findDayButton(host, "2026-07-12"));
	dispatchKey(dom, findDayButton(host, "2026-07-12"), "End");
	assert.equal(dom.window.document.activeElement, findDayButton(host, "2026-07-18"));
	dispatchKey(dom, findDayButton(host, "2026-07-18"), "PageDown");
	await waitForPhase(calendar, "ready");
	assert.equal(dom.window.document.activeElement, findDayButton(host, "2026-08-18"));
	assert.equal(
		findDayButton(host, "2026-08-18").closest("[role='gridcell']")?.getAttribute("aria-selected"),
		"true"
	);
	assert.equal(getGrid(host).querySelectorAll("[role='gridcell'][aria-selected='true']").length, 1);
	assert.match(getAgenda(host).getAttribute("aria-labelledby") ?? "", /agenda-title/);
	dispatchKey(dom, findDayButton(host, "2026-08-18"), "PageUp", true);
	await waitForPhase(calendar, "ready");
	assert.equal(dom.window.document.activeElement, findDayButton(host, "2025-08-18"));
	assert.equal(
		findDayButton(host, "2025-08-18").closest("[role='gridcell']")?.getAttribute("aria-selected"),
		"true"
	);
	assert.deepEqual(selectedDates, ["2026-07-15"]);
});

interface TestDom {
	readonly dom: ReturnType<typeof createDom>;
	readonly host: HTMLElement;
}

function setupDom(
	context: TestContext,
	markup = '<div id="calendar"></div>',
	hostId = "calendar"
): TestDom {
	const dom = createDom(markup);
	const restore = installDom(dom);
	context.after(restore);
	const host = dom.window.document.querySelector<HTMLElement>(`#${hostId}`);
	assert.ok(host, `Expected #${hostId} to exist.`);
	return { dom, host };
}

function event(
	id: string,
	start: string,
	title: string,
	end?: string
): CalendarEventInput {
	return end === undefined
		? { id, start, title }
		: { end, id, start, title };
}

function getGrid(host: HTMLElement): HTMLElement {
	const grid = host.querySelector<HTMLElement>("[role='grid']");
	assert.ok(grid, "Expected the month grid to exist.");
	return grid;
}

function getAgenda(host: HTMLElement): HTMLElement {
	const agenda = host.querySelector<HTMLElement>("section[aria-labelledby]");
	assert.ok(agenda, "Expected the selected-day agenda to exist.");
	return agenda;
}

function getDayButtons(grid: HTMLElement): readonly HTMLButtonElement[] {
	return [...grid.querySelectorAll<HTMLButtonElement>("[role='gridcell'] > button[data-lfc-date]")];
}

function findDayButton(host: HTMLElement, date: string): HTMLButtonElement {
	const button = getGrid(host).querySelector<HTMLButtonElement>(
		`[role='gridcell'] > button[data-lfc-date='${date}']`
	);
	assert.ok(button, `Expected the ${date} day button to exist.`);
	return button;
}

function findRetryButton(host: HTMLElement): HTMLButtonElement | undefined {
	return [...host.querySelectorAll<HTMLButtonElement>("button")]
		.find((button) => /retry/i.test(button.textContent ?? "") &&
			button.hasAttribute("hidden") === false && button.closest("[hidden]") === null);
}

async function waitForPhase<TMetadata>(
	calendar: Calendar<TMetadata>,
	phase: ReturnType<Calendar["getState"]>["phase"]
): Promise<void> {
	await waitFor(() => calendar.getState().phase === phase, `${phase} calendar state`);
}

function isCalendarError(error: unknown, code: CalendarErrorCode, message?: RegExp): boolean {
	return error instanceof LitefoldCalendarError && error.code === code &&
		(message === undefined || message.test(error.message));
}

function escapeRegExp(value: string): string {
	return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}
