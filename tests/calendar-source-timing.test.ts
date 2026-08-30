import assert from "node:assert/strict";
import test, { type TestContext } from "node:test";

import {
	createCalendar,
	type Calendar,
	type CalendarEventInput,
	type CalendarPhase,
	type CalendarRenderHooks,
	type LitefoldCalendarError
} from "../src/index.js";
import {
	createDom,
	deferred,
	installDom,
	waitFor
} from "./helpers/dom.js";
import {
	createRegisteredExtensionProbe,
	flushRegisteredExtensionTasks
} from "./helpers/registered-extensions.js";

const DAYS_PER_GRID = 42;

void test("static arrays commit before render returns with one full grid pass", (context) => {
	const { dom, host } = setupDom(context);
	const probe = createRenderProbe();
	const replacements = observeWeekReplacements(context, dom, host);
	const observations: StateObservation[] = [];
	const calendar = createCalendar(host, {
		events: [event("initial", "Initial immediate event")],
		initialDate: "2026-08-06",
		onStateChange: (state) => {
			observations.push(observeState(host, probe, state.phase, "Initial immediate event"));
		},
		renderHooks: [probe.hooks]
	});

	calendar.render();

	assert.equal(calendar.getState().phase, "ready");
	assert.equal(probe.mounts, DAYS_PER_GRID);
	assert.equal(probe.cleanups, 0);
	assert.equal(replacements.count, 1);
	assert.equal(host.hasAttribute("aria-busy"), false);
	assert.equal(grid(host).hasAttribute("aria-busy"), false);
	assert.match(host.textContent ?? "", /Initial immediate event/u);
	assert.deepEqual(observations, [{
		busy: false,
		eventRendered: false,
		mounts: 0,
		phase: "ready"
	}]);

	calendar.setEvents([event("replacement", "Replacement immediate event")]);

	assert.equal(calendar.getState().phase, "ready");
	assert.equal(probe.mounts, DAYS_PER_GRID * 2);
	assert.equal(probe.cleanups, DAYS_PER_GRID);
	assert.equal(replacements.count, 2);
	assert.equal(host.hasAttribute("aria-busy"), false);
	assert.match(host.textContent ?? "", /Replacement immediate event/u);
	assert.doesNotMatch(host.textContent ?? "", /Initial immediate event/u);
	calendar.destroy();
	assert.equal(probe.cleanups, DAYS_PER_GRID * 2);
});

void test("array-returning providers use one immediate pass for render and navigation", (context) => {
	const { dom, host } = setupDom(context);
	const probe = createRenderProbe();
	const replacements = observeWeekReplacements(context, dom, host);
	const phases: CalendarPhase[] = [];
	let requests = 0;
	const calendar = createCalendar(host, {
		events: () => {
			requests += 1;
			return [event(
				`request-${requests.toString()}`,
				`Immediate request ${requests.toString()}`,
				requests === 1 ? "2026-08-06" : "2026-09-06"
			)];
		},
		initialDate: "2026-08-06",
		onStateChange: (state) => { phases.push(state.phase); },
		renderHooks: [probe.hooks],
		swipe: false
	});

	calendar.render();
	assert.equal(requests, 1);
	assert.equal(probe.mounts, DAYS_PER_GRID);
	assert.equal(replacements.count, 1);
	assert.equal(calendar.getState().phase, "ready");
	assert.match(host.textContent ?? "", /Immediate request 1/u);

	calendar.next();
	assert.equal(requests, 2);
	assert.equal(probe.mounts, DAYS_PER_GRID * 2);
	assert.equal(probe.cleanups, DAYS_PER_GRID);
	assert.equal(replacements.count, 2);
	assert.equal(calendar.getState().phase, "ready");
	assert.equal(host.hasAttribute("aria-busy"), false);
	assert.match(host.textContent ?? "", /Immediate request 2/u);
	assert.deepEqual(phases, ["ready", "ready"]);
	calendar.destroy();
});

