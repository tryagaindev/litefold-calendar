import assert from "node:assert/strict";
import test, { type TestContext } from "node:test";

import {
	createCalendar,
	type Calendar,
	type CalendarErrorCode,
	type CalendarEventInput,
	LitefoldCalendarError
} from "../src/index.js";
import {
	createDom,
	deferred,
	dispatchClick,
	installDom,
	waitFor
} from "./helpers/dom.js";

void test("setEvents checks lifecycle before hardened argument validation", async (context) => {
	const { host } = setupDom(context);
	const observedErrors: LitefoldCalendarError[] = [];
	let providerCalls = 0;
	const calendar = createCalendar(host, {
		events: () => {
			providerCalls += 1;
			return [event("initial", "Initial event")];
		},
		initialDate: "2026-08-06",
		onError: (error) => {
			observedErrors.push(error);
			return "handled";
		}
	});
	let inspections = 0;
	const hostile = new Proxy<CalendarEventInput[]>([], {
		get: () => {
			inspections += 1;
			throw new Error("hostile input was inspected");
		}
	});
	assert.throws(
		() => { calendar.setEvents(hostile); },
		(errorValue: unknown) => isCalendarError(errorValue, "invalid-state", "setEvents")
	);
	assert.equal(inspections, 0);

	calendar.render();
	await waitForReady(calendar);
	const originalState = calendar.getState();
	const originalText = host.textContent;
	for (const invalid of [
		null,
		{},
		hostile,
		revokedArrayProxy()
	]) {
		assert.throws(
			() => { calendar.setEvents(invalid as never); },
			(errorValue: unknown) => isCalendarError(errorValue, "invalid-argument", "setEvents")
		);
	}
	assert.equal(inspections, 1);
	assert.equal(calendar.getState(), originalState);
	assert.equal(host.textContent, originalText);
	assert.equal(providerCalls, 1);
	assert.deepEqual(observedErrors, []);

	const pending = deferred<readonly CalendarEventInput[]>();
	let pendingCalls = 0;
	let pendingSignal: AbortSignal | undefined;
	calendar.setEvents(({ signal }) => {
		pendingCalls += 1;
		pendingSignal = signal;
		return pending.promise;
	});
	const acceptedSignal = pendingSignal;
	assert.ok(acceptedSignal);
	assert.throws(
		() => { calendar.setEvents(hostile); },
		(errorValue: unknown) => isCalendarError(errorValue, "invalid-argument", "setEvents")
	);
	assert.equal(pendingSignal, acceptedSignal);
	assert.equal(acceptedSignal.aborted, false);
	assert.equal(pendingCalls, 1);
	assert.deepEqual(observedErrors, []);
	pending.resolve([event("pending", "Pending provider event")]);
	await waitForReady(calendar);
	assert.match(host.textContent ?? "", /Pending provider event/u);

	calendar.refetchEvents();
	await waitForReady(calendar);
	assert.equal(pendingCalls, 2, "Invalid replacements must leave the accepted provider current.");
	calendar.destroy();
	assert.throws(
		() => { calendar.setEvents(hostile); },
		(errorValue: unknown) => isCalendarError(errorValue, "invalid-state", "setEvents")
	);
	assert.equal(inspections, 2);
});

void test("an accepted invalid payload remains current while retained data stays usable", async (context) => {
	const { host } = setupDom(context);
	const observedErrors: LitefoldCalendarError[] = [];
	let invalidCalls = 0;
	const calendar = createCalendar(host, {
		events: [event("retained", "Retained event")],
		initialDate: "2026-08-06",
		onError: (error) => {
			observedErrors.push(error);
			return "handled";
		}
	});
	calendar.render();
	await waitForReady(calendar);

	calendar.setEvents(() => {
		invalidCalls += 1;
		return [{ id: "invalid", start: "not-a-date", title: "Invalid event" }];
	});
	await waitForPhase(calendar, "degraded");
	assert.match(host.textContent ?? "", /Retained event/u);
	assert.doesNotMatch(host.textContent ?? "", /Invalid event/u);
	assert.equal(observedErrors.at(-1)?.code, "event-data-invalid");

	calendar.refetchEvents();
	await waitFor(() => invalidCalls === 2, "the accepted invalid provider to be retried");
	await waitForPhase(calendar, "degraded");
	assert.match(host.textContent ?? "", /Retained event/u);
	calendar.setEvents([event("recovered", "Recovered event")]);
	await waitForReady(calendar);
	assert.match(host.textContent ?? "", /Recovered event/u);
	assert.doesNotMatch(host.textContent ?? "", /Retained event/u);
});

