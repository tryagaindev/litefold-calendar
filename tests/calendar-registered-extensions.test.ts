import assert from "node:assert/strict";
import test from "node:test";

import {
	createCalendar,
	LitefoldCalendarError,
	type Calendar,
} from "../src/index.js";
import type {
	RegisteredExtensionActivationContext,
	RegisteredExtensionNavigationCommit
} from "../src/internal/runtime/registered-extension-contract.js";
import { RegisteredExtensionManager } from "../src/internal/runtime/registered-extensions.js";
import { waitFor } from "./helpers/dom.js";
import {
	createRegisteredExtensionProbe,
	flushRegisteredExtensionTasks,
	setupRegisteredExtensionDom,
	waitForCalendarPhase
} from "./helpers/registered-extensions.js";

void test("registered extensions activate and observe state in input order, then stop in reverse order", async (context) => {
	const { host } = setupRegisteredExtensionDom(context);
	const activationOrder: string[] = [];
	const stateOrder: string[] = [];
	const publicationOrder: string[] = [];
	const teardownOrder: string[] = [];
	let calendarReference: Calendar | null = null;
	const extensions = ["first", "second", "third"].map((id) => createRegisteredExtensionProbe({
		activate: ({ signal }) => {
			activationOrder.push(id);
			signal.addEventListener("abort", () => { teardownOrder.push(`abort:${id}`); }, { once: true });
			return {
				dispose: () => { teardownOrder.push(`dispose:${id}`); },
				stateChanged: () => {
					stateOrder.push(id);
					publicationOrder.push(`extension:${id}:${calendarReference?.getState().phase ?? "missing"}`);
				}
			};
		},
		id: `ordered-${id}`
	}));
	const calendar = createCalendar(host, {
		events: [],
		extensions,
		initialDate: "2026-07-14",
		onStateChange: (state) => { publicationOrder.push(`application:${state.phase}`); }
	});
	calendarReference = calendar;

	calendar.render();
	assert.deepEqual(activationOrder, ["first", "second", "third"]);
	await waitForCalendarPhase(calendar, "ready");
	await flushRegisteredExtensionTasks();
	assert.deepEqual(stateOrder, ["first", "second", "third"]);
	const applicationReadyIndex = publicationOrder.lastIndexOf("application:ready");
	const firstExtensionIndex = publicationOrder.indexOf("extension:first:ready");
	assert.ok(applicationReadyIndex >= 0);
	assert.ok(firstExtensionIndex > applicationReadyIndex);

	calendar.destroy();
	assert.deepEqual(teardownOrder, [
		"abort:third",
		"dispose:third",
		"abort:second",
		"dispose:second",
		"abort:first",
		"dispose:first"
	]);
	const stoppedOrder = [...teardownOrder];
	calendar.destroy();
	await flushRegisteredExtensionTasks();
	assert.deepEqual(teardownOrder, stoppedOrder);
	assert.deepEqual(stateOrder, ["first", "second", "third"]);
});

void test("destroy before render is terminal and never activates or disposes registered extensions", (context) => {
	const dom = setupRegisteredExtensionDom(context);
	let activations = 0;
	let disposals = 0;
	const extension = createRegisteredExtensionProbe({
		activate: () => {
			activations += 1;
			return { dispose: () => { disposals += 1; } };
		},
		id: "destroy-before-render"
	});
	const calendar = createCalendar(dom.host, {
		events: [],
		extensions: [extension],
		initialDate: "2026-07-14"
	});

	calendar.destroy();
	calendar.destroy();
	assert.equal(activations, 0);
	assert.equal(disposals, 0);
	assert.equal(calendar.getState().phase, "destroyed");
	assert.equal(dom.host.childElementCount, 0);
});