void test("Promise.resolve opts into loading and exactly two full grid passes", async (context) => {
	const { dom, host } = setupDom(context);
	const probe = createRenderProbe();
	const replacements = observeWeekReplacements(context, dom, host);
	const observations: StateObservation[] = [];
	let invoked = false;
	const calendar = createCalendar(host, {
		events: () => {
			invoked = true;
			return Promise.resolve([event("fulfilled", "Fulfilled async event")]);
		},
		initialDate: "2026-08-06",
		onStateChange: (state) => {
			observations.push(observeState(host, probe, state.phase, "Fulfilled async event"));
		},
		renderHooks: [probe.hooks]
	});

	calendar.render();

	assert.equal(invoked, true);
	assert.equal(calendar.getState().phase, "loading");
	assert.equal(host.getAttribute("aria-busy"), "true");
	assert.equal(grid(host).getAttribute("aria-busy"), "true");
	assert.equal(probe.mounts, DAYS_PER_GRID);
	assert.equal(probe.cleanups, 0);
	assert.equal(replacements.count, 1);
	assert.doesNotMatch(host.textContent ?? "", /Fulfilled async event/u);

	await waitForPhase(calendar, "ready");

	assert.equal(host.hasAttribute("aria-busy"), false);
	assert.equal(grid(host).hasAttribute("aria-busy"), false);
	assert.equal(probe.mounts, DAYS_PER_GRID * 2);
	assert.equal(probe.cleanups, DAYS_PER_GRID);
	assert.equal(replacements.count, 2);
	assert.match(host.textContent ?? "", /Fulfilled async event/u);
	assert.deepEqual(observations, [{
		busy: true,
		eventRendered: false,
		mounts: 0,
		phase: "loading"
	}, {
		busy: false,
		eventRendered: false,
		mounts: DAYS_PER_GRID,
		phase: "ready"
	}]);
	calendar.destroy();
	assert.equal(probe.cleanups, DAYS_PER_GRID * 2);
});

void test("an already-fulfilled custom thenable remains asynchronous", async (context) => {
	const { host } = setupDom(context);
	const probe = createRenderProbe();
	let providerInvoked = false;
	let thenObserved = false;
	const loadingObservations: { readonly providerInvoked: boolean; readonly thenObserved: boolean }[] = [];
	const thenable = immediateThenable(
		[event("custom-thenable", "Custom thenable event")],
		() => { thenObserved = true; }
	);
	const calendar = createCalendar(host, {
		events: () => {
			providerInvoked = true;
			return thenable;
		},
		initialDate: "2026-08-06",
		onStateChange: (state) => {
			if (state.phase === "loading") {
				loadingObservations.push({ providerInvoked, thenObserved });
			}
		},
		renderHooks: [probe.hooks]
	});

	calendar.render();

	assert.equal(calendar.getState().phase, "loading");
	assert.equal(host.getAttribute("aria-busy"), "true");
	assert.equal(probe.mounts, DAYS_PER_GRID);
	assert.deepEqual(loadingObservations, [{ providerInvoked: true, thenObserved: true }]);
	await waitForPhase(calendar, "ready");
	assert.equal(probe.mounts, DAYS_PER_GRID * 2);
	assert.equal(probe.cleanups, DAYS_PER_GRID);
	assert.match(host.textContent ?? "", /Custom thenable event/u);
	calendar.destroy();
});

