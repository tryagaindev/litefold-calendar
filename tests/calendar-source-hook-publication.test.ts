import assert from "node:assert/strict";
import test from "node:test";

import { createCalendar, type Calendar, type CalendarEventInput, type CalendarState } from "../src/index.js";
import { createDom, deferred, installDom, waitFor } from "./helpers/dom.js";
import { createRegisteredExtensionProbe, flushRegisteredExtensionTasks } from "./helpers/registered-extensions.js";

const EVENTS: readonly CalendarEventInput[] = [{ id: "one", start: "2026-08-01", title: "An occurrence" }];
const JULY_RANGE = { start: "2026-06-28", end: "2026-08-09" };
const AUGUST_RANGE = { start: "2026-07-26", end: "2026-09-06" };

for (const action of ["replace", "destroy"]) {
	for (const settlement of ["resolve", "reject"]) {
		void test(`superseded hook-failed request cannot publish after ${action} and late ${settlement}`, async (context) => {
			const dom = createDom();
			context.after(installDom(dom));
			const host = dom.window.document.createElement("div");
			dom.window.document.body.append(host);
			const pending = deferred<readonly CalendarEventInput[]>();
			const states: Readonly<CalendarState>[] = [];
			const extensionStates: Readonly<CalendarState>[] = [];
			let calls = 0;
			let armed = false;
			const calendar: Calendar = createCalendar(host, {
				initialDate: "2026-07-14",
				extensions: [createRegisteredExtensionProbe({ id: "late-hook-source", capabilities: ["state"],
					activate: ({ state }) => ({ stateChanged: () => { assert.ok(state); extensionStates.push(state.getState()); } }) })],
				events: () => {
					calls += 1;
					if (calls === 1) { return EVENTS; }
					calendar.focusDate("2026-08-01");
					return pending.promise;
				},
				renderHooks: [{ id: "failing-hook", dayDidMount: () => { if (armed) { throw new Error("Hook failed"); } } }],
				onError: () => "handled", onStateChange: (state) => { states.push(state); }
			});
			context.after(() => { calendar.destroy(); });
			calendar.render();
			await flushRegisteredExtensionTasks();
			armed = true;
			calendar.gotoDate("2026-08-01");
			await flushRegisteredExtensionTasks();
			assert.equal(calendar.getState().phase, "loading");
			assert.equal(calendar.getState().issues[0]?.code, "render-hook-failed");
			if (action === "replace") { calendar.setEvents([]); }
			else { calendar.destroy(); }
			await flushRegisteredExtensionTasks();
			const state = calendar.getState();
			const count = states.length;
			const extensionCount = extensionStates.length;
			assert.equal(state.phase, action === "replace" ? "degraded" : "destroyed");
			if (settlement === "resolve") { pending.resolve(EVENTS); }
			else { pending.reject(new Error("Stale source rejected")); }
			await flushRegisteredExtensionTasks();
			assert.equal(calendar.getState(), state);
			assert.equal(states.length, count);
			assert.equal(extensionStates.length, extensionCount);
			assert.equal(host.hasAttribute("aria-busy"), false);
			assert.equal(host.querySelectorAll('[role="gridcell"]').length, action === "replace" ? 42 : 0);
		});
	}
}

