import assert from "node:assert/strict";
import test, { type TestContext } from "node:test";

import {
	createCalendar,
	type Calendar,
	type CalendarEventInput,
	LitefoldCalendarError
} from "../src/index.js";
import {
	createDom,
	deferred,
	dispatchClick,
	dispatchKey,
	installDom,
	waitFor
} from "./helpers/dom.js";

void test("an onError thenable never transfers presentation ownership and is fully observed", async (context) => {
	const { host } = setupDom(context);
	const reported: unknown[] = [];
	const priorReporter = Object.getOwnPropertyDescriptor(globalThis, "reportError");
	Object.defineProperty(globalThis, "reportError", {
		configurable: true,
		value: (error: unknown) => { reported.push(error); }
	});
	context.after(() => {
		if (priorReporter === undefined) {
			Reflect.deleteProperty(globalThis, "reportError");
		} else {
			Object.defineProperty(globalThis, "reportError", priorReporter);
		}
	});
	const options = {
		events: async (): Promise<readonly CalendarEventInput[]> => { throw new Error("source failure"); },
		initialDate: "2026-07-14"
	};
	Reflect.set(options, "onError", () => Promise.reject(new Error("async handler rejection")));
	const calendar = createCalendar(host, options);
	calendar.render();
	await waitFor(() => reported.length === 1, "observed onError thenable");
	await Promise.resolve();

	assert.ok(findRetryButton(host), "A thenable return must retain package-owned error UI.");
	assert.equal(reported.length, 1, "A rejected onError thenable must produce one aggregate report.");
	assert.ok(reported.every((error) => error instanceof AggregateError));
});

void test("sources are invoked synchronously for render, refetch, and range changes", async (context) => {
	const { host } = setupDom(context);
	let requests = 0;
	const calendar = createCalendar(host, {
		events: async () => {
			requests += 1;
			return [];
		},
		initialDate: "2026-07-14"
	});

	calendar.render();
	assert.equal(requests, 1);
	calendar.refetchEvents();
	assert.equal(requests, 2);
	calendar.next();
	assert.equal(requests, 3);
	await waitForPhase(calendar, "ready");
});

void test("generated DOM names use the public root and lfc internal namespaces", async (context) => {
	const { host } = setupDom(context);
	const calendar = createCalendar(host, {
		events: async () => [event("namespace", "2026-07-14", "Namespace")],
		initialDate: "2026-07-14"
	});

	calendar.render();
	await waitForPhase(calendar, "ready");

	const generatedElements = [host, ...host.querySelectorAll("*")];
	for (const element of generatedElements) {
		for (const className of element.classList) {
			if (element === host && className === "litefold-calendar") {
				continue;
			}
			assert.match(className, /^lfc-[a-z0-9]+(?:-[a-z0-9]+)*$/u);
		}
		for (const attribute of element.attributes) {
			if (attribute.name.startsWith("data-")) {
				if (element === host && attribute.name === "data-litefold-calendar") {
					assert.equal(attribute.value, "");
					continue;
				}
				assert.match(attribute.name, /^data-lfc-[a-z0-9]+(?:-[a-z0-9]+)*$/u);
			}
		}
		if (element !== host && element.id.length > 0) {
			assert.match(element.id, /^lfc-[a-z0-9]+(?:-[a-z0-9]+)*$/u);
		}
	}
	assert.equal(host.classList.contains("litefold-calendar"), true);
	assert.equal(host.getAttribute("data-litefold-calendar"), "");
	assert.equal(host.querySelector("[data-litefold-calendar]"), null);
});

void test("Date inputs and a cross-realm clock project through the configured time zone", async (context) => {
	const { host } = setupDom(context);
	const foreignDom = createDom();
	context.after(() => { foreignDom.window.close(); });
	const instant = new foreignDom.window.Date("2026-07-15T01:00:00.000Z");
	const calendar = createCalendar(host, {
		events: async () => [],
		initialDate: instant,
		maxDate: new foreignDom.window.Date("2026-08-01T01:00:00.000Z"),
		minDate: new foreignDom.window.Date("2026-07-15T01:00:00.000Z"),
		now: () => instant,
		timeZone: "America/Los_Angeles"
	});

	calendar.render();
	await waitForPhase(calendar, "ready");
	assertSelected(host, "2026-07-14");
	calendar.gotoDate(new foreignDom.window.Date("2026-08-01T01:00:00.000Z"));
	await waitForPhase(calendar, "ready");
	assertSelected(host, "2026-07-31");
	calendar.focusToday();
	assertSelected(host, "2026-07-14");
});

