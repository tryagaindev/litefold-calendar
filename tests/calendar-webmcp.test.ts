import assert from "node:assert/strict";
import test from "node:test";

import {
	createCalendar,
	type Calendar,
	type CalendarEventInput,
	LitefoldCalendarError
} from "../src/index.js";
import { webMcp } from "../src/extensions/webmcp/index.js";
import { deferred, waitFor } from "./helpers/dom.js";
import {
	assertErrorEnvelope,
	createDeferredEventSource,
	executeTool,
	findTool,
	isAbortError,
	requireRecord,
	setupDom,
	type SourceRequest,
	TestModelContext,
	waitForPhase,
	waitForRegistrations
} from "./helpers/webmcp.js";

void test("WebMCP is a silent progressive enhancement in unsupported and hostile hosts", async (context) => {
	const { dom, host } = setupDom(context);
	const errors: LitefoldCalendarError[] = [];
	const calendar = createCalendar(host, {
		events: [],
		initialDate: "2026-07-14",
		onError: (error) => { errors.push(error); },
		extensions: [webMcp({ toolNamePrefix: "schedule" })]
	});

	calendar.render();
	await waitForPhase(calendar, "ready");

	assert.equal(errors.length, 0);
	assert.equal(calendar.getState().phase, "ready");
	calendar.destroy();

	Object.defineProperty(dom.window.document, "modelContext", {
		configurable: true,
		value: { registerTool: true }
	});
	const nonCallable = createCalendar(host, {
		events: [],
		initialDate: "2026-07-14",
		onError: (error) => { errors.push(error); },
		extensions: [webMcp({ toolNamePrefix: "non-callable" })]
	});
	nonCallable.render();
	await waitForPhase(nonCallable, "ready");
	assert.equal(errors.length, 0);
	nonCallable.destroy();

	Object.defineProperty(dom.window.document, "modelContext", {
		configurable: true,
		value: Object.defineProperty({}, "registerTool", {
			get: () => { throw new Error("registerTool getter failed"); }
		})
	});
	const throwingGetter = createCalendar(host, {
		events: [],
		initialDate: "2026-07-14",
		onError: (error) => { errors.push(error); },
		extensions: [webMcp({ toolNamePrefix: "throwing-getter" })]
	});
	throwingGetter.render();
	await waitFor(() => errors.length === 1, "WebMCP feature-detection diagnostic");
	await waitForPhase(throwingGetter, "ready");
	assert.equal(errors[0]?.code, "extension-failed");
	assert.equal(errors[0]?.extensionId, "webmcp");
	assert.equal(errors[0]?.hook, "register");
	assert.deepEqual(throwingGetter.getState().issues, []);
});

void test("WebMCP remains opt-in when a model context is available", async (context) => {
	const modelContext = new TestModelContext();
	const { host } = setupDom(context, modelContext);
	const disabled = createCalendar(host, {
		events: [],
		initialDate: "2026-07-14",
		extensions: []
	});

	disabled.render();
	await waitForPhase(disabled, "ready");
	disabled.destroy();
	const omitted = createCalendar(host, {
		events: [],
		initialDate: "2026-07-14"
	});
	omitted.render();
	await waitForPhase(omitted, "ready");

	assert.deepEqual(modelContext.registrations, []);
});

void test("WebMCP configuration rejects malformed and unsafe tool prefixes", () => {
	const invalidOptions: readonly object[] = [
		{ toolNamePrefix: "" },
		{ toolNamePrefix: "calendar tools" },
		{ toolNamePrefix: "calendar/tools" },
		{ toolNamePrefix: "x".repeat(118) },
		{ extra: true, toolNamePrefix: "schedule" }
	];

	for (const invalidOptionsValue of invalidOptions) {
		assert.throws(
			() => webMcp(invalidOptionsValue),
			(error: unknown) => error instanceof LitefoldCalendarError &&
				error.code === "invalid-configuration" && error.phase === "configuration"
		);
	}
	assert.throws(
		() => webMcp(true as never),
		(error: unknown) => error instanceof LitefoldCalendarError &&
			error.code === "invalid-configuration"
	);
	assert.doesNotThrow(() => webMcp({ toolNamePrefix: "x".repeat(117) }));
	assert.doesNotThrow(() => webMcp({
		[Symbol("application-tag")]: true,
		toolNamePrefix: "symbol-tagged"
	}));
});