void test("a failed registered extension is quarantined without changing core state or blocking peers", async (context) => {
	const { host } = setupRegisteredExtensionDom(context);
	const privateCause = new Error("private registered extension failure");
	const errors: LitefoldCalendarError[] = [];
	const stateCalls: string[] = [];
	const contexts = new Map<string, Readonly<RegisteredExtensionActivationContext>>();
	let failingCalls = 0;
	let failingDisposals = 0;
	const first = createRegisteredExtensionProbe({
		activate: (activationContext) => {
			contexts.set("first", activationContext);
			return { stateChanged: () => { stateCalls.push("first"); } };
		},
		id: "isolated-first"
	});
	const failing = createRegisteredExtensionProbe({
		activate: (activationContext) => {
			contexts.set("failing", activationContext);
			return {
				dispose: () => { failingDisposals += 1; },
				stateChanged: () => {
					failingCalls += 1;
					throw privateCause;
				}
			};
		},
		id: "isolated-failing"
	});
	const later = createRegisteredExtensionProbe({
		activate: (activationContext) => {
			contexts.set("later", activationContext);
			return { stateChanged: () => { stateCalls.push("later"); } };
		},
		id: "isolated-later"
	});
	const calendar = createCalendar(host, {
		events: [],
		extensions: [first, failing, later],
		initialDate: "2026-07-14",
		onError: (error) => {
			errors.push(error);
			return "handled";
		}
	});

	calendar.render();
	await waitForCalendarPhase(calendar, "ready");
	await waitFor(() => errors.length === 1 && stateCalls.includes("later"), "extension quarantine");
	const failure = errors[0];
	assert.ok(failure);
	assert.equal(failure.code, "extension-failed");
	assert.equal(failure.extensionId, "isolated-failing");
	assert.equal(failure.hook, "stateChanged");
	assert.equal(failure.phase, "integration");
	assert.equal(failure.severity, "warning");
	assert.equal(failure.recoverable, true);
	assert.equal(failure.stale, false);
	assert.equal(failure.cause, privateCause);
	assert.equal(failingCalls, 1);
	assert.equal(failingDisposals, 1);
	assert.equal(contexts.get("failing")?.signal.aborted, true);
	assert.equal(contexts.get("first")?.signal.aborted, false);
	assert.equal(contexts.get("later")?.signal.aborted, false);
	assert.equal(calendar.getState().phase, "ready");
	assert.equal(calendar.getState().issues.some((issue) => issue.code === "extension-failed"), false);
	assert.doesNotMatch(host.textContent ?? "", /private registered extension failure|isolated-failing/u);

	const laterCalls = stateCalls.filter((entry) => entry === "later").length;
	calendar.next();
	await waitFor(() => stateCalls.filter((entry) => entry === "later").length > laterCalls, "later extension state");
	assert.equal(failingCalls, 1);
	assert.equal(errors.length, 1);
	calendar.destroy();
});

void test("non-void and thenable state hooks quarantine independently", async (context) => {
	const { host } = setupRegisteredExtensionDom(context);
	const errors: LitefoldCalendarError[] = [];
	const calls = new Map<string, number>();
	const disposals: string[] = [];
	const createInvalidStateExtension = (
		id: string,
		result: () => unknown
	) => createRegisteredExtensionProbe({
		activate: () => ({
			dispose: () => { disposals.push(id); },
			stateChanged: () => {
				calls.set(id, (calls.get(id) ?? 0) + 1);
				return result() as never;
			}
		}),
		id
	});
	const nonVoid = createInvalidStateExtension("state-non-void", () => "unsupported");
	const thenable = createInvalidStateExtension("state-thenable", () => Promise.resolve());
	const healthy = createRegisteredExtensionProbe({
		activate: () => ({
			stateChanged: () => { calls.set("state-healthy", (calls.get("state-healthy") ?? 0) + 1); }
		}),
		id: "state-healthy"
	});
	const calendar = createCalendar(host, {
		events: [],
		extensions: [nonVoid, thenable, healthy],
		initialDate: "2026-07-14",
		onError: (error) => {
			errors.push(error);
			return "handled";
		}
	});

	calendar.render();
	await waitForCalendarPhase(calendar, "ready");
	await waitFor(() => errors.length === 2 && (calls.get("state-healthy") ?? 0) > 0, "invalid state hooks");
	await flushRegisteredExtensionTasks();
	assert.deepEqual(
		errors.map((error) => [error.extensionId, error.hook]),
		[
			["state-non-void", "stateChanged"],
			["state-thenable", "stateChanged"]
		]
	);
	assert.ok(errors.every((error) => error.code === "extension-failed"));
	assert.deepEqual(disposals, ["state-non-void", "state-thenable"]);
	assert.equal(calls.get("state-non-void"), 1);
	assert.equal(calls.get("state-thenable"), 1);
	const healthyCalls = calls.get("state-healthy") ?? 0;

	calendar.next();
	await waitFor(() => (calls.get("state-healthy") ?? 0) > healthyCalls, "healthy state hook");
	assert.equal(calls.get("state-non-void"), 1);
	assert.equal(calls.get("state-thenable"), 1);
	assert.equal(errors.length, 2);
	calendar.destroy();
});

