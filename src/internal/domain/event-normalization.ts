import { LitefoldCalendarError } from "../../errors.js";
import type { CalendarDate, CalendarEvent } from "../../types.js";
import {
	assertCalendarDate,
	compareCalendarDates,
	compareDateTimes,
	formatCalendarDate,
	isMidnight,
	parseCalendarDateTime,
	toCalendarDate,
	type CalendarDateTime
} from "./civil-date.js";

const ACCENT_COLOR_PATTERN = /^#[0-9A-Fa-f]{6}$/;
const CONTROL_CHARACTER_PATTERN = /[\u0000-\u001F\u007F-\u009F]/u;
const URL_SCHEME_PATTERN = /^[A-Za-z][A-Za-z0-9+.-]*:/u;

/** The default and absolute maximum number of source events accepted in one snapshot. */
export const MAX_SOURCE_EVENT_LIMIT = 10_000;

/** Maximum UTF-16 code units accepted for a normalized event identifier. */
export const MAX_EVENT_ID_CODE_UNITS = 256;

/** Maximum UTF-16 code units accepted for a normalized event title. */
export const MAX_EVENT_TITLE_CODE_UNITS = 1_024;

/** Maximum UTF-16 code units accepted for an input or resolved event destination. */
export const MAX_EVENT_URL_CODE_UNITS = 2_048;

/** An event paired with parsed local components used for placement and ordering. */
export interface NormalizedCalendarEvent<TMetadata = unknown> {
	/** Parsed explicit end; `null` means the event uses its representation-specific default duration. */
	readonly endDateTime: CalendarDateTime | null;
	readonly event: CalendarEvent<TMetadata>;
	readonly startDateTime: CalendarDateTime;
}

interface CalendarEventNormalizationResult<TMetadata> {
	readonly event: Readonly<CalendarEvent<TMetadata>> | null;
	readonly invalidField: "url" | null;
}

/** Normalizes one event while preserving opaque metadata by reference; invalid inputs return `null`. */
export function normalizeCalendarEvent<TMetadata = unknown>(
	value: unknown,
	baseUrl?: string
): Readonly<CalendarEvent<TMetadata>> | null {
	return normalizeCalendarEventResult<TMetadata>(value, baseUrl).event;
}

function normalizeCalendarEventResult<TMetadata>(
	value: unknown,
	baseUrl: string | undefined
): CalendarEventNormalizationResult<TMetadata> {
	if (!isRecord(value)) {
		return { event: null, invalidField: null };
	}

	const accentColorValue = value["accentColor"];
	const endValue = value["end"];
	const idValue = value["id"];
	const metadataValue = value["metadata"];
	const startValue = value["start"];
	const titleValue = value["title"];
	const urlValue = value["url"];
	const id = normalizeIdentifier(idValue);
	const title = normalizeTitle(titleValue);
	const start = typeof startValue === "string" ? startValue : null;
	const end = endValue === undefined ? null : typeof endValue === "string" ? endValue : undefined;
	const startDateTime = start === null ? null : parseCalendarDateTime(start);
	const endDateTime = typeof end === "string" ? parseCalendarDateTime(end) : null;
	const url = urlValue === undefined ? null : normalizeEventUrl(urlValue, baseUrl);

	if (url === undefined) {
		return { event: null, invalidField: "url" };
	}
	if (id === null || title === null || start === null || startDateTime === null || end === undefined ||
		(typeof end === "string" && endDateTime === null) ||
		(endDateTime !== null && endDateTime.hasTime !== startDateTime.hasTime) ||
		(endDateTime !== null && compareDateTimes(endDateTime, startDateTime) <= 0)) {
		return { event: null, invalidField: null };
	}

	return { event: Object.freeze({
		accentColor: normalizeAccentColor(accentColorValue),
		end,
		id,
		isAllDay: !startDateTime.hasTime,
		metadata: metadataValue as TMetadata | undefined,
		start,
		title,
		url
	}), invalidField: null };
}