void test("WebMCP registers the two stable tool contracts with one lifecycle signal", async (context) => {
	const modelContext = new TestModelContext();
	const { host } = setupDom(context, modelContext);
	const webMcpOptions = { toolNamePrefix: "team-calendar" };
	const calendar = createCalendar(host, {
		events: [],
		initialDate: "2026-07-14",
		extensions: [webMcp(webMcpOptions)]
	});
	webMcpOptions.toolNamePrefix = "mutated-after-construction";
	assert.equal(modelContext.registrations.length, 0);

	calendar.render();
	await waitForRegistrations(modelContext);
	calendar.render();
	await Promise.resolve();
	assert.equal(modelContext.registrations.length, 2);
	const getEvents = findTool(modelContext, "team-calendar-get-events");
	const navigate = findTool(modelContext, "team-calendar-navigate");
	const signals = modelContext.registrations.map(({ options }) => options.signal);

	assert.equal(
		getEvents.description,
		"Read up to 10 unique events from this calendar's currently loaded, allowed visible range. Omit date for the whole range, provide date to filter one day, and continue with nextCursor."
	);
	assert.equal(getEvents.title, "Get calendar events");
	assert.equal(navigate.description.length > 0, true);
	assert.deepEqual(getEvents.annotations, {
		readOnlyHint: true,
		untrustedContentHint: true
	});
	assert.deepEqual(navigate.annotations, { readOnlyHint: false });
	assert.deepEqual(getEvents.inputSchema, {
		oneOf: [
			{
				additionalProperties: false,
				properties: {
					date: {
						description: "Optional strict YYYY-MM-DD date filter. Omit it to inspect every event available on allowed dates in the current visible range.",
						pattern: "^[0-9]{4}-[0-9]{2}-[0-9]{2}$",
						type: "string"
					}
				},
				type: "object"
			},
			{
				additionalProperties: false,
				properties: {
					cursor: {
						description: "Opaque continuation cursor returned by a previous get-events result.",
						maxLength: 512,
						minLength: 1,
						type: "string"
					}
				},
				required: ["cursor"],
				type: "object"
			}
		],
		type: "object"
	});
	assert.deepEqual(navigate.inputSchema, {
		oneOf: [
			{
				additionalProperties: false,
				properties: {
					date: {
						description: "Destination in strict YYYY-MM-DD form.",
						pattern: "^[0-9]{4}-[0-9]{2}-[0-9]{2}$",
						type: "string"
					},
					target: { const: "date" }
				},
				required: ["target", "date"],
				type: "object"
			},
			{
				additionalProperties: false,
				properties: {
					target: {
						enum: ["today", "previous-month", "next-month"]
					}
				},
				required: ["target"],
				type: "object"
			}
		],
		type: "object"
	});
	assert.equal(signals.length, 2);
	assert.ok(signals[0]);
	assert.equal(signals[0], signals[1]);
	assert.equal(signals[0].aborted, false);

	calendar.destroy();
	assert.equal(signals[0].aborted, true);
	assert.equal(modelContext.activeTools.size, 0);
});

void test("WebMCP tools fall back to the lifecycle signal when execution options are omitted or malformed", async (context) => {
	const modelContext = new TestModelContext();
	const { host } = setupDom(context, modelContext);
	const calendar = createCalendar(host, {
		events: [{
			id: "event",
			start: "2026-07-14",
			title: "Visible event"
		}],
		initialDate: "2026-07-14",
		extensions: [webMcp({ toolNamePrefix: "fallback" })]
	});
	calendar.render();
	await waitForPhase(calendar, "ready");
	await waitForRegistrations(modelContext);
	const getEvents = findTool(modelContext, "fallback-get-events");
	const navigate = findTool(modelContext, "fallback-navigate");

	const getEventsResult = requireRecord(await getEvents.execute({}, undefined));
	assert.equal(getEventsResult["ok"], true);
	assert.equal(getEventsResult["totalEvents"], 1);
	const navigateResult = requireRecord(await navigate.execute({
		date: "2026-07-14",
		target: "date"
	}, undefined));
	assert.equal(navigateResult["ok"], true);
	assert.equal(navigateResult["changed"], false);

	assert.equal(requireRecord(await getEvents.execute({}, { signal: null }))["ok"], true);
	assert.equal(requireRecord(await navigate.execute({
		date: "2026-07-14",
		target: "date"
	}, null))["ok"], true);

	const callerController = new AbortController();
	callerController.abort();
	Object.defineProperty(callerController.signal, "aborted", {
		configurable: true,
		value: false
	});
	assert.equal(callerController.signal.aborted, false);
	await assert.rejects(
		getEvents.execute({}, { signal: callerController.signal }),
		isAbortError
	);
});

