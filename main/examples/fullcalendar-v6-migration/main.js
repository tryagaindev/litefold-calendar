import { createCalendar } from "../../dist/index.js";

/** @typedef {"deadline" | "meeting" | "workshop"} MigrationKind */
/**
 * @typedef MigrationMetadata
 * @property {MigrationKind} kind
 * @property {string} [ownerLabel]
 */
/**
 * @typedef FullCalendarEventInput
 * @property {string | number} id
 * @property {string} title
 * @property {string} start
 * @property {string} [end]
 * @property {string} [url]
 * @property {string} [backgroundColor]
 * @property {string} [borderColor]
 * @property {Readonly<MigrationMetadata>} [extendedProps]
 */
/** @typedef {import("../../dist/index.js").CalendarEventInput<MigrationMetadata>} MigratedEvent */
/** @typedef {import("../../dist/index.js").CalendarRange} CalendarRange */

const MILLISECONDS_PER_DAY = 86_400_000;

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

const host = requireElement("[data-example-calendar]");
const rangeResult = requireElement("[data-example-range]");
const selectionResult = requireElement("[data-example-selection]");
const activationResult = requireElement("[data-example-activation]");
const statusResult = requireElement("[data-example-status]");
const refetchButton = requireElement("[data-example-refetch]");
if (!(refetchButton instanceof HTMLButtonElement)) {
	throw new Error("The migration refetch control must be a button.");
}

/** @type {readonly Readonly<FullCalendarEventInput>[]} */
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
		end: "2026-08-04T10:15",
		extendedProps: Object.freeze({ kind: "meeting", ownerLabel: "Design group" }),
		id: "design-review",
		start: "2026-08-04T09:30",
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
 * Converts the common FullCalendar event fields used by a basic `dayGridMonth` view.
 * Litefold performs the authoritative public-event validation when the provider resolves.
 * @param {readonly Readonly<FullCalendarEventInput>[]} events
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
		const accentColor = event.backgroundColor ?? event.borderColor;
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
		throw new RangeError("Expected Litefold's fixed 42-day provider range.");
	}

	requestSequence += 1;
	const requestId = requestSequence;
	rangeResult.textContent = `${start} to ${end} (exclusive): ${dayCount} days, request ${requestId}.`;
	host.dataset["exampleRangeDays"] = String(dayCount);
	host.dataset["exampleRequest"] = String(requestId);
	try {
		await abortableDelay(requestId % 2 === 0 ? 15 : 45, signal);
		signal.throwIfAborted();
		const events = adaptFullCalendarSnapshot(FULLCALENDAR_STYLE_RESPONSE);
		signal.throwIfAborted();
		host.dataset["exampleReturnedRequest"] = String(requestId);
		return events;
	} catch (error) {
		if (signal.aborted) {
			abortedRequestCount += 1;
			host.dataset["exampleAbortedRequests"] = String(abortedRequestCount);
		}
		throw error;
	}
}

const calendar = createCalendar(host, {
	events: loadMigratedEvents,
	initialDate: "2026-08-04",
	onDaySelect: ({ dateString }) => {
		selectionResult.textContent = dateString;
	},
	onEventActivate: ({ element, event, nativeEvent, surface }) => {
		if (element instanceof HTMLAnchorElement) {
			nativeEvent.preventDefault();
		}
		activationResult.textContent = `${event.title} from ${surface}; metadata kind: ${event.metadata?.kind ?? "unknown"}.`;
	},
	onStateChange: (state) => {
		document.documentElement.dataset["examplePhase"] = state.phase;
		if (state.phase === "ready") {
			document.documentElement.dataset["exampleReady"] = "true";
			statusResult.textContent = "The latest validated response is rendered.";
		}
	}
});

refetchButton.addEventListener("click", () => {
	calendar.refetchEvents();
	calendar.refetchEvents();
});

calendar.render();

window.addEventListener("pagehide", () => {
	calendar.destroy();
}, { once: true });