void test("one provider may switch timing independently on every invocation", async (context) => {
	const { host } = setupDom(context);
	const pending = deferred<readonly CalendarEventInput[]>();
	const probe = createRenderProbe();
	const phases: CalendarPhase[] = [];
	let requests = 0;
	const calendar = createCalendar(host, {
		events: () => {
			requests += 1;
			if (requests === 2) {
				return pending.promise;
			}
			return [event(
				`timing-${requests.toString()}`,
				requests === 1 ? "First immediate event" : "Second immediate event"
			)];
		},
		initialDate: "2026-08-06",
		onStateChange: (state) => { phases.push(state.phase); },
		renderHooks: [probe.hooks]
	});

	calendar.render();
	assert.equal(requests, 1);
	assert.equal(probe.mounts, DAYS_PER_GRID);
	assert.equal(calendar.getState().phase, "ready");

	calendar.refetchEvents();
	assert.equal(requests, 2);
	assert.equal(calendar.getState().phase, "loading");
	assert.equal(host.getAttribute("aria-busy"), "true");
	assert.equal(probe.mounts, DAYS_PER_GRID * 2);
	pending.resolve([event("async-middle", "Async middle event")]);
	await waitForPhase(calendar, "ready");
	assert.equal(probe.mounts, DAYS_PER_GRID * 3);
	assert.match(host.textContent ?? "", /Async middle event/u);

	calendar.refetchEvents();
	assert.equal(requests, 3);
	assert.equal(calendar.getState().phase, "ready");
	assert.equal(host.hasAttribute("aria-busy"), false);
	assert.equal(probe.mounts, DAYS_PER_GRID * 4);
	assert.equal(probe.cleanups, DAYS_PER_GRID * 3);
	assert.match(host.textContent ?? "", /Second immediate event/u);
	assert.deepEqual(phases, ["ready", "loading", "ready", "ready"]);
	calendar.destroy();
});

void test("an immediate replacement supersedes async work and clears busy state", async (context) => {
	const { host } = setupDom(context);
	const pending = deferred<readonly CalendarEventInput[]>();
	const probe = createRenderProbe();
	let pendingSignal: AbortSignal | undefined;
	const calendar = createCalendar(host, {
		events: [event("initial", "Initial event")],
		initialDate: "2026-08-06",
		renderHooks: [probe.hooks]
	});
	calendar.render();

	calendar.setEvents(({ signal }) => {
		pendingSignal = signal;
		return pending.promise;
	});
	assert.ok(pendingSignal);
	assert.equal(calendar.getState().phase, "loading");
	assert.equal(host.getAttribute("aria-busy"), "true");
	assert.equal(probe.mounts, DAYS_PER_GRID * 2);

	calendar.setEvents([event("replacement", "Immediate replacement")]);
	assert.equal(pendingSignal.aborted, true);
	assert.equal(calendar.getState().phase, "ready");
	assert.equal(host.hasAttribute("aria-busy"), false);
	assert.equal(grid(host).hasAttribute("aria-busy"), false);
	assert.equal(probe.mounts, DAYS_PER_GRID * 3);
	assert.equal(probe.cleanups, DAYS_PER_GRID * 2);
	assert.match(host.textContent ?? "", /Immediate replacement/u);

	pending.resolve([event("stale", "Stale async event")]);
	await flushMicrotasks();
	assert.equal(probe.mounts, DAYS_PER_GRID * 3);
	assert.doesNotMatch(host.textContent ?? "", /Stale async event/u);
	calendar.destroy();
});

void test("synchronous source failures render one terminal pass without busy state", (context) => {
	const { host } = setupDom(context);
	const probe = createRenderProbe();
	const errors: LitefoldCalendarError[] = [];
	const phases: CalendarPhase[] = [];
	const calendar = createCalendar(host, {
		events: () => { throw new Error("immediate source failure"); },
		initialDate: "2026-08-06",
		onError: (error) => { errors.push(error); return "handled"; },
		onStateChange: (state) => { phases.push(state.phase); },
		renderHooks: [probe.hooks]
	});

	calendar.render();

	assert.equal(calendar.getState().phase, "unavailable");
	assert.equal(probe.mounts, DAYS_PER_GRID);
	assert.equal(probe.cleanups, 0);
	assert.equal(host.hasAttribute("aria-busy"), false);
	assert.equal(grid(host).hasAttribute("aria-busy"), false);
	assert.deepEqual(phases, ["unavailable"]);
	assert.equal(errors.length, 1);
	assert.equal(errors[0]?.code, "event-source-failed");
	calendar.destroy();
});