void test("reentrant state delivery invalidates the stale pass and redispatches in input order", async (context) => {
	const { host } = setupRegisteredExtensionDom(context);
	const order: string[] = [];
	const managerReference: { current: RegisteredExtensionManager | null } = { current: null };
	let invalidated = false;
	const extensions = ["a", "b", "c"].map((id) => createRegisteredExtensionProbe({
		activate: () => ({
			stateChanged: () => {
				order.push(id);
				if (id === "a" && !invalidated) {
					invalidated = true;
					assert.ok(managerReference.current);
					managerReference.current.notifyStateChanged();
				}
			}
		}),
		id: `reentrant-${id}`
	}));
	const manager = new RegisteredExtensionManager({
		abortControllerConstructor: AbortController,
		document: host.ownerDocument,
		extensions,
		getGeneration: () => 0,
		getNavigationRevision: () => 0,
		getPresentationEventPage: () => Object.freeze({
			events: Object.freeze([]),
			snapshotRevision: 1,
			totalEvents: 0
		}),
		getState: () => {
			throw new Error("State was not requested by this probe.");
		},
		hasCurrentSnapshot: () => false,
		isLive: () => true,
		navigate: () => Object.freeze({
			changed: false,
			generation: 0,
			navigationRevision: 0,
			startedLoad: false
		}),
		reportFailure: (_extensionId, _hook, cause) => { throw cause; }
	});
	managerReference.current = manager;

	manager.activate();
	manager.notifyStateChanged();
	await flushRegisteredExtensionTasks();
	assert.deepEqual(order, ["a", "a", "b", "c"]);
	manager.stop();
});

void test("a rejecting activation thenable is observed once and does not block later extensions", async (context) => {
	const { host } = setupRegisteredExtensionDom(context);
	const errors: LitefoldCalendarError[] = [];
	const activationOrder: string[] = [];
	const thenable = createRegisteredExtensionProbe({
		activate: () => {
			activationOrder.push("thenable");
			return Promise.reject(new Error("private rejected activation")) as never;
		},
		id: "rejecting-activation"
	});
	const later = createRegisteredExtensionProbe({
		activate: () => { activationOrder.push("later"); },
		id: "after-rejecting-activation"
	});
	const calendar = createCalendar(host, {
		events: [],
		extensions: [thenable, later],
		initialDate: "2026-07-14",
		onError: (error) => {
			errors.push(error);
			return "handled";
		}
	});

	calendar.render();
	await waitForCalendarPhase(calendar, "ready");
	await flushRegisteredExtensionTasks();
	assert.deepEqual(activationOrder, ["thenable", "later"]);
	assert.equal(errors.length, 1);
	assert.equal(errors[0]?.code, "extension-failed");
	assert.equal(errors[0]?.extensionId, "rejecting-activation");
	assert.equal(errors[0]?.hook, "activate");
	assert.equal(errors[0]?.phase, "integration");
	assert.ok(errors[0]?.cause instanceof TypeError);
	calendar.destroy();
});

