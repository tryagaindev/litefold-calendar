import assert from "node:assert/strict";
import test, { type TestContext } from "node:test";

import {
	createCalendar, LitefoldCalendarError, type CalendarEventInput, type CalendarEventOverflowActivation,
	type CalendarEventOverflowDefaultContext, type CalendarOptions
} from "../src/index.js";
import { hasElementFocus } from "../src/internal/dom/grid-focus.js";
import { createDom, deferred, dispatchClick, getHost, installDom } from "./helpers/dom.js";

const TARGET = "2026-07-15";
interface Metadata { value: number; }
const METADATA: Metadata = { value: 1 };
const EVENTS: readonly CalendarEventInput<Metadata>[] = Array.from({ length: 25 }, (_, i) => ({
	id: String(i), metadata: METADATA, start: "2026-07-14", end: "2026-07-17", title: `Event ${String(i)}`
}));

function setup(context: TestContext, options: Partial<CalendarOptions<Metadata>> = {}) {
	const dom = createDom();
	context.after(installDom(dom));
	const host = getHost(dom);
	const calendar = createCalendar(host, {
		events: EVENTS, initialDate: "2026-07-14", agendaPageSize: 10, onError: () => undefined, ...options
	});
	context.after(() => { calendar.destroy(); });
	calendar.render();
	const action = (date = TARGET): HTMLButtonElement => {
		const button = host.querySelector<HTMLButtonElement>(`.lfc-calendar-grid-more[data-lfc-date='${date}']`);
		assert.ok(button);
		return button;
	};
	return { dom, host, calendar, action };
}

void test("both hooks share the original immutable full occurrence snapshot before microtasks", async (context) => {
	const order: string[] = [];
	let pre: CalendarEventOverflowActivation<Metadata> | undefined;
	let post: CalendarEventOverflowDefaultContext<Metadata> | undefined;
	let daySelections = 0;
	const fixture = setup(context, {
		onDaySelect: () => { daySelections += 1; },
		onEventOverflowActivate: (value) => {
			pre = value;
			assert.equal(value.element.isConnected, true);
			assert.equal(fixture.calendar.getState().selectedDate.day, 14);
			order.push("pre");
			queueMicrotask(() => { order.push("pre-microtask"); });
		},
		onEventOverflowDefault: (value) => {
			post = value;
			order.push("post");
			assert.equal(fixture.calendar.getState().selectedDate.day, 15);
			assert.equal(value.agendaHeading, fixture.dom.window.document.activeElement);
			assert.equal(value.agendaHeading, fixture.host.querySelector(".lfc-calendar-agenda-title"));
			assert.equal(value.triggerElement.isConnected, false);
			assert.equal(value.agendaHeading.isConnected, true);
			value.nativeEvent.preventDefault();
		}
	});
	order.push("before-dispatch");
	dispatchClick(fixture.dom, fixture.action());
	order.push("after-dispatch");
	assert.deepEqual(order, ["before-dispatch", "pre", "post", "after-dispatch"]);
	await Promise.resolve();
	assert.deepEqual(order, ["before-dispatch", "pre", "post", "after-dispatch", "pre-microtask"]);
	assert.ok(pre && post);
	for (const key of ["date", "dateString", "events", "eventCount", "nativeEvent"] as const) {
		assert.equal(post[key], pre[key]);
	}
	assert.equal(post.triggerElement, pre.element);
	assert.equal(post.dateString, TARGET);
	assert.equal(post.eventCount, 25);
	assert.equal(post.events.length, 25);
	assert.equal(post.events[0]?.start, "2026-07-14");
	assert.equal(post.events[0]?.metadata, METADATA);
	assert.equal(Object.isFrozen(METADATA), false);
	assert.ok(Object.isFrozen(post) && Object.isFrozen(post.events) && Object.isFrozen(post.date));
	assert.equal(daySelections, 0);
});

