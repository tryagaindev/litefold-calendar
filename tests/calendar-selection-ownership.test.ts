import assert from "node:assert/strict";
import test from "node:test";

import { createCalendar, type CalendarEventInput } from "../src/index.js";
import { createDom, dispatchClick, getHost, installDom } from "./helpers/dom.js";
import { createRegisteredExtensionProbe } from "./helpers/registered-extensions.js";

const TARGET_DATE = "2026-07-15";
const EVENTS: readonly CalendarEventInput[] = [0, 1].map((id) => ({
	id: String(id), start: TARGET_DATE, title: "An occurrence"
}));

for (const extensions of [false, true]) {
	for (const boundary of ["badge", "cleanup", "mount", "state", "day-focus", "restore-focus"] as const) {
		for (const replacement of ["same-date", "away-back", "events", "refetch", "destroy"] as const) {
			void test(`${boundary} ${replacement} supersedes overflow focus (extensions: ${String(extensions)})`, (context) => {
				const dom = createDom();
				context.after(installDom(dom));
				const host = getHost(dom);
				const appButton = dom.window.document.createElement("button");
				dom.window.document.body.append(appButton);
				let armed = false;
				let completions = 0;
				const supersede = (): void => {
					if (!armed) { return; }
					armed = false;
					switch (replacement) {
						case "same-date": calendar.gotoDate(TARGET_DATE); break;
						case "away-back": calendar.gotoDate("2026-07-16"); calendar.gotoDate(TARGET_DATE); break;
						case "events": calendar.setEvents(EVENTS); break;
						case "refetch": calendar.refetchEvents(); break;
						case "destroy": calendar.destroy(); break;
					}
					appButton.focus();
				};
				const calendar = createCalendar(host, {
					events: EVENTS,
					...(extensions ? { extensions: [createRegisteredExtensionProbe({ id: "ownership" })] } : {}),
					initialDate: "2026-07-14",
					onEventOverflowDefault: () => { completions += 1; },
					onStateChange: () => { if (boundary === "state") { supersede(); } },
					renderHooks: [{
						id: "ownership",
						renderDayBadge: () => { if (boundary === "badge") { supersede(); } },
						dayDidMount: () => {
							if (boundary === "mount") { supersede(); }
							return () => { if (boundary === "cleanup") { supersede(); } };
						}
					}]
				});
				context.after(() => { calendar.destroy(); });
				calendar.render();
				host.addEventListener("focusin", (event) => {
					if (event.target instanceof dom.window.HTMLButtonElement && (
						(boundary === "day-focus" && event.target.classList.contains("lfc-calendar-day-button")) ||
						(boundary === "restore-focus" && event.target.classList.contains("lfc-calendar-grid-more"))
					)) { supersede(); }
				});
				const action = host.querySelector<HTMLButtonElement>(`.lfc-calendar-grid-more[data-lfc-date='${TARGET_DATE}']`);
				assert.ok(action);
				action.focus();
				armed = true;
				dispatchClick(dom, action);
				assert.equal(armed, false, "The chosen reentrancy boundary was exercised.");
				assert.equal(dom.window.document.activeElement, appButton, "The superseded default must not steal focus.");
				assert.equal(completions, 0, "The interrupted operation cannot report successful focus.");
				if (replacement !== "destroy") {
					assert.equal(calendar.getState().phase, "ready");
					assert.equal(calendar.getState().selectedDate.day, 15);
					assert.equal(host.querySelectorAll('[role="gridcell"]').length, 42);
					assert.equal(host.querySelectorAll(".lfc-calendar-day-button").length, 42);
					assert.equal(host.querySelector('[aria-selected="true"] .lfc-calendar-day-button')?.getAttribute("data-lfc-date"), TARGET_DATE);
				}
			});
		}
	}
}