void test("capability facades fail closed after quarantine and destroy", async (context) => {
	const { host } = setupRegisteredExtensionDom(context);
	const errors: LitefoldCalendarError[] = [];
	let quarantinedContext: Readonly<RegisteredExtensionActivationContext> | undefined;
	let destroyedContext: Readonly<RegisteredExtensionActivationContext> | undefined;
	let quarantinedDisposals = 0;
	const quarantined = createRegisteredExtensionProbe({
		activate: (activationContext) => {
			quarantinedContext = activationContext;
			return { dispose: () => { quarantinedDisposals += 1; } };
		},
		capabilities: ["navigation", "presentationEvents", "state"],
		id: "stale-after-quarantine"
	});
	const destroyed = createRegisteredExtensionProbe({
		activate: (activationContext) => { destroyedContext = activationContext; },
		capabilities: ["presentationEvents", "state"],
		id: "stale-after-destroy"
	});
	const calendar = createCalendar(host, {
		events: [],
		extensions: [quarantined, destroyed],
		initialDate: "2026-07-14",
		onError: (error) => {
			errors.push(error);
			return "handled";
		}
	});

	calendar.render();
	await waitForCalendarPhase(calendar, "ready");
	const quarantinedActivation = quarantinedContext;
	const destroyedActivation = destroyedContext;
	assert.ok(quarantinedActivation?.navigation);
	assert.ok(quarantinedActivation.presentationEvents);
	assert.ok(quarantinedActivation.state);
	assert.ok(destroyedActivation?.presentationEvents);
	assert.ok(destroyedActivation?.state);
	assert.deepEqual(quarantinedActivation.presentationEvents.getPage(null, 0, 1), {
		events: [],
		snapshotRevision: 1,
		totalEvents: 0
	});
	quarantinedActivation.fail(new Error("private runtime failure"), "runtime-probe");
	assert.equal(quarantinedActivation.signal.aborted, true);
	assert.equal(quarantinedDisposals, 1);
	assert.equal(errors.length, 1);
	assert.equal(errors[0]?.extensionId, "stale-after-quarantine");
	assert.equal(errors[0]?.hook, "runtime-probe");
	assert.throws(() => quarantinedActivation.navigation?.navigate({ target: "next-month" }), /no longer active/u);
	assert.throws(() => quarantinedActivation.presentationEvents?.getPage(null, 0, 1), /no longer active/u);
	assert.throws(() => quarantinedActivation.state?.getState(), /no longer active/u);
	quarantinedActivation.fail(new Error("ignored repeated failure"));
	assert.equal(errors.length, 1);

	calendar.destroy();
	assert.equal(destroyedActivation.signal.aborted, true);
	assert.throws(() => destroyedActivation.presentationEvents?.getPage(null, 0, 1), /no longer active/u);
	assert.throws(() => destroyedActivation.state?.getState(), /no longer active/u);
	assert.equal(errors.length, 1);
	assert.equal(quarantinedDisposals, 1);
});

void test("fatal failure stops registered extensions once in reverse order", async (context) => {
	const { host } = setupRegisteredExtensionDom(context);
	const fatalCause = new Error("private clock failure");
	const teardownOrder: string[] = [];
	let failClock = false;
	const extensions = ["first", "second"].map((id) => createRegisteredExtensionProbe({
		activate: ({ signal }) => {
			signal.addEventListener("abort", () => { teardownOrder.push(`abort:${id}`); }, { once: true });
			return { dispose: () => { teardownOrder.push(`dispose:${id}`); } };
		},
		id: `fatal-${id}`
	}));
	const calendar = createCalendar(host, {
		events: [],
		extensions,
		initialDate: "2026-07-14",
		now: () => {
			if (failClock) {
				throw fatalCause;
			}
			return new Date(2026, 6, 14, 12);
		},
		onError: () => "handled"
	});

	calendar.render();
	await waitForCalendarPhase(calendar, "ready");
	failClock = true;
	calendar.today();
	await waitForCalendarPhase(calendar, "unavailable");
	assert.deepEqual(teardownOrder, [
		"abort:second",
		"dispose:second",
		"abort:first",
		"dispose:first"
	]);
	const fatalTeardown = [...teardownOrder];
	calendar.destroy();
	calendar.destroy();
	assert.deepEqual(teardownOrder, fatalTeardown);
});