void test("post-only same-date activations reset pagination, notify once, and reject old triggers", (context) => {
	let count = 0;
	const { dom, host, action } = setup(context, { onEventOverflowDefault: (value) => {
		count += 1;
		assert.equal(value.eventCount, 25);
		assert.equal(hasElementFocus(value.agendaHeading), true);
	} });
	const old = action();
	dispatchClick(dom, old);
	const more = host.querySelector<HTMLButtonElement>(".lfc-calendar-agenda-more");
	assert.ok(more);
	dispatchClick(dom, more);
	assert.equal(host.querySelectorAll(".lfc-calendar-agenda-item").length, 20);
	dispatchClick(dom, action());
	assert.equal(host.querySelectorAll(".lfc-calendar-agenda-item").length, 10);
	dispatchClick(dom, old);
	assert.equal(count, 2);
});

for (const behavior of ["cancel", "destroy", "detach", "navigate", "same-date", "replace", "refetch"] as const) {
	void test(`pre-hook ${behavior} prevents default completion`, (context) => {
		let calls = 0;
		const fixture = setup(context, {
			onEventOverflowActivate: ({ nativeEvent }) => {
				switch (behavior) {
					case "cancel": nativeEvent.preventDefault(); break;
					case "destroy": fixture.calendar.destroy(); break;
					case "detach": fixture.host.remove(); break;
					case "navigate": fixture.calendar.gotoDate(TARGET); break;
					case "same-date": fixture.calendar.gotoDate("2026-07-14"); break;
					case "replace": fixture.calendar.setEvents(EVENTS); break;
					case "refetch": fixture.calendar.refetchEvents(); break;
				}
			},
			onEventOverflowDefault: () => { calls += 1; }
		});
		dispatchClick(fixture.dom, fixture.action());
		assert.equal(calls, 0);
	});
}

void test("pending hooks never delay default, and cancellation after await is too late", async (context) => {
	const pending = deferred<void>();
	let calls = 0;
	const { dom, action, calendar } = setup(context, {
		onEventOverflowActivate: async ({ nativeEvent }) => { await pending.promise; nativeEvent.preventDefault(); },
		onEventOverflowDefault: () => { calls += 1; return pending.promise; }
	});
	dispatchClick(dom, action());
	assert.equal(calls, 1);
	assert.equal(calendar.getState().selectedDate.day, 15);
	pending.resolve();
	await pending.promise;
	assert.equal(calls, 1);
});

for (const hook of ["onEventOverflowActivate", "onEventOverflowDefault"] as const) {
	for (const failure of ["throw", "reject"] as const) {
		void test(`${hook} ${failure} uses action errors without rollback or implicit cancellation`, async (context) => {
			const errors: LitefoldCalendarError[] = [];
			let calls = 0;
			const { dom, action, calendar, host } = setup(context, {
				onError: (error) => { errors.push(error); },
				[hook]: () => {
					calls += 1;
					if (failure === "throw") { throw new Error("private failure"); }
					return Promise.reject(new Error("private failure"));
				}
			});
			dispatchClick(dom, action());
			await Promise.resolve();
			assert.equal(calls, 1);
			assert.equal(calendar.getState().selectedDate.day, 15);
			assert.equal(errors.some((error) => error.code === "action-failed" && error.hook === hook), true);
			assert.doesNotMatch(host.textContent ?? "", /private failure/u);
		});
	}
}

void test("late rejected post promises retain per-hook stale diagnostics", async (context) => {
	const first = deferred<void>();
	const errors: LitefoldCalendarError[] = [];
	let calls = 0;
	const { dom, action } = setup(context, {
		onError: (error) => { errors.push(error); },
		onEventOverflowDefault: () => { calls += 1; return calls === 1 ? first.promise : undefined; }
	});
	dispatchClick(dom, action());
	dispatchClick(dom, action());
	first.reject(new Error("old completion"));
	await Promise.resolve();
	assert.equal(errors.some((error) => error.hook === "onEventOverflowDefault" && error.stale), true);
});