void test("WebMCP falls back before navigation when a signal lookalike has unusable listeners", async (context) => {
	const modelContext = new TestModelContext();
	const requests: SourceRequest[] = [];
	const { host } = setupDom(context, modelContext);
	const calendar = createCalendar(host, {
		events: createDeferredEventSource(requests),
		initialDate: "2026-07-14",
		extensions: [webMcp({ toolNamePrefix: "hostile-signal" })]
	});
	calendar.render();
	await waitFor(() => requests.length === 1, "initial event request");
	requests[0]?.pending.resolve([]);
	await waitForPhase(calendar, "ready");
	await waitForRegistrations(modelContext);

	const navigation = findTool(modelContext, "hostile-signal-navigate").execute({
		target: "next-month"
	}, {
		signal: {
			aborted: false,
			addEventListener: () => { throw new Error("Listener installation failed."); },
			removeEventListener: () => undefined
		}
	});
	void navigation.catch(() => undefined);
	await waitFor(() => requests.length === 2, "destination event request");
	requests[1]?.pending.resolve([]);

	const result = requireRecord(await navigation);
	assert.equal(result["ok"], true);
	assert.equal(result["changed"], true);
});

void test("distinct calendar prefixes coexist while a duplicate prefix rolls back", async (context) => {
	const modelContext = new TestModelContext(null, true);
	const { dom, host } = setupDom(
		context,
		modelContext,
		'<div id="calendar"></div><div id="secondary"></div><div id="duplicate"></div>'
	);
	const secondaryHost = dom.window.document.querySelector<HTMLElement>("#secondary");
	const duplicateHost = dom.window.document.querySelector<HTMLElement>("#duplicate");
	assert.ok(secondaryHost);
	assert.ok(duplicateHost);
	const duplicateErrors: LitefoldCalendarError[] = [];
	const primary = createCalendar(host, {
		events: [],
		initialDate: "2026-07-14",
		extensions: [webMcp({ toolNamePrefix: "primary" })]
	});
	const secondary = createCalendar(secondaryHost, {
		events: [],
		initialDate: "2026-07-14",
		extensions: [webMcp({ toolNamePrefix: "secondary" })]
	});
	const duplicate = createCalendar(duplicateHost, {
		events: [],
		initialDate: "2026-07-14",
		onError: (error) => { duplicateErrors.push(error); },
		extensions: [webMcp({ toolNamePrefix: "primary" })]
	});

	primary.render();
	secondary.render();
	await waitForRegistrations(modelContext, 4);
	assert.deepEqual([...modelContext.activeTools.keys()].sort(), [
		"primary-get-events",
		"primary-navigate",
		"secondary-get-events",
		"secondary-navigate"
	]);

	duplicate.render();
	await waitFor(() => duplicateErrors.length === 1, "duplicate WebMCP registration diagnostic");
	await waitForPhase(duplicate, "ready");
	assert.equal(modelContext.registrations.length, 5);
	assert.equal(modelContext.registrations[4]?.options.signal?.aborted, true);
	assert.equal(duplicateErrors[0]?.code, "extension-failed");
	assert.equal(duplicateErrors[0]?.extensionId, "webmcp");
	assert.equal(duplicateErrors[0]?.hook, "register");
	assert.deepEqual(duplicate.getState().issues, []);
	assert.equal(modelContext.activeTools.size, 4);

	duplicate.destroy();
	secondary.destroy();
	primary.destroy();
	assert.equal(modelContext.activeTools.size, 0);
});

