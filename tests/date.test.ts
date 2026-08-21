import assert from "node:assert/strict";
import test from "node:test";

import {
	addCalendarDays,
	addCalendarMonths,
	formatCalendarDate,
	getCalendarDateForTimeZone,
	parseCalendarDateTime
} from "../src/internal/domain/civil-date.js";
import {
	calendarEventOccursOnDate,
	compareCalendarEvents,
	MAX_EVENT_ID_CODE_UNITS,
	MAX_EVENT_TITLE_CODE_UNITS,
	MAX_EVENT_URL_CODE_UNITS,
	normalizeCalendarEvent,
	normalizeCalendarEvents
} from "../src/internal/domain/event-normalization.js";
import {
	getCalendarMonthRange,
	resolveCalendarFirstDay
} from "../src/internal/domain/grid.js";
import {
	clampCalendarMonthDate,
	doesCalendarMonthIntersectBounds,
	isCalendarDateWithinBounds
} from "../src/internal/domain/ranges.js";
import { LitefoldCalendarError } from "../src/errors.js";

function restoreProperty(
	target: object,
	property: PropertyKey,
	descriptor: PropertyDescriptor | undefined
): void {
	if (descriptor === undefined) {
		Reflect.deleteProperty(target, property);
		return;
	}
	Object.defineProperty(target, property, descriptor);
}

void test("strict civil parsing accepts the documented Gregorian profile", () => {
	assert.deepEqual(parseCalendarDateTime("2024-02-29T23:59:58.1234567"), {
		day: 29,
		fractionalSecond: 1_234_567,
		hasTime: true,
		hour: 23,
		millisecond: 123,
		minute: 59,
		month: 2,
		second: 58,
		year: 2024
	});
	assert.deepEqual(parseCalendarDateTime("0001-01-01"), {
		day: 1,
		fractionalSecond: 0,
		hasTime: false,
		hour: 0,
		millisecond: 0,
		minute: 0,
		month: 1,
		second: 0,
		year: 1
	});
	assert.ok(Object.isFrozen(parseCalendarDateTime("9999-12-31")));

	for (const invalid of [
		"2023-02-29",
		"2024-13-01",
		"2024-01-32",
		"2024-01-01T24:00",
		"2024-01-01T23:60",
		"2024-01-01T23:59:60",
		"2024-01-01T09",
		"2024-01-01T09:00.",
		"2024-01-01T09:00:00.12345678",
		"2024-01-01T09:00Z",
		"2024-01-01T09:00+01:00",
		"2024-01-01[Europe/London]",
		" 2024-01-01",
		"2024-01-01 ",
		"0000-01-01"
	]) {
		assert.equal(parseCalendarDateTime(invalid), null, invalid);
	}
});

void test("civil arithmetic handles leap days, clamping, fixed grids, and supported year bounds", () => {
	assert.deepEqual(addCalendarDays({ day: 28, month: 2, year: 2024 }, 1), {
		day: 29,
		month: 2,
		year: 2024
	});
	assert.deepEqual(addCalendarDays({ day: 31, month: 12, year: 2026 }, 1), {
		day: 1,
		month: 1,
		year: 2027
	});
	assert.deepEqual(addCalendarMonths({ day: 31, month: 1, year: 2024 }, 1), {
		day: 29,
		month: 2,
		year: 2024
	});
	assert.throws(() => addCalendarDays({ day: 31, month: 12, year: 9999 }, 1), RangeError);
	assert.throws(() => addCalendarMonths({ day: 1, month: 1, year: 1 }, -1), RangeError);

	const sundayRange = getCalendarMonthRange({ day: 20, month: 2, year: 2024 }, 0);
	assert.equal(sundayRange.days.length, 42);
	assert.equal(formatCalendarDate(sundayRange.start), "2024-01-28");
	assert.equal(formatCalendarDate(sundayRange.days.at(-1) ?? sundayRange.start), "2024-03-09");
	assert.equal(formatCalendarDate(sundayRange.end), "2024-03-10");
	assert.ok(Object.isFrozen(sundayRange));
	assert.ok(Object.isFrozen(sundayRange.days));

	const mondayRange = getCalendarMonthRange({ day: 20, month: 2, year: 2024 }, 1);
	assert.equal(formatCalendarDate(mondayRange.start), "2024-01-29");
	assert.equal(formatCalendarDate(mondayRange.end), "2024-03-11");
});