void test("asynchronous source failures retain the loading and terminal passes", async (context) => {
	const { host } = setupDom(context);
	const pending = deferred<readonly CalendarEventInput[]>();
	const probe = createRenderProbe();
	const phases: CalendarPhase[] = [];
	const calendar = createCalendar(host, {
		events: () => pending.promise,
		initialDate: "2026-08-06",
		onError: () => "handled",
		onStateChange: (state) => { phases.push(state.phase); },
		renderHooks: [probe.hooks]
	});

	calendar.render();
	assert.equal(calendar.getState().phase, "loading");
	assert.equal(probe.mounts, DAYS_PER_GRID);
	assert.equal(host.getAttribute("aria-busy"), "true");
	pending.reject(new Error("async source failure"));
	await waitForPhase(calendar, "unavailable");
	assert.equal(probe.mounts, DAYS_PER_GRID * 2);
	assert.equal(probe.cleanups, DAYS_PER_GRID);
	assert.equal(host.hasAttribute("aria-busy"), false);
	assert.deepEqual(phases, ["loading", "unavailable"]);
	calendar.destroy();
});

void test("loading reentrancy runs after provider observation and preserves the newest commit", async (context) => {
	const { host } = setupDom(context);
	const controlled = controlledThenable<readonly CalendarEventInput[]>();
	const probe = createRenderProbe();
	const phases: CalendarPhase[] = [];
	let providerCalls = 0;
	let sourceSignal: AbortSignal | undefined;
	let calendarReference: Calendar | null = null;
	const calendar = createCalendar(host, {
		events: ({ signal }) => {
			providerCalls += 1;
			sourceSignal = signal;
			return controlled.promise;
		},
		initialDate: "2026-08-06",
		onStateChange: (state) => {
			phases.push(state.phase);
			if (state.phase === "loading") {
				calendarReference?.setEvents([event("newest", "Newest immediate event")]);
			}
		},
		renderHooks: [probe.hooks]
	});
	calendarReference = calendar;

	calendar.render();

	assert.equal(providerCalls, 1);
	assert.equal(controlled.observed, true);
	assert.ok(sourceSignal);
	assert.equal(sourceSignal.aborted, true);
	assert.equal(calendar.getState().phase, "ready");
	assert.equal(host.hasAttribute("aria-busy"), false);
	assert.equal(probe.mounts, DAYS_PER_GRID);
	assert.equal(probe.cleanups, 0);
	assert.match(host.textContent ?? "", /Newest immediate event/u);
	assert.deepEqual(phases, ["loading", "ready"]);

	controlled.resolve([event("stale", "Stale thenable event")]);
	await flushMicrotasks();
	assert.equal(probe.mounts, DAYS_PER_GRID);
	assert.doesNotMatch(host.textContent ?? "", /Stale thenable event/u);
	calendar.destroy();
});

void test("terminal ready replacement commits only the nested synchronous render", (context) => {
	const { host } = setupDom(context);
	const probe = createRenderProbe();
	const phases: CalendarPhase[] = [];
	let outerCalls = 0;
	let innerCalls = 0;
	let replaceFromReady = true;
	let calendarReference: Calendar | null = null;
	const calendar = createCalendar(host, {
		events: () => {
			outerCalls += 1;
			return [event("outer-ready", "Outer ready event")];
		},
		initialDate: "2026-08-06",
		onStateChange: (state) => {
			phases.push(state.phase);
			if (state.phase === "ready" && replaceFromReady) {
				replaceFromReady = false;
				calendarReference?.setEvents(() => {
					innerCalls += 1;
					return [event("inner-ready", "Inner ready event")];
				});
			}
		},
		renderHooks: [probe.hooks]
	});
	calendarReference = calendar;

	calendar.render();

	assert.equal(outerCalls, 1);
	assert.equal(innerCalls, 1);
	assert.equal(calendar.getState().phase, "ready");
	assert.equal(probe.mounts, DAYS_PER_GRID);
	assert.equal(probe.cleanups, 0);
	assert.match(host.textContent ?? "", /Inner ready event/u);
	assert.doesNotMatch(host.textContent ?? "", /Outer ready event/u);
	assert.deepEqual(phases, ["ready", "ready"]);
	calendar.destroy();
});