void test("get-events distinguishes unloaded and empty views while validating every argument", async (context) => {
	const modelContext = new TestModelContext();
	const request = deferred<readonly CalendarEventInput[]>();
	const { host } = setupDom(context, modelContext);
	const calendar = createCalendar(host, {
		events: () => request.promise,
		initialDate: "2026-07-14",
		extensions: [webMcp({ toolNamePrefix: "schedule" })]
	});

	calendar.render();
	await waitForRegistrations(modelContext);
	const getEvents = findTool(modelContext, "schedule-get-events");
	const loading = requireRecord(await executeTool(getEvents, {}));
	assertErrorEnvelope(loading, "date-not-loaded");
	assert.equal(requireRecord(loading["state"])["phase"], "loading");

	for (const input of [
		null,
		[],
		{ date: null },
		{ date: "2026-7-14" },
		{ cursor: "" },
		{ cursor: "not-a-litefold-cursor" },
		{ cursor: "lfc2.other-instance.1" },
		{ cursor: "x".repeat(513) },
		{ cursor: "lfc1.other-instance.9007199254740992" },
		{ cursor: "lfc1.other-instance.1", date: "2026-07-14" },
		{ offset: 0 },
		{ extra: true },
		{ [Symbol("extra")]: true },
		Object.defineProperty({}, "cursor", {
			enumerable: true,
			get: () => { throw new Error("Do not read this value twice."); }
		})
	]) {
		assertErrorEnvelope(await executeTool(getEvents, input), "invalid-input");
	}
	assertErrorEnvelope(
		await executeTool(getEvents, { date: "2027-01-01" }),
		"date-outside-visible-range"
	);

	request.resolve([]);
	await waitForPhase(calendar, "ready");
	const emptyRange = requireRecord(await executeTool(getEvents, {}));
	assert.equal(emptyRange["ok"], true);
	assert.equal(Object.hasOwn(emptyRange, "dataAvailable"), false);
	assert.equal(emptyRange["date"], null);
	assert.equal(emptyRange["totalEvents"], 0);
	assert.deepEqual(emptyRange["events"], []);
	const emptyDate = requireRecord(await executeTool(getEvents, { date: "2026-07-14" }));
	assert.equal(emptyDate["date"], "2026-07-14");
	assert.equal(emptyDate["totalEvents"], 0);
	assert.deepEqual(emptyDate["events"], []);
});

void test("get-events serves a retained snapshot during loading and after a degraded refresh", async (context) => {
	const modelContext = new TestModelContext();
	const requests: SourceRequest[] = [];
	const errors: LitefoldCalendarError[] = [];
	const { host } = setupDom(context, modelContext);
	const calendar = createCalendar(host, {
		events: createDeferredEventSource(requests),
		initialDate: "2026-07-14",
		onError: (error) => { errors.push(error); },
		extensions: [webMcp({ toolNamePrefix: "schedule" })]
	});

	calendar.render();
	await waitFor(() => requests.length === 1, "initial retained-snapshot request");
	requests[0]?.pending.resolve([{
		id: "private-retained-id",
		metadata: { secret: true },
		start: "2026-07-14",
		title: "Retained event",
		url: "https://private.example/retained"
	}]);
	await waitForPhase(calendar, "ready");
	await waitForRegistrations(modelContext);
	const getEvents = findTool(modelContext, "schedule-get-events");

	calendar.refetchEvents();
	await waitFor(() => requests.length === 2, "retained refresh request");
	const loading = requireRecord(await executeTool(getEvents, {}));
	assert.equal(loading["ok"], true);
	assert.equal(requireRecord(loading["state"])["phase"], "loading");
	assert.deepEqual(loading["events"], [{
		end: null,
		isAllDay: true,
		start: "2026-07-14",
		title: "Retained event"
	}]);
	assert.doesNotMatch(JSON.stringify(loading), /private-retained-id|private\.example|secret/u);

	requests[1]?.pending.reject(new Error("Refresh failed."));
	await waitForPhase(calendar, "degraded");
	const degraded = requireRecord(await executeTool(getEvents, {}));
	assert.equal(degraded["ok"], true);
	assert.equal(requireRecord(degraded["state"])["phase"], "degraded");
	assert.deepEqual(degraded["events"], loading["events"]);
	assert.equal(errors.length, 1);

	calendar.setEvents([{
		id: "replacement-id",
		start: "2026-07-20",
		title: "Replacement event"
	}]);
	await waitForPhase(calendar, "ready");
	const replaced = requireRecord(await executeTool(getEvents, {}));
	assert.deepEqual(replaced["events"], [{
		end: null,
		isAllDay: true,
		start: "2026-07-20",
		title: "Replacement event"
	}]);
});