void test("nested extension navigation from the configured clock supersedes its outer navigation", async (context) => {
	const { host } = setupRegisteredExtensionDom(context);
	let outerContext: Readonly<RegisteredExtensionActivationContext> | undefined;
	let innerContext: Readonly<RegisteredExtensionActivationContext> | undefined;
	let innerCommit: Readonly<RegisteredExtensionNavigationCommit> | undefined;
	let triggerNestedNavigation = false;
	let nestedNavigationStarted = false;
	const outer = createRegisteredExtensionProbe({
		activate: (activationContext) => { outerContext = activationContext; },
		capabilities: ["navigation", "state"],
		id: "nested-clock-outer"
	});
	const inner = createRegisteredExtensionProbe({
		activate: (activationContext) => { innerContext = activationContext; },
		capabilities: ["navigation", "state"],
		id: "nested-clock-inner"
	});
	const calendar = createCalendar(host, {
		events: [],
		extensions: [outer, inner],
		initialDate: "2026-07-14",
		now: () => {
			if (triggerNestedNavigation && !nestedNavigationStarted) {
				nestedNavigationStarted = true;
				innerCommit = innerContext?.navigation?.navigate({ target: "next-month" });
			}
			return new Date(2026, 5, 15, 12);
		}
	});

	calendar.render();
	await waitForCalendarPhase(calendar, "ready");
	const outerActivation = outerContext;
	const innerActivation = innerContext;
	assert.ok(outerActivation?.navigation);
	assert.ok(outerActivation.state);
	assert.ok(innerActivation?.navigation);
	triggerNestedNavigation = true;

	const outerCommit = outerActivation.navigation.navigate({ target: "today" });
	await waitForCalendarPhase(calendar, "ready");
	const committedInnerNavigation = innerCommit;
	assert.ok(committedInnerNavigation);
	assert.equal(nestedNavigationStarted, true);
	assert.ok(committedInnerNavigation.navigationRevision > outerCommit.navigationRevision);
	assert.equal(outerActivation.state.getNavigationRevision(), committedInnerNavigation.navigationRevision);
	assert.deepEqual(calendar.getState().displayedMonth, { day: 1, month: 8, year: 2026 });
	assert.deepEqual(calendar.getState().selectedDate, { day: 14, month: 8, year: 2026 });
	calendar.destroy();
});

void test("same-date public focus publishes its navigation revision without replacing public state", async (context) => {
	const { host } = setupRegisteredExtensionDom(context);
	let activationContext: Readonly<RegisteredExtensionActivationContext> | undefined;
	let applicationStateCalls = 0;
	let extensionStateCalls = 0;
	const observer = createRegisteredExtensionProbe({
		activate: (context) => {
			activationContext = context;
			return { stateChanged: () => { extensionStateCalls += 1; } };
		},
		capabilities: ["state"],
		id: "same-date-public-observer"
	});
	const calendar = createCalendar(host, {
		events: [],
		extensions: [observer],
		initialDate: "2026-07-14",
		onStateChange: () => { applicationStateCalls += 1; }
	});

	calendar.render();
	await waitForCalendarPhase(calendar, "ready");
	await flushRegisteredExtensionTasks();
	const observerContext = activationContext;
	assert.ok(observerContext?.state);
	const applicationStateCallsBefore = applicationStateCalls;
	const extensionStateCallsBefore = extensionStateCalls;
	const navigationRevisionBefore = observerContext.state.getNavigationRevision();
	const stateBefore = calendar.getState();

	calendar.focusDate("2026-07-14");
	await flushRegisteredExtensionTasks();

	assert.equal(observerContext.state.getNavigationRevision(), navigationRevisionBefore + 1);
	assert.equal(extensionStateCalls, extensionStateCallsBefore + 1);
	assert.equal(applicationStateCalls, applicationStateCallsBefore);
	assert.equal(calendar.getState(), stateBefore);
	calendar.destroy();
});