void test("setEvents aborts stale sources and refetches the latest accepted provider", async (context) => {
	const { host } = setupDom(context);
	const observedErrors: LitefoldCalendarError[] = [];
	const first = deferred<readonly CalendarEventInput[]>();
	const staleFailure = deferred<readonly CalendarEventInput[]>();
	const latest = deferred<readonly CalendarEventInput[]>();
	let firstSignal: AbortSignal | undefined;
	let failureSignal: AbortSignal | undefined;
	let latestCalls = 0;
	const calendar = createCalendar(host, {
		events: [event("initial", "Initial event")],
		initialDate: "2026-08-06",
		onError: (error) => {
			observedErrors.push(error);
			return "handled";
		}
	});
	calendar.render();
	await waitForReady(calendar);

	calendar.setEvents(({ signal }) => {
		firstSignal = signal;
		return first.promise;
	});
	assert.ok(firstSignal);
	calendar.setEvents(({ signal }) => {
		failureSignal = signal;
		return staleFailure.promise;
	});
	assert.equal(firstSignal.aborted, true);
	assert.ok(failureSignal);
	calendar.setEvents(() => {
		latestCalls += 1;
		return latestCalls === 1
			? latest.promise
			: [event("refetched", "Latest provider refetched")];
	});
	assert.equal(failureSignal.aborted, true);
	latest.resolve([event("latest", "Latest replacement")]);
	await waitForReady(calendar);
	first.resolve([event("stale-success", "Stale success")]);
	staleFailure.reject(new Error("stale transport failure"));
	await waitFor(() => observedErrors.some((error) => error.stale), "a stale failure diagnostic");
	assert.equal(calendar.getState().phase, "ready");
	assert.match(host.textContent ?? "", /Latest replacement/u);
	assert.doesNotMatch(host.textContent ?? "", /Stale success/u);

	calendar.refetchEvents();
	await waitForReady(calendar);
	assert.equal(latestCalls, 2);
	assert.match(host.textContent ?? "", /Latest provider refetched/u);
});

void test("setEvents snapshots a static array before accepting it", async (context) => {
	const { host } = setupDom(context);
	const initialRecord = {
		id: "initial-snapshot",
		start: "2026-08-06",
		title: "Initial snapshotted event"
	};
	const calendar = createCalendar(host, {
		events: [initialRecord],
		initialDate: "2026-08-06"
	});
	initialRecord.start = "invalid-after-construction";
	initialRecord.title = "Initial caller mutation";
	calendar.render();
	await waitForReady(calendar);
	assert.match(host.textContent ?? "", /Initial snapshotted event/u);
	assert.doesNotMatch(host.textContent ?? "", /Initial caller mutation/u);

	const mutableRecord = {
		id: "snapshot",
		start: "2026-08-06",
		title: "Snapshotted event"
	};
	const mutableEvents: CalendarEventInput[] = [mutableRecord];
	calendar.setEvents(mutableEvents);
	mutableEvents.splice(0, 1, event("mutated", "Caller mutation"));
	mutableRecord.start = "invalid-after-replacement";
	mutableRecord.title = "Caller record mutation";
	await waitForReady(calendar);
	assert.match(host.textContent ?? "", /Snapshotted event/u);
	assert.doesNotMatch(host.textContent ?? "", /Caller mutation/u);
	assert.doesNotMatch(host.textContent ?? "", /Caller record mutation/u);

	calendar.refetchEvents();
	await waitForReady(calendar);
	assert.match(host.textContent ?? "", /Snapshotted event/u);
	assert.doesNotMatch(host.textContent ?? "", /Caller mutation/u);
	assert.doesNotMatch(host.textContent ?? "", /Caller record mutation/u);
});

