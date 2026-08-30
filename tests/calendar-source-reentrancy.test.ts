import assert from "node:assert/strict";
import test, { type TestContext } from "node:test";

import {
	createCalendar,
	type Calendar,
	type CalendarEventInput,
	type CalendarPhase,
	type LitefoldCalendarError
} from "../src/index.js";
import {
	createDom,
	deferred,
	installDom,
	waitFor
} from "./helpers/dom.js";

void test("destroy from the host busy-add callback prevents stale loading publication", async (context) => {
	let calendar: Calendar | null = null;
	let sourceSignal: AbortSignal | undefined;
	const pending = deferred<readonly CalendarEventInput[]>();
	const phases: CalendarPhase[] = [];
	const { host } = setupObservedBusyHost(context, (_oldValue, newValue) => {
		if (newValue === "true") {
			calendar?.destroy();
		}
	});
	calendar = createCalendar(host, {
		events: ({ signal }) => {
			sourceSignal = signal;
			return pending.promise;
		},
		initialDate: "2026-07-14",
		onStateChange: (state) => { phases.push(state.phase); }
	});

	calendar.render();

	assert.ok(sourceSignal);
	assert.equal(sourceSignal.aborted, true);
	assert.equal(calendar.getState().phase, "destroyed");
	assert.deepEqual(phases, ["destroyed"]);
	assert.equal(host.childElementCount, 0);
	assert.equal(host.hasAttribute("aria-busy"), false);
	pending.resolve([event("stale", "Stale terminal event")]);
	await flushMicrotasks();
	assert.equal(calendar.getState().phase, "destroyed");
	assert.equal(host.childElementCount, 0);
	assert.doesNotMatch(host.textContent ?? "", /Stale terminal event/u);
});

void test("destroy from the host busy-removal callback prevents stale terminal publication", async (context) => {
	let armed = false;
	let calendar: Calendar | null = null;
	const pending = deferred<readonly CalendarEventInput[]>();
	const phases: CalendarPhase[] = [];
	const { host } = setupObservedBusyHost(context, (_oldValue, newValue) => {
		if (armed && newValue === null) {
			armed = false;
			calendar?.destroy();
		}
	});
	calendar = createCalendar(host, {
		events: () => pending.promise,
		initialDate: "2026-07-14",
		onStateChange: (state) => { phases.push(state.phase); }
	});
	calendar.render();
	assert.equal(calendar.getState().phase, "loading");
	assert.equal(host.getAttribute("aria-busy"), "true");
	armed = true;

	pending.resolve([event("stale", "Stale terminal event")]);
	await waitFor(() => calendar?.getState().phase === "destroyed", "destroy from busy removal");
	await flushMicrotasks();

	assert.deepEqual(phases, ["loading", "destroyed"]);
	assert.equal(calendar.getState().phase, "destroyed");
	assert.equal(host.childElementCount, 0);
	assert.equal(host.hasAttribute("aria-busy"), false);
	assert.doesNotMatch(host.textContent ?? "", /Stale terminal event/u);
});

void test("a newer async request started by busy removal retains loading ownership", async (context) => {
	let armed = false;
	let calendar: Calendar | null = null;
	let replacementRequests = 0;
	const first = deferred<readonly CalendarEventInput[]>();
	const replacement = deferred<readonly CalendarEventInput[]>();
	const phases: CalendarPhase[] = [];
	const { host } = setupObservedBusyHost(context, (_oldValue, newValue) => {
		if (armed && newValue === null) {
			armed = false;
			calendar?.setEvents(() => {
				replacementRequests += 1;
				return replacement.promise;
			});
		}
	});
	calendar = createCalendar(host, {
		events: () => first.promise,
		initialDate: "2026-07-14",
		onStateChange: (state) => { phases.push(state.phase); }
	});
	calendar.render();
	const grid = getGrid(host);
	assert.equal(calendar.getState().phase, "loading");
	armed = true;

	first.resolve([event("first", "First terminal event")]);
	await waitFor(() => replacementRequests === 1, "replacement request from busy removal");
	await flushMicrotasks();

	assert.equal(calendar.getState().phase, "loading");
	assert.equal(host.getAttribute("aria-busy"), "true");
	assert.equal(grid.getAttribute("aria-busy"), "true");
	assert.deepEqual(phases, ["loading", "loading"]);
	replacement.resolve([event("replacement", "Replacement terminal event")]);
	await waitForPhase(calendar, "ready");

	assert.equal(host.hasAttribute("aria-busy"), false);
	assert.equal(grid.hasAttribute("aria-busy"), false);
	assert.deepEqual(phases, ["loading", "loading", "ready"]);
	assert.match(host.textContent ?? "", /Replacement terminal event/u);
	assert.doesNotMatch(host.textContent ?? "", /First terminal event/u);
});