for (const extensions of [false, true]) {
	void test(`detachment during overflow rendering commits state without completion (extensions: ${String(extensions)})`, (context) => {
		const dom = createDom();
		context.after(installDom(dom));
		const host = getHost(dom);
		const states: number[] = [];
		let armed = false;
		let completions = 0;
		const calendar = createCalendar(host, {
			events: EVENTS, initialDate: "2026-07-14",
			...(extensions ? { extensions: [createRegisteredExtensionProbe({ id: "detach-render" })] } : {}),
			onStateChange: (state) => { states.push(state.selectedDate.day); },
			onEventOverflowDefault: () => { completions += 1; },
			renderHooks: [{ id: "detach-render", dayDidMount: () => {
				if (armed) { armed = false; host.remove(); }
			} }]
		});
		context.after(() => { calendar.destroy(); });
		calendar.render();
		states.length = 0;
		const action = host.querySelector<HTMLButtonElement>(`.lfc-calendar-grid-more[data-lfc-date='${TARGET_DATE}']`);
		assert.ok(action);
		armed = true;
		dispatchClick(dom, action);
		assert.equal(host.isConnected, false);
		assert.equal(calendar.getState().selectedDate.day, 15);
		assert.deepEqual(states, [15]);
		assert.equal(host.querySelectorAll('[role="gridcell"]').length, 42);
		assert.equal(completions, 0);
	});
	for (const navigation of ["gotoDate", "today"] as const) {
		void test(`early badge ${navigation} keeps a complete initial grid (extensions: ${String(extensions)})`, (context) => {
			const dom = createDom();
			context.after(installDom(dom));
			const host = getHost(dom);
			let armed = true;
			let mounts = 0;
			const calendar = createCalendar(host, {
				events: EVENTS, initialDate: "2026-07-14", now: () => new Date("2026-07-14T12:00:00Z"),
				...(extensions ? { extensions: [createRegisteredExtensionProbe({ id: "initial" })] } : {}),
				renderHooks: [{
					id: "initial",
					renderDayBadge: () => {
						if (!armed) { return; }
						armed = false;
						if (navigation === "gotoDate") { calendar.gotoDate("2026-07-14"); }
						else { calendar.today(); }
					},
					dayDidMount: () => { mounts += 1; }
				}]
			});
			context.after(() => { calendar.destroy(); });
			calendar.render();
			assert.equal(armed, false);
			assert.equal(mounts, 42);
			assert.equal(calendar.getState().phase, "ready");
			assert.equal(host.querySelectorAll('[role="gridcell"]').length, 42);
			assert.equal(host.querySelectorAll(".lfc-calendar-day-button").length, 42);
			const nextDay = host.querySelector<HTMLButtonElement>(`.lfc-calendar-day-button[data-lfc-date='${TARGET_DATE}']`);
			assert.ok(nextDay);
			dispatchClick(dom, nextDay);
			assert.equal(calendar.getState().selectedDate.day, 15, "The completed grid retains usable day actions.");
		});
	}
	for (const navigation of ["gotoDate", "focusDate"] as const) {
		void test(`detached ${navigation} commits same-month selection (extensions: ${String(extensions)})`, (context) => {
			const dom = createDom();
			context.after(installDom(dom));
			const host = getHost(dom);
			host.remove();
			const states: number[] = [];
			let completions = 0;
			const calendar = createCalendar(host, {
				events: EVENTS, initialDate: "2026-07-14",
				...(extensions ? { extensions: [createRegisteredExtensionProbe({ id: "detached" })] } : {}),
				onStateChange: (state) => { states.push(state.selectedDate.day); },
				onEventOverflowDefault: () => { completions += 1; }
			});
			context.after(() => { calendar.destroy(); });
			calendar.render();
			states.length = 0;
			calendar[navigation](TARGET_DATE);
			assert.equal(calendar.getState().selectedDate.day, 15);
			assert.equal(calendar.getState().phase, "ready");
			assert.deepEqual(states, [15]);
			assert.equal(host.querySelectorAll('[role="gridcell"]').length, 42);
			assert.equal(host.querySelector('[aria-selected="true"] .lfc-calendar-day-button')?.getAttribute("data-lfc-date"), TARGET_DATE);
			const overflow = host.querySelector<HTMLButtonElement>(`.lfc-calendar-grid-more[data-lfc-date='${TARGET_DATE}']`);
			assert.ok(overflow);
			dispatchClick(dom, overflow);
			assert.equal(completions, 0, "Detached actions cannot claim successful agenda focus.");
			assert.deepEqual(states, [15]);
		});
	}
}
