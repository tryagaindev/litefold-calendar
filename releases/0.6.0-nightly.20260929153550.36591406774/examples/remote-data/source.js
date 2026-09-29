/** @typedef {{ category: string }} EventMetadata */
/** @typedef {import("../../dist/index.js").CalendarEventInput<EventMetadata>} EventInput */
/** @typedef {import("../../dist/index.js").CalendarRange} SourceContext */

/**
 * Load a real same-origin JSON resource and return a validated calendar snapshot.
 * This static fixture filters on the client; a production endpoint must authorize
 * and filter records on the server before returning them.
 * @param {SourceContext} range
 * @param {string} category
 * @param {typeof fetch} [request]
 * @returns {Promise<EventInput[]>}
 */
export async function loadEvents({ start, end, signal }, category, request = fetch) {
	const url = new URL("./events.json", import.meta.url);
	url.searchParams.set("start", start);
	url.searchParams.set("end", end);
	url.searchParams.set("category", category);
	const response = await request(url, { signal, headers: { Accept: "application/json" } });
	if (!response.ok) {
		throw new Error(`Event request failed (${response.status}).`);
	}
	/** @type {unknown} */
	const payload = await response.json();
	signal.throwIfAborted();
	const events = validateEvents(payload);
	return events.filter((event) =>
		(category === "all" || event.metadata?.category === category) &&
		event.start < end &&
		(event.end === undefined ? event.start >= start : event.end > start)
	);
}

/**
 * Adapt this example's date-only JSON schema; the library validates its complete
 * public event contract again. Timed API records need their own explicit adapter.
 * @param {unknown} payload
 * @returns {EventInput[]}
 */
export function validateEvents(payload) {
	if (!Array.isArray(payload)) {
		throw new Error("Expected an event array.");
	}
	const ids = new Set();
	return payload.map((record) => {
		if (record === null || typeof record !== "object" ||
			typeof record.id !== "string" || record.id.trim() === "" || ids.has(record.id) ||
			typeof record.title !== "string" || record.title.trim() === "" ||
			typeof record.category !== "string" || record.category.trim() === "" ||
			!isCivilDate(record.start) ||
			(record.end !== undefined && (!isCivilDate(record.end) || record.end <= record.start))) {
			throw new Error("The event response contains an invalid record.");
		}
		ids.add(record.id);
		return {
			id: record.id,
			title: record.title,
			start: record.start,
			...(record.end === undefined ? {} : { end: record.end }),
			metadata: { category: record.category }
		};
	});
}

/** @param {unknown} value @returns {value is string} */
function isCivilDate(value) {
	if (typeof value !== "string" || !/^[0-9]{4}-[0-9]{2}-[0-9]{2}$/u.test(value)) {
		return false;
	}
	const date = new Date(`${value}T00:00:00Z`);
	return value.slice(0, 4) !== "0000" &&
		Number.isFinite(date.getTime()) && date.toISOString().slice(0, 10) === value;
}