void test("an omitted initialDate defaults to the date produced by now", async (context) => {
	const { host } = setupDom(context);
	const calendar = createCalendar(host, {
		events: async () => [],
		now: () => new Date("2026-07-15T01:00:00.000Z"),
		timeZone: "America/Los_Angeles"
	});

	calendar.render();
	await waitForPhase(calendar, "ready");
	assertSelected(host, "2026-07-14");
});

void test("a losing calendar instance cannot mutate another instance's host", async (context) => {
	const { host } = setupDom(context);
	const first = createCalendar(host, {
		events: async () => [],
		initialDate: "2026-07-14"
	});
	const losing = createCalendar(host, {
		events: async () => [],
		initialDate: "2026-07-14"
	});
	first.render();
	await waitForPhase(first, "ready");
	assert.throws(
		() => { losing.render(); },
		(error: unknown) => error instanceof LitefoldCalendarError &&
			error.code === "invalid-state" && error.recoverable && /owned by another live calendar/i.test(error.message)
	);
	const ownedMarkup = host.innerHTML;
	losing.destroy();
	assert.equal(host.innerHTML, ownedMarkup);
	assert.equal(host.hasAttribute("data-litefold-calendar"), true);

	first.destroy();
	const replacement = createCalendar(host, {
		events: async () => [],
		initialDate: "2026-07-14"
	});
	replacement.render();
	await waitForPhase(replacement, "ready");
	assert.equal(host.hasAttribute("data-litefold-calendar"), true);
});

void test("action issues clear only after a current success for the same hook", async (context) => {
	const { dom, host } = setupDom(context);
	const firstAction = deferred<void>();
	let activation = 0;
	const calendar = createCalendar(host, {
		onEventActivate: () => {
			activation += 1;
			return activation === 1
				? firstAction.promise
				: activation === 2 ? Promise.reject(new Error("newer failure")) : Promise.resolve();
		},
		events: async () => [event("action-generation", "2026-07-14T09:00", "Action generation")],
		initialDate: "2026-07-14",
		onError: () => undefined
	});
	calendar.render();
	await waitForPhase(calendar, "ready");
	const action = getAgenda(host).querySelector<HTMLButtonElement>("button[data-lfc-event-id]");
	assert.ok(action);
	dispatchClick(dom, action);
	dispatchClick(dom, action);
	await waitFor(() => calendar.getState().issues.some((issue) => issue.code === "action-failed"), "new action failure");
	firstAction.resolve();
	await Promise.resolve();
	assert.ok(host.querySelector(".lfc-calendar-status-panel:not([hidden])"));

	dispatchClick(dom, findDayButton(host, "2026-07-15"));
	assert.ok(host.querySelector(".lfc-calendar-status-panel:not([hidden])"));
	calendar.focusDate("2026-07-14");
	const retryAction = getAgenda(host).querySelector<HTMLButtonElement>("button[data-lfc-event-id]");
	assert.ok(retryAction);
	dispatchClick(dom, retryAction);
	await waitFor(() => host.querySelector(".lfc-calendar-status-panel:not([hidden])") === null, "action recovery");
});

void test("synchronous reentrant actions preserve only the newest action outcome", async (context) => {
	const { dom, host } = setupDom(context);
	const errors: LitefoldCalendarError[] = [];
	let depth = 0;
	let scenario: "newer-fails" | "older-fails" | "success" = "newer-fails";
	const calendar = createCalendar(host, {
		events: [],
		initialDate: "2026-07-14",
		onDaySelect: () => {
			if (scenario === "success") {
				return;
			}
			if (depth === 0) {
				depth = 1;
				dispatchClick(
					dom,
					findDayButton(host, scenario === "newer-fails" ? "2026-07-15" : "2026-07-18")
				);
				depth = 0;
				if (scenario === "older-fails") {
					throw new Error("stale outer failure");
				}
				return;
			}
			if (scenario === "newer-fails") {
				throw new Error("current nested failure");
			}
		},
		onError: (error) => { errors.push(error); }
	});
	calendar.render();
	await waitForPhase(calendar, "ready");

	dispatchClick(dom, findDayButton(host, "2026-07-14"));
	assert.ok(calendar.getState().issues.some((issue) => issue.code === "action-failed"));
	assert.equal(errors.at(-1)?.stale, false);

	scenario = "success";
	dispatchClick(dom, findDayButton(host, "2026-07-16"));
	assert.equal(calendar.getState().issues.some((issue) => issue.code === "action-failed"), false);

	scenario = "older-fails";
	dispatchClick(dom, findDayButton(host, "2026-07-17"));
	assert.equal(errors.at(-1)?.stale, true);
	assert.equal(calendar.getState().issues.some((issue) => issue.code === "action-failed"), false);
});