void test("registration failure rolls back every tool without degrading calendar state", async (context) => {
	const modelContext = new TestModelContext(2);
	const errors: LitefoldCalendarError[] = [];
	const { host } = setupDom(context, modelContext);
	const calendar = createCalendar(host, {
		events: [],
		initialDate: "2026-07-14",
		onError: (error) => { errors.push(error); },
		extensions: [webMcp({ toolNamePrefix: "schedule" })]
	});

	calendar.render();
	await waitFor(() => errors.length === 1, "WebMCP registration diagnostic");
	await waitForPhase(calendar, "ready");
	const registrationError = errors[0];
	assert.ok(registrationError);
	assert.equal(registrationError.code, "extension-failed");
	assert.equal(registrationError.extensionId, "webmcp");
	assert.equal(registrationError.hook, "register");
	assert.equal(registrationError.recoverable, true);
	assert.equal(registrationError.stale, false);
	assert.deepEqual(calendar.getState().issues, []);
	assert.equal(calendar.getState().phase, "ready");
	assert.equal(modelContext.registrations.length, 2);
	assert.ok(modelContext.registrations.every(({ options }) => options.signal?.aborted === true));
	assert.equal(modelContext.activeTools.size, 0);
});

void test("navigate validates tagged inputs and changes state without stealing focus or invoking actions", async (context) => {
	const modelContext = new TestModelContext();
	const { dom, host } = setupDom(
		context,
		modelContext,
		'<button id="outside" type="button">Outside</button><div id="calendar"></div>'
	);
	const outside = dom.window.document.querySelector<HTMLButtonElement>("#outside");
	assert.ok(outside);
	let actionCalls = 0;
	const states: ReturnType<Calendar["getState"]>[] = [];
	const calendar = createCalendar(host, {
		events: [],
		initialDate: "2026-07-14",
		onDayContextMenu: () => { actionCalls += 1; },
		onDaySelect: () => { actionCalls += 1; },
		onEventActivate: () => { actionCalls += 1; },
		onEventContextMenu: () => { actionCalls += 1; },
		onStateChange: (state) => { states.push(state); },
		extensions: [webMcp({ toolNamePrefix: "schedule" })]
	});
	calendar.render();
	await waitForPhase(calendar, "ready");
	await waitForRegistrations(modelContext);
	const navigate = findTool(modelContext, "schedule-navigate");

	for (const input of [
		null,
		[],
		{},
		{ target: "date" },
		{ date: "2026-07-20", target: "today" },
		{ date: "2026-7-20", target: "date" },
		{ target: "somewhere" },
		{ extra: true, target: "next-month" },
		{ [Symbol("extra")]: true, target: "next-month" }
	]) {
		assertErrorEnvelope(await executeTool(navigate, input), "invalid-input");
	}
	assertErrorEnvelope(
		await executeTool(navigate, { date: "0001-01-01", target: "date" }),
		"invalid-input"
	);

	outside.focus();
	const result = requireRecord(await executeTool(navigate, {
		date: "2026-07-20",
		target: "date"
	}));
	assert.equal(result["ok"], true);
	assert.equal(result["changed"], true);
	assert.equal(dom.window.document.activeElement, outside);
	assert.deepEqual(calendar.getState().selectedDate, { day: 20, month: 7, year: 2026 });
	assert.equal(actionCalls, 0);
	assert.equal(states.at(-1)?.selectedDate.day, 20);

	const unchanged = requireRecord(await executeTool(navigate, {
		date: "2026-07-20",
		target: "date"
	}));
	assert.equal(unchanged["ok"], true);
	assert.equal(unchanged["changed"], false);
});

void test("a no-op navigate resolves while an unrelated initial load remains pending", async (context) => {
	const modelContext = new TestModelContext();
	const requests: SourceRequest[] = [];
	const { host } = setupDom(context, modelContext);
	const calendar = createCalendar(host, {
		events: createDeferredEventSource(requests),
		initialDate: "2026-07-14",
		minDate: "2026-07-01",
		extensions: [webMcp({ toolNamePrefix: "schedule" })]
	});
	context.after(() => {
		requests[0]?.pending.resolve([]);
		calendar.destroy();
	});
	calendar.render();
	await waitFor(() => requests.length === 1, "slow initial event request");
	await waitForRegistrations(modelContext);

	const navigation = executeTool(findTool(modelContext, "schedule-navigate"), {
		target: "previous-month"
	});
	let result: unknown;
	let failure: unknown;
	void navigation.then(
		(value) => { result = value; },
		(error: unknown) => { failure = error; }
	);
	await Promise.resolve();
	await Promise.resolve();

	assert.equal(failure, undefined);
	const settled = requireRecord(result);
	assert.equal(settled["ok"], true);
	assert.equal(settled["changed"], false);
	assert.equal(requireRecord(settled["state"])["phase"], "loading");
	assert.equal(requests.length, 1);
	assert.equal(requests[0]?.signal.aborted, false);

	requests[0]?.pending.resolve([]);
	await waitForPhase(calendar, "ready");
});