void test("same-range date navigation does not refetch or collapse an unchanged agenda", async (context) => {
	const { dom, host } = setupDom(context);
	let providerCalls = 0;
	const calendar = createCalendar(host, {
		agendaPageSize: 10,
		events: () => {
			providerCalls += 1;
			return agendaEvents(12);
		},
		initialDate: "2026-08-06",
		now: () => new Date("2026-08-07T12:00:00Z"),
		timeZone: "UTC"
	});
	calendar.render();
	await waitForReady(calendar);
	assert.equal(providerCalls, 1);

	const more = requireElement(host, ".lfc-calendar-agenda-more", dom.window.HTMLButtonElement);
	dispatchClick(dom, more);
	assert.equal(renderedAgendaEvents(host).length, 12);

	calendar.gotoDate("2026-08-06");
	assert.equal(providerCalls, 1);
	assert.equal(renderedAgendaEvents(host).length, 12, "An idempotent gotoDate must preserve disclosure.");

	calendar.gotoDate("2026-08-07");
	assert.equal(providerCalls, 1);
	assert.deepEqual(calendar.getState().selectedDate, { day: 7, month: 8, year: 2026 });
	calendar.today();
	assert.equal(providerCalls, 1);
	assert.deepEqual(calendar.getState().selectedDate, { day: 7, month: 8, year: 2026 });

	calendar.gotoDate("2026-09-07");
	await waitForReady(calendar);
	assert.equal(providerCalls, 2, "A visible-range transition must request its new snapshot.");
});

void test("reentrant validation and callbacks keep the last accepted replacement", async (context) => {
	const { host } = setupDom(context);
	const calendarReference: { current: Calendar | null } = { current: null };
	let armStateReplacement = false;
	let replaceFromState = false;
	let replaceFromError = false;
	let outerProviderCalls = 0;
	const calendar = createCalendar(host, {
		events: [event("initial", "Initial event")],
		initialDate: "2026-08-06",
		onError: (error) => {
			if (replaceFromError && error.code === "event-data-invalid") {
				replaceFromError = false;
				calendarReference.current?.setEvents([
					event("error-recovery", "Error callback replacement")
				]);
			}
			return "handled";
		},
		onStateChange: (state) => {
			if (armStateReplacement && !replaceFromState && state.phase === "loading") {
				replaceFromState = true;
				calendarReference.current?.setEvents([
					event("state-replacement", "State callback replacement")
				]);
			}
		}
	});
	calendarReference.current = calendar;
	calendar.render();
	await waitForReady(calendar);

	let replacedFromGetter = false;
	const staleOuter = [event("stale-outer", "Stale outer replacement")];
	Object.defineProperty(staleOuter, 0, {
		configurable: true,
		get: () => {
			if (!replacedFromGetter) {
				replacedFromGetter = true;
				calendar.setEvents([event("getter-replacement", "Getter replacement")]);
			}
			return event("stale-outer", "Stale outer replacement");
		}
	});
	calendar.setEvents(staleOuter);
	await waitForReady(calendar);
	assert.match(host.textContent ?? "", /Getter replacement/u);
	assert.doesNotMatch(host.textContent ?? "", /Stale outer replacement/u);

	let rejectedFromGetter = false;
	const validOuter = [event("valid-outer", "Valid outer replacement")];
	Object.defineProperty(validOuter, 0, {
		configurable: true,
		get: () => {
			if (!rejectedFromGetter) {
				rejectedFromGetter = true;
				assert.throws(
					() => { calendar.setEvents(null as never); },
					(errorValue: unknown) => isCalendarError(errorValue, "invalid-argument", "setEvents")
				);
			}
			return event("valid-outer", "Valid outer replacement");
		}
	});
	calendar.setEvents(validOuter);
	await waitForReady(calendar);
	assert.match(host.textContent ?? "", /Valid outer replacement/u);

	armStateReplacement = true;
	calendar.setEvents(() => {
		outerProviderCalls += 1;
		return Promise.resolve([event("state-outer", "State outer replacement")]);
	});
	await waitForReady(calendar);
	assert.equal(outerProviderCalls, 1, "The provider must run before publishing loading state.");
	assert.match(host.textContent ?? "", /State callback replacement/u);
	assert.doesNotMatch(host.textContent ?? "", /State outer replacement/u);

	replaceFromError = true;
	calendar.setEvents([{ id: "invalid", start: "invalid", title: "Invalid" }]);
	await waitForReady(calendar);
	assert.match(host.textContent ?? "", /Error callback replacement/u);
});

