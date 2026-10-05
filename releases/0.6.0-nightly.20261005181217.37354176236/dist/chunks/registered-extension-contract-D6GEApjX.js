//#region src/internal/domain/civil-date.ts
var MILLISECONDS_PER_DAY = 864e5;
var MINIMUM_YEAR = 1;
var MAXIMUM_YEAR = 9999;
var CIVIL_DATE_TIME_PATTERN = /^(\d{4})-(\d{2})-(\d{2})(?:T(\d{2}):(\d{2})(?::(\d{2})(?:\.(\d{1,7}))?)?)?$/;
/** Parses the documented Gregorian date or local date-time profile without invoking `Date.parse()`. */
function parseCalendarDateTime(value) {
	const match = CIVIL_DATE_TIME_PATTERN.exec(value);
	if (match === null) return null;
	const yearText = match[1];
	const monthText = match[2];
	const dayText = match[3];
	if (yearText === void 0 || monthText === void 0 || dayText === void 0) return null;
	const hourText = match[4];
	const minuteText = match[5];
	const secondText = match[6];
	const fractionText = match[7] ?? "";
	const year = Number.parseInt(yearText, 10);
	const month = Number.parseInt(monthText, 10);
	const day = Number.parseInt(dayText, 10);
	const hour = Number.parseInt(hourText ?? "0", 10);
	const minute = Number.parseInt(minuteText ?? "0", 10);
	const second = Number.parseInt(secondText ?? "0", 10);
	const fractionalSecond = fractionText.length === 0 ? 0 : Number.parseInt(fractionText.padEnd(7, "0"), 10);
	const date = {
		day,
		month,
		year
	};
	if (!isValidCalendarDate(date) || hour > 23 || minute > 59 || second > 59) return null;
	return Object.freeze({
		...date,
		fractionalSecond,
		hasTime: hourText !== void 0,
		hour,
		millisecond: Math.trunc(fractionalSecond / 1e4),
		minute,
		second
	});
}
/** Projects an instant into a Gregorian civil date in an IANA time zone. */
function getCalendarDateForTimeZone(instant, timeZone) {
	const timeZoneCandidate = timeZone;
	const timestamp = getDateTimestamp(instant);
	if (timestamp === null || typeof timeZoneCandidate !== "string" || timeZoneCandidate.length === 0 || timeZoneCandidate.trim() !== timeZoneCandidate) return null;
	try {
		const parts = new Intl.DateTimeFormat("en-US-u-ca-gregory-nu-latn", {
			calendar: "gregory",
			day: "2-digit",
			era: "short",
			month: "2-digit",
			timeZone,
			year: "numeric"
		}).formatToParts(timestamp);
		const values = new Map(parts.map((part) => [part.type, part.value]));
		if (values.get("era") !== "AD") return null;
		const date = {
			day: Number.parseInt(values.get("day") ?? "", 10),
			month: Number.parseInt(values.get("month") ?? "", 10),
			year: Number.parseInt(values.get("year") ?? "", 10)
		};
		return isValidCalendarDate(date) ? Object.freeze(date) : null;
	} catch (error) {
		if (error instanceof RangeError) return null;
		throw error;
	}
}
/** Converts a supported structured date, strict civil string, or `Date` instant into a civil date. */
function parseCalendarDate(value) {
	if (typeof value === "string") {
		const parsed = parseCalendarDateTime(value);
		return parsed === null ? null : toCalendarDate(parsed);
	}
	if (getDateTimestamp(value) !== null) {
		let date;
		try {
			date = {
				day: Date.prototype.getDate.call(value),
				month: Date.prototype.getMonth.call(value) + 1,
				year: Date.prototype.getFullYear.call(value)
			};
		} catch {
			return null;
		}
		return isValidCalendarDate(date) ? Object.freeze(date) : null;
	}
	try {
		const date = {
			day: Reflect.get(value, "day"),
			month: Reflect.get(value, "month"),
			year: Reflect.get(value, "year")
		};
		return hasNumericCalendarFields(date) && isValidCalendarDate(date) ? Object.freeze(date) : null;
	} catch {
		return null;
	}
}
/** Adds whole civil days without allowing a result outside years 0001-9999. */
function addCalendarDays(date, days) {
	assertCalendarDate(date);
	if (!Number.isFinite(days)) throw new RangeError("Calendar day offset must be finite.");
	return fromUtcDayNumber(toUtcDayNumber(date) + Math.trunc(days));
}
/** Adds whole calendar months, clamps the day, and retains the supported year range. */
function addCalendarMonths(date, months) {
	assertCalendarDate(date);
	if (!Number.isFinite(months)) throw new RangeError("Calendar month offset must be finite.");
	const monthIndex = (date.year - 1) * 12 + date.month - 1 + Math.trunc(months);
	const year = Math.floor(monthIndex / 12) + 1;
	if (year < MINIMUM_YEAR || year > MAXIMUM_YEAR) throw new RangeError("Calendar month result is outside years 0001-9999.");
	const month = positiveModulo(monthIndex, 12) + 1;
	return Object.freeze({
		day: Math.min(date.day, getDaysInMonth(year, month)),
		month,
		year
	});
}
/** Formats a validated civil date as `YYYY-MM-DD`. */
function formatCalendarDate(date) {
	assertCalendarDate(date);
	return `${date.year.toString().padStart(4, "0")}-${date.month.toString().padStart(2, "0")}-${date.day.toString().padStart(2, "0")}`;
}
/** Compares two validated Gregorian civil dates. */
function compareCalendarDates(left, right) {
	assertCalendarDate(left);
	assertCalendarDate(right);
	return toUtcDayNumber(left) - toUtcDayNumber(right);
}
/** Compares two civil date-times while retaining seven-digit fractional precision. */
function compareDateTimes(left, right) {
	const millisecondDifference = toUtcDateTime(left).valueOf() - toUtcDateTime(right).valueOf();
	return millisecondDifference !== 0 ? millisecondDifference : left.fractionalSecond - right.fractionalSecond;
}
/** Returns an immutable date-only copy of a civil date-time value. */
function toCalendarDate(value) {
	assertCalendarDate(value);
	return Object.freeze({
		day: value.day,
		month: value.month,
		year: value.year
	});
}
/** Creates a UTC surrogate used only for locale formatting and civil arithmetic. */
function toUtcDate(date) {
	assertCalendarDate(date);
	const result = /* @__PURE__ */ new Date(0);
	result.setUTCHours(0, 0, 0, 0);
	result.setUTCFullYear(date.year, date.month - 1, date.day);
	return result;
}
/** Creates a UTC surrogate for formatting a civil date-time. */
function toUtcDateTime(date) {
	assertCalendarDateTime(date);
	const result = toUtcDate(date);
	result.setUTCHours(date.hour, date.minute, date.second, date.millisecond);
	return result;
}
/** Identifies an exact civil midnight, including fractional precision. */
function isMidnight(value) {
	assertCalendarDateTime(value);
	return value.hour === 0 && value.minute === 0 && value.second === 0 && value.fractionalSecond === 0;
}
/** Returns whether a value is a supported Gregorian calendar date. */
function isValidCalendarDate(date) {
	return Number.isInteger(date.year) && date.year >= MINIMUM_YEAR && date.year <= MAXIMUM_YEAR && Number.isInteger(date.month) && date.month >= 1 && date.month <= 12 && Number.isInteger(date.day) && date.day >= 1 && date.day <= getDaysInMonth(date.year, date.month);
}
/** Returns whether a value is a supported parsed local date-time. */
function isValidCalendarDateTime(value) {
	return isValidCalendarDate(value) && typeof value.hasTime === "boolean" && isIntegerInRange(value.hour, 0, 23) && isIntegerInRange(value.minute, 0, 59) && isIntegerInRange(value.second, 0, 59) && isValidFractionalSecond(value) && (value.hasTime || isZeroTime(value));
}
function getDaysInMonth(year, month) {
	if (month === 2) return year % 4 === 0 && (year % 100 !== 0 || year % 400 === 0) ? 29 : 28;
	return month === 4 || month === 6 || month === 9 || month === 11 ? 30 : 31;
}
function assertCalendarDate(date) {
	if (!isValidCalendarDate(date)) throw new RangeError("Calendar date must be a valid Gregorian date in years 0001 through 9999.");
}
function positiveModulo(value, divisor) {
	return (value % divisor + divisor) % divisor;
}
function isIntegerInRange(value, minimum, maximum) {
	return Number.isInteger(value) && value >= minimum && value <= maximum;
}
function isValidFractionalSecond(value) {
	return isIntegerInRange(value.fractionalSecond, 0, 9999999) && Number.isInteger(value.millisecond) && value.millisecond === Math.trunc(value.fractionalSecond / 1e4);
}
function isZeroTime(value) {
	return value.hour === 0 && value.minute === 0 && value.second === 0 && value.fractionalSecond === 0;
}
function assertCalendarDateTime(value) {
	if (!isValidCalendarDateTime(value)) throw new RangeError("Calendar date-time must use the supported Gregorian local date-time profile.");
}
function toUtcDayNumber(date) {
	return Math.floor(toUtcDate(date).valueOf() / MILLISECONDS_PER_DAY);
}
function fromUtcDayNumber(dayNumber) {
	const date = /* @__PURE__ */ new Date(dayNumber * MILLISECONDS_PER_DAY);
	const result = {
		day: date.getUTCDate(),
		month: date.getUTCMonth() + 1,
		year: date.getUTCFullYear()
	};
	if (!isValidCalendarDate(result)) throw new RangeError("Calendar day result is outside years 0001-9999.");
	return Object.freeze(result);
}
function hasNumericCalendarFields(value) {
	return typeof value.day === "number" && typeof value.month === "number" && typeof value.year === "number";
}
function getDateTimestamp(value) {
	if (typeof value !== "object" || value === null) return null;
	try {
		const timestamp = Date.prototype.getTime.call(value);
		return Number.isNaN(timestamp) ? null : timestamp;
	} catch {
		return null;
	}
}
//#endregion
//#region src/errors.ts
/**
* A typed calendar failure containing separate diagnostic and user-safe text.
*
* The original failure remains available through `cause` for trusted application diagnostics. Causes, stack traces,
* extension identifiers, render-hook identifiers, and hook names must never be copied into rendered output or calendar state.
*/
var LitefoldCalendarError = class extends Error {
	/** Stable machine-readable failure category. */
	code;
	/** Zero-based source-event index associated with validation, when known. */
	eventIndex;
	/** Trusted registered-extension identifier associated with the failure, when applicable. */
	extensionId;
	/** Trusted render-hook identifier associated with the failure, when applicable. */
	renderHookId;
	/** Trusted lifecycle or action hook name associated with the failure, when applicable. */
	hook;
	/** Operation in which the failure originated. */
	phase;
	/** Inclusive/exclusive request range associated with the failure, when applicable. */
	range;
	/** Whether this instance may remain usable or recover through a later valid operation; this does not promise Retry UI. */
	recoverable;
	/** User-facing importance of the failure. */
	severity;
	/** Whether the failure belongs to work superseded by a newer request. */
	stale;
	/** Rendering surface associated with the failure, when applicable. */
	surface;
	/** Localized text safe to present to an end user. */
	userMessage;
	/** Localized heading safe to present to an end user. */
	userTitle;
	/** Creates an immutable typed calendar error. */
	constructor(options) {
		super(options.message, { cause: options.cause });
		this.name = "LitefoldCalendarError";
		this.code = options.code;
		this.eventIndex = options.eventIndex;
		this.extensionId = options.extensionId;
		this.renderHookId = options.renderHookId;
		this.hook = options.hook;
		this.phase = options.phase;
		this.range = options.range === void 0 ? void 0 : Object.freeze({
			end: options.range.end,
			start: options.range.start
		});
		this.recoverable = options.recoverable;
		this.severity = options.severity;
		this.stale = options.stale ?? false;
		this.surface = options.surface;
		this.userMessage = options.userMessage;
		this.userTitle = options.userTitle;
		Object.freeze(this);
	}
};
/** Returns an immutable, presentation-safe issue derived from a diagnostic error. */
function toCalendarIssue(error) {
	return Object.freeze({
		code: error.code,
		message: error.userMessage,
		recoverable: error.recoverable,
		severity: error.severity,
		title: error.userTitle
	});
}
/** Identifies abort failures without depending on a realm-specific `DOMException` constructor. */
function isAbortError(error) {
	if (typeof error !== "object" || error === null) return false;
	try {
		return Reflect.get(error, "name") === "AbortError";
	} catch {
		return false;
	}
}
/** Converts an arbitrary thrown value into an `Error` while preserving the original value as its cause. */
function toError(error, message = "An unknown calendar error occurred.") {
	try {
		if (error instanceof Error) return error;
	} catch {}
	return new Error(message, { cause: error });
}
/**
* Reports an otherwise-unhandled failure through the platform error-reporting channel.
*
* `reportError()` is preferred when present. The microtask throw retains visibility on platforms that do not
* implement it without introducing a runtime dependency or touching the DOM during module evaluation.
*/
function reportCalendarError(error) {
	const reportedError = toError(error);
	let reportErrorCandidate;
	try {
		reportErrorCandidate = Reflect.get(globalThis, "reportError");
	} catch (reporterLookupFailure) {
		queueReportedError(new AggregateError([reportedError, reporterLookupFailure], "The platform error reporter could not be resolved."));
		return;
	}
	if (typeof reportErrorCandidate === "function") {
		try {
			Reflect.apply(reportErrorCandidate, globalThis, [reportedError]);
		} catch (reporterFailure) {
			queueReportedError(new AggregateError([reportedError, reporterFailure], "The platform error reporter failed while reporting a calendar error."));
		}
		return;
	}
	queueReportedError(reportedError);
}
function queueReportedError(error) {
	try {
		queueMicrotask(() => {
			throw error;
		});
	} catch {
		try {
			Promise.resolve().then(() => {
				throw error;
			});
		} catch {}
	}
}
/** Private discovery key shared only by package-owned core and extension entry points. */
var REGISTERED_EXTENSION_INTERFACE = Symbol("litefold-calendar.extension");
var EXTENSION_ID_PATTERN = /^[a-z0-9]+(?:-[a-z0-9]+)*$/u;
var CAPABILITIES = /* @__PURE__ */ new Set([
	"document",
	"navigation",
	"presentationEvents",
	"state"
]);
var ISSUED_EXTENSIONS = /* @__PURE__ */ new WeakMap();
/** Creates one immutable, reusable extension value for an official extension factory. */
function createRegisteredExtension(definition) {
	if (!EXTENSION_ID_PATTERN.test(definition.id)) throw new TypeError("A registered extension ID must use lowercase kebab-case.");
	if (typeof definition.activate !== "function") throw new TypeError("A registered extension must provide an activation function.");
	const capabilities = Object.freeze([...definition.capabilities]);
	const seenCapabilities = /* @__PURE__ */ new Set();
	for (const capability of capabilities) {
		if (!CAPABILITIES.has(capability) || seenCapabilities.has(capability)) throw new TypeError(`Registered extension ${definition.id} declares an invalid capability.`);
		seenCapabilities.add(capability);
	}
	const frozenDefinition = Object.freeze({
		activate: definition.activate,
		capabilities,
		id: definition.id
	});
	const extensionInterface = Object.freeze({
		definition: frozenDefinition,
		protocolVersion: 1
	});
	const extension = Object.create(null);
	Object.defineProperty(extension, REGISTERED_EXTENSION_INTERFACE, {
		configurable: false,
		enumerable: false,
		value: extensionInterface,
		writable: false
	});
	Object.freeze(extension);
	ISSUED_EXTENSIONS.set(extension, extensionInterface);
	return extension;
}
/** Discovers and authenticates the internal interface carried by an extension value. */
function resolveRegisteredExtension(value) {
	if (typeof value !== "object" && typeof value !== "function" || value === null) return null;
	const descriptor = Object.getOwnPropertyDescriptor(value, REGISTERED_EXTENSION_INTERFACE);
	if (descriptor === void 0 || descriptor.get !== void 0 || descriptor.set !== void 0 || descriptor.enumerable === true || descriptor.configurable === true || descriptor.writable === true) return null;
	const issuedInterface = ISSUED_EXTENSIONS.get(value);
	if (issuedInterface === void 0 || descriptor.value !== issuedInterface || issuedInterface.protocolVersion !== 1) return null;
	return issuedInterface.definition;
}
//#endregion
export { parseCalendarDateTime as _, reportCalendarError as a, toUtcDate as b, addCalendarMonths as c, compareDateTimes as d, formatCalendarDate as f, parseCalendarDate as g, isMidnight as h, isAbortError as i, assertCalendarDate as l, getDaysInMonth as m, resolveRegisteredExtension as n, toCalendarIssue as o, getCalendarDateForTimeZone as p, LitefoldCalendarError as r, addCalendarDays as s, createRegisteredExtension as t, compareCalendarDates as u, positiveModulo as v, toUtcDateTime as x, toCalendarDate as y };

//# sourceMappingURL=registered-extension-contract-D6GEApjX.js.map