for (const extensions of [false, true]) {
	for (const boundary of ["abort", "provider"]) {
		for (const action of ["focus", "replace", "destroy"]) {
			void test(`onError ${action} during ${boundary} preserves ownership (extensions: ${String(extensions)})`, (context) => {
				const dom = createDom();
				context.after(installDom(dom));
				const host = dom.window.document.createElement("div");
				dom.window.document.body.append(host);
				const states: Readonly<CalendarState>[] = [];
				const errors: string[] = [];
				let armed = false;
				let calls = 0;
				const reenter = (): void => { calendar.focusDate("2026-08-01"); };
				const calendar: Calendar = createCalendar(host, {
					initialDate: "2026-07-14",
					...(extensions ? { extensions: [createRegisteredExtensionProbe({ id: "source-error-navigation" })] } : {}),
					events: ({ signal }) => {
						calls += 1;
						if (calls === 1) { return EVENTS; }
						if (boundary === "abort" && calls === 2) {
							signal.addEventListener("abort", reenter, { once: true });
							return deferred<readonly CalendarEventInput[]>().promise;
						}
						if (boundary === "provider") { reenter(); }
						return EVENTS;
					},
					renderHooks: [{ id: "failing-hook", renderDayBadge: () => { if (armed) { throw new Error("Hook failed"); } } }],
					onError: (error) => {
						errors.push(error.code);
						if (action === "destroy") { calendar.destroy(); }
						else {
							calendar.focusDate("2026-08-02");
							if (action === "replace") { calendar.setEvents(EVENTS); }
						}
						return "handled";
					},
					onStateChange: (state) => { states.push(state); }
				});
				context.after(() => { calendar.destroy(); });
				calendar.render();
				if (boundary === "abort") { calendar.refetchEvents(); }
				states.length = 0;
				armed = true;
				calendar.gotoDate("2026-08-01");
				assert.deepEqual(errors, ["render-hook-failed"]);
				assert.deepEqual(states.map(({ phase }) => phase), [action === "destroy" ? "destroyed" : action === "replace" ? "ready" : "degraded"]);
				assert.deepEqual(calendar.getState().range, action === "destroy" ? null : AUGUST_RANGE);
				assert.equal(calendar.getState().issues.length, action === "focus" ? 1 : 0);
				if (action !== "destroy") {
					assert.deepEqual(calendar.getState().selectedDate, { year: 2026, month: 8, day: 2 });
					assert.equal(host.querySelector('[aria-selected="true"] .lfc-calendar-day-button')?.getAttribute("data-lfc-date"), "2026-08-02");
				}
			});
		}
	}
}

for (const hook of ["renderDayBadge", "dayDidMount"] as const) {
	void test(`${hook} errors outside a source reservation publish immediately`, (context) => {
		const dom = createDom();
		context.after(installDom(dom));
		const host = dom.window.document.createElement("div");
		const states: Readonly<CalendarState>[] = [];
		let armed = false;
		const calendar = createCalendar(host, {
			initialDate: "2026-07-14", events: EVENTS, onError: () => "handled",
			renderHooks: [{ id: "outside-source-hook", [hook]: () => { if (armed) { throw new Error("Hook failed"); } } }],
			onStateChange: (state) => { states.push(state); }
		});
		context.after(() => { calendar.destroy(); });
		calendar.render();
		states.length = 0;
		armed = true;
		calendar.focusDate("2026-07-15");
		assert.deepEqual(states.map(({ phase }) => phase), ["degraded"]);
		assert.deepEqual(states[0]?.range, JULY_RANGE);
		assert.deepEqual(states[0]?.selectedDate, { year: 2026, month: 7, day: 15 });
		assert.equal(states[0]?.issues[0]?.code, "render-hook-failed");
	});
}