void test("terminal ready destruction runs after invocation and prevents the stale render", (context) => {
	const { host } = setupDom(context);
	const probe = createRenderProbe();
	const phases: CalendarPhase[] = [];
	let providerCalls = 0;
	let calendarReference: Calendar | null = null;
	const calendar = createCalendar(host, {
		events: () => {
			providerCalls += 1;
			return [event("destroyed-ready", "Destroyed ready event")];
		},
		initialDate: "2026-08-06",
		onStateChange: (state) => {
			phases.push(state.phase);
			if (state.phase === "ready") {
				calendarReference?.destroy();
			}
		},
		renderHooks: [probe.hooks]
	});
	calendarReference = calendar;

	calendar.render();

	assert.equal(providerCalls, 1);
	assert.equal(calendar.getState().phase, "destroyed");
	assert.equal(probe.mounts, 0);
	assert.equal(probe.cleanups, 0);
	assert.equal(host.childElementCount, 0);
	assert.deepEqual(phases, ["ready", "destroyed"]);
});

void test("initial extensions receive one terminal delivery for either source timing", async (context) => {
	const { dom, host } = setupDom(
		context,
		'<div id="calendar"></div><div id="async-calendar"></div>'
	);
	const asyncHost = dom.window.document.querySelector<HTMLElement>("#async-calendar");
	assert.ok(asyncHost);
	const pending = deferred<readonly CalendarEventInput[]>();
	const synchronousPhases: CalendarPhase[] = [];
	const asynchronousPhases: CalendarPhase[] = [];
	let synchronousCalendar: Calendar | null = null;
	let asynchronousCalendar: Calendar | null = null;
	const synchronousExtension = createRegisteredExtensionProbe({
		activate: () => ({
			stateChanged: () => {
				if (synchronousCalendar !== null) {
					synchronousPhases.push(synchronousCalendar.getState().phase);
				}
			}
		}),
		capabilities: ["state"],
		id: "my-synchronous-source-observer"
	});
	const asynchronousExtension = createRegisteredExtensionProbe({
		activate: () => ({
			stateChanged: () => {
				if (asynchronousCalendar !== null) {
					asynchronousPhases.push(asynchronousCalendar.getState().phase);
				}
			}
		}),
		capabilities: ["state"],
		id: "my-asynchronous-source-observer"
	});
	synchronousCalendar = createCalendar(host, {
		events: [],
		extensions: [synchronousExtension],
		initialDate: "2026-08-06"
	});
	asynchronousCalendar = createCalendar(asyncHost, {
		events: () => pending.promise,
		extensions: [asynchronousExtension],
		initialDate: "2026-08-06"
	});

	synchronousCalendar.render();
	asynchronousCalendar.render();
	await flushRegisteredExtensionTasks();
	assert.deepEqual(synchronousPhases, ["ready"]);
	assert.deepEqual(asynchronousPhases, []);

	pending.resolve([]);
	await waitForPhase(asynchronousCalendar, "ready");
	await flushRegisteredExtensionTasks();
	assert.deepEqual(synchronousPhases, ["ready"]);
	assert.deepEqual(asynchronousPhases, ["ready"]);
	synchronousCalendar.destroy();
	asynchronousCalendar.destroy();
});

interface TestDom {
	readonly dom: ReturnType<typeof createDom>;
	readonly host: HTMLElement;
}

interface RenderProbe {
	readonly cleanups: number;
	readonly hooks: Readonly<CalendarRenderHooks>;
	readonly mounts: number;
}

interface StateObservation {
	readonly busy: boolean;
	readonly eventRendered: boolean;
	readonly mounts: number;
	readonly phase: CalendarPhase;
}

interface ControlledThenable<T> {
	readonly observed: boolean;
	readonly promise: PromiseLike<T>;
	readonly resolve: (value: T) => void;
}

interface WeekReplacementProbe {
	readonly count: number;
}

