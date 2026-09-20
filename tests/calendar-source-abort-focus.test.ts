import assert from "node:assert/strict";
import test from "node:test";

import { createCalendar, type Calendar, type CalendarEventInput, type CalendarState } from "../src/index.js";
import { createDom, deferred, dispatchClick, getHost, installDom, waitFor } from "./helpers/dom.js";
import { createRegisteredExtensionProbe } from "./helpers/registered-extensions.js";

const EVENTS: readonly CalendarEventInput[] = ["2026-07-15", "2026-08-01"].flatMap((start) =>
	[0, 1].map((id) => ({ id: `${start}-${String(id)}`, start, title: "An occurrence" }))
);

for (const extensions of [false, true]) {
	void test(`a request accepted by an abort listener owns subsequent focus publication (extensions: ${String(extensions)})`, async (context) => {
		const dom = createDom();
		context.after(installDom(dom));
		const states: Readonly<CalendarState>[] = [];
		const pending = deferred<readonly CalendarEventInput[]>();
		let requests = 0;
		const calendar: Calendar = createCalendar(getHost(dom), {
			initialDate: "2026-07-14",
			...(extensions ? { extensions: [createRegisteredExtensionProbe({ id: "abort-replacement" })] } : {}),
			events: ({ signal }) => {
				requests += 1;
				if (requests === 1) { return EVENTS; }
				signal.addEventListener("abort", () => {
					calendar.setEvents(EVENTS);
					calendar.focusDate("2026-08-02");
				}, { once: true });
				return pending.promise;
			},
			onStateChange: (state) => { states.push(state); }
		});
		context.after(() => { calendar.destroy(); });
		calendar.render();
		calendar.refetchEvents();
		states.length = 0;
		calendar.gotoDate("2026-08-01");
		assert.equal(requests, 2, "The interrupted replacement must not invoke the old provider again.");
		assert.deepEqual(states.map(({ phase, selectedDate }) => [phase, selectedDate.day]), [["ready", 1], ["ready", 2]]);
		for (const state of states) { assert.deepEqual(state.range, { start: "2026-07-26", end: "2026-09-06" }); }
		assert.deepEqual(calendar.getState().selectedDate, { year: 2026, month: 8, day: 2 });
		pending.resolve(EVENTS);
		await new Promise<void>((resolve) => { setTimeout(resolve, 0); });
		assert.equal(states.length, 2);
	});
}

for (const extensions of [false, true]) {
	for (const navigation of ["focusDate", "focusToday"] as const) {
		for (const operation of ["range", "refresh"] as const) {
			for (const result of ["array", "promise", "throw"] as const) {
				void test(`abort-listener ${navigation} during ${operation} ${result} replacement preserves coherent state (extensions: ${String(extensions)})`, async (context) => {
					const dom = createDom();
					context.after(installDom(dom));
					const host = getHost(dom);
					const target = operation === "range" ? "2026-08-01" : "2026-07-15";
					const range = operation === "range"
						? { start: "2026-07-26", end: "2026-09-06" }
						: { start: "2026-06-28", end: "2026-08-09" };
					const selectedDate = { year: 2026, month: operation === "range" ? 8 : 7, day: operation === "range" ? 1 : 15 };
					const states: Readonly<CalendarState>[] = [];
					const pending = deferred<readonly CalendarEventInput[]>();
					let duringAbort: readonly Readonly<CalendarState>[] = [];
					let aborted = false;
					let requests = 0;
					let completions = 0;
					let mounts = 0;
					let mountsDuringAbort = 0;
					const calendar: Calendar = createCalendar(host, {
						initialDate: "2026-07-14", now: () => new Date(`${target}T12:00:00Z`),
						...(extensions ? { extensions: [createRegisteredExtensionProbe({ id: "abort-focus" })] } : {}),
						events: ({ signal }) => {
							requests += 1;
							if (requests === 1) { return EVENTS; }
							if (requests === 2) {
								signal.addEventListener("abort", () => {
									aborted = true;
									if (navigation === "focusDate") { calendar.focusDate(target); }
									else { calendar.focusToday(); }
									duringAbort = [...states];
									mountsDuringAbort = mounts;
								}, { once: true });
								return pending.promise;
							}
							if (result === "throw") { throw new Error("Replacement source failed"); }
							return result === "array" ? EVENTS : Promise.resolve(EVENTS);
						},
						onStateChange: (state) => { states.push(state); },
						renderHooks: [{ id: "abort-render-count", dayDidMount: () => { mounts += 1; } }],
						onError: () => "handled",
						onEventOverflowActivate: () => { if (operation === "refresh") { calendar.refetchEvents(); } },
						onEventOverflowDefault: () => { completions += 1; }
					});
					context.after(() => { calendar.destroy(); });
					calendar.render();
					calendar.refetchEvents();
					assert.equal(calendar.getState().phase, "loading");
					states.length = 0;
					mounts = 0;
					const action = host.querySelector<HTMLButtonElement>(`.lfc-calendar-grid-more[data-lfc-date='${target}']`);
					assert.ok(action);
					dispatchClick(dom, action);
					assert.equal(aborted, true);
					assert.equal(requests, 3);
					assert.deepEqual(duringAbort, [], "Aborting the old request must not publish an intermediate snapshot.");
					assert.equal(mountsDuringAbort, 42, "Explicit focus navigation performs its own full render.");
					const terminal = result === "throw" ? operation === "refresh" ? "degraded" : "unavailable" : "ready";
					assert.deepEqual(states.map(({ phase }) => phase), [result === "promise" ? "loading" : terminal]);
					if (result === "promise") {
						await waitFor(() => calendar.getState().phase === "ready", "replacement provider settles");
						assert.deepEqual(states.map(({ phase }) => phase), ["loading", "ready"]);
					}
					for (const state of states) {
						assert.deepEqual(state.selectedDate, selectedDate);
						assert.deepEqual(state.range, range, "Every callback must pair the selection with its owning request range.");
					}
					assert.deepEqual(calendar.getState().selectedDate, selectedDate);
					assert.equal(mounts, 42 * (result === "promise" ? 3 : 2), "The source adds one direct or two asynchronous renders.");
					assert.deepEqual(calendar.getState().range, range);
					assert.equal(host.querySelectorAll('[role="gridcell"]').length, 42);
					assert.equal(host.querySelector('[aria-selected="true"] .lfc-calendar-day-button')?.getAttribute("data-lfc-date"), target);
					assert.equal(completions, 0);
					const stateCount = states.length;
					pending.resolve(EVENTS);
					await new Promise<void>((resolve) => { setTimeout(resolve, 0); });
					assert.equal(states.length, stateCount, "Settlement of the aborted request must stay stale.");
				});
			}
		}
	}
}
