import assert from "node:assert/strict";
import test, { type TestContext } from "node:test";

import {
	createCalendar,
	type Calendar,
	type CalendarEventContextMenu,
	type CalendarEventInput
} from "../src/index.js";
import { createDom, installDom, waitFor } from "./helpers/dom.js";

void test("cleanup reentrancy preserves the newest extension signal until destroy", async (context) => {
	const { dom, host } = setupDom(context);
	const PROBE_EVENT = "lfc-cleanup-reentrancy-probe";
	const signals: AbortSignal[] = [];
	const calendarReference: { current: Calendar | null } = { current: null };
	let cleanups = 0;
	let probeCalls = 0;
	let redirected = false;
	const handleProbe = (): void => { probeCalls += 1; };
	const calendar = createCalendar(host, {
		events: [
			event("cleanup-first", "2026-07-14T09:00", "Cleanup first"),
			event("cleanup-newest", "2026-07-15T09:00", "Cleanup newest")
		],
		extensions: [{
			eventDidMount: ({ document: ownerDocument, event: mountedEvent, signal, surface }) => {
				if (surface !== "agenda") {
					return;
				}
				signals.push(signal);
				ownerDocument.addEventListener(PROBE_EVENT, handleProbe, { signal });
				return () => {
					cleanups += 1;
					if (!redirected && mountedEvent.id === "cleanup-first") {
						redirected = true;
						calendarReference.current?.focusDate("2026-07-15");
					}
				};
			},
			id: "cleanup-reentrancy"
		}],
		initialDate: "2026-07-14"
	});
	calendarReference.current = calendar;
	calendar.render();
	await waitForPhase(calendar, "ready");

	calendar.focusDate("2026-07-14");
	assert.equal(redirected, true);
	assert.deepEqual(calendar.getState().selectedDate, { day: 15, month: 7, year: 2026 });
	assert.equal(signals.length, 2);
	assert.equal(signals[0]?.aborted, true);
	assert.equal(signals[1]?.aborted, false);
	dom.window.document.dispatchEvent(new dom.window.Event(PROBE_EVENT));
	assert.equal(probeCalls, 1);

	calendar.destroy();
	assert.ok(signals.every((signal) => signal.aborted));
	assert.equal(cleanups, 2);
	assert.equal(host.childElementCount, 0);
	dom.window.document.dispatchEvent(new dom.window.Event(PROBE_EVENT));
	assert.equal(probeCalls, 1);
});

void test("cleanup reentrancy drains the old batch once without cleaning the newest generation", async (context) => {
	const { host } = setupDom(context);
	const cleanupOrder: string[] = [];
	const signals = new Map<string, AbortSignal>();
	const calendarReference: { current: Calendar | null } = { current: null };
	let redirected = false;
	const calendar = createCalendar(host, {
		events: [
			event("batch-first", "2026-07-14T09:00", "Batch first"),
			event("batch-second", "2026-07-14T10:00", "Batch second"),
			event("batch-newest", "2026-07-15T09:00", "Batch newest")
		],
		extensions: [{
			eventDidMount: ({ event: mountedEvent, signal, surface }) => {
				if (surface !== "agenda") {
					return;
				}
				signals.set(mountedEvent.id, signal);
				return () => {
					cleanupOrder.push(mountedEvent.id);
					if (!redirected && mountedEvent.id === "batch-first") {
						redirected = true;
						calendarReference.current?.focusDate("2026-07-15");
					}
				};
			},
			id: "cleanup-batch-reentrancy"
		}],
		initialDate: "2026-07-14"
	});
	calendarReference.current = calendar;
	calendar.render();
	await waitForPhase(calendar, "ready");

	calendar.focusDate("2026-07-14");
	assert.deepEqual(cleanupOrder, ["batch-first", "batch-second"]);
	assert.deepEqual(calendar.getState().selectedDate, { day: 15, month: 7, year: 2026 });
	assert.equal(signals.get("batch-first")?.aborted, true);
	assert.equal(signals.get("batch-second")?.aborted, true);
	assert.equal(signals.get("batch-newest")?.aborted, false);

	calendar.destroy();
	assert.deepEqual(cleanupOrder, ["batch-first", "batch-second", "batch-newest"]);
	assert.ok([...signals.values()].every((signal) => signal.aborted));
	assert.equal(host.childElementCount, 0);
});