void test("a later boundary no-op supersedes an earlier pending navigation", async (context) => {
	const modelContext = new TestModelContext();
	const requests: SourceRequest[] = [];
	const { host } = setupDom(context, modelContext);
	const calendar = createCalendar(host, {
		events: ({ signal }) => {
			const pending = deferred<readonly CalendarEventInput[]>();
			requests.push({ pending, signal });
			return pending.promise;
		},
		initialDate: "2026-07-14",
		maxDate: "2026-08-31",
		extensions: [webMcp({ toolNamePrefix: "schedule" })]
	});
	calendar.render();
	await waitFor(() => requests.length === 1, "initial bounded request");
	requests[0]?.pending.resolve([]);
	await waitForPhase(calendar, "ready");
	await waitForRegistrations(modelContext);
	const navigate = findTool(modelContext, "schedule-navigate");

	const first = executeTool(navigate, { target: "next-month" });
	await waitFor(() => requests.length === 2, "bounded destination request");
	const boundary = requireRecord(await executeTool(navigate, { target: "next-month" }));

	assertErrorEnvelope(await first, "navigation-superseded");
	assert.equal(boundary["ok"], true);
	assert.equal(boundary["changed"], false);
	assert.equal(requireRecord(boundary["state"])["phase"], "loading");
	assert.equal(requests.length, 2);

	requests[1]?.pending.resolve([]);
	await waitForPhase(calendar, "ready");
});

void test("synchronous destroy during navigation rejects before a waiter can be registered", async (context) => {
	const modelContext = new TestModelContext();
	const { host } = setupDom(context, modelContext);
	let destroyFromNow = false;
	const calendar: Calendar = createCalendar(host, {
		events: [],
		initialDate: "2026-07-14",
		now: () => {
			if (destroyFromNow) {
				calendar.destroy();
			}
			return new Date("2026-07-14T12:00:00Z");
		},
		extensions: [webMcp({ toolNamePrefix: "destroy-in-navigation" })]
	});
	calendar.render();
	await waitForPhase(calendar, "ready");
	await waitForRegistrations(modelContext);

	destroyFromNow = true;
	const navigation = executeTool(
		findTool(modelContext, "destroy-in-navigation-navigate"),
		{ target: "today" }
	);
	await assert.rejects(navigation, isAbortError);
	assert.equal(calendar.getState().phase, "destroyed");
	assert.equal(modelContext.activeTools.size, 0);
});

void test("synchronous fatal teardown during navigation rejects before waiter setup", async (context) => {
	const modelContext = new TestModelContext();
	const errors: LitefoldCalendarError[] = [];
	const { host } = setupDom(context, modelContext);
	let failFromNow = false;
	const calendar = createCalendar(host, {
		events: [],
		initialDate: "2026-07-14",
		now: () => {
			if (failFromNow) {
				throw new Error("Today lookup failed during navigation.");
			}
			return new Date("2026-07-14T12:00:00Z");
		},
		onError: (error) => { errors.push(error); },
		extensions: [webMcp({ toolNamePrefix: "fatal-in-navigation" })]
	});
	calendar.render();
	await waitForPhase(calendar, "ready");
	await waitForRegistrations(modelContext);

	failFromNow = true;
	const navigation = executeTool(
		findTool(modelContext, "fatal-in-navigation-navigate"),
		{ target: "today" }
	);
	await assert.rejects(navigation, isAbortError);
	assert.equal(calendar.getState().phase, "unavailable");
	assert.equal(errors.some((error) => error.severity === "fatal"), true);
	assert.equal(modelContext.activeTools.size, 0);
});

