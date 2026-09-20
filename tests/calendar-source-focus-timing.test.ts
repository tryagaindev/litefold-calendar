import assert from "node:assert/strict";
import test from "node:test";

import { createCalendar, type Calendar, type CalendarEventInput, type CalendarState } from "../src/index.js";
import { createDom, dispatchClick, getHost, installDom, waitFor } from "./helpers/dom.js";
import { createRegisteredExtensionProbe } from "./helpers/registered-extensions.js";

const EVENTS: readonly CalendarEventInput[] = ["2026-07-15", "2026-08-01"].flatMap((start) =>
	[0, 1].map((id) => ({ id: `${start}-${String(id)}`, start, title: "An occurrence" }))
);

function stateLabel(state: Readonly<CalendarState>): string {
	const { year, month, day } = state.selectedDate;
	return `${state.phase}:${String(year)}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
}

for (const extensions of [false, true]) {
	void test(`a superseding source releases publication while the old provider is on the stack (extensions: ${String(extensions)})`, (context) => {
		const dom = createDom();
		context.after(installDom(dom));
		const host = getHost(dom);
		const states: string[] = [];
		let calls = 0;
		const calendar: Calendar = createCalendar(host, {
			initialDate: "2026-07-14",
			...(extensions ? { extensions: [createRegisteredExtensionProbe({ id: "superseding-source" })] } : {}),
			events: () => {
				calls += 1;
				if (calls === 2) {
					calendar.setEvents(EVENTS);
					calendar.focusDate("2026-08-02");
				}
				return EVENTS;
			},
			onStateChange: (state) => { states.push(stateLabel(state)); }
		});
		context.after(() => { calendar.destroy(); });
		calendar.render();
		states.length = 0;
		calendar.gotoDate("2026-08-01");
		assert.deepEqual(states, ["ready:2026-08-01", "ready:2026-08-02"]);
		assert.equal(stateLabel(calendar.getState()), "ready:2026-08-02");
		assert.equal(host.querySelector('[aria-selected="true"] .lfc-calendar-day-button')?.getAttribute("data-lfc-date"), "2026-08-02");
	});
	for (const boundary of ["then-getter", "then-call"] as const) {
		void test(`${boundary} focus reentry preserves source timing (extensions: ${String(extensions)})`, async (context) => {
			const dom = createDom();
			context.after(installDom(dom));
			const states: string[] = [];
			let observedDuringSource: readonly string[] = [];
			let calls = 0;
			const reenter = (): void => {
				calendar.focusDate("2026-08-01");
				observedDuringSource = [...states];
			};
			const calendar: Calendar = createCalendar(getHost(dom), {
				initialDate: "2026-07-14",
				...(extensions ? { extensions: [createRegisteredExtensionProbe({ id: "thenable-focus" })] } : {}),
				events: () => {
					calls += 1;
					if (calls === 1) { return EVENTS; }
					const pending = observeThen(EVENTS, () => { if (boundary === "then-call") { reenter(); } });
					return { get then() {
						if (boundary === "then-getter") { reenter(); }
						return pending.then.bind(pending);
					} };
				},
				onStateChange: (state) => { states.push(stateLabel(state)); }
			});
			context.after(() => { calendar.destroy(); });
			calendar.render();
			states.length = 0;
			calendar.gotoDate("2026-08-01");
			assert.equal(calls, 2);
			assert.deepEqual(observedDuringSource, []);
			assert.deepEqual(states, ["loading:2026-08-01"]);
			await waitFor(() => calendar.getState().phase === "ready", "thenable terminal state");
			assert.deepEqual(states, ["loading:2026-08-01", "ready:2026-08-01"]);
		});
	}
}

function observeThen<T>(value: T, observe: () => void): PromiseLike<T> {
	return { then: (onfulfilled, onrejected) => {
		observe();
		return Promise.resolve(value).then(onfulfilled, onrejected);
	} };
}

for (const extensions of [false, true]) {
	for (const detached of [false, true]) {
		for (const navigation of ["focusDate", "focusToday"] as const) {
			for (const operation of ["range", "refresh"] as const) {
				for (const result of ["array", "promise", "thenable", "throw"] as const) {
					void test(`${operation} ${result} source ${navigation} preserves timing (extensions: ${String(extensions)}, detached: ${String(detached)})`, async (context) => {
						const dom = createDom();
						context.after(installDom(dom));
						const host = getHost(dom);
						const target = operation === "range" ? "2026-08-01" : "2026-07-15";
						const states: string[] = [];
						let observedDuringSource: readonly string[] = [];
						let requests = 0;
						let completions = 0;
						let mounts = 0;
						let mountsDuringSource = 0;
						const errors: string[] = [];
						const calendar: Calendar = createCalendar(host, {
							initialDate: "2026-07-14",
							now: () => new Date(`${target}T12:00:00Z`),
							...(extensions ? { extensions: [createRegisteredExtensionProbe({ id: "source-focus" })] } : {}),
							events: () => {
								requests += 1;
								if (requests === 1) { return EVENTS; }
								if (detached) { host.remove(); }
								if (navigation === "focusDate") { calendar.focusDate(target); }
								else { calendar.focusToday(); }
								observedDuringSource = [...states];
								mountsDuringSource = mounts;
								if (result === "throw") { throw new Error("Source failed synchronously"); }
								if (result === "promise") { return Promise.resolve(EVENTS); }
								if (result === "thenable") {
									const pending = Promise.resolve(EVENTS);
									return { then: pending.then.bind(pending) };
								}
								return EVENTS;
							},
							onStateChange: (state) => { states.push(stateLabel(state)); },
							renderHooks: [{ id: "source-render-count", dayDidMount: () => { mounts += 1; } }],
							onError: (error) => { errors.push(error.code); return "handled"; },
							onEventOverflowActivate: () => { if (operation === "refresh") { calendar.refetchEvents(); } },
							onEventOverflowDefault: () => { completions += 1; }
						});
						context.after(() => { calendar.destroy(); });
						calendar.render();
						states.length = 0;
						mounts = 0;
						const action = host.querySelector<HTMLButtonElement>(`.lfc-calendar-grid-more[data-lfc-date='${target}']`);
						assert.ok(action);
						dispatchClick(dom, action);
						assert.equal(requests, 2);
						assert.deepEqual(observedDuringSource, [], "Source classification owns selection-state publication.");
						assert.equal(mountsDuringSource, 42, "Explicit focus navigation performs its own full render.");
						const asynchronous = result === "promise" || result === "thenable";
						const terminal = result === "throw" ? operation === "refresh" ? "degraded" : "unavailable" : "ready";
						assert.deepEqual(states, [`${asynchronous ? "loading" : terminal}:${target}`]);
						assert.equal(host.hasAttribute("aria-busy"), asynchronous);
						if (asynchronous) {
							await waitFor(() => calendar.getState().phase === "ready", "source terminal state");
							assert.deepEqual(states, [`loading:${target}`, `ready:${target}`]);
						}
						assert.equal(stateLabel(calendar.getState()), `${terminal}:${target}`);
						assert.equal(mounts, 42 * (asynchronous ? 3 : 2), "The source adds one direct or two asynchronous renders.");
						assert.equal(host.hasAttribute("aria-busy"), false);
						assert.equal(host.isConnected, !detached);
						assert.equal(host.querySelectorAll('[role="gridcell"]').length, 42);
						assert.equal(host.querySelector('[aria-selected="true"] .lfc-calendar-day-button')?.getAttribute("data-lfc-date"), target);
						assert.equal(completions, 0, "Provider focus reentry supersedes the initiating overflow completion.");
						assert.deepEqual(errors, result === "throw" ? ["event-source-failed"] : []);
						if (operation === "refresh") { assert.match(host.textContent ?? "", /An occurrence/u); }
						const next = operation === "range" ? "2026-08-02" : "2026-07-16";
						calendar.focusDate(next);
						assert.equal(states.at(-1), `${terminal}:${next}`, "Source evaluation releases state publication after return or throw.");
						assert.equal(stateLabel(calendar.getState()), `${terminal}:${next}`);
					});
				}
			}
		}
	}
}
