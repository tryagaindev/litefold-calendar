import assert from "node:assert/strict";
import { Buffer } from "node:buffer";
import test from "node:test";

import { createCalendar } from "../src/index.js";
import { webMcp } from "../src/extensions/webmcp/index.js";
import { waitFor } from "./helpers/dom.js";
import {
	assertErrorEnvelope,
	createDeferredEventSource,
	createPrivateEvents,
	executeTool,
	findTool,
	requireRecord,
	requireRecords,
	setupDom,
	type SourceRequest,
	TestModelContext,
	waitForPhase,
	waitForRegistrations
} from "./helpers/webmcp.js";

function replaceCursorField(cursor: string, index: number, value: unknown): string {
	const serialized = Buffer.from(cursor.slice("lfc.".length), "hex").toString("ascii");
	const parsed: unknown = JSON.parse(serialized);
	assert.ok(Array.isArray(parsed));
	const payload: unknown[] = [];
	for (const value of parsed as readonly unknown[]) {
		payload.push(value);
	}
	payload[index] = value;
	return `lfc.${Buffer.from(JSON.stringify(payload), "ascii").toString("hex")}`;
}

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
		extensions: [webMcp({ toolNamePrefix: "schedule-pages" })]
	});

	calendar.render();
	await waitForPhase(calendar, "ready");
	await waitForRegistrations(modelContext);
	const getEvents = findTool(modelContext, "schedule-pages-get-events");
	const first = requireRecord(await executeTool(getEvents, {}));
	const firstEvents = requireRecords(first["events"]);
	assert.equal(first["ok"], true);
	assert.equal(Object.hasOwn(first, "dataAvailable"), false);
	assert.equal(first["date"], null);
	assert.equal(first["totalEvents"], 15);
	assert.equal(first["offset"], 0);
	assert.equal(firstEvents.length, 10);
	assert.equal(typeof first["nextCursor"], "string");
	assert.equal(Object.hasOwn(first, "nextOffset"), false);
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

	const second = requireRecord(await executeTool(getEvents, { cursor: first["nextCursor"] }));
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
	assert.equal(second["nextCursor"], null);

	const projected = requireRecord(await executeTool(getEvents, { date: "2026-07-15" }));
	assert.equal(Object.hasOwn(projected, "dataAvailable"), false);
	assert.equal(projected["date"], "2026-07-15");
	assert.equal(projected["totalEvents"], 1);
	assert.deepEqual(projected["events"], [{
		end: "2026-07-16",
		isAllDay: true,
		start: "2026-07-14",
		title: hostileTitle
	}]);
	assert.equal(projected["nextCursor"], null);
	const dateFirst = requireRecord(await executeTool(getEvents, { date: "2026-07-14" }));
	assert.equal(typeof dateFirst["nextCursor"], "string");
	const dateSecond = requireRecord(await executeTool(getEvents, {
		cursor: dateFirst["nextCursor"]
	}));
	assert.equal(dateSecond["date"], "2026-07-14");
	assert.equal(dateSecond["offset"], 10);
	assertErrorEnvelope(await executeTool(getEvents, {
		cursor: dateFirst["nextCursor"],
		date: "2026-07-15"
	}), "invalid-input");
	const trailingDate = requireRecord(await executeTool(getEvents, { date: "2026-08-01" }));
	assert.equal(trailingDate["totalEvents"], 2);
	assert.equal(requireRecords(trailingDate["events"]).length, 2);

	const repeated = requireRecord(await executeTool(getEvents, { cursor: first["nextCursor"] }));
	assert.deepEqual(repeated, second);
	const repeatedFirst = requireRecord(await executeTool(getEvents, {}));
	assert.equal(repeatedFirst["nextCursor"], first["nextCursor"]);
	const unsupportedCursor = replaceCursorField(first["nextCursor"] as string, 0, 2);
	assertErrorEnvelope(await executeTool(getEvents, { cursor: unsupportedCursor }), "invalid-input");
	const malformedScopeCursor = replaceCursorField(first["nextCursor"] as string, 5, "date");
	assertErrorEnvelope(
		await executeTool(getEvents, { cursor: malformedScopeCursor }),
		"invalid-input"
	);
	const malformedDateCursor = replaceCursorField(
		dateFirst["nextCursor"] as string,
		6,
		"2026-7-14"
	);
	assertErrorEnvelope(await executeTool(getEvents, { cursor: malformedDateCursor }), "invalid-input");
	const impossibleDateCursor = replaceCursorField(
		dateFirst["nextCursor"] as string,
		6,
		"2026-07-15"
	);
	assertErrorEnvelope(
		await executeTool(getEvents, { cursor: impossibleDateCursor }),
		"pagination-stale"
	);
	const impossibleCursor = replaceCursorField(first["nextCursor"] as string, 7, 20);
	assertErrorEnvelope(await executeTool(getEvents, { cursor: impossibleCursor }), "pagination-stale");
});