void test("extension nodes must be detached, noninteractive, and remain application-owned if moved", async (context) => {
	const { dom, host } = setupDom(context, '<div id="outside"><span id="connected">Connected</span></div><div id="calendar"></div>');
	const outside = dom.window.document.querySelector<HTMLElement>("#outside");
	const connected = dom.window.document.querySelector<HTMLElement>("#connected");
	assert.ok(outside);
	assert.ok(connected);
	const leasedNodes: HTMLSpanElement[] = [];
	const errors: LitefoldCalendarError[] = [];
	const calendar = createCalendar(host, {
		events: async () => [event("lease", "2026-07-14", "Lease")],
		extensions: [
			{ id: "connected", renderEventDetails: () => connected },
			{ id: "interactive", renderEventTrailing: () => dom.window.document.createElement("button") },
			{
				id: "movable",
				renderEventLeading: () => {
					if (leasedNodes.length > 0) {
						return null;
					}
					const node = dom.window.document.createElement("span");
					node.textContent = "Movable";
					leasedNodes.push(node);
					return node;
				}
			}
		],
		initialDate: "2026-07-14",
		onError: (error) => { errors.push(error); }
	});
	calendar.render();
	await waitForPhase(calendar, "degraded");
	assert.equal(connected.parentElement, outside);
	assert.equal(errors.filter((error) => error.code === "extension-failed").length, 2);
	const leasedNode = leasedNodes[0];
	assert.ok(leasedNode);
	outside.append(leasedNode);
	calendar.destroy();
	assert.equal(leasedNode.parentElement, outside);
});

void test("async returns from synchronous host and cleanup callbacks are observed and surfaced", async (context) => {
	const { host } = setupDom(context);
	const errors: LitefoldCalendarError[] = [];
	let cleanupSawAbort = false;
	const options = {
		events: async () => [event("callbacks", "2026-07-14", "Callbacks")],
		extensions: [{
			eventDidMount: ({ signal }: { readonly signal: AbortSignal }) => () => {
				cleanupSawAbort = signal.aborted;
				return Promise.reject(new Error("async cleanup rejection"));
			},
			id: "async-cleanup"
		}],
		initialDate: "2026-07-14",
		onError: (error: LitefoldCalendarError) => { errors.push(error); }
	};
	Reflect.set(options, "onAnnounce", async () => undefined);
	Reflect.set(options, "onStateChange", async () => undefined);
	const calendar = createCalendar(host, options);
	calendar.render();
	await waitFor(() => errors.some((error) => error.hook === "onStateChange"), "async state callback error");
	await waitFor(() => getAgenda(host).textContent?.includes("Callbacks") === true, "mounted callback event");
	calendar.focusDate("2026-07-14");
	await waitFor(() => errors.some((error) => error.extensionId === "async-cleanup"), "async cleanup error");
	assert.equal(cleanupSawAbort, true);
	assert.ok(errors.some((error) => error.code === "host-integration-failed"));
	assert.ok(errors.some((error) => error.code === "extension-failed"));
});

void test("a fatal render failure creates an unavailable fallback and restores removed owned focus", (context) => {
	const { dom, host } = setupDom(context, '<div id="calendar"><button id="owned">Owned focus</button></div>');
	const owned = dom.window.document.querySelector<HTMLButtonElement>("#owned");
	assert.ok(owned);
	owned.focus();
	let requests = 0;
	let throwOnce = true;
	const replaceChildren = host.replaceChildren.bind(host);
	host.replaceChildren = (...nodes: (Node | string)[]): void => {
		if (throwOnce) {
			throwOnce = false;
			throw new Error("render failure");
		}
		replaceChildren(...nodes);
	};
	const calendar = createCalendar(host, {
		events: async () => {
			requests += 1;
			return [];
		},
		initialDate: "2026-07-14",
		onError: () => undefined
	});
	calendar.render();

	assert.equal(requests, 0);
	assert.equal(calendar.getState().phase, "unavailable");
	assert.equal(host.classList.contains("litefold-calendar"), true);
	assert.equal(host.getAttribute("data-litefold-calendar"), "");
	const panel = host.querySelector<HTMLElement>(".lfc-calendar-status-panel:not([hidden])");
	assert.ok(panel);
	assert.equal(host.querySelector<HTMLElement>(".lfc-calendar-grid")?.hidden, true);
	assert.equal(host.querySelector<HTMLElement>(".lfc-calendar-agenda")?.hidden, true);
	assert.equal(dom.window.document.activeElement, panel.querySelector(".lfc-calendar-status-title"));

	calendar.destroy();
	assert.equal(host.classList.contains("litefold-calendar"), false);
	assert.equal(host.hasAttribute("data-litefold-calendar"), false);
});