void test("nested public navigation from the configured clock supersedes extension navigation", async (context) => {
	const { host } = setupRegisteredExtensionDom(context);
	let outerContext: Readonly<RegisteredExtensionActivationContext> | undefined;
	let calendarReference: Calendar | null = null;
	let triggerNestedNavigation = false;
	let nestedNavigationStarted = false;
	const outer = createRegisteredExtensionProbe({
		activate: (activationContext) => { outerContext = activationContext; },
		capabilities: ["navigation", "state"],
		id: "nested-public-outer"
	});
	const calendar = createCalendar(host, {
		events: [],
		extensions: [outer],
		initialDate: "2026-07-14",
		now: () => {
			if (triggerNestedNavigation && !nestedNavigationStarted) {
				nestedNavigationStarted = true;
				calendarReference?.next();
			}
			return new Date(2026, 5, 15, 12);
		}
	});
	calendarReference = calendar;

	calendar.render();
	await waitForCalendarPhase(calendar, "ready");
	const outerActivation = outerContext;
	assert.ok(outerActivation?.navigation);
	assert.ok(outerActivation.state);
	triggerNestedNavigation = true;

	const outerCommit = outerActivation.navigation.navigate({ target: "today" });
	await waitForCalendarPhase(calendar, "ready");
	assert.equal(nestedNavigationStarted, true);
	assert.ok(outerActivation.state.getNavigationRevision() > outerCommit.navigationRevision);
	assert.deepEqual(calendar.getState().displayedMonth, { day: 1, month: 8, year: 2026 });
	assert.deepEqual(calendar.getState().selectedDate, { day: 14, month: 8, year: 2026 });
	calendar.destroy();
});

void test("a nested valid boundary no-op supersedes outer extension navigation", async (context) => {
	const { host } = setupRegisteredExtensionDom(context);
	let outerContext: Readonly<RegisteredExtensionActivationContext> | undefined;
	let innerContext: Readonly<RegisteredExtensionActivationContext> | undefined;
	let innerCommit: Readonly<RegisteredExtensionNavigationCommit> | undefined;
	let stateNotifications = 0;
	let triggerNestedNavigation = false;
	let nestedNavigationStarted = false;
	const outer = createRegisteredExtensionProbe({
		activate: (activationContext) => {
			outerContext = activationContext;
			return { stateChanged: () => { stateNotifications += 1; } };
		},
		capabilities: ["navigation", "state"],
		id: "nested-noop-outer"
	});
	const inner = createRegisteredExtensionProbe({
		activate: (activationContext) => { innerContext = activationContext; },
		capabilities: ["navigation"],
		id: "nested-noop-inner"
	});
	const calendar = createCalendar(host, {
		events: [],
		extensions: [outer, inner],
		initialDate: "2026-07-14",
		maxDate: "2026-07-31",
		now: () => {
			if (triggerNestedNavigation && !nestedNavigationStarted) {
				nestedNavigationStarted = true;
				innerCommit = innerContext?.navigation?.navigate({ target: "next-month" });
			}
			return new Date(2026, 5, 15, 12);
		}
	});

	calendar.render();
	await waitForCalendarPhase(calendar, "ready");
	const outerActivation = outerContext;
	assert.ok(outerActivation?.navigation);
	assert.ok(outerActivation.state);
	assert.ok(innerContext?.navigation);
	await flushRegisteredExtensionTasks();
	const stateNotificationsBefore = stateNotifications;
	const originalQueueMicrotask = Object.getOwnPropertyDescriptor(globalThis, "queueMicrotask");
	Object.defineProperty(globalThis, "queueMicrotask", {
		configurable: true,
		value: () => { throw new Error("test queueMicrotask failure"); }
	});
	context.after(() => {
		if (originalQueueMicrotask === undefined) {
			Reflect.deleteProperty(globalThis, "queueMicrotask");
		} else {
			Object.defineProperty(globalThis, "queueMicrotask", originalQueueMicrotask);
		}
	});
	triggerNestedNavigation = true;

	const outerCommit = outerActivation.navigation.navigate({ target: "today" });
	const committedInnerNavigation = innerCommit;
	assert.ok(committedInnerNavigation);
	assert.equal(committedInnerNavigation.changed, false);
	assert.equal(committedInnerNavigation.startedLoad, false);
	assert.ok(committedInnerNavigation.navigationRevision > outerCommit.navigationRevision);
	assert.equal(outerActivation.state.getNavigationRevision(), committedInnerNavigation.navigationRevision);
	assert.equal(stateNotifications, stateNotificationsBefore + 1);
	assert.deepEqual(calendar.getState().displayedMonth, { day: 1, month: 7, year: 2026 });
	assert.deepEqual(calendar.getState().selectedDate, { day: 14, month: 7, year: 2026 });
	calendar.destroy();
});