void test("get-events cursors are bound to their instance, range, and event snapshot", async (context) => {
	const modelContext = new TestModelContext();
	const { dom, host } = setupDom(
		context,
		modelContext,
		'<div id="calendar"></div><div id="secondary"></div>'
	);
	const secondaryHost = dom.window.document.querySelector<HTMLElement>("#secondary");
	assert.ok(secondaryHost);
	const primary = createCalendar(host, {
		events: createPrivateEvents(12),
		initialDate: "2026-07-14",
		extensions: [webMcp({ toolNamePrefix: "primary-pages" })]
	});
	const secondary = createCalendar(secondaryHost, {
		events: createPrivateEvents(12),
		initialDate: "2026-07-14",
		extensions: [webMcp({ toolNamePrefix: "secondary-pages" })]
	});

	primary.render();
	secondary.render();
	await waitForPhase(primary, "ready");
	await waitForPhase(secondary, "ready");
	await waitForRegistrations(modelContext, 4);
	const primaryGetEvents = findTool(modelContext, "primary-pages-get-events");
	const first = requireRecord(await executeTool(primaryGetEvents, {}));
	const cursor = first["nextCursor"];
	assert.equal(typeof cursor, "string");
	const publicState = JSON.stringify(first["state"]);

	const wrongInstance = requireRecord(
		await executeTool(findTool(modelContext, "secondary-pages-get-events"), { cursor })
	);
	assertErrorEnvelope(wrongInstance, "pagination-stale");
	assert.equal(
		requireRecord(wrongInstance["error"])["message"],
		"The pagination cursor is no longer valid for this calendar state; call get-events again without a cursor."
	);

	primary.setEvents([{
		id: "replacement-first",
		start: "2026-07-14T08:00",
		title: "Replacement first"
	}, ...createPrivateEvents(12)]);
	await waitForPhase(primary, "ready");
	assert.equal(JSON.stringify(primary.getState()), publicState);
	const staleReplacement = await executeTool(primaryGetEvents, { cursor });
	assertErrorEnvelope(staleReplacement, "pagination-stale");
	assert.doesNotMatch(JSON.stringify(staleReplacement), /Visible event/u);

	const restartedFirst = requireRecord(await executeTool(primaryGetEvents, {}));
	const restartedSecond = requireRecord(await executeTool(primaryGetEvents, {
		cursor: restartedFirst["nextCursor"]
	}));
	const titles = [
		...requireRecords(restartedFirst["events"]),
		...requireRecords(restartedSecond["events"])
	].map((event) => event["title"]);
	assert.equal(titles.length, 13);
	assert.equal(new Set(titles).size, 13);
	assert.equal(titles.includes("Replacement first"), true);
	assert.equal(restartedSecond["nextCursor"], null);

	primary.gotoDate("2026-08-14");
	await waitForPhase(primary, "ready");
	assertErrorEnvelope(
		await executeTool(primaryGetEvents, { cursor: restartedFirst["nextCursor"] }),
		"pagination-stale"
	);
});

void test("get-events cursors survive a failed refresh and expire after a successful refresh", async (context) => {
	const modelContext = new TestModelContext();
	const requests: SourceRequest[] = [];
	const { host } = setupDom(context, modelContext);
	const calendar = createCalendar(host, {
		events: createDeferredEventSource(requests),
		initialDate: "2026-07-14",
		onError: () => "handled",
		extensions: [webMcp({ toolNamePrefix: "retained-pages" })]
	});

	calendar.render();
	await waitFor(() => requests.length === 1, "initial cursor snapshot request");
	requests[0]?.pending.resolve(createPrivateEvents(12));
	await waitForPhase(calendar, "ready");
	await waitForRegistrations(modelContext);
	const getEvents = findTool(modelContext, "retained-pages-get-events");
	const first = requireRecord(await executeTool(getEvents, {}));
	const cursor = first["nextCursor"];
	assert.equal(typeof cursor, "string");

	calendar.refetchEvents();
	await waitFor(() => requests.length === 2, "retained cursor refresh request");
	const duringRefresh = requireRecord(await executeTool(getEvents, { cursor }));
	assert.equal(duringRefresh["ok"], true);
	assert.equal(duringRefresh["offset"], 10);
	assert.equal(requireRecord(duringRefresh["state"])["phase"], "loading");

	requests[1]?.pending.reject(new Error("Retained cursor refresh failed."));
	await waitForPhase(calendar, "degraded");
	const afterFailure = requireRecord(await executeTool(getEvents, { cursor }));
	assert.deepEqual(afterFailure["events"], duringRefresh["events"]);
	assert.equal(requireRecord(afterFailure["state"])["phase"], "degraded");

	calendar.refetchEvents();
	await waitFor(() => requests.length === 3, "successful cursor refresh request");
	requests[2]?.pending.resolve(createPrivateEvents(12));
	await waitForPhase(calendar, "ready");
	assertErrorEnvelope(await executeTool(getEvents, { cursor }), "pagination-stale");
});