for (const extensions of [false, true]) {
	for (const hook of ["renderDayBadge", "dayDidMount", "dayCleanup"] as const) {
		for (const boundary of ["abort", "provider", "busy-loading", "busy-terminal"] as const) {
			for (const result of ["array", "promise", "throw", "reject"] as const) {
				if (boundary === "busy-loading" && (result === "array" || result === "throw")) { continue; }
				void test(`${hook} failure during ${boundary} focus joins ${result} source publication (extensions: ${String(extensions)})`, async (context) => {
					const dom = createDom("<main></main>");
					context.after(installDom(dom));
					const states: Readonly<CalendarState>[] = [];
					const extensionStates: Readonly<CalendarState>[] = [];
					const errors: string[] = [];
					const pending = deferred<readonly CalendarEventInput[]>();
					const previous = deferred<readonly CalendarEventInput[]>();
					const direct = result === "array" || result === "throw";
					const refreshFirst = boundary === "abort" || (boundary === "busy-terminal" && direct);
					let requests = 0;
					let armed = false;
					let throwHook = false;
					let failureCount = 0;
					let nestedState: Readonly<CalendarState> | undefined;
					let nestedNotifications = -1;
					const fail = (): undefined => {
						if (throwHook) { throwHook = false; failureCount += 1; throw new Error("Hook failed"); }
						return undefined;
					};
					const reenter = (): void => {
						if (!armed) { return; }
						armed = false;
						throwHook = true;
						const count = states.length;
						calendar.focusDate("2026-08-01");
						nestedState = calendar.getState();
						nestedNotifications = states.length - count;
					};
					class ObservedBusyHost extends dom.window.HTMLElement {
						public static readonly observedAttributes = ["aria-busy"];
						public attributeChangedCallback(_name: string, _oldValue: string | null, newValue: string | null): void {
							if ((boundary === "busy-loading" && newValue === "true") ||
								(boundary === "busy-terminal" && newValue === null)) { reenter(); }
						}
					}
					dom.window.customElements.define("lfc-observed-busy-host", ObservedBusyHost);
					const host = dom.window.document.createElement("lfc-observed-busy-host");
					dom.window.document.body.append(host);
					const calendar: Calendar = createCalendar(host, {
						initialDate: "2026-07-14",
						...(extensions ? { extensions: [createRegisteredExtensionProbe({
							id: "source-hook-error", capabilities: ["state"],
							activate: ({ state }) => ({ stateChanged: () => {
								assert.ok(state);
								extensionStates.push(state.getState());
							} })
						})] } : {}),
						events: ({ signal }) => {
							requests += 1;
							if (requests === 1) { return EVENTS; }
							if (refreshFirst && requests === 2) {
								if (boundary === "abort") { signal.addEventListener("abort", reenter, { once: true }); }
								return previous.promise;
							}
							if (boundary === "provider") { reenter(); }
							if (result === "throw") { throw new Error("Source failed"); }
							return direct ? EVENTS : pending.promise;
						},
						renderHooks: [{ id: "throwing-source-hook", ...(hook === "dayCleanup" ? { dayDidMount: () => fail } : { [hook]: fail }) }],
						onError: (error) => { errors.push(error.code); return "handled"; },
						onStateChange: (state) => { states.push(state); }
					});
					context.after(() => { calendar.destroy(); });
					calendar.render();
					if (refreshFirst) { calendar.refetchEvents(); }
					await flushRegisteredExtensionTasks();
					states.length = 0;
					extensionStates.length = 0;
					armed = true;
					calendar.gotoDate("2026-08-01");
					const terminal = result === "throw" || result === "reject" ? "unavailable" : "degraded";
					assert.deepEqual(states.map(({ phase }) => phase), [direct ? terminal : "loading"]);
					assert.deepEqual(extensionStates, [], "Extension delivery is queued after source publication.");
					await flushRegisteredExtensionTasks();
					assert.deepEqual(extensionStates, extensions ? states : []);
					if (!direct) {
						if (result === "reject") { pending.reject(new Error("Source rejected")); }
						else { pending.resolve(EVENTS); }
						await waitFor(() => calendar.getState().phase === terminal, "source settles with admitted hook error");
						await flushRegisteredExtensionTasks();
						assert.deepEqual(states.map(({ phase }) => phase), ["loading", terminal]);
					}
					assert.equal(failureCount, 1, "The failing hook is quarantined once.");
					assert.deepEqual(extensionStates, extensions ? states : [], "Each source phase has one coherent extension delivery.");
					assert.equal(nestedNotifications, 0, "Recoverable hook failure must not publish inside the reserved focus render.");
					assert.deepEqual(nestedState?.range, boundary === "busy-terminal" && !direct ? AUGUST_RANGE : JULY_RANGE);
					for (const state of states) {
						assert.deepEqual(state.range, AUGUST_RANGE);
						assert.deepEqual(state.selectedDate, { year: 2026, month: 8, day: 1 });
					}
					assert.deepEqual(errors, result === "throw" || result === "reject" ? ["render-hook-failed", "event-source-failed"] : ["render-hook-failed"]);
					assert.equal(calendar.getState().issues.filter(({ code }) => code === "render-hook-failed").length, 1);
					assert.equal(host.querySelectorAll('[role="gridcell"]').length, 42);
					assert.equal(host.hasAttribute("aria-busy"), false);
					const count = states.length;
					previous.resolve(EVENTS);
					await new Promise<void>((resolve) => { setTimeout(resolve, 0); });
					assert.equal(states.length, count);
					calendar.focusDate("2026-08-02");
					assert.equal(states.length, count + 1, "Later navigation publishes normally after source ownership is released.");
				});
			}
		}
	}
}