void test("a nested canceled navigation leaves the outer extension reservation eligible", async (context) => {
	const { host } = setupRegisteredExtensionDom(context);
	let outerContext: Readonly<RegisteredExtensionActivationContext> | undefined;
	let innerContext: Readonly<RegisteredExtensionActivationContext> | undefined;
	let nestedFailure: unknown;
	let triggerNestedNavigation = false;
	let nestedNavigationStarted = false;
	const outer = createRegisteredExtensionProbe({
		activate: (activationContext) => { outerContext = activationContext; },
		capabilities: ["navigation", "state"],
		id: "nested-canceled-outer"
	});
	const inner = createRegisteredExtensionProbe({
		activate: (activationContext) => { innerContext = activationContext; },
		capabilities: ["navigation"],
		id: "nested-canceled-inner"
	});
	const calendar = createCalendar(host, {
		events: [],
		extensions: [outer, inner],
		initialDate: "2026-07-14",
		maxDate: "2026-07-31",
		now: () => {
			if (triggerNestedNavigation && !nestedNavigationStarted) {
				nestedNavigationStarted = true;
				try {
					innerContext?.navigation?.navigate({
						date: { day: 1, month: 8, year: 2026 },
						target: "date"
					});
				} catch (cause: unknown) {
					nestedFailure = cause;
				}
			}
			return new Date(2026, 5, 15, 12);
		}
	});

	calendar.render();
	await waitForCalendarPhase(calendar, "ready");
	const outerActivation = outerContext;
	assert.ok(outerActivation?.navigation);
	assert.ok(outerActivation.state);
	assert.ok(innerContext?.navigation);
	triggerNestedNavigation = true;

	const outerCommit = outerActivation.navigation.navigate({ target: "today" });
	await waitForCalendarPhase(calendar, "ready");
	assert.equal(nestedNavigationStarted, true);
	assert.ok(nestedFailure instanceof LitefoldCalendarError);
	assert.equal(nestedFailure.code, "invalid-argument");
	assert.equal(outerActivation.state.getNavigationRevision(), outerCommit.navigationRevision);
	assert.deepEqual(calendar.getState().displayedMonth, { day: 1, month: 6, year: 2026 });
	assert.deepEqual(calendar.getState().selectedDate, { day: 15, month: 6, year: 2026 });
	calendar.destroy();
});

