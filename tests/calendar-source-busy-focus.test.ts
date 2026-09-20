import assert from "node:assert/strict";
import test from "node:test";

import { createCalendar, type Calendar, type CalendarEventInput, type CalendarState } from "../src/index.js";
import { createDom, deferred, installDom, waitFor } from "./helpers/dom.js";
import { createRegisteredExtensionProbe, flushRegisteredExtensionTasks } from "./helpers/registered-extensions.js";

const EVENTS: readonly CalendarEventInput[] = ["2026-07-15", "2026-08-02"].map((start) =>
	({ id: start, start, title: "An occurrence" })
);

for (const extensions of [false, true]) {
	for (const boundary of ["add", "remove"]) {
		void test(`busy ${boundary} replacement releases nested source and state-callback navigation (extensions: ${String(extensions)})`, async (context) => {
			const dom = createDom("<main></main>");
			context.after(installDom(dom));
			const pending = deferred<readonly CalendarEventInput[]>();
			const states: Readonly<CalendarState>[] = [];
			let armed = false;
			let navigateFromState = false;
			let requests = 0;
			class ObservedBusyHost extends dom.window.HTMLElement {
				public static readonly observedAttributes = ["aria-busy"];
				public attributeChangedCallback(_name: string, _oldValue: string | null, newValue: string | null): void {
					if (!armed || (boundary === "add" ? newValue !== "true" : newValue !== null)) { return; }
					armed = false;
					navigateFromState = true;
					calendar.setEvents(EVENTS);
					calendar.focusDate("2026-08-03");
				}
			}
			dom.window.customElements.define("lfc-observed-busy-host", ObservedBusyHost);
			const host = dom.window.document.createElement("lfc-observed-busy-host");
			dom.window.document.body.append(host);
			const calendar: Calendar = createCalendar(host, {
				initialDate: "2026-07-14",
				...(extensions ? { extensions: [createRegisteredExtensionProbe({ id: "busy-replacement" })] } : {}),
				events: () => { requests += 1; return requests === 2 ? pending.promise : EVENTS; },
				onStateChange: (state) => {
					states.push(state);
					if (navigateFromState) {
						navigateFromState = false;
						calendar.focusDate("2026-08-02");
					}
				}
			});
			context.after(() => { calendar.destroy(); });
			calendar.render();
			if (boundary === "remove") { calendar.refetchEvents(); }
			states.length = 0;
			armed = true;
			calendar.gotoDate("2026-08-01");
			assert.equal(armed, false);
			assert.deepEqual(states.map(({ phase, selectedDate }) => [phase, selectedDate.day]), [["ready", 1], ["ready", 2], ["ready", 3]]);
			for (const state of states) { assert.deepEqual(state.range, { start: "2026-07-26", end: "2026-09-06" }); }
			assert.equal(host.hasAttribute("aria-busy"), false);
			assert.equal(host.querySelector('[aria-selected="true"] .lfc-calendar-day-button')?.getAttribute("data-lfc-date"), "2026-08-03");
			pending.resolve(EVENTS);
			await new Promise<void>((resolve) => { setTimeout(resolve, 0); });
			assert.equal(states.length, 3);
		});
	}
}