void test("inclusive date bounds intersect partial months and clamp preferred days", () => {
	const minDate = { day: 15, month: 7, year: 2026 };
	const maxDate = { day: 20, month: 9, year: 2026 };

	assert.equal(isCalendarDateWithinBounds(minDate, minDate, maxDate), true);
	assert.equal(isCalendarDateWithinBounds(maxDate, minDate, maxDate), true);
	assert.equal(isCalendarDateWithinBounds({ day: 14, month: 7, year: 2026 }, minDate, maxDate), false);
	assert.equal(isCalendarDateWithinBounds({ day: 21, month: 9, year: 2026 }, minDate, maxDate), false);
	assert.equal(isCalendarDateWithinBounds({ day: 1, month: 1, year: 1 }, null, maxDate), true);
	assert.equal(isCalendarDateWithinBounds({ day: 31, month: 12, year: 9999 }, minDate), true);

	assert.equal(doesCalendarMonthIntersectBounds({ day: 1, month: 6, year: 2026 }, minDate, maxDate), false);
	assert.equal(doesCalendarMonthIntersectBounds({ day: 1, month: 7, year: 2026 }, minDate, maxDate), true);
	assert.equal(doesCalendarMonthIntersectBounds({ day: 30, month: 9, year: 2026 }, minDate, maxDate), true);
	assert.equal(doesCalendarMonthIntersectBounds({ day: 1, month: 10, year: 2026 }, minDate, maxDate), false);

	assert.deepEqual(clampCalendarMonthDate({ day: 1, month: 7, year: 2026 }, 1, minDate, maxDate), minDate);
	assert.deepEqual(clampCalendarMonthDate({ day: 1, month: 8, year: 2026 }, 31, minDate, maxDate), {
		day: 31,
		month: 8,
		year: 2026
	});
	assert.deepEqual(clampCalendarMonthDate({ day: 1, month: 9, year: 2026 }, 30, minDate, maxDate), maxDate);
	assert.deepEqual(clampCalendarMonthDate({ day: 1, month: 2, year: 2027 }, 31), {
		day: 28,
		month: 2,
		year: 2027
	});
	assert.equal(clampCalendarMonthDate({ day: 1, month: 6, year: 2026 }, 15, minDate, maxDate), null);
	assert.ok(Object.isFrozen(clampCalendarMonthDate({ day: 1, month: 8, year: 2026 }, 15, minDate, maxDate)));

	assert.throws(
		() => isCalendarDateWithinBounds(minDate, maxDate, minDate),
		RangeError
	);
	assert.throws(
		() => clampCalendarMonthDate({ day: 1, month: 8, year: 2026 }, 0, minDate, maxDate),
		RangeError
	);
});

void test("time-zone projection applies only to supplied instants", () => {
	const instant = new Date("2026-07-14T06:30:00Z");
	assert.deepEqual(getCalendarDateForTimeZone(instant, "America/Los_Angeles"), {
		day: 13,
		month: 7,
		year: 2026
	});
	assert.deepEqual(getCalendarDateForTimeZone(instant, "Asia/Tokyo"), {
		day: 14,
		month: 7,
		year: 2026
	});
	const absoluteStart = new Date("0001-01-01T00:00:00.000Z");
	assert.deepEqual(getCalendarDateForTimeZone(absoluteStart, "UTC"), {
		day: 1,
		month: 1,
		year: 1
	});
	assert.equal(getCalendarDateForTimeZone(absoluteStart, "America/Los_Angeles"), null);
	assert.equal(getCalendarDateForTimeZone(instant, "Not/A_Zone"), null);
	assert.equal(getCalendarDateForTimeZone(instant, " America/Los_Angeles"), null);
	assert.equal(resolveCalendarFirstDay("locale", "en-US"), 0);
	assert.equal(resolveCalendarFirstDay("locale", "en-GB"), 1);
});