void test("destroy aborts requests, removes package DOM and classes, and is terminal", async (context) => {
	const { host } = setupDom(context);
	const pending = deferred<readonly CalendarEventInput[]>();
	let sourceSignal: AbortSignal | undefined;
	let requests = 0;
	const errors: LitefoldCalendarError[] = [];
	const calendar = createCalendar(host, {
		events: ({ signal }) => {
			requests += 1;
			sourceSignal = signal;
			return pending.promise;
		},
		initialDate: "2026-07-14",
		onError: (error) => {
			errors.push(error);
			return "handled";
		}
	});
	calendar.render();
	await waitFor(() => sourceSignal !== undefined, "active source signal");
	assert.ok(sourceSignal);
	calendar.destroy();
	calendar.destroy();
	for (const operation of [() => { calendar.next(); }, () => { calendar.refetchEvents(); }]) {
		assert.throws(operation, (error: unknown) =>
			error instanceof LitefoldCalendarError && error.code === "invalid-state");
	}
	await Promise.resolve();

	assert.equal(sourceSignal.aborted, true);
	assert.equal(requests, 1);
	assert.equal(host.childElementCount, 0);
	assert.equal(host.classList.contains("litefold-calendar"), false);
	assert.equal(host.hasAttribute("data-litefold-calendar"), false);
	assert.equal(calendar.getState().phase, "destroyed");
	assert.equal(errors.length, 0);
});

void test("callback reentrancy cannot invoke a source or overwrite destroyed state", async (context) => {
	const { host } = setupDom(context);
	let sourceCalls = 0;
	const loadingReference: { current: Calendar | null } = { current: null };
	const loadingCalendar = createCalendar(host, {
		events: async () => {
			sourceCalls += 1;
			return [];
		},
		initialDate: "2026-07-14",
		onStateChange: (state) => {
			if (state.phase === "loading") {
				loadingReference.current?.destroy();
			}
		}
	});
	loadingReference.current = loadingCalendar;
	loadingCalendar.render();
	assert.equal(sourceCalls, 0);
	assert.equal(loadingCalendar.getState().phase, "destroyed");
	assert.equal(host.childElementCount, 0);

	const failingReference: { current: Calendar | null } = { current: null };
	const failingCalendar = createCalendar(host, {
		events: async () => { throw new Error("source failure"); },
		initialDate: "2026-07-14",
		onError: () => { failingReference.current?.destroy(); }
	});
	failingReference.current = failingCalendar;
	failingCalendar.render();
	await waitFor(() => failingCalendar?.getState().phase === "destroyed", "destroy from onError");
	assert.equal(failingCalendar.getState().phase, "destroyed");
	assert.equal(host.childElementCount, 0);
});

void test("extension hooks stop and clean up after reentrant destroy", (context) => {
	const { host } = setupDom(context);
	let renderCalls = 0;
	let returnedNode: HTMLElement | undefined;
	let renderingCalendar: Calendar | null = null;
	const first = createCalendar(host, {
		events: [],
		extensions: [{
			id: "destroying-render-hook",
			renderDayBadge: ({ document: ownerDocument }) => {
				renderCalls += 1;
				returnedNode = ownerDocument.createElement("span");
				renderingCalendar?.destroy();
				return returnedNode;
			}
		}],
		initialDate: "2026-07-14"
	});
	renderingCalendar = first;
	first.render();

	assert.equal(renderCalls, 1);
	assert.equal(returnedNode?.parentNode, null);
	assert.equal(first.getState().phase, "destroyed");
	assert.equal(host.childElementCount, 0);

	let mountCalls = 0;
	let cleanups = 0;
	let mountingCalendar: Calendar | null = null;
	const second = createCalendar(host, {
		events: [],
		extensions: [{
			dayDidMount: () => {
				mountCalls += 1;
				mountingCalendar?.destroy();
				return () => { cleanups += 1; };
			},
			id: "destroying-mount-hook"
		}],
		initialDate: "2026-07-14"
	});
	mountingCalendar = second;
	second.render();

	assert.equal(mountCalls, 1);
	assert.equal(cleanups, 1);
	assert.equal(second.getState().phase, "destroyed");
	assert.equal(host.childElementCount, 0);
});