void test("fatal loading abort reentrancy cannot repopulate a destroyed host", async (context) => {
	const { host } = setupDom(context);
	let calendar: Calendar | null = null;
	let failClock = false;
	let sourceSignal: AbortSignal | undefined;
	const pending = deferred<readonly CalendarEventInput[]>();
	calendar = createCalendar(host, {
		events: ({ signal }) => {
			sourceSignal = signal;
			signal.addEventListener("abort", () => { calendar?.destroy(); }, { once: true });
			failClock = true;
			return pending.promise;
		},
		initialDate: "2026-07-14",
		now: () => {
			if (failClock) {
				throw new Error("fatal loading clock failure");
			}
			return new Date("2026-07-14T12:00:00.000Z");
		},
		onError: () => "handled"
	});

	calendar.render();
	await flushMicrotasks();

	assert.ok(sourceSignal);
	assert.equal(sourceSignal.aborted, true);
	assert.equal(calendar.getState().phase, "destroyed");
	assert.equal(host.childElementCount, 0);
	assert.equal(host.classList.contains("litefold-calendar"), false);
	assert.equal(host.hasAttribute("data-litefold-calendar"), false);
	pending.resolve([]);
	await flushMicrotasks();
	assert.equal(calendar.getState().phase, "destroyed");
	assert.equal(host.childElementCount, 0);
});

void test("async fallback commit failures enter the direct fatal path without an unhandled rejection", async (context) => {
	const { dom, host: asyncHost } = setupDom(context);
	const directHost = dom.window.document.createElement("div");
	const failures = new WeakMap<HTMLElement, Error>();
	class ThrowingFallbackElement extends dom.window.HTMLElement {
		public override get hidden(): HTMLElement["hidden"] { return super.hidden; }

		public override set hidden(value: HTMLElement["hidden"]) {
			const failure = failures.get(this);
			if (value === true && failure !== undefined) {
				throw failure;
			}
			super.hidden = value;
		}
	}
	dom.window.customElements.define("lfc-throwing-fallback", ThrowingFallbackElement);
	const directFallback = dom.window.document.createElement("lfc-throwing-fallback");
	const asyncFallback = dom.window.document.createElement("lfc-throwing-fallback");
	directFallback.textContent = "Direct server fallback";
	asyncFallback.textContent = "Async server fallback";
	asyncHost.before(asyncFallback, directFallback, directHost);
	const directFailure = new Error("direct fallback hide failure");
	const asyncFailure = new Error("async fallback hide failure");
	failures.set(directFallback, directFailure);
	failures.set(asyncFallback, asyncFailure);
	const directErrors: LitefoldCalendarError[] = [];
	const asyncErrors: LitefoldCalendarError[] = [];
	let leakedRejection = false;
	const trackUnhandledRejection = (reason: unknown): void => {
		if (reason === asyncFailure) {
			leakedRejection = true;
		}
	};
	process.on("unhandledRejection", trackUnhandledRejection);
	context.after(() => { process.off("unhandledRejection", trackUnhandledRejection); });

	const directCalendar = createCalendar(directHost, {
		events: [],
		fallbackElement: directFallback,
		initialDate: "2026-07-14",
		onError: (error) => { directErrors.push(error); return "handled"; }
	});
	directCalendar.render();
	assert.equal(directCalendar.getState().phase, "unavailable");
	assert.equal(directFallback.hidden, false);
	assert.deepEqual(directErrors.map((error) => error.code), ["internal-error"]);
	assert.equal(directErrors[0]?.cause, directFailure);

	const pending = deferred<readonly CalendarEventInput[]>();
	const asyncCalendar = createCalendar(asyncHost, {
		events: () => pending.promise,
		fallbackElement: asyncFallback,
		initialDate: "2026-07-14",
		onError: (error) => { asyncErrors.push(error); return "handled"; }
	});
	asyncCalendar.render();
	assert.equal(asyncCalendar.getState().phase, "loading");
	pending.resolve([]);
	await waitForPhase(asyncCalendar, "unavailable");
	await Promise.resolve();
	await new Promise<void>((resolve) => { setImmediate(resolve); });

	assert.equal(leakedRejection, false);
	assert.equal(asyncFallback.hidden, false);
	assert.deepEqual(asyncErrors.map((error) => error.code), ["internal-error"]);
	assert.equal(asyncErrors[0]?.cause, asyncFailure);
});