void test("locale week starts support both Intl.Locale week-info API shapes", () => {
	const localePrototype = (Intl.Locale as unknown as { readonly prototype: object }).prototype;
	const originalMethod = Object.getOwnPropertyDescriptor(localePrototype, "getWeekInfo");
	const originalAccessor = Object.getOwnPropertyDescriptor(localePrototype, "weekInfo");

	try {
		Object.defineProperty(localePrototype, "getWeekInfo", {
			configurable: true,
			value: () => ({ firstDay: 7 }),
			writable: true
		});
		Object.defineProperty(localePrototype, "weekInfo", {
			configurable: true,
			get: () => ({ firstDay: 1 })
		});
		assert.equal(resolveCalendarFirstDay("locale", "en-US"), 0);

		Object.defineProperty(localePrototype, "getWeekInfo", {
			configurable: true,
			value: () => ({ firstDay: 8 }),
			writable: true
		});
		Object.defineProperty(localePrototype, "weekInfo", {
			configurable: true,
			get: () => ({ firstDay: 2 })
		});
		assert.equal(resolveCalendarFirstDay("locale", "en-US"), 2);

		Object.defineProperty(localePrototype, "getWeekInfo", {
			configurable: true,
			value: () => { throw new Error("Unavailable"); },
			writable: true
		});
		Object.defineProperty(localePrototype, "weekInfo", {
			configurable: true,
			get: () => ({ firstDay: 6 })
		});
		assert.equal(resolveCalendarFirstDay("locale", "en-US"), 6);

		Object.defineProperty(localePrototype, "getWeekInfo", {
			configurable: true,
			value: undefined,
			writable: true
		});
		Object.defineProperty(localePrototype, "weekInfo", {
			configurable: true,
			get: () => ({ firstDay: 0 })
		});
		assert.equal(resolveCalendarFirstDay("locale", "en-US"), 0);
	} finally {
		restoreProperty(localePrototype, "getWeekInfo", originalMethod);
		restoreProperty(localePrototype, "weekInfo", originalAccessor);
	}
});

void test("single-event normalization derives representation and contains the color contract", () => {
	const metadata = { reference: 42 };
	const allDay = normalizeCalendarEvent<typeof metadata>({
		accentColor: "#a1b2c3",
		id: "opaque:id",
		metadata,
		start: "2026-07-13",
		title: "  Two days  ",
		end: "2026-07-15"
	});
	assert.ok(allDay);
	assert.deepEqual(allDay, {
		accentColor: "#A1B2C3",
		end: "2026-07-15",
		id: "opaque:id",
		isAllDay: true,
		metadata,
		start: "2026-07-13",
		title: "Two days",
		url: null
	});
	assert.equal(allDay.metadata, metadata);
	assert.ok(Object.isFrozen(allDay));

	for (const invalidColor of [
		"#123",
		"#AABBCCDD",
		" #AABBCC",
		"transparent",
		"url(javascript:alert(1))"
	]) {
		assert.equal(normalizeCalendarEvent({
			accentColor: invalidColor,
			id: invalidColor,
			start: "2026-07-13T09:00",
			title: "Color fallback"
		})?.accentColor, null);
	}

	assert.equal(normalizeCalendarEvent({
		end: "2026-07-14T00:00",
		id: "mixed-kind",
		start: "2026-07-13",
		title: "Mixed"
	}), null);
	assert.equal(normalizeCalendarEvent({
		end: "2026-07-13T09:00",
		id: "equal-end",
		start: "2026-07-13T09:00",
		title: "Equal"
	}), null);
});