for (const extensions of [false, true]) {
	for (const navigation of ["focusDate", "focusToday"] as const) {
		for (const operation of ["range", "refresh"] as const) {
			for (const boundary of ["loading", "array", "promise", "throw", "reject"] as const) {
				void test(`busy ${boundary} reaction ${navigation} during ${operation} preserves source publication (extensions: ${String(extensions)})`, async (context) => {
					const dom = createDom("<main></main>");
					context.after(installDom(dom));
					const target = operation === "range" ? "2026-08-02" : "2026-07-15";
					const targetDate = { year: 2026, month: operation === "range" ? 8 : 7, day: operation === "range" ? 2 : 15 };
					const range = operation === "range"
						? { start: "2026-07-26", end: "2026-09-06" }
						: { start: "2026-06-28", end: "2026-08-09" };
					const states: Readonly<CalendarState>[] = [];
					const extensionStates: Readonly<CalendarState>[] = [];
					const pending = deferred<readonly CalendarEventInput[]>();
					const previous = deferred<readonly CalendarEventInput[]>();
					const direct = boundary === "array" || boundary === "throw";
					let armed = false;
					let reactions = 0;
					let requests = 0;
					let reactionPublications = 0;
					class ObservedBusyHost extends dom.window.HTMLElement {
						public static readonly observedAttributes = ["aria-busy"];
						public attributeChangedCallback(_name: string, _oldValue: string | null, newValue: string | null): void {
							if (!armed || (boundary === "loading" ? newValue !== "true" : newValue !== null)) { return; }
							armed = false;
							reactions += 1;
							const count = states.length;
							if (navigation === "focusDate") { calendar.focusDate(target); }
							else { calendar.focusToday(); }
							reactionPublications += states.length - count;
						}
					}
					dom.window.customElements.define("lfc-observed-busy-host", ObservedBusyHost);
					const host = dom.window.document.createElement("lfc-observed-busy-host");
					dom.window.document.body.append(host);
					const calendar: Calendar = createCalendar(host, {
						initialDate: "2026-07-14", now: () => new Date(`${target}T12:00:00Z`),
						...(extensions ? { extensions: [createRegisteredExtensionProbe({
							id: "busy-focus", capabilities: ["state"],
							activate: ({ state }) => ({ stateChanged: () => {
								assert.ok(state);
								extensionStates.push(state.getState());
							} })
						})] } : {}),
						events: () => {
							requests += 1;
							if (requests === 1) { return EVENTS; }
							if (direct && requests === 2) { return previous.promise; }
							if (boundary === "throw") { throw new Error("Replacement failed"); }
							return direct ? EVENTS : pending.promise;
						},
						onError: () => "handled",
						onStateChange: (state) => { states.push(state); }
					});
					context.after(() => { calendar.destroy(); });
					calendar.render();
					if (direct) { calendar.refetchEvents(); }
					await flushRegisteredExtensionTasks();
					states.length = 0;
					extensionStates.length = 0;
					armed = true;
					if (operation === "range") { calendar.gotoDate("2026-08-01"); }
					else { calendar.refetchEvents(); }
					const terminal = boundary === "throw" || boundary === "reject"
						? operation === "range" ? "unavailable" : "degraded" : "ready";
					assert.deepEqual(states.map(({ phase }) => phase), [direct ? terminal : "loading"]);
					assert.deepEqual(extensionStates, []);
					await flushRegisteredExtensionTasks();
					assert.deepEqual(extensionStates, extensions ? states : []);
					if (!direct) {
						if (boundary === "reject") { pending.reject(new Error("Replacement rejected")); }
						else { pending.resolve(EVENTS); }
						await waitFor(() => calendar.getState().phase === terminal, "replacement settles");
						await flushRegisteredExtensionTasks();
						assert.deepEqual(states.map(({ phase }) => phase), ["loading", terminal]);
					}
					assert.equal(reactions, 1);
					assert.deepEqual(extensionStates, extensions ? states : []);
					assert.equal(reactionPublications, 0, "Busy reactions must leave publication to the source transaction.");
					for (const state of states) { assert.deepEqual(state.range, range); }
					assert.deepEqual(states.at(-1)?.selectedDate, targetDate);
					assert.deepEqual(calendar.getState().selectedDate, targetDate);
					assert.equal(host.hasAttribute("aria-busy"), false);
					assert.equal(host.querySelectorAll('[role="gridcell"]').length, 42);
					assert.equal(host.querySelector('[aria-selected="true"] .lfc-calendar-day-button')?.getAttribute("data-lfc-date"), target);
					const count = states.length;
					previous.resolve(EVENTS);
					await new Promise<void>((resolve) => { setTimeout(resolve, 0); });
					assert.equal(states.length, count);
				});
			}
		}
	}
}