void test("destroy from a fallback hidden callback restores visibility and releases its lease", (context) => {
	const { dom, host } = setupDom(context);
	let calendar: Calendar | null = null;
	let hiddenAdds = 0;
	class DestroyingFallbackElement extends dom.window.HTMLElement {
		public static readonly observedAttributes = ["hidden"];

		public attributeChangedCallback(
			_name: string,
			oldValue: string | null,
			newValue: string | null
		): void {
			if (oldValue === null && newValue !== null) {
				hiddenAdds += 1;
				calendar?.destroy();
			}
		}
	}
	dom.window.customElements.define("lfc-destroying-fallback", DestroyingFallbackElement);
	const fallback = dom.window.document.createElement("lfc-destroying-fallback");
	fallback.textContent = "Server fallback";
	host.before(fallback);
	const successorHost = dom.window.document.createElement("div");
	host.after(successorHost);
	assert.equal(fallback.hidden, false);

	calendar = createCalendar(host, {
		events: [event("initial", "Initial immediate event")],
		fallbackElement: fallback,
		initialDate: "2026-07-14"
	});
	calendar.render();

	assert.equal(hiddenAdds, 1);
	assert.equal(calendar.getState().phase, "destroyed");
	assert.equal(host.childElementCount, 0);
	assert.equal(fallback.hidden, false, "Destroy must restore the fallback's original visibility.");
	assert.equal(fallback.hasAttribute("hidden"), false);

	const successor = createCalendar(successorHost, {
		events: [],
		fallbackElement: fallback,
		initialDate: "2026-07-14"
	});
	assert.doesNotThrow(() => { successor.render(); }, "Destroy must release the fallback lease.");
	assert.equal(successor.getState().phase, "ready");
	assert.equal(fallback.hidden, true);
	successor.destroy();
	assert.equal(fallback.hidden, false);
});

void test("fatal month-picker close stops after an application toggle listener destroys the calendar", async (context) => {
	const { dom, host } = setupDom(context);
	let calendar: Calendar | null = null;
	let throwDuringRender = false;
	calendar = createCalendar(host, {
		events: [],
		initialDate: "2026-07-14",
		onError: () => "handled",
		now: () => {
			if (throwDuringRender) {
				throw new Error("fatal render after picker opened");
			}
			return new Date("2026-07-14T12:00:00.000Z");
		}
	});
	calendar.render();
	assert.equal(calendar.getState().phase, "ready");

	const trigger = host.querySelector<HTMLButtonElement>(".lfc-calendar-title-button");
	const picker = host.querySelector<HTMLElement>(".lfc-calendar-month-picker");
	const navigation = host.querySelector<HTMLElement>(".lfc-calendar-navigation");
	assert.ok(trigger);
	assert.ok(picker);
	assert.ok(navigation);
	trigger.click();
	const staleMutations: MutationRecord[] = [];
	const observer = new dom.window.MutationObserver((records) => { staleMutations.push(...records); });
	observer.observe(navigation, { attributes: true });
	picker.addEventListener("toggle", () => { calendar?.destroy(); }, { once: true });
	throwDuringRender = true;

	assert.doesNotThrow(() => { calendar?.setEvents([event("fatal", "Fatal event")]); });
	await flushMicrotasks();
	observer.disconnect();

	assert.equal(calendar.getState().phase, "destroyed");
	assert.equal(host.childElementCount, 0);
	assert.equal(staleMutations.length, 0,
		"Fatal presentation must not mutate detached calendar nodes after the picker callback destroys it.");
});

interface TestDom {
	readonly dom: ReturnType<typeof createDom>;
	readonly host: HTMLElement;
}

function setupObservedBusyHost(
	context: TestContext,
	onAttributeChanged: (oldValue: string | null, newValue: string | null) => void
): TestDom {
	const dom = createDom("<main></main>");
	const restore = installDom(dom);
	context.after(restore);
	class ObservedBusyHost extends dom.window.HTMLElement {
		public static readonly observedAttributes = ["aria-busy"];

		public attributeChangedCallback(
			_name: string,
			oldValue: string | null,
			newValue: string | null
		): void {
			onAttributeChanged(oldValue, newValue);
		}
	}
	dom.window.customElements.define("lfc-observed-busy-host", ObservedBusyHost);
	const host = dom.window.document.createElement("lfc-observed-busy-host");
	host.id = "calendar";
	dom.window.document.body.append(host);
	return { dom, host };
}

function setupDom(context: TestContext): TestDom {
	const dom = createDom();
	const restore = installDom(dom);
	context.after(restore);
	const host = dom.window.document.querySelector<HTMLElement>("#calendar");
	assert.ok(host);
	return { dom, host };
}

function event(id: string, title: string): CalendarEventInput {
	return { id, start: "2026-07-14", title };
}

function getGrid(host: HTMLElement): HTMLElement {
	const grid = host.querySelector<HTMLElement>("[role='grid']");
	assert.ok(grid);
	return grid;
}

async function waitForPhase(calendar: Calendar, phase: CalendarPhase): Promise<void> {
	await waitFor(() => calendar.getState().phase === phase, `${phase} calendar state`);
}

async function flushMicrotasks(): Promise<void> {
	await Promise.resolve();
	await Promise.resolve();
	await Promise.resolve();
}