void test("snapshot normalization is atomic for invalid data, duplicates, and limits", () => {
	const valid = {
		id: "valid",
		start: "2026-07-13",
		title: "Valid"
	};
	assert.throws(
		() => normalizeCalendarEvents([valid, { ...valid, id: "invalid", start: "2023-02-29" }]),
		(error: unknown) => isValidationError(error, "event-data-invalid", 1)
	);
	assert.throws(
		() => normalizeCalendarEvents([valid, { ...valid }]),
		(error: unknown) => isValidationError(error, "event-data-invalid", 1)
	);
	assert.throws(
		() => normalizeCalendarEvents([valid, { ...valid, id: "second" }], 1),
		(error: unknown) => isValidationError(error, "event-limit-exceeded")
	);
	assert.throws(
		() => normalizeCalendarEvents({ not: "an array" }),
		(error: unknown) => isValidationError(error, "event-data-invalid")
	);
});

void test("event text caps, explicit null ends, and hostile getters reject atomically", () => {
	const identifier = "i".repeat(MAX_EVENT_ID_CODE_UNITS);
	const title = "t".repeat(MAX_EVENT_TITLE_CODE_UNITS);
	assert.notEqual(normalizeCalendarEvent({ id: identifier, start: "2026-07-14", title }), null);
	assert.equal(normalizeCalendarEvent({
		id: `${identifier}x`,
		start: "2026-07-14",
		title
	}), null);
	assert.equal(normalizeCalendarEvent({
		id: identifier,
		start: "2026-07-14",
		title: `${title}x`
	}), null);
	assert.equal(normalizeCalendarEvent({
		end: null,
		id: "null-end",
		start: "2026-07-14",
		title: "Null end"
	}), null);

	const getterFailure = new Error("getter failure");
	const hostileEvent = Object.create(null) as Record<string, unknown>;
	Object.defineProperty(hostileEvent, "id", {
		get: () => { throw getterFailure; }
	});
	assert.throws(
		() => normalizeCalendarEvents([
			{ id: "valid", start: "2026-07-14", title: "Valid" },
			hostileEvent
		]),
		(error: unknown) => error instanceof LitefoldCalendarError &&
			error.code === "event-data-invalid" && error.eventIndex === 1 && error.cause === getterFailure
	);
});

void test("event destinations accept safe relative and HTTP(S) URLs and reject unsafe values atomically", () => {
	const baseUrl = "https://calendar.example.test/app/month";
	const relative = normalizeCalendarEvent({
		id: "relative",
		start: "2026-07-14",
		title: "Relative",
		url: "../events/relative?from=calendar#details"
	}, baseUrl);
	assert.equal(relative?.url, "../events/relative?from=calendar#details");
	const absolute = normalizeCalendarEvent({
		id: "absolute",
		start: "2026-07-14",
		title: "Absolute",
		url: "HTTP://Example.COM:80/a/../event"
	}, baseUrl);
	assert.equal(absolute?.url, "http://example.com/event");

	for (const url of [
		"",
		" https://example.test/event",
		"https://example.test/event ",
		"https://example.test/\nevent",
		"https://example.test/\u0085event",
		"https://user:secret@example.test/event",
		"//user:secret@example.test/event",
		"javascript:alert(1)",
		"data:text/html,unsafe",
		"file:///calendar/event",
		"http://[",
		"x".repeat(MAX_EVENT_URL_CODE_UNITS + 1)
	]) {
		assert.equal(normalizeCalendarEvent({
			id: "unsafe",
			start: "2026-07-14",
			title: "Unsafe",
			url
		}, baseUrl), null, url);
	}

	assert.throws(
		() => normalizeCalendarEvents([
			{ id: "safe", start: "2026-07-14", title: "Safe", url: "/events/safe" },
			{ id: "unsafe", start: "2026-07-15", title: "Private title", url: "mailto:test@example.test" }
		], 10, baseUrl),
		(error: unknown) => error instanceof LitefoldCalendarError &&
			error.code === "event-data-invalid" && error.eventIndex === 1 &&
			error.message.includes("invalid url") && !error.message.includes("Private title")
	);
});