for (const boundary of ["focus", "post"] as const) {
	for (const behavior of ["redirect", "navigate", "detach", "destroy"] as const) {
		void test(`${boundary} ${behavior} keeps application focus ownership`, (context) => {
			let calls = 0;
			const fixture = setup(context, { onEventOverflowDefault: () => {
				calls += 1;
				if (boundary === "post") { takeOver(); }
			} });
			const appButton = fixture.dom.window.document.createElement("button");
			fixture.dom.window.document.body.append(appButton);
			const takeOver = (): void => {
				switch (behavior) {
					case "redirect": break;
					case "navigate": fixture.calendar.gotoDate("2026-07-16"); break;
					case "detach": fixture.host.remove(); break;
					case "destroy": fixture.calendar.destroy(); break;
				}
				appButton.focus();
			};
			if (boundary === "focus") {
				fixture.host.querySelector(".lfc-calendar-agenda-title")?.addEventListener("focus", takeOver, { once: true });
			}
			dispatchClick(fixture.dom, fixture.action());
			assert.equal(calls, boundary === "post" ? 1 : 0);
			assert.equal(fixture.dom.window.document.activeElement, appButton);
		});
	}
}

void test("loading adjacent-month completion retains activation events and never replays on settlement", async (context) => {
	const pending = deferred<readonly CalendarEventInput<Metadata>[]>();
	let loads = 0;
	let calls = 0;
	const fixture = setup(context, {
		events: () => ++loads === 1 ? [{ id: "adjacent", start: "2026-08-01", title: "Original" }] : pending.promise,
		initialDate: "2026-07-31", gridEventDisplay: { compact: "count", wide: "count" },
		onEventOverflowDefault: (value) => {
			calls += 1;
			assert.equal(fixture.calendar.getState().phase, "loading");
			assert.equal(value.events[0]?.title, "Original");
			assert.equal(hasElementFocus(value.agendaHeading), true);
		}
	});
	dispatchClick(fixture.dom, fixture.action("2026-08-01"));
	assert.equal(calls, 1);
	pending.resolve([]);
	await pending.promise;
	await Promise.resolve();
	assert.equal(calls, 1);
});

void test("unrelated day/event/navigation/pagination actions do not notify overflow completion", (context) => {
	let calls = 0;
	const { calendar, host, dom } = setup(context, {
		onEventActivate: () => undefined,
		onEventOverflowDefault: () => { calls += 1; }
	});
	calendar.gotoDate(TARGET);
	calendar.focusDate(TARGET);
	calendar.refetchEvents();
	for (const selector of [`.lfc-calendar-day-button[data-lfc-date='${TARGET}']`, ".lfc-calendar-event-button", ".lfc-calendar-agenda-more"]) {
		const control = host.querySelector(selector);
		assert.ok(control);
		dispatchClick(dom, control);
	}
	assert.equal(calls, 0);
});

void test("callback validation is safe before mounting and construction snapshots its function", (context) => {
	const dom = createDom();
	context.after(installDom(dom));
	const host = getHost(dom);
	for (const invalid of [null, 1, "callback", {}, []]) {
		assert.throws(() => createCalendar(host, { events: [], onEventOverflowDefault: invalid } as never),
			(error: unknown) => error instanceof LitefoldCalendarError && error.code === "invalid-configuration");
		assert.equal(host.childElementCount, 0);
	}
	assert.throws(() => createCalendar(host, {
		events: [], get onEventOverflowDefault(): never { throw new Error("unreadable"); }
	}), LitefoldCalendarError);
	let calls = 0;
	const options = { events: EVENTS, initialDate: TARGET, onEventOverflowDefault: () => { calls += 1; } };
	const calendar = createCalendar(host, options);
	context.after(() => { calendar.destroy(); });
	options.onEventOverflowDefault = () => { throw new Error("replacement callback"); };
	calendar.render();
	const action = host.querySelector(".lfc-calendar-grid-more");
	assert.ok(action);
	dispatchClick(dom, action);
	assert.equal(calls, 1);
});