/** Validates and normalizes an entire source snapshot. */
export function normalizeCalendarEvents<TMetadata = unknown>(
	values: unknown,
	maximum = MAX_SOURCE_EVENT_LIMIT,
	baseUrl?: string
): readonly Readonly<NormalizedCalendarEvent<TMetadata>>[] {
	if (!Number.isInteger(maximum) || maximum < 1 || maximum > MAX_SOURCE_EVENT_LIMIT) {
		throw new LitefoldCalendarError({
			code: "invalid-configuration",
			message: `Source event limit must be an integer from 1 through ${MAX_SOURCE_EVENT_LIMIT.toString()}.`,
			phase: "configuration",
			recoverable: false,
			severity: "error",
			userMessage: "The calendar configuration is invalid.",
			userTitle: "Calendar unavailable"
		});
	}

	let isArray: boolean;
	try {
		isArray = Array.isArray(values);
	} catch (cause: unknown) {
		throw createEventDataError("The event source result could not be inspected.", undefined, cause);
	}
	if (!isArray) {
		throw createEventDataError("The event source result is not an array.");
	}
	const eventValues = values as readonly unknown[];

	let eventCount: number;
	try {
		eventCount = eventValues.length;
	} catch (cause: unknown) {
		throw createEventDataError("The event source result could not be inspected.", undefined, cause);
	}
	if (!Number.isSafeInteger(eventCount) || eventCount < 0) {
		throw createEventDataError("The event source result has an invalid length.");
	}

	if (eventCount > maximum) {
		throw new LitefoldCalendarError({
			code: "event-limit-exceeded",
			message: `The event source returned ${eventCount.toString()} events; the configured maximum is ${maximum.toString()}.`,
			phase: "validation",
			recoverable: true,
			severity: "error",
			userMessage: "Too many events were returned. Narrow the range and try again.",
			userTitle: "Events could not be displayed"
		});
	}

	const identifiers = new Set<string>();
	const normalizedEvents: Readonly<NormalizedCalendarEvent<TMetadata>>[] = [];
	for (let eventIndex = 0; eventIndex < eventCount; eventIndex += 1) {
		let normalization: CalendarEventNormalizationResult<TMetadata>;
		try {
			normalization = normalizeCalendarEventResult<TMetadata>(eventValues[eventIndex], baseUrl);
		} catch (cause: unknown) {
			throw createEventDataError(
				`Event at index ${eventIndex.toString()} could not be inspected.`,
				eventIndex,
				cause
			);
		}
		const event = normalization.event;
		if (event === null) {
			if (normalization.invalidField === "url") {
				throw createEventDataError(
					`Event at index ${eventIndex.toString()} has an invalid url. Expected a relative or HTTP(S) URL without credentials, surrounding whitespace, or control characters.`,
					eventIndex
				);
			}
			throw createEventDataError(`Event at index ${eventIndex.toString()} is invalid.`, eventIndex);
		}

		if (identifiers.has(event.id)) {
			throw createEventDataError(`Event at index ${eventIndex.toString()} has a duplicate identifier.`, eventIndex);
		}

		identifiers.add(event.id);
		const startDateTime = parseCalendarDateTime(event.start);
		const endDateTime = event.end === null ? null : parseCalendarDateTime(event.end);
		if (startDateTime === null || (event.end !== null && endDateTime === null)) {
			throw createEventDataError(`Event at index ${eventIndex.toString()} is invalid.`, eventIndex);
		}

		normalizedEvents.push(Object.freeze({ endDateTime, event, startDateTime }));
	}

	return Object.freeze(normalizedEvents);
}

/** Returns whether an event overlaps a civil day using an exclusive explicit end. */
export function calendarEventOccursOnDate(
	event: NormalizedCalendarEvent,
	date: CalendarDate
): boolean {
	assertCalendarDate(date);
	const start = toCalendarDate(event.startDateTime);
	if (event.endDateTime === null) {
		return compareCalendarDates(date, start) === 0;
	}

	if (compareCalendarDates(date, start) < 0) {
		return false;
	}

	const end = toCalendarDate(event.endDateTime);
	const endDateDifference = compareCalendarDates(date, end);
	return endDateDifference < 0 ||
		(endDateDifference === 0 && !event.event.isAllDay && !isMidnight(event.endDateTime));
}

