import { createCalendar } from "../../dist/index.js";

/** @typedef {"deadline" | "meeting" | "workshop"} MigrationKind */
/**
 * @typedef MigrationMetadata
 * @property {MigrationKind} kind
 * @property {string} [ownerLabel]
 */
/**
 * Narrow FullCalendar-style input accepted by this migration adapter.
 * Transport validation should happen before values reach this type.
 * @typedef MigratableFullCalendarEvent
 * @property {string | number} [id]
 * @property {string} title
 * @property {string} start
 * @property {string} [end]
 * @property {boolean} [allDay]
 * @property {string} [url]
 * @property {string} [backgroundColor]
 * @property {string} [borderColor]
 * @property {Readonly<MigrationMetadata>} [extendedProps]
 */
/** @typedef {import("../../dist/index.js").CalendarEventInput<MigrationMetadata>} MigratedEvent */
/** @typedef {import("../../dist/index.js").CalendarRange} CalendarRange */

const MILLISECONDS_PER_DAY = 86_400_000;
const OPAQUE_HEX_COLOR = /^#[0-9A-F]{6}$/iu;
const DATE_ONLY_PATTERN = /^\d{4}-\d{2}-\d{2}$/u;

const FULLCALENDAR_VALID_RANGE = Object.freeze({
	end: "2027-09-16",
	start: "2026-07-15"
});

/**
 * @param {string} selector
 * @returns {HTMLElement}
 */
function requireElement(selector) {
	const element = document.querySelector(selector);
	if (!(element instanceof HTMLElement)) {
		throw new Error(`Missing migration example element: ${selector}`);
	}
	return element;
}

const host = requireElement("[data-my-calendar]");
const rangeResult = requireElement("[data-my-range]");
const selectionResult = requireElement("[data-my-selection]");
const activationResult = requireElement("[data-my-activation]");
const statusResult = requireElement("[data-my-status]");
const refetchButton = requireElement("[data-my-refetch]");
if (!(refetchButton instanceof HTMLButtonElement)) {
	throw new Error("The migration refetch control must be a button.");
}

/** @type {readonly Readonly<MigratableFullCalendarEvent>[]} */
const FULLCALENDAR_STYLE_RESPONSE = Object.freeze([
	Object.freeze({
		backgroundColor: "#008577",
		end: "2026-08-06",
		extendedProps: Object.freeze({ kind: "deadline", ownerLabel: "Release team" }),
		id: 42,
		start: "2026-08-04",
		title: "Release window"
	}),
	Object.freeze({
		borderColor: "#805FC0",
		end: "2026-08-04T12:23",
		extendedProps: Object.freeze({ kind: "meeting", ownerLabel: "Design group" }),
		id: "design-review",
		start: "2026-08-04T11:38",
		title: "Calendar design review",
		url: "/events/design-review?from=month&view=summary#agenda"
	}),
	Object.freeze({
		end: "2026-08-07T15:00",
		extendedProps: Object.freeze({ kind: "workshop" }),
		id: "migration-workshop",
		start: "2026-08-07T13:00",
		title: "Migration workshop"
	})
]);

/**
 * Returns the first FullCalendar color that Litefold Calendar can use as a marker accent.
 * @param {Readonly<MigratableFullCalendarEvent>} event
 * @returns {string | undefined}
 */
function getMarkerAccent(event) {
	for (const candidate of [event.backgroundColor, event.borderColor]) {
		if (typeof candidate === "string" && OPAQUE_HEX_COLOR.test(candidate)) {
			return candidate.toUpperCase();
		}
	}

	return undefined;
}

/**
 * Converts the common FullCalendar event fields used by a basic `dayGridMonth` view.
 * Litefold Calendar performs the authoritative public-event validation when the provider resolves.
 * @param {readonly Readonly<MigratableFullCalendarEvent>[]} events
 * @returns {readonly Readonly<MigratedEvent>[]}
 */
export function adaptFullCalendarSnapshot(events) {
	if (!Array.isArray(events)) {
		throw new TypeError("The event response must be an array.");
	}

	return events.map((event) => {
		if (typeof event.id !== "string" && typeof event.id !== "number") {
			throw new TypeError("Every migrated event needs a stable string or numeric id.");
		}
		if (event.allDay !== undefined && typeof event.allDay !== "boolean") {
			throw new TypeError("FullCalendar allDay must be a boolean when supplied.");
		}
		const inferredAllDay = DATE_ONLY_PATTERN.test(event.start);
		if ((event.end !== undefined && DATE_ONLY_PATTERN.test(event.end) !== inferredAllDay) ||
			(event.allDay !== undefined && event.allDay !== inferredAllDay)) {
			throw new TypeError("FullCalendar allDay must match the date-only or date-time start and end values.");
		}
		const accentColor = getMarkerAccent(event);
		return {
			id: String(event.id),
			title: event.title,
			start: event.start,
			...(event.end === undefined ? {} : { end: event.end }),
			...(event.url === undefined ? {} : { url: event.url }),
			...(accentColor === undefined ? {} : { accentColor }),
			...(event.extendedProps === undefined ? {} : { metadata: event.extendedProps })
		};
	});
}

