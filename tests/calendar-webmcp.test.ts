import assert from "node:assert/strict";
import test from "node:test";

import {
	createCalendar,
	type Calendar,
	type CalendarEventInput,
	LitefoldCalendarError
} from "../src/index.js";
import { deferred, waitFor } from "./helpers/dom.js";
import {
	assertErrorEnvelope,
	createDeferredEventSource,
	createPrivateEvents,
	executeTool,
	findTool,
	isAbortError,
	requireRecord,
	requireRecords,
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
		webMcp: { toolNamePrefix: "schedule" }
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
		webMcp: { toolNamePrefix: "non-callable" }
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
		webMcp: { toolNamePrefix: "throwing-getter" }
	});
	throwingGetter.render();
	await waitFor(() => errors.length === 1, "WebMCP feature-detection diagnostic");
	await waitForPhase(throwingGetter, "ready");
	assert.equal(errors[0]?.hook, "webMcp");
	assert.deepEqual(throwingGetter.getState().issues, []);
});

void test("WebMCP remains opt-in when a model context is available", async (context) => {
	const modelContext = new TestModelContext();
	const { host } = setupDom(context, modelContext);
	const disabled = createCalendar(host, {
		events: [],
		initialDate: "2026-07-14",
		webMcp: false
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

void test("WebMCP configuration rejects malformed and unsafe tool prefixes", (context) => {
	const { host } = setupDom(context);
	const invalidOptions: readonly object[] = [
		{ toolNamePrefix: "" },
		{ toolNamePrefix: "calendar tools" },
		{ toolNamePrefix: "calendar/tools" },
		{ toolNamePrefix: "x".repeat(118) },
		{ extra: true, toolNamePrefix: "schedule" },
		{ [Symbol("extra")]: true, toolNamePrefix: "schedule" }
	];

	for (const webMcp of invalidOptions) {
		assert.throws(
			() => {
				createCalendar(host, {
					events: [],
					webMcp: webMcp as Readonly<{ readonly toolNamePrefix: string }>
				});
			},
			(error: unknown) => error instanceof LitefoldCalendarError &&
				error.code === "invalid-configuration" && error.phase === "configuration"
		);
	}
	assert.throws(
		() => {
			createCalendar(host, {
				events: [],
				webMcp: true as never
			});
		},
		(error: unknown) => error instanceof LitefoldCalendarError &&
			error.code === "invalid-configuration"
	);
	assert.doesNotThrow(() => createCalendar(host, {
		events: [],
		webMcp: { toolNamePrefix: "x".repeat(117) }
	}));
});

void test("WebMCP registers the two stable tool contracts with one lifecycle signal", async (context) => {
	const modelContext = new TestModelContext();
	const { host } = setupDom(context, modelContext);
	const webMcp = { toolNamePrefix: "team-calendar" };
	const calendar = createCalendar(host, {
		events: [],
		initialDate: "2026-07-14",
		webMcp
	});
	webMcp.toolNamePrefix = "mutated-after-construction";
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
		"Read up to 10 unique events from this calendar's currently loaded, allowed visible range. Omit date for the whole range, provide date to filter one day, and continue with nextOffset."
	);
	assert.equal(getEvents.title, "Get calendar events");
	assert.equal(navigate.description.length > 0, true);
	assert.deepEqual(getEvents.annotations, {
		readOnlyHint: true,
		untrustedContentHint: true
	});
	assert.deepEqual(navigate.annotations, { readOnlyHint: false });
	assert.deepEqual(getEvents.inputSchema, {
		additionalProperties: false,
		properties: {
			date: {
				description: "Optional strict YYYY-MM-DD date filter. Omit it to inspect every event available on allowed dates in the current visible range.",
				pattern: "^[0-9]{4}-[0-9]{2}-[0-9]{2}$",
				type: "string"
			},
			offset: {
				description: "Zero-based event offset for paging. Defaults to 0.",
				minimum: 0,
				type: "integer"
			}
		},
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
		webMcp: { toolNamePrefix: "primary" }
	});
	const secondary = createCalendar(secondaryHost, {
		events: [],
		initialDate: "2026-07-14",
		webMcp: { toolNamePrefix: "secondary" }
	});
	const duplicate = createCalendar(duplicateHost, {
		events: [],
		initialDate: "2026-07-14",
		onError: (error) => { duplicateErrors.push(error); },
		webMcp: { toolNamePrefix: "primary" }
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
	assert.equal(duplicateErrors[0]?.hook, "webMcp");
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
		webMcp: { toolNamePrefix: "schedule" }
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
		{ offset: -1 },
		{ offset: 0.5 },
		{ offset: Number.MAX_SAFE_INTEGER + 1 },
		{ extra: true },
		Object.defineProperty({}, "offset", {
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
	assert.equal(emptyRange["dataAvailable"], true);
	assert.equal(emptyRange["date"], null);
	assert.equal(emptyRange["totalEvents"], 0);
	assert.deepEqual(emptyRange["events"], []);
	const emptyDate = requireRecord(await executeTool(getEvents, { date: "2026-07-14" }));
	assert.equal(emptyDate["date"], "2026-07-14");
	assert.equal(emptyDate["totalEvents"], 0);
	assert.deepEqual(emptyDate["events"], []);
});

void test("get-events pages unique allowed-range events and exposes only presentation-safe fields", async (context) => {
	const modelContext = new TestModelContext();
	const { host } = setupDom(context, modelContext);
	const hostileTitle = '<img src=x onerror="steal()"> Multi-day';
	const calendar = createCalendar(host, {
		events: [
			...createPrivateEvents(12),
			{
				end: "2026-07-16",
				id: "private-multi-day",
				metadata: { secret: "multi-day-secret" },
				start: "2026-07-14",
				title: hostileTitle,
				url: "https://private.example/events/multi-day"
			},
			{
				id: "private-identical-a",
				metadata: { secret: "identical-a" },
				start: "2026-08-01",
				title: "Same visible projection"
			},
			{
				id: "private-identical-b",
				metadata: { secret: "identical-b" },
				start: "2026-08-01",
				title: "Same visible projection"
			},
			{
				id: "private-disabled-filler",
				start: "2026-07-01",
				title: "Disabled filler event"
			},
			{
				id: "private-outside-range",
				start: "2026-12-01",
				title: "Outside range event"
			}
		],
		initialDate: "2026-07-14",
		minDate: "2026-07-10",
		webMcp: { toolNamePrefix: "schedule" }
	});

	calendar.render();
	await waitForPhase(calendar, "ready");
	await waitForRegistrations(modelContext);
	const getEvents = findTool(modelContext, "schedule-get-events");
	const first = requireRecord(await executeTool(getEvents, {}));
	const firstEvents = requireRecords(first["events"]);
	assert.equal(first["ok"], true);
	assert.equal(first["dataAvailable"], true);
	assert.equal(first["date"], null);
	assert.equal(first["totalEvents"], 15);
	assert.equal(first["offset"], 0);
	assert.equal(firstEvents.length, 10);
	assert.equal(first["nextOffset"], 10);
	for (const event of firstEvents) {
		assert.deepEqual(Object.keys(event).sort(), ["end", "isAllDay", "start", "title"]);
	}
	assert.deepEqual(firstEvents[0], {
		end: "2026-07-16",
		isAllDay: true,
		start: "2026-07-14",
		title: hostileTitle
	});
	assert.equal(host.querySelector("img"), null);
	assert.doesNotMatch(
		JSON.stringify(firstEvents),
		/secret|private\.example|event-0|private-multi-day/u
	);

	const second = requireRecord(await executeTool(getEvents, { offset: 10 }));
	const secondEvents = requireRecords(second["events"]);
	assert.equal(second["offset"], 10);
	assert.equal(secondEvents.length, 5);
	assert.equal(secondEvents[0]?.["title"], "Visible event 10");
	assert.equal(
		secondEvents.filter((event) => event["title"] === "Same visible projection").length,
		2
	);
	assert.equal(
		[...firstEvents, ...secondEvents].filter((event) => event["title"] === hostileTitle).length,
		1
	);
	assert.doesNotMatch(JSON.stringify(secondEvents), /Disabled filler|Outside range/u);
	assert.equal(second["nextOffset"], null);

	const projected = requireRecord(await executeTool(getEvents, {
		date: "2026-07-15",
		offset: 0
	}));
	assert.equal(projected["dataAvailable"], true);
	assert.equal(projected["date"], "2026-07-15");
	assert.equal(projected["totalEvents"], 1);
	assert.deepEqual(projected["events"], [{
		end: "2026-07-16",
		isAllDay: true,
		start: "2026-07-14",
		title: hostileTitle
	}]);
	assert.equal(projected["nextOffset"], null);
	const trailingDate = requireRecord(await executeTool(getEvents, { date: "2026-08-01" }));
	assert.equal(trailingDate["totalEvents"], 2);
	assert.equal(requireRecords(trailingDate["events"]).length, 2);

	const beyond = requireRecord(await executeTool(getEvents, { offset: Number.MAX_SAFE_INTEGER }));
	assert.equal(beyond["ok"], true);
	assert.equal(beyond["offset"], Number.MAX_SAFE_INTEGER);
	assert.equal(beyond["totalEvents"], 15);
	assert.deepEqual(beyond["events"], []);
	assert.equal(beyond["nextOffset"], null);
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
		webMcp: { toolNamePrefix: "schedule" }
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
	assert.equal(loading["dataAvailable"], true);
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
	assert.equal(degraded["dataAvailable"], true);
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
		webMcp: { toolNamePrefix: "schedule" }
	});

	calendar.render();
	await waitFor(() => errors.length === 1, "WebMCP registration diagnostic");
	await waitForPhase(calendar, "ready");
	const registrationError = errors[0];
	assert.ok(registrationError);
	assert.equal(registrationError.code, "host-integration-failed");
	assert.equal(registrationError.hook, "webMcp");
	assert.equal(registrationError.recoverable, true);
	assert.equal(registrationError.stale, true);
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
		webMcp: { toolNamePrefix: "schedule" }
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
		{ extra: true, target: "next-month" }
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
		webMcp: { toolNamePrefix: "schedule" }
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
		webMcp: { toolNamePrefix: "schedule" }
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
		webMcp: { toolNamePrefix: "schedule" }
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
		webMcp: { toolNamePrefix: "schedule" }
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
		webMcp: { toolNamePrefix: "schedule" }
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
	const { host } = setupDom(context, modelContext);
	const calendar = createCalendar(host, {
		events: ({ signal }) => {
			const pending = deferred<readonly CalendarEventInput[]>();
			requests.push({ pending, signal });
			return pending.promise;
		},
		initialDate: "2026-07-14",
		webMcp: { toolNamePrefix: "schedule" }
	});
	calendar.render();
	await waitFor(() => requests.length === 1, "initial event request");
	requests[0]?.pending.resolve([]);
	await waitForPhase(calendar, "ready");
	await waitForRegistrations(modelContext);

	const controller = new AbortController();
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
		webMcp: { toolNamePrefix: "schedule" }
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

void test("destroy aborts registration and rejects a pending navigation", async (context) => {
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
		webMcp: { toolNamePrefix: "schedule" }
	});
	calendar.render();
	await waitFor(() => requests.length === 1, "initial event request");
	requests[0]?.pending.resolve([]);
	await waitForPhase(calendar, "ready");
	await waitForRegistrations(modelContext);
	const navigation = executeTool(findTool(modelContext, "schedule-navigate"), {
		target: "next-month"
	});
	await waitFor(() => requests.length === 2, "pending destination request");

	calendar.destroy();
	assert.equal(requests[1]?.signal.aborted, true);
	assert.ok(modelContext.registrations.every(({ options }) => options.signal?.aborted === true));
	await assert.rejects(navigation, isAbortError);
});