void test("destroy reports invalid disposers without interrupting reverse cleanup", async (context) => {
	const { host } = setupRegisteredExtensionDom(context);
	const errors: LitefoldCalendarError[] = [];
	const teardownOrder: string[] = [];
	const thrownCause = new Error("private throwing disposer");
	const extensions = [
		createRegisteredExtensionProbe({
			activate: ({ signal }) => {
				signal.addEventListener("abort", () => { teardownOrder.push("abort:throwing"); }, { once: true });
				return {
					dispose: () => {
						teardownOrder.push("dispose:throwing");
						throw thrownCause;
					}
				};
			},
			id: "dispose-throwing"
		}),
		createRegisteredExtensionProbe({
			activate: ({ signal }) => {
				signal.addEventListener("abort", () => { teardownOrder.push("abort:non-void"); }, { once: true });
				return {
					dispose: () => {
						teardownOrder.push("dispose:non-void");
						return "unsupported" as never;
					}
				};
			},
			id: "dispose-non-void"
		}),
		createRegisteredExtensionProbe({
			activate: ({ signal }) => {
				signal.addEventListener("abort", () => { teardownOrder.push("abort:thenable"); }, { once: true });
				return {
					dispose: () => {
						teardownOrder.push("dispose:thenable");
						return Promise.reject(new Error("private rejected disposer")) as never;
					}
				};
			},
			id: "dispose-thenable"
		}),
		createRegisteredExtensionProbe({
			activate: ({ signal }) => {
				signal.addEventListener("abort", () => { teardownOrder.push("abort:healthy"); }, { once: true });
				return { dispose: () => { teardownOrder.push("dispose:healthy"); } };
			},
			id: "dispose-healthy"
		})
	];
	const calendar = createCalendar(host, {
		events: [],
		extensions,
		initialDate: "2026-07-14",
		onError: (error) => {
			errors.push(error);
			return "handled";
		}
	});

	calendar.render();
	await waitForCalendarPhase(calendar, "ready");
	calendar.destroy();
	await flushRegisteredExtensionTasks();
	assert.deepEqual(teardownOrder, [
		"abort:healthy",
		"dispose:healthy",
		"abort:thenable",
		"dispose:thenable",
		"abort:non-void",
		"dispose:non-void",
		"abort:throwing",
		"dispose:throwing"
	]);
	assert.deepEqual(errors.map(({ code, extensionId, hook, phase }) => ({
		code, extensionId, hook, phase
	})), [
		{
			code: "extension-failed",
			extensionId: "dispose-thenable",
			hook: "dispose",
			phase: "integration"
		},
		{
			code: "extension-failed",
			extensionId: "dispose-non-void",
			hook: "dispose",
			phase: "integration"
		},
		{
			code: "extension-failed",
			extensionId: "dispose-throwing",
			hook: "dispose",
			phase: "integration"
		}
	]);
	assert.ok(errors.every((error) => error.severity === "warning" && error.recoverable));
	assert.equal(errors[2]?.cause, thrownCause);
	assert.equal(calendar.getState().phase, "destroyed");
	assert.deepEqual(calendar.getState().issues, []);
	assert.equal(host.childElementCount, 0);

	const stoppedOrder = [...teardownOrder];
	calendar.destroy();
	await flushRegisteredExtensionTasks();
	assert.deepEqual(teardownOrder, stoppedOrder);
	assert.equal(errors.length, 3);
});

void test("synchronous activation failure reports once when its detached disposer throws", async (context) => {
	const { host } = setupRegisteredExtensionDom(context);
	const activationCause = new Error("private synchronous activation failure");
	const errors: LitefoldCalendarError[] = [];
	let failedSignal: AbortSignal | undefined;
	let detachedDisposals = 0;
	let laterActivations = 0;
	const failing = createRegisteredExtensionProbe({
		activate: (activationContext) => {
			failedSignal = activationContext.signal;
			activationContext.fail(activationCause, "registration");
			return {
				dispose: () => {
					detachedDisposals += 1;
					throw new Error("private detached disposer failure");
				}
			};
		},
		id: "activation-fail-with-disposer"
	});
	const later = createRegisteredExtensionProbe({
		activate: () => { laterActivations += 1; },
		id: "activation-fail-later"
	});
	const calendar = createCalendar(host, {
		events: [],
		extensions: [failing, later],
		initialDate: "2026-07-14",
		onError: (error) => {
			errors.push(error);
			return "handled";
		}
	});

	calendar.render();
	await waitForCalendarPhase(calendar, "ready");
	await flushRegisteredExtensionTasks();
	assert.equal(failedSignal?.aborted, true);
	assert.equal(detachedDisposals, 1);
	assert.equal(laterActivations, 1);
	assert.equal(errors.length, 1);
	assert.equal(errors[0]?.code, "extension-failed");
	assert.equal(errors[0]?.extensionId, "activation-fail-with-disposer");
	assert.equal(errors[0]?.hook, "registration");
	assert.equal(errors[0]?.phase, "integration");
	assert.equal(errors[0]?.cause, activationCause);
	assert.equal(calendar.getState().phase, "ready");
	assert.deepEqual(calendar.getState().issues, []);

	calendar.destroy();
	calendar.destroy();
	assert.equal(detachedDisposals, 1);
	assert.equal(errors.length, 1);
});
