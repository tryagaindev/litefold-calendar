import assert from "node:assert/strict";
import test from "node:test";
import { loadEvents, validateEvents } from "../../examples/remote-data/source.js";

const RECORDS = [
	{ id: "ending-before", title: "Ends at range start", start: "2026-08-01", end: "2026-08-06", category: "community" },
	{ id: "overlap", title: "Spans range start", start: "2026-08-05", end: "2026-08-08", category: "community" },
	{ id: "included", title: "Starts at range start", start: "2026-08-06", category: "workshop" },
	{ id: "other", title: "Last included day", start: "2026-08-09", category: "community" },
	{ id: "outside", title: "Starts at exclusive end", start: "2026-08-10", category: "workshop" }
];

function range(signal = new AbortController().signal) {
	return { start: "2026-08-06", end: "2026-08-10", signal };
}

test("remote fixture forwards range, category, and cancellation and filters overlapping dates", async () => {
	const requestRange = range();
	const events = await loadEvents(requestRange, "all", async (input, options) => {
		assert.equal(input.searchParams.get("start"), requestRange.start);
		assert.equal(input.searchParams.get("end"), requestRange.end);
		assert.equal(input.searchParams.get("category"), "all");
		assert.equal(options.signal, requestRange.signal);
		assert.equal(options.headers.Accept, "application/json");
		return Response.json(RECORDS);
	});
	assert.deepEqual(events.map((event) => event.id), ["overlap", "included", "other"]);
	assert.deepEqual(events[0].metadata, { category: "community" });
	assert.equal(Object.hasOwn(events[1], "end"), false);
});

test("remote fixture applies category filters and preserves a successful empty response", async () => {
	const request = async () => Response.json(RECORDS);
	assert.deepEqual((await loadEvents(range(), "workshop", request)).map((event) => event.id), ["included"]);
	assert.deepEqual(await loadEvents(range(), "sports", request), []);
	assert.deepEqual(await loadEvents(range(), "all", async () => Response.json([])), []);
});

test("remote fixture propagates HTTP, network, parsing, and cancellation failures", async () => {
	await assert.rejects(loadEvents(range(), "all", async () => new Response("Unavailable", { status: 503 })), /503/u);
	const failure = new TypeError("Connection lost");
	await assert.rejects(loadEvents(range(), "all", async () => { throw failure; }), (error) => error === failure);
	await assert.rejects(loadEvents(range(), "all", async () => new Response("not JSON")), SyntaxError);
	const controller = new AbortController();
	await assert.rejects(loadEvents(range(controller.signal), "all", async () => {
		controller.abort();
		return Response.json(RECORDS);
	}), { name: "AbortError" });
});

test("remote fixture validates the whole response before filtering", async () => {
	const invalid = { id: "invalid", title: "Invalid outside range", start: "2020-02-30", category: "sports" };
	await assert.rejects(loadEvents(range(), "workshop", async () => Response.json([...RECORDS, invalid])), /invalid record/u);
});

test("remote schema rejects malformed, duplicate, timed, and non-increasing event records", () => {
	const valid = RECORDS[2];
	for (const payload of [
		null, {}, [null], ["event"],
		[{ ...valid, id: " " }], [{ ...valid, title: " " }], [{ ...valid, category: null }],
		[{ ...valid, start: "2026-02-29" }], [{ ...valid, start: "0000-01-01" }],
		[{ ...valid, start: "2026-08-06T11:00" }],
		[{ ...valid, end: "2026-08-06" }], [{ ...valid, end: "2026-08-05" }],
		[valid, valid]
	]) {
		assert.throws(() => validateEvents(payload), Error);
	}
	assert.equal(validateEvents([{ ...valid, start: "2028-02-29" }])[0].start, "2028-02-29");
});