function setupDom(
	context: TestContext,
	markup = '<div id="calendar"></div>'
): TestDom {
	const dom = createDom(markup);
	const restore = installDom(dom);
	context.after(restore);
	const host = dom.window.document.querySelector<HTMLElement>("#calendar");
	assert.ok(host);
	return { dom, host };
}

function createRenderProbe(): RenderProbe {
	let cleanups = 0;
	let mounts = 0;
	return {
		get cleanups(): number { return cleanups; },
		hooks: Object.freeze({
			dayDidMount: () => {
				mounts += 1;
				return () => {
					cleanups += 1;
					return undefined;
				};
			},
			id: "my-source-timing-render-probe"
		}),
		get mounts(): number { return mounts; }
	};
}

function observeWeekReplacements(
	context: TestContext,
	dom: ReturnType<typeof createDom>,
	host: HTMLElement
): WeekReplacementProbe {
	let count = 0;
	const collect = (records: readonly MutationRecord[]): void => {
		for (const record of records) {
			if (!(record.target instanceof dom.window.HTMLElement) ||
				!record.target.classList.contains("lfc-calendar-weeks")) {
				continue;
			}
			const rows = [...record.addedNodes].filter((node) =>
				node instanceof dom.window.HTMLElement &&
				node.classList.contains("lfc-calendar-week")
			);
			if (rows.length === 6) {
				count += 1;
			}
		}
	};
	const observer = new dom.window.MutationObserver(collect);
	observer.observe(host, { childList: true, subtree: true });
	context.after(() => { observer.disconnect(); });
	return {
		get count(): number {
			collect(observer.takeRecords());
			return count;
		}
	};
}

function event(
	id: string,
	title: string,
	start = "2026-08-06"
): CalendarEventInput {
	return { id, start, title };
}

function grid(host: HTMLElement): HTMLElement {
	const element = host.querySelector<HTMLElement>(".lfc-calendar-grid");
	assert.ok(element);
	return element;
}

function observeState(
	host: HTMLElement,
	probe: Readonly<RenderProbe>,
	phase: CalendarPhase,
	eventTitle: string
): StateObservation {
	return {
		busy: host.getAttribute("aria-busy") === "true",
		eventRendered: (host.textContent ?? "").includes(eventTitle),
		mounts: probe.mounts,
		phase
	};
}

function immediateThenable<T>(value: T, onObserved: () => void): PromiseLike<T> {
	const thenable: PromiseLike<T> = {
		then<TResult1 = T, TResult2 = never>(
			onfulfilled?: ((value: T) => TResult1 | PromiseLike<TResult1>) | null
		): PromiseLike<TResult1 | TResult2> {
			onObserved();
			if (onfulfilled !== undefined && onfulfilled !== null) {
				void onfulfilled(value);
			}
			return thenable as PromiseLike<unknown> as PromiseLike<TResult1 | TResult2>;
		}
	};
	return thenable;
}

function controlledThenable<T>(): ControlledThenable<T> {
	let observed = false;
	let resolveObserved: ((value: T) => void) | null = null;
	const thenable: PromiseLike<T> = {
		then<TResult1 = T, TResult2 = never>(
			onfulfilled?: ((value: T) => TResult1 | PromiseLike<TResult1>) | null
		): PromiseLike<TResult1 | TResult2> {
			observed = true;
			resolveObserved = onfulfilled === undefined || onfulfilled === null
				? null
				: (value) => { void onfulfilled(value); };
			return thenable as PromiseLike<unknown> as PromiseLike<TResult1 | TResult2>;
		}
	};
	return {
		get observed(): boolean { return observed; },
		promise: thenable,
		resolve: (value) => {
			assert.ok(resolveObserved, "Expected the source thenable to be observed before settlement.");
			resolveObserved(value);
		}
	};
}

async function waitForPhase(calendar: Calendar, phase: CalendarPhase): Promise<void> {
	await waitFor(() => calendar.getState().phase === phase, `${phase} calendar state`);
}

async function flushMicrotasks(): Promise<void> {
	await Promise.resolve();
	await Promise.resolve();
	await Promise.resolve();
}