void test("extension node leases survive connected-callback teardown without blocking reuse", async (context) => {
	const { dom, host } = setupDom(context);
	let activeCalendar: Calendar | null = null;
	let connections = 0;
	class DestroyingExtensionElement extends dom.window.HTMLElement {
		public connectedCallback(): void {
			connections += 1;
			activeCalendar?.destroy();
		}
	}
	dom.window.customElements.define("lfc-destroying-extension", DestroyingExtensionElement);
	const extensionNode = dom.window.document.createElement("lfc-destroying-extension");
	let firstReturned = false;
	const first = createCalendar(host, {
		events: [],
		extensions: [{
			id: "connected-destroy",
			renderDayBadge: () => {
				if (firstReturned) {
					return null;
				}
				firstReturned = true;
				return extensionNode;
			}
		}],
		initialDate: "2026-07-14"
	});
	activeCalendar = first;
	first.render();

	assert.equal(first.getState().phase, "destroyed");
	assert.equal(extensionNode.parentNode, null);
	assert.equal(connections, 1);
	const connectionsBeforeReuse = connections;

	activeCalendar = null;
	const errors: LitefoldCalendarError[] = [];
	const second = createCalendar(host, {
		events: [],
			extensions: [{
			id: "connected-reuse",
			renderDayBadge: () => {
				if (extensionNode.parentNode === null) {
					return extensionNode;
				}
				return null;
			}
		}],
		initialDate: "2026-07-14",
		onError: (error) => { errors.push(error); }
	});
	second.render();
	await waitForPhase(second, "ready");

	assert.ok(connections > connectionsBeforeReuse);
	assert.equal(host.contains(extensionNode), true);
	assert.equal(errors.some((error) => error.code === "extension-failed"), false);
	second.destroy();
	assert.equal(extensionNode.parentNode, null);
});

void test("Page navigation always changes month while arrows remain focus-only at the grid boundary", async (context) => {
	const { dom, host } = setupDom(context);
	let requests = 0;
	const selectedDates: string[] = [];
	const calendar = createCalendar(host, {
		onDaySelect: ({ dateString }) => { selectedDates.push(dateString); },
		events: async () => {
			requests += 1;
			return [];
		},
		firstDay: 0,
		initialDate: "2026-07-08"
	});
	calendar.render();
	await waitForPhase(calendar, "ready");

	const lastVisibleDay = findDayButton(host, "2026-08-08");
	lastVisibleDay.focus();
	dispatchKey(dom, lastVisibleDay, "ArrowDown");
	assert.equal(dom.window.document.activeElement, lastVisibleDay);
	assertSelected(host, "2026-07-08");
	assert.equal(requests, 1);

	const pageStart = findDayButton(host, "2026-07-08");
	pageStart.focus();
	dispatchKey(dom, pageStart, "PageDown");
	assert.equal(requests, 2, "PageDown must request August even though August 8 was already visible.");
	await waitForPhase(calendar, "ready");
	assertSelected(host, "2026-08-08");
	assert.match(host.querySelector(".lfc-calendar-title")?.textContent ?? "", /August 2026/);
	assert.deepEqual(selectedDates, []);
});

void test("destroy detaches toolbar content for reuse and duplicate cleanup registrations all execute", async (context) => {
	const { host } = setupDom(context, '<div id="calendar"><fieldset id="filters"><legend>Filters</legend></fieldset></div>');
	const toolbarEnd = host.querySelector<HTMLElement>("#filters");
	assert.ok(toolbarEnd);
	let registrations = 0;
	let cleanups = 0;
	const cleanup = (): void => { cleanups += 1; };
	const calendar = createCalendar(host, {
		events: async () => [event("cleanup", "2026-07-14", "Cleanup")],
		extensions: [{
			eventDidMount: () => {
				registrations += 1;
				return cleanup;
			},
			id: "duplicate-cleanup"
		}],
		initialDate: "2026-07-14",
		toolbarEnd
	});
	calendar.render();
	await waitForPhase(calendar, "ready");
	const expectedCleanups = registrations;
	calendar.focusDate("2026-07-14");
	assert.equal(cleanups, expectedCleanups);
	calendar.destroy();
	assert.equal(toolbarEnd.parentNode, null);

	const replacement = createCalendar(host, {
		events: async () => [],
		initialDate: "2026-07-14",
		toolbarEnd
	});
	replacement.render();
	await waitForPhase(replacement, "ready");
	assert.equal(host.contains(toolbarEnd), true);
});