void test("abort-listener reentrancy retains cancellation ownership for the newest request", async (context) => {
	const { host } = setupDom(context);
	const initial = deferred<readonly CalendarEventInput[]>();
	const newest = deferred<readonly CalendarEventInput[]>();
	let initialSignal: AbortSignal | undefined;
	let newestSignal: AbortSignal | undefined;
	let outerProviderCalls = 0;
	const calendarReference: { current: Calendar | null } = { current: null };
	const calendar = createCalendar(host, {
		events: ({ signal }) => {
			initialSignal = signal;
			signal.addEventListener("abort", () => {
				calendarReference.current?.setEvents(({ signal: replacementSignal }) => {
					newestSignal = replacementSignal;
					return newest.promise;
				});
			}, { once: true });
			return initial.promise;
		},
		initialDate: "2026-08-06"
	});
	calendarReference.current = calendar;
	calendar.render();
	assert.ok(initialSignal);

	calendar.setEvents(() => {
		outerProviderCalls += 1;
		return [event("outer", "Outer replacement")];
	});
	assert.equal(initialSignal.aborted, true);
	assert.equal(outerProviderCalls, 0);
	assert.ok(newestSignal);
	assert.equal(newestSignal.aborted, false);

	calendar.setEvents([event("final", "Final replacement")]);
	assert.equal(newestSignal.aborted, true);
	await waitForReady(calendar);
	assert.match(host.textContent ?? "", /Final replacement/u);
	newest.resolve([event("stale-newest", "Stale newest")]);
	initial.resolve([event("stale-initial", "Stale initial")]);
	await Promise.resolve();
	await Promise.resolve();
	assert.doesNotMatch(host.textContent ?? "", /Stale/u);
});

void test("setEvents preserves focus, agenda disclosure, shell identity, and progressive fallback", async (context) => {
	const { dom, host } = setupDom(
		context,
		'<button id="outside" type="button">Outside</button>' +
		'<section id="fallback">Server schedule</section><div id="calendar"></div>'
	);
	const outside = requireElement(dom.window.document, "#outside", dom.window.HTMLButtonElement);
	const fallback = requireElement(dom.window.document, "#fallback", dom.window.HTMLElement);
	const calendar = createCalendar(host, {
		agendaPageSize: 10,
		events: agendaEvents(12),
		fallbackElement: fallback,
		initialDate: "2026-08-06"
	});
	calendar.render();
	await waitForReady(calendar);
	assert.equal(fallback.hidden, true);
	const agendaShell = requireElement(host, ".lfc-calendar-agenda", dom.window.HTMLElement);
	const more = requireElement(host, ".lfc-calendar-agenda-more", dom.window.HTMLButtonElement);
	dispatchClick(dom, more);
	assert.equal(renderedAgendaEvents(host).length, 12);
	findEventAction(host, "grid-summary", "keep").focus();

	const pending = deferred<readonly CalendarEventInput[]>();
	calendar.setEvents(() => pending.promise);
	assert.equal(fallback.hidden, true);
	assert.equal(host.querySelector(".lfc-calendar-agenda"), agendaShell);
	assert.equal(renderedAgendaEvents(host).length, 12);
	pending.resolve(agendaEvents(30));
	await waitForReady(calendar);
	assert.equal(renderedAgendaEvents(host).length, 20);
	assert.ok(host.querySelector(".lfc-calendar-agenda-more"));
	assert.match(host.querySelector(".lfc-calendar-agenda-overflow")?.textContent ?? "", /20 of 30/u);
	assert.equal(dom.window.document.activeElement, findEventAction(host, "grid-summary", "keep"));
	assert.equal(host.querySelector(".lfc-calendar-agenda"), agendaShell);

	findEventAction(host, "agenda", "keep").focus();
	calendar.setEvents(agendaEvents(14));
	await waitForReady(calendar);
	assert.equal(dom.window.document.activeElement, findEventAction(host, "agenda", "keep"));

	calendar.setEvents(agendaEvents(14).filter((candidate) => candidate.id !== "keep"));
	await waitForReady(calendar);
	assert.equal(dom.window.document.activeElement, findDayButton(host, "2026-08-06"));

	outside.focus();
	calendar.setEvents(agendaEvents(11));
	await waitForReady(calendar);
	assert.equal(dom.window.document.activeElement, outside);
	assert.equal(fallback.hidden, true);
	calendar.destroy();
	assert.equal(fallback.hidden, false);
});