void test("normalization snapshots each public event field once, including precise URL diagnostics", () => {
	const values: Record<string, unknown> = {
		accentColor: "#112233",
		end: "2026-07-15",
		id: "one-read",
		metadata: { opaque: true },
		start: "2026-07-14",
		title: "One read",
		url: "/events/one-read"
	};
	const reads = new Map<string, number>();
	const event = Object.create(null) as Record<string, unknown>;
	for (const [field, value] of Object.entries(values)) {
		Object.defineProperty(event, field, {
			get: () => {
				reads.set(field, (reads.get(field) ?? 0) + 1);
				return value;
			}
		});
	}
	const [normalized] = normalizeCalendarEvents([event], 10, "https://calendar.example.test/");
	assert.equal(normalized?.event.url, "/events/one-read");
	for (const field of Object.keys(values)) {
		assert.equal(reads.get(field), 1, field);
	}

	let urlReads = 0;
	const stateful = {
		id: "stateful",
		start: "2026-07-14",
		title: "Stateful",
		get url(): string {
			urlReads += 1;
			return urlReads === 1 ? "/events/stateful" : "javascript:alert(1)";
		}
	};
	assert.equal(
		normalizeCalendarEvents([stateful], 10, "https://calendar.example.test/")[0]?.event.url,
		"/events/stateful"
	);
	assert.equal(urlReads, 1);
});

void test("event placement uses exclusive ends and point-event defaults", () => {
	const normalized = normalizeCalendarEvents([
		{ end: "2026-07-15", id: "all-day", start: "2026-07-13", title: "Two days" },
		{ end: "2026-07-14T00:00", id: "midnight", start: "2026-07-13T23:00", title: "Midnight" },
		{ end: "2026-07-14T00:00:00.0000001", id: "after-midnight", start: "2026-07-13T23:00", title: "After" },
		{ id: "point", start: "2026-07-13T09:00", title: "Point" }
	]);
	const byId = new Map(normalized.map((entry) => [entry.event.id, entry]));
	const day13 = { day: 13, month: 7, year: 2026 };
	const day14 = { day: 14, month: 7, year: 2026 };
	const day15 = { day: 15, month: 7, year: 2026 };

	assertOccurs(byId, "all-day", day13, true);
	assertOccurs(byId, "all-day", day14, true);
	assertOccurs(byId, "all-day", day15, false);
	assertOccurs(byId, "midnight", day13, true);
	assertOccurs(byId, "midnight", day14, false);
	assertOccurs(byId, "after-midnight", day14, true);
	assertOccurs(byId, "point", day13, true);
	assertOccurs(byId, "point", day14, false);

	const sorted = [...normalized].sort(compareCalendarEvents);
	assert.equal(sorted[0]?.event.id, "all-day");
});

function isValidationError(
	error: unknown,
	code: "event-data-invalid" | "event-limit-exceeded",
	eventIndex?: number
): boolean {
	return error instanceof LitefoldCalendarError && error.code === code &&
		(eventIndex === undefined || error.eventIndex === eventIndex);
}

function assertOccurs(
	events: ReadonlyMap<string, ReturnType<typeof normalizeCalendarEvents>[number]>,
	id: string,
	date: Readonly<{ readonly day: number; readonly month: number; readonly year: number }>,
	expected: boolean
): void {
	const event = events.get(id);
	assert.ok(event, `Expected ${id} to be normalized.`);
	assert.equal(calendarEventOccursOnDate(event, date), expected, `${id} on ${formatCalendarDate(date)}`);
}