void test("interactive icon content is rejected and later clock failures become fatal", (context) => {
	const { host } = setupDom(context);
	const interactiveIcon = host.ownerDocument.createElement("span");
	interactiveIcon.append(host.ownerDocument.createElement("details"));
	assert.throws(
		() => createCalendar(host, {
			events: async () => [],
			icons: { previous: () => interactiveIcon }
		}),
		(error: unknown) => error instanceof LitefoldCalendarError && error.code === "invalid-configuration"
	);

	let clockCalls = 0;
	let sourceCalls = 0;
	const errors: LitefoldCalendarError[] = [];
	const calendar = createCalendar(host, {
		events: async () => {
			sourceCalls += 1;
			return [];
		},
		initialDate: "2026-07-14",
		now: () => {
			clockCalls += 1;
			if (clockCalls === 1) {
				return new Date("2026-07-14T12:00:00.000Z");
			}
			throw new Error("clock failed");
		},
		onError: (error) => { errors.push(error); }
	});
	calendar.render();
	assert.equal(sourceCalls, 0);
	assert.equal(calendar.getState().phase, "unavailable");
	assert.ok(errors.some((error) => error.code === "internal-error"));
	assert.ok(host.querySelector(".lfc-calendar-status-panel:not([hidden])"));
});

void test("a fatal retry render cannot be followed by a recovery announcement", async (context) => {
	const { dom, host } = setupDom(context);
	const announcements: string[] = [];
	let clockCalls = 0;
	let sourceCalls = 0;
	const calendar = createCalendar(host, {
		onAnnounce: ({ message }) => { announcements.push(message); },
		events: async () => {
			sourceCalls += 1;
			if (sourceCalls === 1) {
				throw new Error("initial source failure");
			}
			return [];
		},
		initialDate: "2026-07-14",
		now: () => {
			clockCalls += 1;
			if (clockCalls >= 6) {
				throw new Error("retry render failure");
			}
			return new Date("2026-07-14T12:00:00.000Z");
		},
		onError: () => undefined
	});
	calendar.render();
	await waitFor(() => findRetryButton(host) !== undefined, "initial retry control");
	const retry = findRetryButton(host);
	assert.ok(retry);
	dispatchClick(dom, retry);
	await waitFor(() => calendar.getState().phase === "unavailable" && sourceCalls === 2, "fatal retry render");

	assert.equal(announcements.includes("Calendar updated"), false);
	assert.ok(announcements.some((message) => /unexpected error/i.test(message)));
});

void test("configuration is snapshotted once and rejects unknown keys, bad callbacks, and bad tokens", async (context) => {
	const { host } = setupDom(context);
	let eventReads = 0;
	const staticEvents = [event("snapshot", "2026-07-14", "Snapshot")];
	Object.defineProperty(staticEvents, Symbol.iterator, {
		value: () => { throw new Error("The custom iterator must not run."); }
	});
	const options = { initialDate: "2026-07-14" } as Record<PropertyKey, unknown>;
	Object.defineProperty(options, "events", {
		enumerable: true,
		get: () => {
			eventReads += 1;
			if (eventReads > 1) {
				throw new Error("events was read twice");
			}
			return staticEvents;
		}
	});
	const calendar = createCalendar(host, options as never);
	calendar.render();
	await waitForPhase(calendar, "ready");
	assert.equal(eventReads, 1);
	assert.match(getAgenda(host).textContent ?? "", /Snapshot/);
	calendar.destroy();

	const invalidOptions: unknown[] = [
		{ events: [], swpie: true },
		{ events: [], firstDay: null },
		{ events: [], swipe: null },
		{ events: [], onDaySelect: "not a function" },
		{ events: [], icons: { nxt: () => host.ownerDocument.createTextNode("next") } },
		{ events: [], extensions: [{ id: "typo", renderDayBadg: () => null }] },
		{ events: [], messages: { agendaEmpty: "None", emtpy: "Typo" } },
		{ events: [], messages: { agendaTitle: "Events for {dayte}" } }
	];
	for (const invalid of invalidOptions) {
		assert.throws(
			() => createCalendar(host, invalid as never),
			(error: unknown) => error instanceof LitefoldCalendarError && error.code === "invalid-configuration"
		);
	}
});