/**
 * Converts FullCalendar's exclusive date-only upper bound to Litefold Calendar's inclusive bound.
 * @param {string} value
 * @returns {string}
 */
export function previousCivilDate(value) {
	if (typeof value !== "string" || !DATE_ONLY_PATTERN.test(value) || value.startsWith("0000-")) {
		throw new TypeError("validRange.end must be a valid date-only ISO string in years 0001-9999.");
	}

	const date = new Date(`${value}T00:00:00Z`);
	if (Number.isNaN(date.valueOf()) || date.toISOString().slice(0, 10) !== value) {
		throw new TypeError("validRange.end must be a valid date-only ISO string in years 0001-9999.");
	}

	date.setUTCDate(date.getUTCDate() - 1);
	const previous = date.toISOString().slice(0, 10);
	if (previous.startsWith("0000-")) {
		throw new RangeError("validRange.end has no preceding date supported by Litefold Calendar.");
	}
	return previous;
}

/**
 * @param {string} value
 * @returns {number}
 */
function civilDayNumber(value) {
	return Date.parse(`${value}T00:00:00Z`) / MILLISECONDS_PER_DAY;
}

/**
 * @param {number} milliseconds
 * @param {AbortSignal} signal
 * @returns {Promise<void>}
 */
function abortableDelay(milliseconds, signal) {
	return new Promise((resolve, reject) => {
		if (signal.aborted) {
			reject(signal.reason);
			return;
		}

		const handleAbort = () => {
			clearTimeout(timeoutId);
			reject(signal.reason);
		};
		const timeoutId = setTimeout(() => {
			signal.removeEventListener("abort", handleAbort);
			resolve();
		}, milliseconds);
		signal.addEventListener("abort", handleAbort, { once: true });
	});
}

let requestSequence = 0;
let abortedRequestCount = 0;

/**
 * @param {Readonly<CalendarRange>} range
 * @returns {Promise<readonly Readonly<MigratedEvent>[]>}
 */
async function loadMigratedEvents({ end, signal, start }) {
	const dayCount = civilDayNumber(end) - civilDayNumber(start);
	if (dayCount !== 42) {
		throw new RangeError("Expected Litefold Calendar's fixed 42-day provider range.");
	}

	requestSequence += 1;
	const requestId = requestSequence;
	rangeResult.textContent = `${start} to ${end} (exclusive): ${dayCount} days, request ${requestId}.`;
	host.dataset["testRangeDays"] = String(dayCount);
	host.dataset["testRequest"] = String(requestId);
	try {
		await abortableDelay(requestId % 2 === 0 ? 15 : 45, signal);
		signal.throwIfAborted();
		const events = adaptFullCalendarSnapshot(FULLCALENDAR_STYLE_RESPONSE);
		signal.throwIfAborted();
		host.dataset["testReturnedRequest"] = String(requestId);
		return events;
	} catch (error) {
		if (signal.aborted) {
			abortedRequestCount += 1;
			host.dataset["testAbortedRequests"] = String(abortedRequestCount);
		}
		throw error;
	}
}

const calendar = createCalendar(host, {
	events: loadMigratedEvents,
	initialDate: "2026-08-04",
	maxDate: previousCivilDate(FULLCALENDAR_VALID_RANGE.end),
	minDate: FULLCALENDAR_VALID_RANGE.start,
	onDaySelect: ({ dateString }) => {
		selectionResult.textContent = dateString;
	},
	onEventActivate: ({ element, event, nativeEvent, surface }) => {
		let destination = "";
		if (element instanceof HTMLAnchorElement) {
			//Keep this demo open while showing the native link target that would be followed.
			nativeEvent.preventDefault();
			destination = `; link target: ${element.pathname}${element.search}${element.hash}`;
		}
		const message = `${event.title} from ${surface}; metadata kind: ${event.metadata?.kind ?? "unknown"}${destination}.`;
		activationResult.textContent = message;
		statusResult.textContent = message;
	},
	onStateChange: (state) => {
		document.documentElement.dataset["testPhase"] = state.phase;
		if (state.phase === "ready") {
			document.documentElement.dataset["testReady"] = "true";
			statusResult.textContent = "The latest validated response is rendered.";
		}
	}
});

refetchButton.addEventListener("click", () => {
	statusResult.textContent = "Started two overlapping requests; waiting for the latest response.";
	calendar.refetchEvents();
	calendar.refetchEvents();
});

calendar.render();

window.addEventListener("pagehide", (event) => {
	if (!event.persisted) {
		calendar.destroy();
	}
});