void test("known-reference focus works in a shadow root and a non-global document", (context) => {
	const ambient = createDom();
	context.after(installDom(ambient));
	const secondary = createDom();
	context.after(() => { secondary.window.close(); });
	const shadowHost = getHost(secondary);
	const root = shadowHost.attachShadow({ mode: "open" });
	const heading = secondary.window.document.createElement("h3");
	heading.tabIndex = -1;
	root.append(heading);
	heading.focus();
	assert.equal(hasElementFocus(heading), true);
	assert.notEqual(secondary.window.document.activeElement, heading);
	const host = secondary.window.document.createElement("div");
	secondary.window.document.body.append(host);
	let calls = 0;
	const calendar = createCalendar(host, { events: EVENTS, initialDate: TARGET, onEventOverflowDefault: (value) => {
		calls += 1;
		assert.equal(value.agendaHeading, secondary.window.document.activeElement);
	} });
	context.after(() => { calendar.destroy(); });
	calendar.render();
	const action = host.querySelector(".lfc-calendar-grid-more");
	assert.ok(action);
	dispatchClick(secondary, action);
	assert.equal(calls, 1);
});

void test("clearing an earlier pre-hook issue can supersede a fresh action without replacing its trigger", (context) => {
	let fail = true;
	let armed = false;
	let calls = 0;
	const fixture = setup(context, {
		onEventOverflowActivate: () => { if (fail) { throw new Error("initial failure"); } },
		onEventOverflowDefault: () => { calls += 1; },
		onStateChange: () => {
			if (armed) { armed = false; fixture.calendar.gotoDate(TARGET); }
		}
	});
	dispatchClick(fixture.dom, fixture.action());
	assert.equal(calls, 1);
	fail = false;
	armed = true;
	dispatchClick(fixture.dom, fixture.action());
	assert.equal(armed, false);
	assert.equal(calls, 1);
});

for (const failure of ["focus", "fatal-render", "recoverable-render"] as const) {
	void test(`${failure} reports only an actually focused committed agenda`, (context) => {
		let armed = false;
		let calls = 0;
		const fixture = setup(context, {
			onEventOverflowDefault: () => { calls += 1; },
			renderHooks: [{ id: "recovery", renderDayBadge: () => {
				if (armed && failure === "recoverable-render") { throw new Error("quarantine this hook"); }
				return undefined;
			} }]
		});
		armed = true;
		if (failure === "focus") {
			Object.defineProperty(fixture.host.querySelector(".lfc-calendar-agenda-title"), "focus", { value: () => undefined });
		} else if (failure === "fatal-render") {
			Object.defineProperty(fixture.host.querySelector(".lfc-calendar-weeks"), "replaceChildren", {
				value: () => { throw new Error("render unavailable"); }
			});
		}
		dispatchClick(fixture.dom, fixture.action());
		assert.equal(calls, failure === "recoverable-render" ? 1 : 0);
	});
}

void test("an immediate source failure with a usable heading can still complete", (context) => {
	let loads = 0;
	let calls = 0;
	const fixture = setup(context, {
		events: () => {
			if (++loads > 1) { throw new Error("source unavailable"); }
			return [{ id: "adjacent", start: "2026-08-01", title: "Original" }];
		},
		initialDate: "2026-07-31", gridEventDisplay: { compact: "count" },
		onEventOverflowDefault: ({ agendaHeading }) => { calls += 1; assert.equal(hasElementFocus(agendaHeading), true); }
	});
	dispatchClick(fixture.dom, fixture.action("2026-08-01"));
	assert.equal(calls, 1);
	assert.equal(fixture.calendar.getState().phase, "unavailable");
});

void test("two live instances supply their own headings, while invalid navigation does not claim ownership", (context) => {
	let calls = 0;
	const fixture = setup(context, {
		onEventOverflowActivate: () => { assert.throws(() => { fixture.calendar.gotoDate("invalid"); }); },
		onEventOverflowDefault: ({ agendaHeading }) => {
			calls += 1;
			assert.equal(fixture.host.contains(agendaHeading), true);
		}
	});
	const secondHost = fixture.dom.window.document.createElement("div");
	fixture.host.after(secondHost);
	const second = createCalendar(secondHost, { events: EVENTS, initialDate: TARGET,
		onEventOverflowDefault: () => { throw new Error("unrelated instance"); } });
	context.after(() => { second.destroy(); });
	second.render();
	dispatchClick(fixture.dom, fixture.action());
	assert.equal(calls, 1);
	assert.equal(secondHost.contains(fixture.dom.window.document.activeElement), false);
});