void test("a same-turn fatal render wins over the preceding ready publication", async (context) => {
	const modelContext = new TestModelContext();
	const requests: SourceRequest[] = [];
	const readyPublished = deferred<void>();
	const errors: LitefoldCalendarError[] = [];
	let armFatalRender = false;
	let failRender = false;
	const { host } = setupDom(context, modelContext);
	const calendar = createCalendar(host, {
		events: ({ signal }) => {
			const pending = deferred<readonly CalendarEventInput[]>();
			requests.push({ pending, signal });
			return pending.promise;
		},
		initialDate: "2026-07-14",
		now: () => {
			if (failRender) {
				throw new Error("Destination render failed after ready publication.");
			}
			return new Date("2026-07-14T12:00:00Z");
		},
		onError: (error) => { errors.push(error); },
		onStateChange: (state) => {
			if (armFatalRender && state.phase === "ready") {
				failRender = true;
				readyPublished.resolve();
			}
		},
		extensions: [webMcp({ toolNamePrefix: "schedule" })]
	});
	calendar.render();
	await waitFor(() => requests.length === 1, "initial event request");
	requests[0]?.pending.resolve([]);
	await waitForPhase(calendar, "ready");
	await waitForRegistrations(modelContext);
	const registrationSignal = modelContext.registrations[0]?.options.signal;
	assert.ok(registrationSignal);

	armFatalRender = true;
	const navigation = executeTool(findTool(modelContext, "schedule-navigate"), {
		target: "next-month"
	});
	await waitFor(() => requests.length === 2, "destination event request");
	requests[1]?.pending.resolve([{
		id: "destination",
		start: "2026-08-14",
		title: "Destination"
	}]);
	await readyPublished.promise;

	await assert.rejects(navigation, isAbortError);
	await waitForPhase(calendar, "unavailable");
	assert.equal(errors.some((error) => error.severity === "fatal"), true);
	assert.equal(registrationSignal.aborted, true);
	assert.equal(modelContext.activeTools.size, 0);
});

void test("navigate stays pending until the destination event load settles", async (context) => {
	const modelContext = new TestModelContext();
	const requests: SourceRequest[] = [];
	const { host } = setupDom(context, modelContext);
	const calendar = createCalendar(host, {
		events: ({ signal }) => {
			const pending = deferred<readonly CalendarEventInput[]>();
			requests.push({ pending, signal });
			return pending.promise;
		},
		initialDate: "2026-07-14",
		extensions: [webMcp({ toolNamePrefix: "schedule" })]
	});
	calendar.render();
	await waitFor(() => requests.length === 1, "initial event request");
	requests[0]?.pending.resolve([]);
	await waitForPhase(calendar, "ready");
	await waitForRegistrations(modelContext);

	const navigation = executeTool(findTool(modelContext, "schedule-navigate"), {
		target: "next-month"
	});
	let settled = false;
	void navigation.then(
		() => { settled = true; },
		() => { settled = true; }
	);
	await waitFor(() => requests.length === 2, "destination event request");
	await Promise.resolve();
	assert.equal(settled, false);
	assert.equal(calendar.getState().phase, "loading");
	assert.deepEqual(calendar.getState().displayedMonth, { day: 1, month: 8, year: 2026 });

	requests[1]?.pending.resolve([]);
	const result = requireRecord(await navigation);
	assert.equal(result["ok"], true);
	assert.equal(result["changed"], true);
	assert.equal(requireRecord(result["state"])["phase"], "ready");
});

void test("navigate and get-events return unavailable envelopes when a destination cannot load", async (context) => {
	const modelContext = new TestModelContext();
	const requests: SourceRequest[] = [];
	const errors: LitefoldCalendarError[] = [];
	const { host } = setupDom(context, modelContext);
	const calendar = createCalendar(host, {
		events: createDeferredEventSource(requests),
		initialDate: "2026-07-14",
		onError: (error) => { errors.push(error); },
		extensions: [webMcp({ toolNamePrefix: "schedule" })]
	});
	calendar.render();
	await waitFor(() => requests.length === 1, "initial availability request");
	requests[0]?.pending.resolve([]);
	await waitForPhase(calendar, "ready");
	await waitForRegistrations(modelContext);

	const navigation = executeTool(findTool(modelContext, "schedule-navigate"), {
		target: "next-month"
	});
	await waitFor(() => requests.length === 2, "failing destination request");
	requests[1]?.pending.reject(new Error("Destination failed."));

	assertErrorEnvelope(await navigation, "calendar-unavailable");
	await waitForPhase(calendar, "unavailable");
	assertErrorEnvelope(
		await executeTool(findTool(modelContext, "schedule-get-events"), {}),
		"calendar-unavailable"
	);
	assert.equal(errors.length, 1);
});