void test("abort-listener reentrancy preserves the newest extension signal until destroy", async (context) => {
	const { dom, host } = setupDom(context);
	const PROBE_EVENT = "lfc-abort-reentrancy-probe";
	const signals: AbortSignal[] = [];
	const calendarReference: { current: Calendar | null } = { current: null };
	let cleanups = 0;
	let probeCalls = 0;
	let redirected = false;
	const handleProbe = (): void => { probeCalls += 1; };
	const calendar = createCalendar(host, {
		events: [
			event("abort-first", "2026-07-14T09:00", "Abort first"),
			event("abort-newest", "2026-07-15T09:00", "Abort newest")
		],
		extensions: [{
			eventDidMount: ({ document: ownerDocument, event: mountedEvent, signal, surface }) => {
				if (surface !== "agenda") {
					return;
				}
				signals.push(signal);
				ownerDocument.addEventListener(PROBE_EVENT, handleProbe, { signal });
				if (mountedEvent.id === "abort-first") {
					signal.addEventListener("abort", () => {
						if (!redirected) {
							redirected = true;
							calendarReference.current?.focusDate("2026-07-15");
						}
					}, { once: true });
				}
				return () => { cleanups += 1; };
			},
			id: "abort-reentrancy"
		}],
		initialDate: "2026-07-14"
	});
	calendarReference.current = calendar;
	calendar.render();
	await waitForPhase(calendar, "ready");

	calendar.focusDate("2026-07-14");
	assert.equal(redirected, true);
	assert.deepEqual(calendar.getState().selectedDate, { day: 15, month: 7, year: 2026 });
	assert.equal(signals.length, 2);
	assert.equal(signals[0]?.aborted, true);
	assert.equal(signals[1]?.aborted, false);
	dom.window.document.dispatchEvent(new dom.window.Event(PROBE_EVENT));
	assert.equal(probeCalls, 1);

	calendar.destroy();
	assert.ok(signals.every((signal) => signal.aborted));
	assert.equal(cleanups, 2);
	assert.equal(host.childElementCount, 0);
	dom.window.document.dispatchEvent(new dom.window.Event(PROBE_EVENT));
	assert.equal(probeCalls, 1);
});

void test("context-menu-only events expose native primary buttons on both surfaces", async (context) => {
	const { dom, host } = setupDom(context);
	const contexts: Readonly<CalendarEventContextMenu>[] = [];
	const calendar = createCalendar(host, {
		events: [event("context-only", "2026-07-14T09:00", "Context only")],
		initialDate: "2026-07-14",
		onEventContextMenu: (contextValue) => { contexts.push(contextValue); }
	});
	calendar.render();
	await waitForPhase(calendar, "ready");
	const gridButton = host.querySelector<HTMLButtonElement>("button.lfc-calendar-event-summary");
	const agendaButton = host.querySelector<HTMLButtonElement>("button.lfc-calendar-agenda-event");
	assert.ok(gridButton);
	assert.ok(agendaButton);
	assert.equal(gridButton.hasAttribute("aria-label"), true);
	assert.equal(agendaButton.hasAttribute("aria-label"), false);
	const gridClick = new dom.window.MouseEvent("click", {
		bubbles: true, cancelable: true, clientX: 12, clientY: 34
	});
	const agendaClick = new dom.window.MouseEvent("click", {
		bubbles: true, cancelable: true, clientX: 56, clientY: 78
	});
	gridButton.dispatchEvent(gridClick);
	agendaButton.dispatchEvent(agendaClick);
	assert.deepEqual(contexts.map(({ clientX, clientY, nativeEvent, surface }) => ({
		clientX, clientY, nativeEvent, surface
	})), [
		{ clientX: 12, clientY: 34, nativeEvent: gridClick, surface: "grid-summary" },
		{ clientX: 56, clientY: 78, nativeEvent: agendaClick, surface: "agenda" }
	]);
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

function event(id: string, start: string, title: string): CalendarEventInput {
	return { id, start, title };
}

async function waitForPhase(
	calendar: Calendar,
	phase: ReturnType<Calendar["getState"]>["phase"]
): Promise<void> {
	await waitFor(() => calendar.getState().phase === phase, `${phase} calendar state`);
}