void test("recoverable unavailability accepts replacement while fatal unavailability rejects it", async (context) => {
	const { host, dom } = setupDom(
		context,
		'<div id="calendar"></div><div id="fatal-calendar"></div>'
	);
	const recoverable = createCalendar(host, {
		events: () => Promise.reject(new Error("initial source failed")),
		initialDate: "2026-08-06",
		onError: () => "handled"
	});
	recoverable.render();
	await waitForPhase(recoverable, "unavailable");
	recoverable.setEvents([event("recovered", "Recovered from unavailable")]);
	await waitForReady(recoverable);
	assert.match(host.textContent ?? "", /Recovered from unavailable/u);

	const fatalHost = requireElement(dom.window.document, "#fatal-calendar", dom.window.HTMLElement);
	let failClock = false;
	const fatal = createCalendar(fatalHost, {
		events: [],
		initialDate: "2026-08-06",
		now: () => {
			if (failClock) {
				throw new Error("clock failed");
			}
			return new Date("2026-08-06T12:00:00Z");
		},
		onError: () => "handled"
	});
	fatal.render();
	await waitForReady(fatal);
	failClock = true;
	fatal.today();
	assert.equal(fatal.getState().phase, "unavailable");
	let inspections = 0;
	const hostile = new Proxy<CalendarEventInput[]>([], {
		get: () => {
			inspections += 1;
			return 0;
		}
	});
	assert.throws(
		() => { fatal.setEvents(hostile); },
		(errorValue: unknown) => isCalendarError(errorValue, "invalid-state", "setEvents")
	);
	assert.equal(inspections, 0);
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

function event(id: string, title: string): CalendarEventInput {
	return { id, start: "2026-08-06", title };
}

function agendaEvents(count: number): readonly CalendarEventInput[] {
	return Array.from({ length: count }, (_, index) => ({
		id: index === 0 ? "keep" : `event-${index.toString()}`,
		start: `2026-08-06T${(index % 24).toString().padStart(2, "0")}:00`,
		title: index === 0 ? "Keep event" : `Event ${index.toString()}`,
		url: `/events/${index.toString()}`
	}));
}

function renderedAgendaEvents(host: HTMLElement): readonly HTMLElement[] {
	return [...host.querySelectorAll<HTMLElement>(".lfc-calendar-agenda-event")];
}

function findEventAction(
	host: HTMLElement,
	surface: "agenda" | "grid-summary",
	id: string
): HTMLElement {
	const action = host.querySelector<HTMLElement>(
		`[data-lfc-surface='${surface}'][data-lfc-event-id='${id}']`
	);
	assert.ok(action, `Expected ${surface} action ${id}.`);
	return action;
}

function findDayButton(host: HTMLElement, date: string): HTMLButtonElement {
	const button = host.querySelector<HTMLButtonElement>(`button[data-lfc-date='${date}']`);
	assert.ok(button, `Expected day button ${date}.`);
	return button;
}

function requireElement<TElement extends Element>(
	root: ParentNode,
	selector: string,
	constructor: abstract new (...parameters: never[]) => TElement
): TElement {
	const element = root.querySelector(selector);
	assert.ok(element instanceof constructor, `Expected ${selector}.`);
	return element;
}

function revokedArrayProxy(): readonly CalendarEventInput[] {
	const revoked = Proxy.revocable<CalendarEventInput[]>([], {});
	revoked.revoke();
	return revoked.proxy;
}

function isCalendarError(error: unknown, code: CalendarErrorCode, hook: string): boolean {
	return error instanceof LitefoldCalendarError && error.code === code && error.hook === hook;
}

async function waitForReady(calendar: Calendar): Promise<void> {
	await waitForPhase(calendar, "ready");
}

async function waitForPhase(
	calendar: Calendar,
	phase: ReturnType<Calendar["getState"]>["phase"]
): Promise<void> {
	await waitFor(() => calendar.getState().phase === phase, `${phase} calendar state`);
}