void test("navigate cancellation rejects promptly without rolling back a committed destination", async (context) => {
	const modelContext = new TestModelContext();
	const requests: SourceRequest[] = [];
	const { dom, host } = setupDom(context, modelContext);
	const calendar = createCalendar(host, {
		events: ({ signal }) => {
			const pending = deferred<readonly CalendarEventInput[]>();
			requests.push({ pending, signal });
			return pending.promise;
		},
		initialDate: "2026-07-14",
		extensions: [webMcp({ toolNamePrefix: "schedule" })]
	});
	calendar.render();
	await waitFor(() => requests.length === 1, "initial event request");
	requests[0]?.pending.resolve([]);
	await waitForPhase(calendar, "ready");
	await waitForRegistrations(modelContext);

	const frame = dom.window.document.createElement("iframe");
	dom.window.document.body.append(frame);
	const frameWindow = frame.contentWindow;
	assert.ok(frameWindow);
	assert.notEqual(
		Reflect.get(frameWindow, "AbortSignal"),
		Reflect.get(dom.window, "AbortSignal")
	);
	const FrameAbortController: unknown = Reflect.get(frameWindow, "AbortController");
	assert.equal(typeof FrameAbortController, "function");
	const controller = new (FrameAbortController as typeof AbortController)();
	const navigation = executeTool(
		findTool(modelContext, "schedule-navigate"),
		{ target: "next-month" },
		controller.signal
	);
	await waitFor(() => requests.length === 2, "cancelled destination request");
	controller.abort();
	await assert.rejects(navigation, isAbortError);
	assert.deepEqual(calendar.getState().displayedMonth, { day: 1, month: 8, year: 2026 });
	assert.equal(calendar.getState().phase, "loading");

	requests[1]?.pending.resolve([]);
	await waitForPhase(calendar, "ready");
	assert.deepEqual(calendar.getState().displayedMonth, { day: 1, month: 8, year: 2026 });
});

void test("a later public focus navigation supersedes a pending tool call", async (context) => {
	const modelContext = new TestModelContext();
	const requests: SourceRequest[] = [];
	const { host } = setupDom(context, modelContext);
	const calendar = createCalendar(host, {
		events: ({ signal }) => {
			const pending = deferred<readonly CalendarEventInput[]>();
			requests.push({ pending, signal });
			return pending.promise;
		},
		initialDate: "2026-07-14",
		extensions: [webMcp({ toolNamePrefix: "schedule" })]
	});
	calendar.render();
	await waitFor(() => requests.length === 1, "initial event request");
	requests[0]?.pending.resolve([]);
	await waitForPhase(calendar, "ready");
	await waitForRegistrations(modelContext);
	const navigate = findTool(modelContext, "schedule-navigate");

	const first = executeTool(navigate, { target: "next-month" });
	await waitFor(() => requests.length === 2, "first destination request");
	calendar.focusDate("2026-08-20");

	assertErrorEnvelope(await first, "navigation-superseded");
	assert.equal(requests.length, 2);
	requests[1]?.pending.resolve([]);
	await waitForPhase(calendar, "ready");
	assert.deepEqual(calendar.getState().selectedDate, { day: 20, month: 8, year: 2026 });
});

void test("destroy aborts registration and rejects a pending navigation using the fallback signal", async (context) => {
	const modelContext = new TestModelContext();
	const requests: SourceRequest[] = [];
	const { host } = setupDom(context, modelContext);
	const calendar = createCalendar(host, {
		events: ({ signal }) => {
			const pending = deferred<readonly CalendarEventInput[]>();
			requests.push({ pending, signal });
			return pending.promise;
		},
		initialDate: "2026-07-14",
		extensions: [webMcp({ toolNamePrefix: "schedule" })]
	});
	calendar.render();
	await waitFor(() => requests.length === 1, "initial event request");
	requests[0]?.pending.resolve([]);
	await waitForPhase(calendar, "ready");
	await waitForRegistrations(modelContext);
	const navigation = findTool(modelContext, "schedule-navigate").execute({
		target: "next-month"
	}, undefined);
	await waitFor(() => requests.length === 2, "pending destination request");

	calendar.destroy();
	assert.equal(requests[1]?.signal.aborted, true);
	assert.ok(modelContext.registrations.every(({ options }) => options.signal?.aborted === true));
	await assert.rejects(navigation, isAbortError);
});