void test("context-menu-only agenda events have a primary action and native accessible names", async (context) => {
	const { dom, host } = setupDom(context);
	let contextCalls = 0;
	let nativeEvent: Event | undefined;
	const calendar = createCalendar(host, {
		events: [event("context-only", "2026-07-14T09:00", "Context only")],
		extensions: [{
			id: "visible-details",
			renderEventDetails: ({ document }) => document.createTextNode("Visible details")
		}],
		initialDate: "2026-07-14",
		onEventContextMenu: (context) => {
			contextCalls += 1;
			nativeEvent = context.nativeEvent;
		}
	});
	calendar.render();
	await waitForPhase(calendar, "ready");
	const button = getAgenda(host).querySelector<HTMLButtonElement>("button.lfc-calendar-agenda-event");
	assert.ok(button);
	assert.equal(button.classList.contains("lfc-calendar-event-button"), true);
	assert.equal(button.hasAttribute("aria-label"), false);
	assert.match(button.textContent ?? "", /Context only.*Visible details/s);
	dispatchClick(dom, button);
	assert.equal(contextCalls, 1);
	assert.ok(nativeEvent instanceof dom.window.MouseEvent);
});

void test("action generations survive onError reentrancy and stale nodes cannot act", async (context) => {
	const { dom, host } = setupDom(context);
	let activations = 0;
	let actionButton: HTMLButtonElement | null = null;
	const calendar = createCalendar(host, {
		events: [event("reentrant", "2026-07-14", "Reentrant")],
		initialDate: "2026-07-14",
		onError: (error) => {
			if (error.code === "action-failed" && activations === 1 && actionButton !== null) {
				dispatchClick(dom, actionButton);
			}
		},
		onEventActivate: () => {
			activations += 1;
			if (activations === 1) {
				throw new Error("first activation failed");
			}
		}
	});
	calendar.render();
	await waitForPhase(calendar, "ready");
	actionButton = getAgenda(host).querySelector<HTMLButtonElement>("button[data-lfc-event-id]");
	assert.ok(actionButton);
	dispatchClick(dom, actionButton);
	assert.equal(activations, 2);
	assert.equal(calendar.getState().issues.some((issue) => issue.code === "action-failed"), false);
	const retainedButton = actionButton;
	calendar.destroy();
	dispatchClick(dom, retainedButton);
	assert.equal(activations, 2);
});

void test("fatal fallback invalidates pending actions and retained action nodes", async (context) => {
	const { dom, host } = setupDom(context);
	const pendingAction = deferred<void>();
	const errors: LitefoldCalendarError[] = [];
	let activations = 0;
	const calendar = createCalendar(host, {
		events: [event("fatal-action", "2026-07-14", "Fatal action")],
		initialDate: "2026-07-14",
		onError: (error) => { errors.push(error); },
		onEventActivate: () => {
			activations += 1;
			return pendingAction.promise;
		}
	});
	calendar.render();
	await waitForPhase(calendar, "ready");
	const retainedButton = getAgenda(host).querySelector<HTMLButtonElement>("button[data-lfc-event-id]");
	assert.ok(retainedButton);
	dispatchClick(dom, retainedButton);
	const weekdays = host.querySelector<HTMLElement>(".lfc-calendar-weekdays");
	assert.ok(weekdays);
	weekdays.replaceChildren = () => { throw new Error("fatal rerender"); };
	calendar.focusDate("2026-07-15");
	assert.equal(calendar.getState().phase, "unavailable");
	dispatchClick(dom, retainedButton);
	assert.equal(activations, 1);
	pendingAction.reject(new Error("late action failure"));
	await waitFor(() => errors.some((error) => error.code === "action-failed"), "stale action diagnostic");
	const actionError = errors.find((error) => error.code === "action-failed");
	assert.equal(actionError?.stale, true);
	assert.equal(calendar.getState().issues.some((issue) => issue.code === "action-failed"), false);
});