/** Orders all-day events first, then local start, title, and opaque identifier. */
export function compareCalendarEvents(
	left: NormalizedCalendarEvent,
	right: NormalizedCalendarEvent
): number {
	if (left.event.isAllDay !== right.event.isAllDay) {
		return left.event.isAllDay ? -1 : 1;
	}

	const timeDifference = compareDateTimes(left.startDateTime, right.startDateTime);
	return timeDifference !== 0
		? timeDifference
		: compareStrings(left.event.title, right.event.title) || compareStrings(left.event.id, right.event.id);
}

/** Indexes sorted event occurrences for a fixed rendered civil-date range. */
export function indexCalendarEventsByDate<TMetadata>(
	events: readonly NormalizedCalendarEvent<TMetadata>[],
	days: readonly CalendarDate[]
): ReadonlyMap<string, readonly NormalizedCalendarEvent<TMetadata>[]> {
	const index = new Map<string, readonly NormalizedCalendarEvent<TMetadata>[]>();
	for (const date of days) {
		const occurrences = events
			.filter((event) => calendarEventOccursOnDate(event, date))
			.sort(compareCalendarEvents);
		index.set(formatCalendarDate(date), Object.freeze(occurrences));
	}
	return index;
}

function normalizeIdentifier(value: unknown): string | null {
	return typeof value === "string" && value.trim().length > 0 && value.length <= MAX_EVENT_ID_CODE_UNITS
		? value
		: null;
}

function normalizeTitle(value: unknown): string | null {
	if (typeof value !== "string") {
		return null;
	}
	const title = value.trim();
	return title.length > 0 && title.length <= MAX_EVENT_TITLE_CODE_UNITS ? title : null;
}

function normalizeAccentColor(value: unknown): string | null {
	return typeof value === "string" && ACCENT_COLOR_PATTERN.test(value) ? value.toUpperCase() : null;
}

function normalizeEventUrl(value: unknown, baseUrl: string | undefined): string | null | undefined {
	if (typeof value !== "string" || value.length === 0 || value.length > MAX_EVENT_URL_CODE_UNITS ||
		value.trim() !== value || CONTROL_CHARACTER_PATTERN.test(value)) {
		return undefined;
	}

	try {
		const isAbsolute = URL_SCHEME_PATTERN.test(value);
		if (!isAbsolute && baseUrl === undefined) {
			return undefined;
		}
		const resolved = isAbsolute
			? new URL(value)
			: new URL(value, baseUrl);
		if ((isAbsolute && resolved.protocol !== "http:" && resolved.protocol !== "https:") ||
			resolved.username.length > 0 || resolved.password.length > 0 ||
			resolved.href.length > MAX_EVENT_URL_CODE_UNITS) {
			return undefined;
		}
		return isAbsolute ? resolved.href : value;
	} catch {
		return undefined;
	}
}

function isRecord(value: unknown): value is Readonly<Record<string, unknown>> {
	return typeof value === "object" && value !== null && !Array.isArray(value);
}

function compareStrings(left: string, right: string): number {
	return left < right ? -1 : left > right ? 1 : 0;
}

function createEventDataError(message: string, eventIndex?: number, cause?: unknown): LitefoldCalendarError {
	const options = {
		...(cause === undefined ? {} : { cause }),
		code: "event-data-invalid" as const,
		message,
		phase: "validation" as const,
		recoverable: true,
		severity: "error" as const,
		userMessage: "The event data is invalid. Try again.",
		userTitle: "Events could not be displayed"
	};
	return eventIndex === undefined
		? new LitefoldCalendarError(options)
		: new LitefoldCalendarError({ ...options, eventIndex });
}
