import { expect, test } from "@playwright/test";
import { expectLibraryFixtureReady } from "./helpers.js";

for (const hook of ["renderDayBadge", "dayDidMount"]) {
	for (const boundary of ["abort", "provider", "busy"]) {
		test(`${hook} failure during native ${boundary} focus joins the source phase`, async ({ page }) => {
			await expectLibraryFixtureReady(page);
			const result = await page.evaluate(async ({ hook, boundary }) => {
				const { createCalendar } = await import("/dist/index.js");
				const states = [];
				const errors = [];
				let calls = 0;
				let armed = false;
				let failHook = false;
				let nestedNotifications = -1;
				const reenter = () => {
					if (!armed) { return; }
					armed = false;
					failHook = true;
					const count = states.length;
					calendar.focusDate("2026-08-01");
					nestedNotifications = states.length - count;
				};
				class ObservedBusyHost extends HTMLElement {
					static observedAttributes = ["aria-busy"];
					attributeChangedCallback(_name, _oldValue, newValue) { if (boundary === "busy" && newValue === "true") { reenter(); } }
				}
				customElements.define("lfc-observed-busy-host", ObservedBusyHost);
				const host = document.createElement("lfc-observed-busy-host");
				document.body.append(host);
				const calendar = createCalendar(host, {
					initialDate: "2026-07-14",
					events: ({ signal }) => {
						calls += 1;
						if (calls === 1) { return []; }
						if (boundary === "abort" && calls === 2) {
							signal.addEventListener("abort", reenter, { once: true });
							return new Promise(() => {});
						}
						if (boundary === "provider") { reenter(); }
						return boundary === "busy" ? Promise.resolve([]) : [];
					},
					renderHooks: [{ id: "failing-hook", [hook]: () => { if (failHook) { throw new Error("Hook failed"); } } }],
					onError: (error) => { errors.push(error.code); return "handled"; },
					onStateChange: (state) => { states.push(state); }
				});
				calendar.render();
				if (boundary === "abort") { calendar.refetchEvents(); }
				states.length = 0;
				armed = true;
				calendar.gotoDate("2026-08-01");
				await new Promise((resolve) => { setTimeout(resolve, 0); });
				return {
					phases: states.map(({ phase }) => phase), ranges: states.map(({ range }) => range),
					dates: states.map(({ selectedDate }) => selectedDate), nestedNotifications, errors,
					issues: calendar.getState().issues.map(({ code }) => code), cells: host.querySelectorAll('[role="gridcell"]').length
				};
			}, { hook, boundary });
			const range = { start: "2026-07-26", end: "2026-09-06" };
			const date = { year: 2026, month: 8, day: 1 };
			expect(result).toEqual({
				phases: boundary === "busy" ? ["loading", "degraded"] : ["degraded"],
				ranges: boundary === "busy" ? [range, range] : [range], dates: boundary === "busy" ? [date, date] : [date],
				nestedNotifications: 0, errors: ["render-hook-failed"], issues: ["render-hook-failed"], cells: 42
			});
		});
	}
}

for (const navigation of ["focusDate", "focusToday"]) {
	for (const boundary of ["loading", "ready", "failure"]) {
		test(`${navigation} from native busy ${boundary} reaction preserves the source phase sequence`, async ({ page }) => {
			await expectLibraryFixtureReady(page);
			const result = await page.evaluate(async ({ navigation, boundary }) => {
				const { createCalendar } = await import("/dist/index.js");
				const target = boundary === "failure" ? "2026-07-15" : "2026-08-02";
				const events = [{ id: "one", title: "An occurrence", start: target }];
				const states = [];
				let armed = false;
				let reactions = 0;
				let reactionPublications = 0;
				let requests = 0;
				class ObservedBusyHost extends HTMLElement {
					static observedAttributes = ["aria-busy"];
					attributeChangedCallback(_name, _oldValue, newValue) {
						if (!armed || (boundary === "loading" ? newValue !== "true" : newValue !== null)) { return; }
						armed = false;
						reactions += 1;
						const count = states.length;
						if (navigation === "focusDate") { calendar.focusDate(target); }
						else { calendar.focusToday(); }
						reactionPublications += states.length - count;
					}
				}
				customElements.define("lfc-observed-busy-host", ObservedBusyHost);
				const host = document.createElement("lfc-observed-busy-host");
				document.body.append(host);
				const calendar = createCalendar(host, {
					initialDate: "2026-07-14", now: () => new Date(`${target}T12:00:00Z`),
					events: () => {
						requests += 1;
						if (requests === 1) { return events; }
						if (boundary === "failure") {
							if (requests === 2) { return new Promise(() => {}); }
							throw new Error("Replacement failed");
						}
						return Promise.resolve(events);
					},
					onError: () => "handled",
					onStateChange: (state) => { states.push(state); }
				});
				calendar.render();
				if (boundary === "failure") { calendar.refetchEvents(); }
				states.length = 0;
				armed = true;
				if (boundary === "failure") { calendar.refetchEvents(); }
				else { calendar.gotoDate("2026-08-01"); }
				const synchronous = states.map(({ phase }) => phase);
				await new Promise((resolve) => { setTimeout(resolve, 0); });
				return {
					synchronous, phases: states.map(({ phase }) => phase),
					ranges: states.map(({ range }) => range), selected: calendar.getState().selectedDate,
					reactions, reactionPublications, busy: host.hasAttribute("aria-busy"),
					cells: host.querySelectorAll('[role="gridcell"]').length,
					date: host.querySelector('[aria-selected="true"] .lfc-calendar-day-button')?.getAttribute("data-lfc-date")
				};
			}, { navigation, boundary });
			const failure = boundary === "failure";
			const range = failure ? { start: "2026-06-28", end: "2026-08-09" } : { start: "2026-07-26", end: "2026-09-06" };
			expect(result).toEqual({
				synchronous: [failure ? "degraded" : "loading"], phases: failure ? ["degraded"] : ["loading", "ready"],
				ranges: failure ? [range] : [range, range], selected: { year: 2026, month: failure ? 7 : 8, day: failure ? 15 : 2 },
				reactions: 1, reactionPublications: 0, busy: false, cells: 42, date: failure ? "2026-07-15" : "2026-08-02"
			});
		});
	}
}