void test("malformed synchronous source arrays stay validation errors and stale refresh diagnostics stay warnings", async (context) => {
	const { host } = setupDom(context);
	const revoked = Proxy.revocable<CalendarEventInput[]>([], {});
	revoked.revoke();
	let validationError: LitefoldCalendarError | undefined;
	const invalidCalendar = createCalendar(host, {
		events: () => revoked.proxy,
		initialDate: "2026-07-14",
		onError: (error) => { validationError = error; return "handled"; }
	});
	invalidCalendar.render();
	await waitFor(() => validationError !== undefined, "revoked source validation");
	assert.equal(validationError?.code, "event-data-invalid");
	assert.equal(validationError?.phase, "validation");
	invalidCalendar.destroy();

	const refreshes: ReturnType<typeof deferred<readonly CalendarEventInput[]>>[] = [];
	const errors: LitefoldCalendarError[] = [];
	let request = 0;
	const calendar = createCalendar(host, {
		events: () => {
			request += 1;
			if (request === 1) {
				return [event("retained", "2026-07-14", "Retained")];
			}
			const pending = deferred<readonly CalendarEventInput[]>();
			refreshes.push(pending);
			return pending.promise;
		},
		initialDate: "2026-07-14",
		onError: (error) => { errors.push(error); }
	});
	calendar.render();
	await waitForPhase(calendar, "ready");
	calendar.refetchEvents();
	calendar.refetchEvents();
	refreshes[0]?.reject(new Error("stale refresh"));
	await waitFor(() => errors.some((error) => error.stale), "stale refresh diagnostic");
	const stale = errors.find((error) => error.stale);
	assert.equal(stale?.severity, "warning");
	assert.equal(stale?.userTitle, "Calendar may be out of date");
	assert.equal(calendar.getState().issues.some((issue) => issue.code === "event-source-failed"), false);
	refreshes[1]?.resolve([event("fresh", "2026-07-14", "Fresh")]);
	await waitForPhase(calendar, "ready");
});

void test("untrusted event text is rendered as text and never creates executable markup", async (context) => {
	const { host } = setupDom(context);
	const hostile = '<img src=x onerror="globalThis.pwned=true"><script>alert(1)</script>';
	const calendar = createCalendar(host, {
		events: async () => [{
			accentColor: "#112233;background:url(https://private.example)",
			id: '"] [autofocus] [data-secret="true',
			metadata: { password: "do-not-render" },
			start: "2026-07-14T09:00",
			title: hostile
		}],
		initialDate: "2026-07-14"
	});
	calendar.render();
	await waitForPhase(calendar, "ready");

	assert.match(host.textContent ?? "", /<img src=x on/);
	assert.equal(host.querySelector("img"), null);
	assert.equal(host.querySelector("script"), null);
	assert.equal(host.querySelector(".lfc-calendar-event-title [autofocus]"), null);
	assert.doesNotMatch(host.outerHTML, /do-not-render|private\.example/);
});

interface TestDom {
	readonly dom: ReturnType<typeof createDom>;
	readonly host: HTMLElement;
}

function setupDom(context: TestContext, markup = '<div id="calendar"></div>'): TestDom {
	const dom = createDom(markup);
	const restore = installDom(dom);
	context.after(restore);
	const host = dom.window.document.querySelector<HTMLElement>("#calendar");
	assert.ok(host);
	return { dom, host };
}

function event(id: string, start: string, title: string): CalendarEventInput {
	return { id, start, title };
}

function getGrid(host: HTMLElement): HTMLElement {
	const grid = host.querySelector<HTMLElement>("[role='grid']");
	assert.ok(grid);
	return grid;
}

function getAgenda(host: HTMLElement): HTMLElement {
	const agenda = host.querySelector<HTMLElement>("section[aria-labelledby]");
	assert.ok(agenda);
	return agenda;
}

function findDayButton(host: HTMLElement, date: string): HTMLButtonElement {
	const button = getGrid(host).querySelector<HTMLButtonElement>(`button[data-lfc-date='${date}']`);
	assert.ok(button);
	return button;
}

function assertSelected(host: HTMLElement, date: string): void {
	assert.equal(findDayButton(host, date).closest("[role='gridcell']")?.getAttribute("aria-selected"), "true");
}

function findRetryButton(host: HTMLElement): HTMLButtonElement | undefined {
	return [...host.querySelectorAll<HTMLButtonElement>("button")]
		.find((button) => /retry/i.test(button.textContent ?? "") &&
			button.hasAttribute("hidden") === false && button.closest("[hidden]") === null);
}

async function waitForPhase(
	calendar: Calendar,
	phase: ReturnType<Calendar["getState"]>["phase"]
): Promise<void> {
	await waitFor(() => calendar.getState().phase === phase, `${phase} calendar state`);
}
