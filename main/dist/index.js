import { _ as parseCalendarDateTime, a as reportCalendarError, b as toUtcDate, c as addCalendarMonths, d as compareDateTimes, f as formatCalendarDate, g as parseCalendarDate, h as isMidnight, i as isAbortError, l as assertCalendarDate, m as getDaysInMonth, n as resolveRegisteredExtension, o as toCalendarIssue, p as getCalendarDateForTimeZone, r as LitefoldCalendarError, s as addCalendarDays, u as compareCalendarDates, v as positiveModulo, x as toUtcDateTime, y as toCalendarDate } from "./chunks/registered-extension-contract-D6GEApjX.js";
//#region src/internal/domain/event-normalization.ts
var ACCENT_COLOR_PATTERN = /^#[0-9A-Fa-f]{6}$/;
var CONTROL_CHARACTER_PATTERN = /[\u0000-\u001F\u007F-\u009F]/u;
var URL_SCHEME_PATTERN = /^[A-Za-z][A-Za-z0-9+.-]*:/u;
/** The default and absolute maximum number of source events accepted in one snapshot. */
var MAX_SOURCE_EVENT_LIMIT = 1e4;
function normalizeCalendarEventResult(value, baseUrl) {
	if (!isRecord$1(value)) return {
		event: null,
		invalidField: null
	};
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
	const end = endValue === void 0 ? null : typeof endValue === "string" ? endValue : void 0;
	const startDateTime = start === null ? null : parseCalendarDateTime(start);
	const endDateTime = typeof end === "string" ? parseCalendarDateTime(end) : null;
	const url = urlValue === void 0 ? null : normalizeEventUrl(urlValue, baseUrl);
	if (url === void 0) return {
		event: null,
		invalidField: "url"
	};
	if (id === null || title === null || start === null || startDateTime === null || end === void 0 || typeof end === "string" && endDateTime === null || endDateTime !== null && endDateTime.hasTime !== startDateTime.hasTime || endDateTime !== null && compareDateTimes(endDateTime, startDateTime) <= 0) return {
		event: null,
		invalidField: null
	};
	return {
		endDateTime,
		event: Object.freeze({
			accentColor: normalizeAccentColor(accentColorValue),
			end,
			id,
			isAllDay: !startDateTime.hasTime,
			metadata: metadataValue,
			start,
			title,
			url
		}),
		invalidField: null,
		startDateTime
	};
}
/** Validates and normalizes an entire source snapshot. */
function normalizeCalendarEvents(values, maximum = MAX_SOURCE_EVENT_LIMIT, baseUrl) {
	if (!Number.isInteger(maximum) || maximum < 1 || maximum > 1e4) throw new LitefoldCalendarError({
		code: "invalid-configuration",
		message: `Source event limit must be an integer from 1 through ${MAX_SOURCE_EVENT_LIMIT.toString()}.`,
		phase: "configuration",
		recoverable: false,
		severity: "error",
		userMessage: "The calendar configuration is invalid.",
		userTitle: "Calendar unavailable"
	});
	let isArray;
	try {
		isArray = Array.isArray(values);
	} catch (cause) {
		throw createEventDataError("The event source result could not be inspected.", void 0, cause);
	}
	if (!isArray) throw createEventDataError("The event source result is not an array.");
	const eventValues = values;
	let eventCount;
	try {
		eventCount = eventValues.length;
	} catch (cause) {
		throw createEventDataError("The event source result could not be inspected.", void 0, cause);
	}
	if (!Number.isSafeInteger(eventCount) || eventCount < 0) throw createEventDataError("The event source result has an invalid length.");
	if (eventCount > maximum) throw new LitefoldCalendarError({
		code: "event-limit-exceeded",
		message: `The event source returned ${eventCount.toString()} events; the configured maximum is ${maximum.toString()}.`,
		phase: "validation",
		recoverable: true,
		severity: "error",
		userMessage: "Too many events were returned. Narrow the range and try again.",
		userTitle: "Events could not be displayed"
	});
	const identifiers = /* @__PURE__ */ new Set();
	const normalizedEvents = [];
	for (let eventIndex = 0; eventIndex < eventCount; eventIndex += 1) {
		let normalization;
		try {
			normalization = normalizeCalendarEventResult(eventValues[eventIndex], baseUrl);
		} catch (cause) {
			throw createEventDataError(`Event at index ${eventIndex.toString()} could not be inspected.`, eventIndex, cause);
		}
		const event = normalization.event;
		if (event === null) {
			if (normalization.invalidField === "url") throw createEventDataError(`Event at index ${eventIndex.toString()} has an invalid url. Expected a relative or HTTP(S) URL without credentials, surrounding whitespace, or control characters.`, eventIndex);
			throw createEventDataError(`Event at index ${eventIndex.toString()} is invalid.`, eventIndex);
		}
		if (identifiers.has(event.id)) throw createEventDataError(`Event at index ${eventIndex.toString()} has a duplicate identifier.`, eventIndex);
		identifiers.add(event.id);
		normalizedEvents.push(Object.freeze({
			endDateTime: normalization.endDateTime,
			event,
			startDateTime: normalization.startDateTime
		}));
	}
	return Object.freeze(normalizedEvents);
}
/** Returns whether an event overlaps a civil day using an exclusive explicit end. */
function calendarEventOccursOnDate(event, date) {
	assertCalendarDate(date);
	const start = toCalendarDate(event.startDateTime);
	if (event.endDateTime === null) return compareCalendarDates(date, start) === 0;
	if (compareCalendarDates(date, start) < 0) return false;
	const end = toCalendarDate(event.endDateTime);
	const endDateDifference = compareCalendarDates(date, end);
	return endDateDifference < 0 || endDateDifference === 0 && !event.event.isAllDay && !isMidnight(event.endDateTime);
}
/** Orders all-day events first, then local start, title, and opaque identifier. */
function compareCalendarEvents(left, right) {
	if (left.event.isAllDay !== right.event.isAllDay) return left.event.isAllDay ? -1 : 1;
	const timeDifference = compareDateTimes(left.startDateTime, right.startDateTime);
	return timeDifference !== 0 ? timeDifference : compareStrings(left.event.title, right.event.title) || compareStrings(left.event.id, right.event.id);
}
/** Indexes sorted event occurrences for a fixed rendered civil-date range. */
function indexCalendarEventsByDate(events, days) {
	const dateEntries = days.map((date) => Object.freeze({
		date,
		dateString: formatCalendarDate(date)
	}));
	if (!areDatesStrictlyIncreasing(dateEntries)) return indexCalendarEventsByArbitraryDates(events, dateEntries);
	const occurrencesByIndex = dateEntries.map(() => []);
	const exactDateIndexes = /* @__PURE__ */ new Map();
	for (let index = 0; index < dateEntries.length; index += 1) {
		const entry = dateEntries[index];
		if (entry !== void 0) exactDateIndexes.set(toCalendarDateKey(entry.date), index);
	}
	const visibleSpans = [];
	for (const event of events) {
		if (event.endDateTime === null) {
			const occurrenceIndex = exactDateIndexes.get(toCalendarDateKey(event.startDateTime));
			if (occurrenceIndex !== void 0) visibleSpans.push({
				endIndex: occurrenceIndex + 1,
				event,
				startIndex: occurrenceIndex
			});
			continue;
		}
		const firstOccurrenceIndex = findCalendarDateInsertionIndex(dateEntries, event.startDateTime, false);
		const includesEndDate = !event.event.isAllDay && !isParsedMidnight(event.endDateTime);
		const endOccurrenceIndex = findCalendarDateInsertionIndex(dateEntries, event.endDateTime, includesEndDate);
		const clampedEndIndex = Math.min(endOccurrenceIndex, dateEntries.length);
		if (firstOccurrenceIndex < clampedEndIndex) visibleSpans.push({
			endIndex: clampedEndIndex,
			event,
			startIndex: firstOccurrenceIndex
		});
	}
	visibleSpans.sort((left, right) => compareNormalizedCalendarEvents(left.event, right.event));
	for (const span of visibleSpans) for (let index = span.startIndex; index < span.endIndex; index += 1) occurrencesByIndex[index]?.push(span.event);
	const index = /* @__PURE__ */ new Map();
	for (let dateIndex = 0; dateIndex < dateEntries.length; dateIndex += 1) {
		const dateEntry = dateEntries[dateIndex];
		const occurrences = occurrencesByIndex[dateIndex];
		if (dateEntry !== void 0 && occurrences !== void 0) index.set(dateEntry.dateString, Object.freeze(occurrences));
	}
	return index;
}
function areDatesStrictlyIncreasing(days) {
	for (let index = 1; index < days.length; index += 1) {
		const previous = days[index - 1];
		const current = days[index];
		if (previous === void 0 || current === void 0 || compareParsedCalendarDates(previous.date, current.date) >= 0) return false;
	}
	return true;
}
function indexCalendarEventsByArbitraryDates(events, days) {
	const index = /* @__PURE__ */ new Map();
	for (const { date, dateString } of days) {
		const occurrences = events.filter((event) => calendarEventOccursOnDate(event, date)).sort(compareCalendarEvents);
		index.set(dateString, Object.freeze(occurrences));
	}
	return index;
}
function findCalendarDateInsertionIndex(days, target, placeAfterEqual) {
	let lower = 0;
	let upper = days.length;
	while (lower < upper) {
		const middle = lower + upper >>> 1;
		const candidate = days[middle];
		if (candidate === void 0) break;
		const comparison = compareParsedCalendarDates(candidate.date, target);
		if (comparison < 0 || placeAfterEqual && comparison === 0) lower = middle + 1;
		else upper = middle;
	}
	return lower;
}
function compareNormalizedCalendarEvents(left, right) {
	if (left.event.isAllDay !== right.event.isAllDay) return left.event.isAllDay ? -1 : 1;
	const timeDifference = compareParsedCalendarDateTimes(left.startDateTime, right.startDateTime);
	return timeDifference !== 0 ? timeDifference : compareStrings(left.event.title, right.event.title) || compareStrings(left.event.id, right.event.id);
}
function compareParsedCalendarDateTimes(left, right) {
	return compareParsedCalendarDates(left, right) || left.hour - right.hour || left.minute - right.minute || left.second - right.second || left.fractionalSecond - right.fractionalSecond;
}
function compareParsedCalendarDates(left, right) {
	return left.year - right.year || left.month - right.month || left.day - right.day;
}
function isParsedMidnight(value) {
	return value.hour === 0 && value.minute === 0 && value.second === 0 && value.fractionalSecond === 0;
}
function toCalendarDateKey(value) {
	return (value.year * 12 + value.month - 1) * 31 + value.day;
}
function normalizeIdentifier(value) {
	return typeof value === "string" && value.length > 0 && value.length <= 256 && value.trim().length > 0 ? value : null;
}
function normalizeTitle(value) {
	return typeof value === "string" && value.length > 0 && value.length <= 1024 ? value : null;
}
function normalizeAccentColor(value) {
	return typeof value === "string" && ACCENT_COLOR_PATTERN.test(value) ? value.toUpperCase() : null;
}
function normalizeEventUrl(value, baseUrl) {
	if (typeof value !== "string" || value.length === 0 || value.length > 2048 || value.trim() !== value || CONTROL_CHARACTER_PATTERN.test(value)) return;
	try {
		const isAbsolute = URL_SCHEME_PATTERN.test(value);
		if (!isAbsolute && baseUrl === void 0) return;
		const resolved = isAbsolute ? new URL(value) : new URL(value, baseUrl);
		if (isAbsolute && resolved.protocol !== "http:" && resolved.protocol !== "https:" || resolved.username.length > 0 || resolved.password.length > 0 || resolved.href.length > 2048) return;
		return isAbsolute ? resolved.href : value;
	} catch {
		return;
	}
}
function isRecord$1(value) {
	return typeof value === "object" && value !== null && !Array.isArray(value);
}
function compareStrings(left, right) {
	return left < right ? -1 : left > right ? 1 : 0;
}
function createEventDataError(message, eventIndex, cause) {
	const options = {
		...cause === void 0 ? {} : { cause },
		code: "event-data-invalid",
		message,
		phase: "validation",
		recoverable: true,
		severity: "error",
		userMessage: "The event data is invalid. Try again.",
		userTitle: "Events could not be displayed"
	};
	return eventIndex === void 0 ? new LitefoldCalendarError(options) : new LitefoldCalendarError({
		...options,
		eventIndex
	});
}
//#endregion
//#region src/internal/domain/grid.ts
var GRID_DAY_COUNT = 42;
var DEFAULT_FIRST_DAY = 0;
var DAYS_PER_WEEK$2 = 7;
/** Returns the fixed six-week grid for a month, including its exclusive request end. */
function getCalendarMonthRange(month, firstDay = DEFAULT_FIRST_DAY) {
	assertCalendarDate(month);
	if (!Number.isInteger(firstDay) || firstDay < 0 || firstDay >= DAYS_PER_WEEK$2) throw new RangeError("Calendar first day must be an integer from 0 through 6.");
	const firstOfMonth = Object.freeze({
		day: 1,
		month: month.month,
		year: month.year
	});
	const leadingDays = positiveModulo(toUtcDate(firstOfMonth).getUTCDay() - firstDay, DAYS_PER_WEEK$2);
	const start = addCalendarDays(firstOfMonth, -leadingDays);
	const days = Object.freeze(Array.from({ length: GRID_DAY_COUNT }, (_value, index) => addCalendarDays(start, index)));
	return Object.freeze({
		days,
		end: addCalendarDays(start, GRID_DAY_COUNT),
		start
	});
}
/** Resolves a locale-derived or explicit Sunday-through-Saturday week start. */
function resolveCalendarFirstDay(firstDay, locale) {
	if (firstDay !== "locale") {
		if (!Number.isInteger(firstDay) || firstDay < 0 || firstDay >= DAYS_PER_WEEK$2) throw new RangeError("Calendar first day must be 'locale' or an integer from 0 through 6.");
		return firstDay;
	}
	return resolveLocaleFirstDay(new Intl.Locale(locale ?? Intl.DateTimeFormat().resolvedOptions().locale)) ?? DEFAULT_FIRST_DAY;
}
/** Returns whether a month can produce its complete six-week grid inside years 0001 through 9999. */
function isRenderableMonth(month, firstDay) {
	try {
		getCalendarMonthRange(month, firstDay);
		return true;
	} catch {
		return false;
	}
}
function resolveLocaleFirstDay(locale) {
	const methodFirstDay = readWeekInfoFirstDay(invokeWeekInfoMethod(locale));
	if (methodFirstDay !== null) return methodFirstDay;
	return readWeekInfoFirstDay(readWeekInfoAccessor(locale));
}
function invokeWeekInfoMethod(locale) {
	try {
		const getWeekInfo = Reflect.get(locale, "getWeekInfo");
		return typeof getWeekInfo === "function" ? Reflect.apply(getWeekInfo, locale, []) : null;
	} catch {
		return null;
	}
}
function readWeekInfoAccessor(locale) {
	try {
		return Reflect.get(locale, "weekInfo");
	} catch {
		return null;
	}
}
function readWeekInfoFirstDay(weekInfo) {
	if (typeof weekInfo !== "object" && typeof weekInfo !== "function" || weekInfo === null) return null;
	let firstDay;
	try {
		firstDay = Reflect.get(weekInfo, "firstDay");
	} catch {
		return null;
	}
	return typeof firstDay === "number" && Number.isInteger(firstDay) && firstDay >= 1 && firstDay <= 7 ? positiveModulo(firstDay, DAYS_PER_WEEK$2) : null;
}
//#endregion
//#region src/internal/domain/ranges.ts
/** Tests a supported civil date against independently optional inclusive bounds. */
function isCalendarDateWithinBounds(date, minDate, maxDate) {
	assertCalendarDate(date);
	assertCalendarDateBounds(minDate, maxDate);
	return (minDate === null || minDate === void 0 || compareCalendarDates(date, minDate) >= 0) && (maxDate === null || maxDate === void 0 || compareCalendarDates(date, maxDate) <= 0);
}
/** Returns whether a Gregorian month contains at least one date inside optional inclusive bounds. */
function doesCalendarMonthIntersectBounds(month, minDate, maxDate) {
	assertCalendarDate(month);
	assertCalendarDateBounds(minDate, maxDate);
	const start = {
		day: 1,
		month: month.month,
		year: month.year
	};
	const end = {
		day: getDaysInMonth(month.year, month.month),
		month: month.month,
		year: month.year
	};
	return (minDate === null || minDate === void 0 || compareCalendarDates(end, minDate) >= 0) && (maxDate === null || maxDate === void 0 || compareCalendarDates(start, maxDate) <= 0);
}
/** Resolves a preferred day inside a Gregorian month and optional inclusive bounds. */
function clampCalendarMonthDate(month, preferredDay, minDate, maxDate) {
	assertCalendarDate(month);
	if (!Number.isInteger(preferredDay) || preferredDay < 1 || preferredDay > 31) throw new RangeError("Preferred calendar day must be an integer from 1 through 31.");
	assertCalendarDateBounds(minDate, maxDate);
	if (!doesCalendarMonthIntersectBounds(month, minDate, maxDate)) return null;
	let result = {
		day: Math.min(preferredDay, getDaysInMonth(month.year, month.month)),
		month: month.month,
		year: month.year
	};
	if (minDate !== null && minDate !== void 0 && compareCalendarDates(result, minDate) < 0) result = { ...minDate };
	if (maxDate !== null && maxDate !== void 0 && compareCalendarDates(result, maxDate) > 0) result = { ...maxDate };
	return Object.freeze(result);
}
function assertCalendarDateBounds(minDate, maxDate) {
	if (minDate !== null && minDate !== void 0) assertCalendarDate(minDate);
	if (maxDate !== null && maxDate !== void 0) assertCalendarDate(maxDate);
	if (minDate !== null && minDate !== void 0 && maxDate !== null && maxDate !== void 0 && compareCalendarDates(minDate, maxDate) > 0) throw new RangeError("Calendar minimum date must not follow the maximum date.");
}
//#endregion
//#region src/internal/domain/bounds.ts
/** Centralized inclusive date and renderable-month policy for one calendar instance. */
var CalendarBounds = class {
	firstDay;
	minDate;
	maxDate;
	constructor(firstDay, minDate, maxDate) {
		this.firstDay = firstDay;
		this.minDate = minDate;
		this.maxDate = maxDate;
	}
	hasAllowedRenderableMonth() {
		let month = this.minDate === void 0 ? {
			day: 1,
			month: 1,
			year: 1
		} : {
			day: 1,
			month: this.minDate.month,
			year: this.minDate.year
		};
		const finalMonth = this.maxDate === void 0 ? {
			day: 1,
			month: 12,
			year: 9999
		} : {
			day: 1,
			month: this.maxDate.month,
			year: this.maxDate.year
		};
		while (compareCalendarDates(month, finalMonth) <= 0) {
			if (this.isMonthAllowed(month)) return true;
			try {
				month = addCalendarMonths(month, 1);
			} catch {
				return false;
			}
		}
		return false;
	}
	resolveImplicitInitialDate(today) {
		let boundedToday = today;
		if (this.minDate !== void 0 && compareCalendarDates(boundedToday, this.minDate) < 0) boundedToday = this.minDate;
		if (this.maxDate !== void 0 && compareCalendarDates(boundedToday, this.maxDate) > 0) boundedToday = this.maxDate;
		const currentMonth = this.resolveMonthTarget(boundedToday, boundedToday.day);
		if (currentMonth !== null) return currentMonth;
		const previous = this.findAllowedDateFromMonth(boundedToday, -1);
		const next = this.findAllowedDateFromMonth(boundedToday, 1);
		if (previous === null) return next;
		if (next === null) return previous;
		return dayDistance(previous, boundedToday) <= dayDistance(next, boundedToday) ? previous : next;
	}
	isDateAllowed(date) {
		return isCalendarDateWithinBounds(date, this.minDate, this.maxDate);
	}
	getDateNavigationFailure(date) {
		if (!this.isDateAllowed(date)) return "out-of-bounds";
		return this.isMonthAllowed({
			day: 1,
			month: date.month,
			year: date.year
		}) ? null : "unrenderable";
	}
	isMonthAllowed(month) {
		return doesCalendarMonthIntersectBounds(month, this.minDate, this.maxDate) && isRenderableMonth({
			day: 1,
			month: month.month,
			year: month.year
		}, this.firstDay);
	}
	resolveMonthTarget(month, preferredDay) {
		if (!this.isMonthAllowed(month)) return null;
		return clampCalendarMonthDate(month, preferredDay, this.minDate, this.maxDate);
	}
	resolveShiftTarget(displayedMonth, preferredDay, amount) {
		try {
			return this.resolveMonthTarget(addCalendarMonths(displayedMonth, amount), preferredDay);
		} catch {
			return null;
		}
	}
	findAllowedDateFromMonth(date, direction) {
		let month = {
			day: 1,
			month: date.month,
			year: date.year
		};
		for (;;) {
			try {
				month = addCalendarMonths(month, direction);
			} catch {
				return null;
			}
			if (direction < 0 && this.minDate !== void 0 && compareMonth(month, this.minDate) < 0) return null;
			if (direction > 0 && this.maxDate !== void 0 && compareMonth(month, this.maxDate) > 0) return null;
			const target = this.resolveMonthTarget(month, direction < 0 ? 31 : 1);
			if (target !== null) return target;
		}
	}
};
function compareMonth(left, right) {
	return (left.year - right.year) * 12 + left.month - right.month;
}
function dayDistance(left, right) {
	return Math.abs(toUtcDate(left).getTime() - toUtcDate(right).getTime());
}
//#endregion
//#region src/internal/runtime/safety.ts
var INTERACTIVE_ROLES = /* @__PURE__ */ new Set([
	"button",
	"checkbox",
	"combobox",
	"grid",
	"gridcell",
	"link",
	"listbox",
	"menu",
	"menubar",
	"menuitem",
	"menuitemcheckbox",
	"menuitemradio",
	"option",
	"radio",
	"radiogroup",
	"scrollbar",
	"searchbox",
	"slider",
	"spinbutton",
	"switch",
	"tab",
	"tablist",
	"textbox",
	"tree",
	"treegrid",
	"treeitem"
]);
var INTERACTIVE_TAGS = /* @__PURE__ */ new Set([
	"button",
	"details",
	"embed",
	"iframe",
	"label",
	"select",
	"summary",
	"textarea"
]);
/** Returns whether extension output contains controls or focusable descendants. */
function containsInteractiveContent(root) {
	const pending = [root];
	while (pending.length > 0) {
		const node = pending.pop();
		if (node === void 0) continue;
		if (node.nodeType === 1 && hasInteractiveSemantics(node)) return true;
		if (node.nodeType === 1) {
			const shadowRoot = node.shadowRoot;
			if (shadowRoot !== null) pending.push(shadowRoot);
		}
		for (const child of node.childNodes) pending.push(child);
	}
	return false;
}
/** Returns whether extension output can contribute visible content. */
function containsPresentationalContent(root) {
	const pending = [root];
	while (pending.length > 0) {
		const node = pending.pop();
		if (node === void 0) continue;
		if (isHtmlTemplateElement(node)) continue;
		if (node.nodeType === 1 || node.nodeType === 3 && (node.nodeValue ?? "").trim().length > 0) return true;
		for (const child of node.childNodes) pending.push(child);
	}
	return false;
}
function isHtmlTemplateElement(node) {
	if (node.nodeType !== 1) return false;
	const element = node;
	if (element.localName.toLowerCase() !== "template") return false;
	return element.namespaceURI === element.ownerDocument.createElement("template").namespaceURI;
}
/** Returns whether an unknown value is a non-null object or function-property carrier. */
function isRecord(value) {
	return typeof value === "object" && value !== null;
}
/** Identifies valid Date values without relying on a realm-specific constructor. */
function isDateInstance(value) {
	if (!isRecord(value)) return false;
	try {
		return !Number.isNaN(Date.prototype.getTime.call(value));
	} catch {
		return false;
	}
}
/** Identifies a genuine HTMLElement through its standard Web IDL attribute brand check. */
function isHTMLElementLike(value) {
	if (!isRecord(value)) return false;
	try {
		const HTMLElementConstructor = Reflect.get(globalThis, "HTMLElement");
		if (typeof HTMLElementConstructor !== "function") return false;
		const prototype = Reflect.get(HTMLElementConstructor, "prototype");
		if (!isRecord(prototype)) return false;
		const titleGetter = Reflect.getOwnPropertyDescriptor(prototype, "title")?.get;
		return typeof titleGetter === "function" && typeof Reflect.apply(titleGetter, value, []) === "string";
	} catch {
		return false;
	}
}
function isNodeLike(value) {
	if (typeof value !== "object" || value === null) return false;
	try {
		return typeof Reflect.get(value, "nodeType") === "number" && Reflect.get(value, "ownerDocument") !== void 0;
	} catch {
		return false;
	}
}
/** Identifies a node owned by a specific document. */
function isSameDocumentNode(document, value) {
	if (!isNodeLike(value)) return false;
	try {
		return value.ownerDocument === document;
	} catch {
		return false;
	}
}
/** Returns whether a node kind may be appended to a package-owned container. */
function isAppendableNode(value) {
	try {
		return value.nodeType === 1 || value.nodeType === 3 || value.nodeType === 8 || value.nodeType === 11;
	} catch {
		return false;
	}
}
/** Identifies the package's typed error without leaking proxy failures. */
function isLitefoldCalendarError(value) {
	try {
		return value instanceof LitefoldCalendarError;
	} catch {
		return false;
	}
}
function hasInteractiveSemantics(element) {
	const tagName = element.tagName.toLowerCase();
	const contentEditable = element.getAttribute("contenteditable");
	const roles = element.getAttribute("role")?.trim().toLowerCase().split(/\s+/u) ?? [];
	const hasStringHandler = Array.from(element.attributes).some((attribute) => attribute.name.toLowerCase().startsWith("on"));
	return INTERACTIVE_TAGS.has(tagName) || tagName === "input" && element.getAttribute("type")?.toLowerCase() !== "hidden" || (tagName === "audio" || tagName === "video") && element.hasAttribute("controls") || (tagName === "img" || tagName === "object") && element.hasAttribute("usemap") || (tagName === "a" || tagName === "area") && element.hasAttribute("href") || contentEditable !== null && contentEditable.toLowerCase() !== "false" || element.hasAttribute("tabindex") || hasStringHandler || roles.some((role) => INTERACTIVE_ROLES.has(role));
}
/** Invokes a callback while retaining its otherwise-void runtime return value. */
function invokeForUnknownResult(callback, argumentsList) {
	if (typeof callback !== "function") throw new TypeError("A calendar callback must be callable.");
	return Reflect.apply(callback, void 0, argumentsList);
}
/** Observes an unsupported thenable returned by a synchronous integration callback. */
function observeThenable(value, onRejected, onFulfilled) {
	if ((typeof value !== "object" || value === null) && typeof value !== "function") return false;
	let then;
	try {
		then = Reflect.get(value, "then");
	} catch (cause) {
		safelyReportThenableRejection(onRejected, cause);
		return true;
	}
	if (typeof then !== "function") return false;
	try {
		Promise.resolve(value).then(() => {
			try {
				onFulfilled?.();
			} catch (reportingFailure) {
				reportCalendarError(reportingFailure);
			}
		}, (cause) => {
			safelyReportThenableRejection(onRejected, cause);
		});
	} catch (cause) {
		safelyReportThenableRejection(onRejected, cause);
	}
	return true;
}
function safelyReportThenableRejection(onRejected, cause) {
	try {
		onRejected(cause);
	} catch (reportingFailure) {
		reportCalendarError(new AggregateError([cause, reportingFailure], "A calendar callback rejection could not be reported."));
	}
}
//#endregion
//#region src/internal/runtime/configuration.ts
var CALENDAR_OPTION_SCHEMA = Object.freeze({
	agendaDomLimit: "value",
	agendaPageSize: "value",
	eventTimeDisplay: "value",
	events: "value",
	extensions: "value",
	gridEventPlacement: "value",
	gridEventDisplay: "value",
	renderHooks: "value",
	fallbackElement: "value",
	firstDay: "value",
	headingLevel: "value",
	icons: "value",
	initialDate: "value",
	isEventContextMenuAvailable: "callback",
	locale: "value",
	maxDate: "value",
	maxGridEventsPerDay: "value",
	messages: "value",
	minDate: "value",
	now: "callback",
	onAnnounce: "callback",
	onDayContextMenu: "callback",
	onDaySelect: "callback",
	onError: "callback",
	onEventActivate: "callback",
	onEventOverflowActivate: "callback",
	onEventOverflowDefault: "callback",
	onEventContextMenu: "callback",
	onStateChange: "callback",
	sourceEventLimit: "value",
	swipe: "value",
	timeZone: "value",
	toolbarEnd: "value",
	weekRowSizing: "value"
});
var CALENDAR_OPTION_KEYS = Object.freeze(Object.keys(CALENDAR_OPTION_SCHEMA));
var CALENDAR_OPTION_KEY_SET = new Set(CALENDAR_OPTION_KEYS);
var CONFIGURATION_ARRAY_LIMIT = MAX_SOURCE_EVENT_LIMIT + 1;
function createConfigurationError(message, cause) {
	return new LitefoldCalendarError({
		...cause === void 0 ? {} : { cause },
		code: "invalid-configuration",
		message,
		phase: "configuration",
		recoverable: false,
		severity: "error",
		userMessage: "The calendar configuration is invalid.",
		userTitle: "Calendar unavailable"
	});
}
function isConfigurationRecord(value) {
	if (!isRecord(value)) return false;
	try {
		return !Array.isArray(value);
	} catch {
		return false;
	}
}
function assertKnownConfigurationKeys(value, allowedKeys, path) {
	let keys;
	try {
		keys = Reflect.ownKeys(value);
	} catch (cause) {
		throw createConfigurationError(`${path} could not be inspected.`, cause);
	}
	const unknownKey = keys.find((key) => typeof key === "string" && !allowedKeys.has(key));
	if (typeof unknownKey === "string") throw createConfigurationError(`${path}.${unknownKey} is not a supported option.`);
}
function readConfigurationValue(value, key, path) {
	try {
		return Reflect.get(value, key);
	} catch (cause) {
		throw createConfigurationError(`${path} could not be read.`, cause);
	}
}
function snapshotConfigurationArray(value, path, truncate) {
	const length = readConfigurationValue(value, "length", `${path}.length`);
	if (typeof length !== "number" || !Number.isSafeInteger(length) || length < 0) throw createConfigurationError(`${path} has an invalid length.`);
	if (!truncate && length > CONFIGURATION_ARRAY_LIMIT) throw createConfigurationError(`${path} must contain at most ${CONFIGURATION_ARRAY_LIMIT.toString()} items.`);
	const snapshot = [];
	const snapshotLength = Math.min(length, CONFIGURATION_ARRAY_LIMIT);
	for (let index = 0; index < snapshotLength; index += 1) snapshot.push(readConfigurationValue(value, index, `${path}[${index.toString()}]`));
	return Object.freeze(snapshot);
}
function snapshotCalendarOptions(options) {
	if (!isConfigurationRecord(options)) throw createConfigurationError("options must be an object.");
	assertKnownConfigurationKeys(options, CALENDAR_OPTION_KEY_SET, "options");
	const snapshot = {};
	for (const key of CALENDAR_OPTION_KEYS) {
		const value = readConfigurationValue(options, key, `options.${key}`);
		if (value !== void 0 || key === "events") snapshot[key] = value;
	}
	for (const key of CALENDAR_OPTION_KEYS.filter((candidate) => CALENDAR_OPTION_SCHEMA[candidate] === "callback")) {
		const value = snapshot[key];
		if (value !== void 0 && typeof value !== "function") throw createConfigurationError(`${key} must be a function.`);
	}
	normalizeEventTimeDisplay(snapshot["eventTimeDisplay"]);
	snapshot["gridEventPlacement"] = normalizeGridEventPlacement(snapshot["gridEventPlacement"]);
	snapshot["gridEventDisplay"] = normalizeGridEventDisplay(snapshot["gridEventDisplay"]);
	snapshot["weekRowSizing"] = normalizeWeekRowSizing(snapshot["weekRowSizing"]);
	return Object.freeze(snapshot);
}
function normalizeIntegerOption(value, defaultValue, minimum, maximum, name) {
	if (value === void 0) return defaultValue;
	if (!Number.isInteger(value) || value < minimum || value > maximum) throw createConfigurationError(`${name} must be an integer from ${minimum.toString()} through ${maximum.toString()}.`);
	return value;
}
/** Resolves the surfaces on which event times remain visually displayed. */
function normalizeEventTimeDisplay(value) {
	if (value === void 0) return "all";
	if (value !== "all" && value !== "grid" && value !== "agenda" && value !== "none") throw createConfigurationError("eventTimeDisplay must be \"all\", \"grid\", \"agenda\", or \"none\".");
	return value;
}
/** Resolves and snapshots independent container-size presentation settings. */
function normalizeGridEventDisplay(value) {
	if (value !== void 0 && !isConfigurationRecord(value)) throw createConfigurationError("gridEventDisplay must be an object when supplied.");
	if (value !== void 0) assertKnownConfigurationKeys(value, /* @__PURE__ */ new Set(["compact", "wide"]), "gridEventDisplay");
	const resolve = (variant, fallback) => {
		const mode = value === void 0 ? void 0 : readConfigurationValue(value, variant, `gridEventDisplay.${variant}`);
		if (mode === void 0) return fallback;
		if (mode !== "events" && mode !== "count" && mode !== "count-when-multiple") throw createConfigurationError(`gridEventDisplay.${variant} must be "events", "count", or "count-when-multiple".`);
		return mode;
	};
	return Object.freeze({
		compact: resolve("compact", "count-when-multiple"),
		wide: resolve("wide", "events")
	});
}
/** Resolves vertical placement of the complete event stack within each month-grid day cell. */
function normalizeGridEventPlacement(value) {
	if (value === void 0) return "top";
	if (value !== "top" && value !== "center" && value !== "bottom") throw createConfigurationError("gridEventPlacement must be \"top\", \"center\", or \"bottom\".");
	return value;
}
/** Resolves whether month-grid week rows share one intrinsic height or size independently. */
function normalizeWeekRowSizing(value) {
	if (value === void 0) return "equal";
	if (value !== "equal" && value !== "content") throw createConfigurationError("weekRowSizing must be \"equal\" or \"content\".");
	return value;
}
function normalizeLocale(locale) {
	if (locale === void 0) return;
	if (typeof locale !== "string" || locale.trim().length === 0) throw createConfigurationError("locale must be a non-empty language tag.");
	try {
		return Intl.getCanonicalLocales(locale)[0];
	} catch (cause) {
		throw createConfigurationError("locale must be a valid language tag.", cause);
	}
}
function normalizeTimeZone(timeZone) {
	if (timeZone === void 0) return null;
	if (typeof timeZone !== "string" || timeZone.trim().length === 0) throw createConfigurationError("timeZone must be a non-empty IANA time-zone identifier.");
	try {
		new Intl.DateTimeFormat("en-US", { timeZone }).format(0);
		return timeZone;
	} catch (cause) {
		throw createConfigurationError("timeZone must be a valid IANA time-zone identifier.", cause);
	}
}
function resolveFirstDay(value, locale) {
	let firstDay = value;
	if (firstDay === void 0) firstDay = "locale";
	if (firstDay !== "locale" && (typeof firstDay !== "number" || !Number.isInteger(firstDay) || firstDay < 0 || firstDay > 6)) throw createConfigurationError("firstDay must be \"locale\" or an integer from 0 through 6.");
	return resolveCalendarFirstDay(firstDay, locale);
}
function resolveToolbarEnd(document, host, toolbarEnd) {
	if (toolbarEnd === void 0) return null;
	let isValid = false;
	try {
		isValid = isHTMLElementLike(toolbarEnd) && toolbarEnd.ownerDocument === document && toolbarEnd !== host && !toolbarEnd.contains(host) && (toolbarEnd.parentNode === null || host.contains(toolbarEnd));
	} catch (cause) {
		throw createConfigurationError("toolbarEnd could not be inspected.", cause);
	}
	if (!isValid) throw createConfigurationError("toolbarEnd must be a detached HTML element or an existing HTML element descendant of the host.");
	return toolbarEnd;
}
/** Resolves same-document progressive fallback content kept outside the calendar host. */
function resolveFallbackElement(document, host, fallbackElement) {
	if (fallbackElement === void 0) return null;
	let isValid = false;
	try {
		isValid = isHTMLElementLike(fallbackElement) && fallbackElement.ownerDocument === document && fallbackElement !== host && !host.contains(fallbackElement) && !fallbackElement.contains(host);
	} catch (cause) {
		throw createConfigurationError("fallbackElement could not be inspected.", cause);
	}
	if (!isValid) throw createConfigurationError("fallbackElement must be a same-document HTML element that neither contains nor is contained by the calendar host.");
	return fallbackElement;
}
/** Preserves the exact-optional fallback option after construction validation. */
function getFallbackOption(fallbackElement) {
	return fallbackElement === null ? {} : { fallbackElement };
}
function resolveIconNodes(document, host, icons) {
	const nodes = {};
	for (const direction of ["previous", "next"]) {
		if (typeof icons[direction] !== "function") throw createConfigurationError(`${direction} icon must be a factory function.`);
		let node;
		try {
			node = invokeForUnknownResult(icons[direction], [document]);
		} catch (cause) {
			throw createConfigurationError(`${direction} icon factory failed.`, cause);
		}
		let isValid = false;
		try {
			isValid = isSameDocumentNode(document, node) && isAppendableNode(node) && node.parentNode === null && !node.contains(host) && !containsInteractiveContent(node);
		} catch (cause) {
			throw createConfigurationError(`${direction} icon factory result could not be inspected.`, cause);
		}
		if (!isValid) throw createConfigurationError(`${direction} icon factory must return detached, noninteractive content owned by the host document.`);
		nodes[direction] = node;
	}
	if (nodes.previous === nodes.next) throw createConfigurationError("Navigation icon factories must return distinct nodes.");
	return Object.freeze(nodes);
}
//#endregion
//#region src/internal/runtime/actions.ts
/** Creates an immutable public day-selection context. */
function createDaySelection(nativeEvent, date, element) {
	return Object.freeze({
		date: Object.freeze({ ...date }),
		dateString: formatCalendarDate(date),
		element,
		nativeEvent
	});
}
/** Creates an immutable public day-context-menu context. */
function createDayContextMenu(nativeEvent, date, element, clientX, clientY) {
	return Object.freeze({
		clientX,
		clientY,
		date: Object.freeze({ ...date }),
		dateString: formatCalendarDate(date),
		element,
		nativeEvent
	});
}
/** Creates an immutable public event-activation context. */
function createEventActivation(nativeEvent, date, element, event, surface) {
	return Object.freeze({
		date: Object.freeze({ ...date }),
		dateString: formatCalendarDate(date),
		element,
		event,
		nativeEvent,
		surface
	});
}
/** Creates an immutable context-action availability context without exposing DOM or native events. */
function createEventContextMenuAvailability(date, event, surface) {
	return Object.freeze({
		date: Object.freeze({ ...date }),
		dateString: formatCalendarDate(date),
		event,
		surface
	});
}
/** Creates an immutable public event-context-menu context. */
function createEventContextMenu(nativeEvent, date, element, event, surface, clientX, clientY) {
	return Object.freeze({
		clientX,
		clientY,
		date: Object.freeze({ ...date }),
		dateString: formatCalendarDate(date),
		element,
		event,
		nativeEvent,
		surface
	});
}
//#endregion
//#region src/internal/runtime/render-hooks.ts
var RENDER_HOOK_SCHEMA = Object.freeze({
	dayDidMount: "hook",
	eventDidMount: "hook",
	id: "id",
	renderDayBadge: "hook",
	renderEventDetails: "hook",
	renderEventOverflow: "hook",
	renderEventLeading: "hook",
	renderEventMarker: "hook",
	renderEventTrailing: "hook"
});
var RENDER_HOOK_NAMES = Object.freeze(Object.keys(RENDER_HOOK_SCHEMA).filter((key) => key !== "id"));
var RENDER_HOOK_KEY_SET = /* @__PURE__ */ new Set(["id", ...RENDER_HOOK_NAMES]);
var SINGLETON_RENDER_HOOK_NAMES = Object.freeze(["renderEventMarker", "renderEventOverflow"]);
/** Validates consumer-owned render hooks and creates their coordinator-owned runtime records. */
function createRenderHookRuntimes(renderHooks, AbortControllerConstructor) {
	if (renderHooks === void 0) return Object.freeze([]);
	const renderHookValues = renderHooks;
	let isArray;
	try {
		isArray = Array.isArray(renderHookValues);
	} catch (cause) {
		throw createConfigurationError("renderHooks could not be inspected.", cause);
	}
	if (!isArray) throw createConfigurationError("renderHooks must be an array.");
	const renderHookSnapshot = snapshotConfigurationArray(renderHookValues, "renderHooks", false);
	const identifiers = /* @__PURE__ */ new Set();
	const singletonOwners = /* @__PURE__ */ new Map();
	const runtimes = renderHookSnapshot.map((renderHooksDefinition, index) => {
		const renderHooksValue = renderHooksDefinition;
		if (!isConfigurationRecord(renderHooksValue)) throw createConfigurationError(`Render hooks at index ${index.toString()} must have a non-empty id.`);
		const path = `renderHooks[${index.toString()}]`;
		assertKnownConfigurationKeys(renderHooksValue, RENDER_HOOK_KEY_SET, path);
		const identifier = readConfigurationValue(renderHooksValue, "id", `${path}.id`);
		if (typeof identifier !== "string" || identifier.trim().length === 0) throw createConfigurationError(`Render hooks at index ${index.toString()} must have a non-empty id.`);
		if (identifiers.has(identifier)) throw createConfigurationError(`Render hook id "${identifier}" is duplicated.`);
		const definition = { id: identifier };
		for (const hookName of RENDER_HOOK_NAMES) {
			const hook = readConfigurationValue(renderHooksValue, hookName, `${path}.${hookName}`);
			if (hook !== void 0 && typeof hook !== "function") throw createConfigurationError(`Render hooks "${identifier}" have an invalid ${hookName} hook.`);
			if (hook !== void 0) definition[hookName] = hook;
		}
		for (const hookName of SINGLETON_RENDER_HOOK_NAMES) {
			if (definition[hookName] === void 0) continue;
			const ownerId = singletonOwners.get(hookName);
			if (ownerId !== void 0) throw createConfigurationError(`Render hooks "${ownerId}" and "${identifier}" both define ${hookName}.`);
			singletonOwners.set(hookName, identifier);
		}
		identifiers.add(identifier);
		const frozenDefinition = Object.freeze(definition);
		const createController = () => new AbortControllerConstructor();
		return {
			cleanups: [],
			controller: createController(),
			createController,
			definition: frozenDefinition,
			eventOverflowFallbacks: /* @__PURE__ */ new Map(),
			leaseToken: {},
			markerFallbacks: /* @__PURE__ */ new Map(),
			nodeInvocations: /* @__PURE__ */ new WeakMap(),
			nodes: /* @__PURE__ */ new Map(),
			quarantined: false
		};
	});
	return Object.freeze(runtimes);
}
//#endregion
//#region src/internal/runtime/source.ts
/** Reserves state publication for a source phase through preparation and DOM reactions. */
var CalendarEventSourcePublication = class {
	generation = null;
	isPending(generation) {
		return this.generation === generation;
	}
	didPublish(generation) {
		if (this.generation === generation) this.generation = null;
	}
	run(generation, action) {
		const previousGeneration = this.generation;
		this.generation = generation;
		try {
			return action();
		} finally {
			this.generation = previousGeneration;
		}
	}
};
var EVENT_INPUT_KEYS = Object.freeze([
	"accentColor",
	"end",
	"id",
	"metadata",
	"start",
	"title",
	"url"
]);
/** Resolves a static source snapshot or provider from validated calendar options. */
function resolveCalendarEvents(options) {
	const value = readConfigurationValue(options, "events", "events");
	let isArray;
	try {
		isArray = Array.isArray(value);
	} catch (cause) {
		throw createConfigurationError("events could not be inspected.", cause);
	}
	if (!isArray) {
		if (typeof value !== "function") throw createConfigurationError("events must be an array or function.");
		return value;
	}
	try {
		const events = snapshotConfigurationArray(value, "events", true);
		return Object.freeze(events.map((event, index) => snapshotStaticEvent(event, `events[${index.toString()}]`)));
	} catch (cause) {
		if (isLitefoldCalendarError(cause)) throw cause;
		throw createConfigurationError("events array could not be snapshotted.", cause);
	}
}
/** Invokes and normalizes one source result without changing its synchronous or asynchronous timing. */
function requestCalendarEvents(events, range, maximum, baseUrl) {
	const result = typeof events === "function" ? invokeCalendarEventSource(events, range) : events;
	let isArray;
	try {
		isArray = Array.isArray(result);
	} catch {
		return Object.freeze({
			events: normalizeCalendarEvents(result, maximum, baseUrl),
			timing: "synchronous"
		});
	}
	if (isArray) return Object.freeze({
		events: normalizeCalendarEvents(result, maximum, baseUrl),
		timing: "synchronous"
	});
	const then = readThen(result);
	if (then === null) return Object.freeze({
		events: normalizeCalendarEvents(result, maximum, baseUrl),
		timing: "synchronous"
	});
	const pending = observeSourceThenable(result, then).then((values) => normalizeCalendarEvents(values, maximum, baseUrl));
	return Object.freeze({
		events: pending,
		timing: "asynchronous"
	});
}
/** Snapshots supported event fields while preserving opaque metadata by reference. */
function snapshotStaticEvent(value, path) {
	if (!isRecord(value)) return value;
	const snapshot = {};
	for (const key of EVENT_INPUT_KEYS) {
		const field = readConfigurationValue(value, key, `${path}.${key}`);
		if (field !== void 0) snapshot[key] = field;
	}
	return Object.freeze(snapshot);
}
function invokeCalendarEventSource(source, range) {
	return Reflect.apply(source, void 0, [range]);
}
function readThen(value) {
	if ((typeof value !== "object" || value === null) && typeof value !== "function") return null;
	const then = Reflect.get(value, "then");
	return typeof then === "function" ? then : null;
}
function observeSourceThenable(value, then) {
	return new Promise((resolve, reject) => {
		try {
			Reflect.apply(then, value, [resolve, reject]);
		} catch (cause) {
			reject(cause);
		}
	});
}
//#endregion
//#region src/internal/runtime/state.ts
/** Creates one typed package error from coordinator-owned internal values. */
function createInternalError(options) {
	const phase = options.phase ?? phaseForCode(options.code);
	const values = {
		...options.cause === void 0 ? {} : { cause: options.cause },
		code: options.code,
		...options.eventIndex === void 0 ? {} : { eventIndex: options.eventIndex },
		...options.extensionId === void 0 ? {} : { extensionId: options.extensionId },
		...options.renderHookId === void 0 ? {} : { renderHookId: options.renderHookId },
		...options.hook === void 0 ? {} : { hook: options.hook },
		message: options.message ?? `${options.code} during ${phase}.`,
		phase,
		...options.range === void 0 ? {} : { range: options.range },
		recoverable: options.recoverable,
		severity: options.severity,
		...options.stale === void 0 ? {} : { stale: options.stale },
		...options.surface === void 0 ? {} : { surface: options.surface },
		userMessage: options.userMessage,
		userTitle: options.userTitle
	};
	return new LitefoldCalendarError(values);
}
/** Creates a typed error for a rejected public calendar method call. */
function createPublicMethodError(code, hook, message, messages, isLive, cause) {
	return createInternalError({
		...cause === void 0 ? {} : { cause },
		code,
		hook,
		message,
		recoverable: code === "invalid-argument" || isLive,
		severity: "error",
		userMessage: code === "invalid-argument" ? messages.actionErrorMessage : messages.internalErrorMessage,
		userTitle: code === "invalid-argument" ? messages.actionErrorTitle : messages.internalErrorTitle
	});
}
/** Creates an immutable public state snapshot. */
function createState(phase, range, issues, displayedMonth, selectedDate) {
	return Object.freeze({
		displayedMonth: Object.freeze({ ...displayedMonth }),
		issues: Object.freeze([...issues]),
		phase,
		range: range === null ? null : Object.freeze({
			end: range.end,
			start: range.start
		}),
		selectedDate: Object.freeze({ ...selectedDate })
	});
}
/** Identifies a supported render-hook surface. */
function isRenderHookSurface(value) {
	return value === "day" || value === "grid-summary" || value === "agenda";
}
/** Returns whether an issue originated from the event-source pipeline. */
function isSourceIssue(entry) {
	return entry.issue.code === "event-source-failed" || entry.issue.code === "event-data-invalid" || entry.issue.code === "event-limit-exceeded";
}
/** Maps a public error code to its default operation phase. */
function phaseForCode(code) {
	switch (code) {
		case "invalid-configuration": return "configuration";
		case "invalid-argument": return "argument";
		case "invalid-state": return "state";
		case "event-source-failed": return "source";
		case "event-data-invalid":
		case "event-limit-exceeded": return "validation";
		case "extension-failed": return "integration";
		case "render-hook-failed": return "render";
		case "action-failed": return "action";
		case "host-integration-failed": return "integration";
		case "internal-error": return "render";
	}
}
/** Returns a sortable rank for public issue severity. */
function severityRank(severity) {
	switch (severity) {
		case "warning": return 1;
		case "error": return 2;
		case "fatal": return 3;
	}
}
//#endregion
//#region src/internal/dom/announcement.ts
/** Presents distinct announcements while leaving scheduling and generation ownership to the coordinator. */
var CalendarAnnouncementPresenter = class {
	elements;
	lastAnnouncement = null;
	constructor(elements) {
		this.elements = elements;
	}
	/** Clears both live regions and permits the same announcement to be presented again. */
	clear() {
		this.lastAnnouncement = null;
		this.clearRegions();
	}
	/** Clears the live regions and returns a commit for a distinct announcement. */
	prepare(announcement) {
		if (isSameAnnouncement(this.lastAnnouncement, announcement)) return null;
		const snapshot = Object.freeze({ ...announcement });
		this.lastAnnouncement = snapshot;
		this.clearRegions();
		return () => {
			const region = snapshot.politeness === "assertive" ? this.elements.assertiveLive : this.elements.politeLive;
			region.textContent = snapshot.message;
		};
	}
	clearRegions() {
		this.elements.politeLive.textContent = "";
		this.elements.assertiveLive.textContent = "";
	}
};
function isSameAnnouncement(previous, next) {
	return previous !== null && previous.message === next.message && previous.politeness === next.politeness;
}
//#endregion
//#region src/internal/dom/issue-region.ts
/** Updates the stable issue region without replacing its Retry control. */
function presentCalendarIssue(elements, presentation) {
	const { issue } = presentation;
	const showRetry = issue !== null && presentation.retryable;
	elements.panelActions.hidden = !showRetry;
	elements.retryButton.hidden = !showRetry;
	elements.retryButton.setAttribute("aria-disabled", presentation.retrying ? "true" : "false");
	elements.retryButton.textContent = presentation.retrying ? presentation.retryingText : presentation.retryText;
	if (issue === null) {
		clearIssue(elements);
		return;
	}
	elements.panel.hidden = false;
	elements.panel.setAttribute("data-lfc-code", issue.code);
	elements.panel.setAttribute("data-lfc-severity", issue.severity);
	elements.panelIcon.textContent = "!";
	elements.panelTitle.textContent = issue.title;
	elements.panelMessage.textContent = issue.message;
}
function clearIssue(elements) {
	elements.panel.hidden = true;
	elements.panel.removeAttribute("data-lfc-code");
	elements.panel.removeAttribute("data-lfc-severity");
	elements.panelIcon.textContent = "";
	elements.panelTitle.textContent = "";
	elements.panelMessage.textContent = "";
}
//#endregion
//#region src/internal/dom/month-picker.ts
/** Owns native Popover or dialog state, validation, synchronization, and focus restoration. */
var CalendarMonthPickerController = class {
	options;
	isOpen = false;
	restoreFocus = false;
	constructor(options) {
		this.options = options;
	}
	handleBeforeToggle = (event) => {
		if (event.newState !== "open" || event.defaultPrevented) return;
		const elements = this.options.getElements();
		if (!this.options.canContinue() || elements === null) {
			event.preventDefault();
			return;
		}
		this.sync(elements);
		this.isOpen = true;
		elements.titleButton.setAttribute("aria-expanded", "true");
		this.options.document.addEventListener("keydown", this.handleDocumentKeydown, true);
		this.options.document.defaultView?.setTimeout(() => {
			const currentElements = this.options.getElements();
			if (currentElements === null || !this.isPopoverOpen(currentElements)) this.finishClose();
		}, 0);
	};
	handleCancel = (event) => {
		if (event.defaultPrevented || !this.options.canContinue()) return;
		event.preventDefault();
		this.hide(true);
	};
	handleSubmit = (event) => {
		event.preventDefault();
		const elements = this.options.getElements();
		if (!this.options.canContinue() || elements === null) return;
		if (!elements.monthPickerForm.checkValidity()) {
			elements.monthPickerForm.reportValidity();
			return;
		}
		const month = Number.parseInt(elements.monthPickerMonth.value, 10);
		const year = elements.monthPickerYear.valueAsNumber;
		if (!Number.isInteger(month) || month < 1 || month > 12 || !Number.isInteger(year) || year < 1 || year > 9999) return;
		const target = this.options.resolveMonthTarget({
			day: 1,
			month,
			year
		}, this.options.getPreferredDay());
		if (target === null) return;
		const displayedMonth = this.options.getDisplayedMonth();
		const changesMonth = target.month !== displayedMonth.month || target.year !== displayedMonth.year;
		this.hide(true);
		if (changesMonth && this.options.canContinue()) this.options.onNavigate(target);
	};
	handleTitleClick = (event) => {
		const elements = this.options.getElements();
		if (event.defaultPrevented || !this.options.canContinue() || elements === null) {
			event.preventDefault();
			return;
		}
		event.preventDefault();
		if (this.isPopoverOpen(elements)) {
			this.hide(false);
			return;
		}
		try {
			if (isDialogPicker(elements.monthPicker)) {
				this.sync(elements);
				elements.monthPicker.showModal();
				this.handleToggle();
			} else elements.monthPicker.showPopover();
		} catch {
			this.finishClose();
		}
	};
	handleToggle = () => {
		const elements = this.options.getElements();
		if (elements !== null && this.isPopoverOpen(elements)) {
			const wasOpen = this.isOpen;
			this.isOpen = true;
			if (!this.options.canContinue()) {
				this.hide(false);
				return;
			}
			elements.titleButton.setAttribute("aria-expanded", "true");
			if (!wasOpen) this.sync(elements);
			this.options.document.addEventListener("keydown", this.handleDocumentKeydown, true);
			const active = this.options.document.activeElement;
			if (active === null || active === this.options.document.body || active === elements.titleButton) elements.monthPickerMonth.focus({ preventScroll: true });
			return;
		}
		this.finishClose();
	};
	handleYearInput = () => {
		const elements = this.options.getElements();
		if (elements !== null) this.updateMonthOptions(elements);
	};
	hide(restoreFocus) {
		const elements = this.options.getElements();
		if (elements === null) {
			this.finishClose();
			return;
		}
		if (!this.isPopoverOpen(elements)) {
			if (restoreFocus) {
				this.restoreFocus = true;
				this.finishClose();
			}
			return;
		}
		this.restoreFocus = this.restoreFocus || restoreFocus;
		let hideFailed = false;
		try {
			if (isDialogPicker(elements.monthPicker)) elements.monthPicker.close();
			else elements.monthPicker.hidePopover();
		} catch {
			hideFailed = true;
		}
		if (!hideFailed && this.isPopoverOpen(elements)) {
			this.restoreFocus = false;
			return;
		}
		this.finishClose();
	}
	sync(elements) {
		const displayedMonth = this.options.getDisplayedMonth();
		elements.monthPickerYear.value = displayedMonth.year.toString();
		elements.monthPickerMonth.value = displayedMonth.month.toString();
		this.updateMonthOptions(elements);
	}
	updateMonthOptions(elements) {
		const year = elements.monthPickerYear.valueAsNumber;
		const validYear = Number.isInteger(year) && year >= 1 && year <= 9999;
		for (const option of elements.monthPickerMonth.options) {
			const month = Number.parseInt(option.value, 10);
			option.disabled = !validYear || !this.options.isMonthAllowed({
				day: 1,
				month,
				year
			});
		}
		const selected = elements.monthPickerMonth.selectedOptions[0];
		if (selected?.disabled !== true) return;
		const selectedMonth = Number.parseInt(selected.value, 10);
		const nearest = [...elements.monthPickerMonth.options].filter((option) => !option.disabled).reduce((candidate, option) => {
			if (candidate === null) return option;
			const candidateDistance = Math.abs(Number.parseInt(candidate.value, 10) - selectedMonth);
			return Math.abs(Number.parseInt(option.value, 10) - selectedMonth) < candidateDistance ? option : candidate;
		}, null);
		if (nearest !== null) elements.monthPickerMonth.value = nearest.value;
	}
	finishClose() {
		const shouldRestoreFocus = this.restoreFocus;
		this.restoreFocus = false;
		this.isOpen = false;
		this.options.document.removeEventListener("keydown", this.handleDocumentKeydown, true);
		const titleButton = this.options.getElements()?.titleButton;
		titleButton?.setAttribute("aria-expanded", "false");
		if (shouldRestoreFocus && titleButton !== void 0 && this.options.canContinue() && titleButton.isConnected) titleButton.focus({ preventScroll: true });
	}
	isPopoverOpen(elements) {
		if (isDialogPicker(elements.monthPicker)) return elements.monthPicker.open;
		try {
			return elements.monthPicker.matches(":popover-open");
		} catch {
			return this.isOpen;
		}
	}
	handleDocumentKeydown = (event) => {
		if (event.key !== "Escape" || event.defaultPrevented || !this.isOpen) return;
		event.preventDefault();
		this.hide(true);
	};
};
/** Creates the semantic month heading, native trigger, and light-dismiss picker form. */
function createCalendarMonthPicker(options) {
	const title = createHeading$1(options.document, options.headingLevel);
	title.className = "lfc-calendar-title";
	title.id = `${options.instanceName}-title`;
	const titleButton = options.document.createElement("button");
	titleButton.className = "lfc-calendar-title-button";
	titleButton.type = "button";
	const monthPickerId = `${options.instanceName}-month-picker`;
	titleButton.setAttribute("aria-controls", monthPickerId);
	titleButton.setAttribute("aria-expanded", "false");
	titleButton.setAttribute("aria-haspopup", "dialog");
	titleButton.addEventListener("click", options.onTitleClick);
	const titleLabel = options.document.createElement("span");
	titleLabel.className = "lfc-calendar-title-label";
	titleLabel.id = `${options.instanceName}-month-label`;
	titleLabel.setAttribute("aria-atomic", "true");
	titleLabel.setAttribute("aria-live", "polite");
	const titleLabelFull = options.document.createElement("span");
	titleLabelFull.className = "lfc-calendar-title-label-full";
	const titleLabelCompact = options.document.createElement("span");
	titleLabelCompact.className = "lfc-calendar-title-label-compact";
	titleLabelCompact.setAttribute("aria-hidden", "true");
	titleLabel.append(titleLabelFull, titleLabelCompact);
	titleButton.append(titleLabel);
	title.append(titleButton);
	const supportsPopover = typeof titleButton.showPopover === "function" && typeof titleButton.hidePopover === "function";
	const monthPicker = options.document.createElement(supportsPopover ? "div" : "dialog");
	monthPicker.className = "lfc-calendar-month-picker";
	monthPicker.id = monthPickerId;
	monthPicker.setAttribute("aria-labelledby", `${options.instanceName}-month-picker-title`);
	if (supportsPopover) {
		monthPicker.setAttribute("popover", "auto");
		titleButton.setAttribute("popovertarget", monthPickerId);
	} else if (isDialogPicker(monthPicker)) {
		monthPicker.setAttribute("aria-modal", "true");
		if (Reflect.has(monthPicker, "closedBy")) monthPicker.setAttribute("closedby", "any");
		monthPicker.addEventListener("cancel", options.onCancel);
		monthPicker.addEventListener("close", options.onToggle);
		installDialogLightDismiss(monthPicker, options.onCancel);
	}
	monthPicker.setAttribute("role", "dialog");
	const monthPickerTitle = createHeading$1(options.document, Math.min(6, options.headingLevel + 1));
	monthPickerTitle.className = "lfc-calendar-month-picker-title";
	monthPickerTitle.id = `${options.instanceName}-month-picker-title`;
	monthPickerTitle.textContent = options.messages.jumpToMonthYear;
	const monthPickerForm = options.document.createElement("form");
	monthPickerForm.className = "lfc-calendar-month-picker-form";
	const monthPickerFields = options.document.createElement("div");
	monthPickerFields.className = "lfc-calendar-month-picker-fields";
	const monthLabel = options.document.createElement("label");
	monthLabel.className = "lfc-calendar-month-picker-field";
	monthLabel.htmlFor = `${options.instanceName}-month-picker-month`;
	const monthLabelText = options.document.createElement("span");
	monthLabelText.textContent = options.messages.month;
	const monthPickerMonth = options.document.createElement("select");
	monthPickerMonth.id = monthLabel.htmlFor;
	monthPickerMonth.autofocus = true;
	monthPickerMonth.name = "month";
	monthPickerMonth.required = true;
	for (let month = 1; month <= 12; month += 1) {
		const option = options.document.createElement("option");
		option.value = month.toString();
		option.textContent = options.monthNameFormatter.format(toUtcDate({
			day: 1,
			month,
			year: 2e3
		}));
		monthPickerMonth.append(option);
	}
	monthLabel.append(monthLabelText, monthPickerMonth);
	const yearLabel = options.document.createElement("label");
	yearLabel.className = "lfc-calendar-month-picker-field";
	yearLabel.htmlFor = `${options.instanceName}-month-picker-year`;
	const yearLabelText = options.document.createElement("span");
	yearLabelText.textContent = options.messages.year;
	const monthPickerYear = options.document.createElement("input");
	monthPickerYear.id = yearLabel.htmlFor;
	monthPickerYear.inputMode = "numeric";
	monthPickerYear.max = options.maxYear.toString();
	monthPickerYear.min = options.minYear.toString();
	monthPickerYear.name = "year";
	monthPickerYear.required = true;
	monthPickerYear.step = "1";
	monthPickerYear.type = "number";
	yearLabel.append(yearLabelText, monthPickerYear);
	monthPickerFields.append(monthLabel, yearLabel);
	const monthPickerActions = options.document.createElement("div");
	monthPickerActions.className = "lfc-calendar-month-picker-actions";
	const jumpButton = options.document.createElement("button");
	jumpButton.className = "lfc-calendar-month-picker-jump";
	jumpButton.type = "submit";
	jumpButton.textContent = options.messages.jump;
	const monthPickerCancelButton = options.document.createElement("button");
	monthPickerCancelButton.className = "lfc-calendar-month-picker-cancel";
	monthPickerCancelButton.type = "button";
	if (supportsPopover) {
		monthPickerCancelButton.setAttribute("popovertarget", monthPickerId);
		monthPickerCancelButton.setAttribute("popovertargetaction", "hide");
	}
	monthPickerCancelButton.textContent = options.messages.cancel;
	monthPickerCancelButton.addEventListener("click", options.onCancel);
	monthPickerActions.append(jumpButton, monthPickerCancelButton);
	monthPickerForm.append(monthPickerFields, monthPickerActions);
	monthPickerForm.addEventListener("submit", options.onSubmit);
	monthPickerYear.addEventListener("input", options.onYearInput);
	monthPicker.addEventListener("beforetoggle", options.onBeforeToggle);
	monthPicker.addEventListener("toggle", options.onToggle);
	monthPicker.append(monthPickerTitle, monthPickerForm);
	return Object.freeze({
		monthPicker,
		monthPickerCancelButton,
		monthPickerForm,
		monthPickerMonth,
		monthPickerYear,
		title,
		titleButton,
		titleLabel,
		titleLabelCompact,
		titleLabelFull
	});
}
function createHeading$1(document, level) {
	return document.createElement(`h${level.toString()}`);
}
function isDialogPicker(picker) {
	return picker.localName === "dialog";
}
function installDialogLightDismiss(picker, onCancel) {
	if (Reflect.has(picker, "closedBy")) return;
	let pressedBackdrop = false;
	const isBackdrop = (event) => {
		if (event.target !== picker) return false;
		const rect = picker.getBoundingClientRect();
		return event.clientX < rect.left || event.clientX > rect.right || event.clientY < rect.top || event.clientY > rect.bottom;
	};
	picker.addEventListener("pointerdown", (event) => {
		pressedBackdrop = isBackdrop(event);
	});
	picker.addEventListener("pointercancel", () => {
		pressedBackdrop = false;
	});
	picker.addEventListener("click", (event) => {
		if (pressedBackdrop && isBackdrop(event)) onCancel(event);
		pressedBackdrop = false;
	});
}
//#endregion
//#region src/internal/dom/structure.ts
/** Creates the stable toolbar, status, grid, and agenda structure. */
function createCalendarStructure(layoutOptions, options) {
	options.integrationParents.clear();
	const toolbar = options.document.createElement("div");
	toolbar.className = "lfc-calendar-toolbar";
	const picker = createCalendarMonthPicker({
		document: options.document,
		headingLevel: options.headingLevel,
		instanceName: options.instanceName,
		maxYear: options.maxYear,
		messages: options.messages,
		minYear: options.minYear,
		monthNameFormatter: options.monthNameFormatter,
		onBeforeToggle: options.onMonthPickerBeforeToggle,
		onCancel: options.onMonthPickerCancel,
		onSubmit: options.onMonthPickerSubmit,
		onTitleClick: options.onMonthPickerTitleClick,
		onToggle: options.onMonthPickerToggle,
		onYearInput: options.onMonthPickerYearInput
	});
	const navigation = options.document.createElement("div");
	navigation.className = "lfc-calendar-navigation";
	navigation.setAttribute("aria-label", options.messages.navigation);
	navigation.setAttribute("role", "group");
	const previousButton = createNavigationButton(options, "previous");
	const nextButton = createNavigationButton(options, "next");
	const monthStepper = options.document.createElement("div");
	monthStepper.className = "lfc-calendar-month-stepper";
	monthStepper.append(previousButton, nextButton);
	const todayButton = options.document.createElement("button");
	todayButton.className = "lfc-calendar-nav-button lfc-calendar-today-button";
	todayButton.type = "button";
	todayButton.textContent = options.messages.today;
	todayButton.addEventListener("click", options.onToday);
	navigation.append(monthStepper, picker.title, todayButton);
	toolbar.append(navigation, picker.monthPicker);
	appendToolbarEnd(options, toolbar);
	const statusArea = options.document.createElement("div");
	statusArea.className = "lfc-calendar-status-area";
	const panel = options.document.createElement("div");
	panel.className = "lfc-calendar-status-panel";
	panel.hidden = true;
	const panelIcon = options.document.createElement("span");
	panelIcon.className = "lfc-calendar-status-icon";
	panelIcon.setAttribute("aria-hidden", "true");
	const panelTitle = createHeading(options.document, Math.min(6, options.headingLevel + 1));
	panelTitle.className = "lfc-calendar-status-title";
	const panelMessage = options.document.createElement("p");
	panelMessage.className = "lfc-calendar-status-message";
	const panelActions = options.document.createElement("div");
	panelActions.className = "lfc-calendar-status-actions";
	const retryButton = options.document.createElement("button");
	retryButton.className = "lfc-calendar-retry";
	retryButton.type = "button";
	retryButton.textContent = options.messages.retry;
	retryButton.addEventListener("click", options.onRetry);
	panelActions.append(retryButton);
	panel.append(panelIcon, panelTitle, panelMessage, panelActions);
	const politeLive = createLiveRegion(options.document, "polite", "status");
	politeLive.className = "lfc-visually-hidden lfc-calendar-live-polite";
	const assertiveLive = createLiveRegion(options.document, "assertive", "alert");
	assertiveLive.className = "lfc-visually-hidden lfc-calendar-live-assertive";
	const gridInstructions = options.document.createElement("p");
	gridInstructions.className = "lfc-visually-hidden lfc-calendar-grid-instructions";
	gridInstructions.id = `${options.instanceName}-grid-instructions`;
	gridInstructions.textContent = options.messages.gridEventInstructions;
	statusArea.append(panel, politeLive, assertiveLive, gridInstructions);
	const weekdays = options.document.createElement("div");
	weekdays.className = "lfc-calendar-weekdays";
	weekdays.setAttribute("role", "row");
	const weeks = options.document.createElement("div");
	weeks.className = "lfc-calendar-weeks";
	weeks.setAttribute("data-lfc-grid-event-placement", layoutOptions.gridEventPlacement);
	weeks.setAttribute("data-lfc-week-row-sizing", layoutOptions.weekRowSizing);
	weeks.setAttribute("role", "rowgroup");
	const grid = options.document.createElement("div");
	grid.className = "lfc-calendar-grid";
	grid.setAttribute("aria-labelledby", picker.titleLabel.id);
	grid.setAttribute("aria-readonly", "true");
	grid.setAttribute("role", "grid");
	const describedBy = options.host.getAttribute("aria-describedby")?.trim().split(/\s+/u).filter((identifier) => identifier.length > 0) ?? [];
	grid.setAttribute("aria-describedby", [.../* @__PURE__ */ new Set([...describedBy, gridInstructions.id])].join(" "));
	grid.append(weekdays, weeks);
	const { lane: previousLane, label: previousLaneLabel, labelCompact: previousLaneLabelCompact, labelFull: previousLaneLabelFull } = createPagingLane(options.document, "previous");
	const { lane: nextLane, label: nextLaneLabel, labelCompact: nextLaneLabelCompact, labelFull: nextLaneLabelFull } = createPagingLane(options.document, "next");
	const swipeViewport = options.document.createElement("div");
	swipeViewport.className = "lfc-calendar-swipe-viewport";
	swipeViewport.tabIndex = -1;
	swipeViewport.append(previousLane, grid, nextLane);
	const agenda = options.document.createElement("section");
	agenda.className = "lfc-calendar-agenda";
	const agendaTitle = createHeading(options.document, Math.min(6, options.headingLevel + 1));
	agendaTitle.className = "lfc-calendar-agenda-title";
	agendaTitle.id = `${options.instanceName}-agenda-title`;
	agendaTitle.tabIndex = -1;
	const agendaList = options.document.createElement("ol");
	agendaList.className = "lfc-calendar-agenda-list";
	agendaList.setAttribute("role", "list");
	const agendaFooter = options.document.createElement("div");
	agendaFooter.className = "lfc-calendar-agenda-footer";
	agenda.setAttribute("aria-labelledby", agendaTitle.id);
	agenda.append(agendaTitle, agendaList, agendaFooter);
	options.host.replaceChildren(toolbar, statusArea, swipeViewport, agenda);
	return Object.freeze({
		agenda,
		agendaFooter,
		agendaList,
		agendaTitle,
		assertiveLive,
		grid,
		gridInstructions,
		...picker,
		monthStepper,
		navigation,
		nextLane,
		nextLaneLabel,
		nextLaneLabelCompact,
		nextLaneLabelFull,
		nextButton,
		panel,
		panelActions,
		panelIcon,
		panelMessage,
		panelTitle,
		politeLive,
		previousLane,
		previousLaneLabel,
		previousLaneLabelCompact,
		previousLaneLabelFull,
		previousButton,
		retryButton,
		statusArea,
		swipeViewport,
		todayButton,
		toolbar,
		weekdays,
		weeks
	});
}
function createPagingLane(document, direction) {
	const lane = document.createElement("div");
	lane.className = `lfc-calendar-swipe-lane lfc-calendar-swipe-lane-${direction}`;
	lane.setAttribute("aria-hidden", "true");
	const content = document.createElement("span");
	content.className = "lfc-calendar-swipe-lane-content";
	const icon = document.createElement("span");
	icon.className = "lfc-calendar-swipe-lane-icon";
	icon.dir = "ltr";
	icon.textContent = direction === "previous" ? "‹" : "›";
	const label = document.createElement("span");
	label.className = "lfc-calendar-swipe-lane-label";
	const labelFull = document.createElement("span");
	labelFull.className = "lfc-calendar-swipe-lane-label-full";
	const labelCompact = document.createElement("span");
	labelCompact.className = "lfc-calendar-swipe-lane-label-compact";
	label.append(labelFull, labelCompact);
	content.append(icon, label);
	lane.append(content);
	return Object.freeze({
		label,
		labelCompact,
		labelFull,
		lane
	});
}
function createNavigationButton(options, direction) {
	const button = options.document.createElement("button");
	button.className = `lfc-calendar-nav-button lfc-calendar-nav-button-${direction}`;
	button.type = "button";
	button.setAttribute("aria-label", options.messages[direction]);
	const icon = options.iconNodes[direction];
	button.append(icon);
	if (icon.parentNode === button) options.integrationParents.set(icon, button);
	button.addEventListener("click", () => {
		options.onNavigate(direction);
	});
	return button;
}
function appendToolbarEnd(options, toolbar) {
	if (options.toolbarEnd === null) return;
	const toolbarEnd = options.document.createElement("div");
	toolbarEnd.className = "lfc-calendar-toolbar-end";
	toolbarEnd.append(options.toolbarEnd);
	if (options.toolbarEnd.parentNode === toolbarEnd) options.integrationParents.set(options.toolbarEnd, toolbarEnd);
	toolbar.append(toolbarEnd);
}
function createHeading(document, level) {
	return document.createElement(`h${level.toString()}`);
}
function createLiveRegion(document, politeness, role) {
	const region = document.createElement("p");
	region.setAttribute("aria-atomic", "true");
	region.setAttribute("aria-live", politeness);
	region.setAttribute("role", role);
	return region;
}
//#endregion
//#region src/internal/dom/palette.ts
/** Mirrors inherited palette and direction only when their native CSS features are unavailable. */
var CalendarPalette = class {
	host;
	window;
	needsDirectionFallback;
	preference;
	observer;
	connectionObserver;
	disconnected = false;
	constructor(host, window) {
		this.host = host;
		this.window = window;
		const needsPaletteFallback = typeof window?.CSS === "object" && !window.CSS.supports("color", "light-dark(white, black)");
		this.needsDirectionFallback = typeof window?.CSS === "object" && !window.CSS.supports("selector(:dir(rtl))");
		const needsFallback = window !== null && (needsPaletteFallback || this.needsDirectionFallback);
		this.preference = needsPaletteFallback ? window.matchMedia("(prefers-color-scheme: dark)") : null;
		this.observer = needsFallback ? new window.MutationObserver(this.handleMutation) : null;
		this.connectionObserver = needsFallback ? new window.MutationObserver(this.handleConnection) : null;
		if (needsFallback) {
			this.observeAncestors();
			this.preference?.addEventListener("change", this.sync);
			host.ownerDocument.addEventListener("load", this.sync, true);
			this.sync();
		}
	}
	/** Releases listeners and removes only package-owned fallback state. */
	disconnect() {
		this.disconnected = true;
		this.observer?.disconnect();
		this.connectionObserver?.disconnect();
		this.preference?.removeEventListener("change", this.sync);
		this.host.ownerDocument.removeEventListener("load", this.sync, true);
		this.host.classList.remove("lfc-palette-light", "lfc-palette-dark");
		this.host.removeAttribute("data-lfc-direction");
	}
	observeAncestors() {
		this.observer?.disconnect();
		this.connectionObserver?.disconnect();
		for (let ancestor = this.host; ancestor !== null; ancestor = ancestor.parentElement) {
			const observesAutomaticDirection = this.needsDirectionFallback && ancestor.dir === "auto";
			this.observer?.observe(ancestor, {
				attributes: true,
				childList: true,
				...observesAutomaticDirection ? {
					characterData: true,
					subtree: true
				} : {}
			});
		}
		if (!this.host.isConnected) this.connectionObserver?.observe(this.host.ownerDocument, {
			childList: true,
			subtree: true
		});
	}
	handleMutation = (records) => {
		if (this.disconnected) return;
		if (records.some((record) => record.type === "childList" || this.needsDirectionFallback && record.attributeName === "dir")) this.observeAncestors();
		this.sync();
	};
	handleConnection = () => {
		if (!this.disconnected && this.host.isConnected) {
			this.observeAncestors();
			this.sync();
		}
	};
	sync = () => {
		if (this.disconnected || this.window === null) return;
		const style = this.window.getComputedStyle(this.host);
		if (this.preference !== null) {
			const schemes = style.colorScheme.split(/\s+/u);
			const dark = schemes.includes("dark") && (!schemes.includes("light") || this.preference.matches);
			for (const [name, enabled] of [["lfc-palette-dark", dark], ["lfc-palette-light", !dark]]) if (this.host.classList.contains(name) !== enabled) this.host.classList.toggle(name, enabled);
		}
		if (this.needsDirectionFallback) {
			const direction = style.direction === "rtl" ? "rtl" : "ltr";
			if (this.host.getAttribute("data-lfc-direction") !== direction) this.host.setAttribute("data-lfc-direction", direction);
		}
	};
};
//#endregion
//#region src/messages.ts
/** Immutable English defaults used when an application does not override a message. */
var DEFAULT_CALENDAR_MESSAGES = Object.freeze({
	actionErrorMessage: "The action could not be completed. Try again.",
	actionErrorTitle: "Action failed",
	agendaEmpty: "No events",
	agendaMore: "Show {count} more",
	agendaProgress: "Showing {visible} of {total} events",
	agendaTitle: "Events for {date}",
	allDay: "All day",
	cancel: "Cancel",
	chooseMonthYear: "Choose month and year, currently {date}",
	dayLabel: "{date}, {count} {eventLabel}",
	event: "event",
	events: "events",
	renderHookErrorMessage: "Some calendar details could not be displayed.",
	renderHookErrorTitle: "Some details are unavailable",
	gridMore: "{count} more",
	gridEventCount: "{count} {eventLabel}",
	gridEventCountLabel: "View {count} {eventLabel} for {date}",
	gridEventInstructions: "Use arrow keys to move between dates and Enter or Space to select. Press F2 on a date to move to its visible event actions; use Up and Down Arrow between actions, and Escape or F2 to return.",
	gridMoreLabel: "View {count} more {eventLabel} for {date}",
	internalErrorMessage: "The calendar encountered an unexpected error.",
	internalErrorTitle: "Calendar unavailable",
	jump: "Jump",
	jumpToMonthYear: "Jump to month and year",
	loadErrorMessage: "Events could not be loaded. Try again.",
	loadErrorTitle: "Calendar unavailable",
	month: "Month",
	navigation: "Calendar navigation",
	next: "Next month",
	previous: "Previous month",
	recovered: "Calendar updated",
	refreshErrorMessage: "The displayed events may be out of date. Try again.",
	refreshErrorTitle: "Calendar may be out of date",
	retry: "Retry",
	retrying: "Retrying",
	today: "Today",
	year: "Year"
});
/** Substitutes the documented tokens in one calendar message template. */
function formatCalendarMessage(template, values) {
	const replacements = {
		count: values.count?.toString() ?? "",
		date: values.date ?? "",
		eventLabel: values.eventLabel ?? "",
		total: values.total?.toString() ?? "",
		visible: values.visible?.toString() ?? ""
	};
	return template.replace(/\{(count|date|eventLabel|total|visible)\}/g, (_match, token) => replacements[token] ?? "");
}
//#endregion
//#region src/internal/dom/month-title.ts
/** Formats and renders one canonical month title plus an aria-hidden compact presentation. */
var CalendarMonthTitleRenderer = class {
	compactFormatter;
	fullFormatter;
	triggerLabelTemplate;
	constructor(options) {
		this.triggerLabelTemplate = options.chooseMonthYear;
		this.fullFormatter = new Intl.DateTimeFormat(options.locale, {
			calendar: "gregory",
			month: "long",
			timeZone: "UTC",
			year: "numeric"
		});
		this.compactFormatter = new Intl.DateTimeFormat(options.locale, {
			calendar: "gregory",
			month: "short",
			timeZone: "UTC",
			year: "numeric"
		});
	}
	/** Returns the complete localized month-and-year label used by nonvisual consumers. */
	formatFull(month) {
		return this.fullFormatter.format(toUtcDate(month));
	}
	/** Returns the abbreviated localized month and complete numeric year used by compact visuals. */
	formatCompact(month) {
		return this.compactFormatter.format(toUtcDate(month));
	}
	/** Updates the title only when a value changed, avoiding redundant live-region announcements. */
	render(elements, month) {
		const date = toUtcDate(month);
		const fullTitle = this.fullFormatter.format(date);
		const compactTitle = this.compactFormatter.format(date);
		setTextContent(elements.titleLabelFull, fullTitle);
		setTextContent(elements.titleLabelCompact, compactTitle);
		setAccessibleLabel(elements.titleButton, formatCalendarMessage(this.triggerLabelTemplate, { date: fullTitle }));
	}
};
function setAccessibleLabel(element, value) {
	if (element.getAttribute("aria-label") !== value) element.setAttribute("aria-label", value);
}
function setTextContent(element, value) {
	if (element.textContent !== value) element.textContent = value;
}
//#endregion
//#region src/internal/dom/agenda.ts
/** Creates agenda list and footer content without mutating the stable agenda shell. */
function createAgendaPresentation(input) {
	if (!input.hasSnapshot) return freezePresentation(input.titleText, true, [], [], [], null);
	if (input.totalEventCount === 0) {
		const empty = input.document.createElement("p");
		empty.className = "lfc-calendar-agenda-empty";
		empty.textContent = input.emptyText;
		return freezePresentation(input.titleText, true, [], [empty], [], null);
	}
	const listItems = [];
	const actionReferences = [];
	for (const entry of input.entries) {
		const item = input.document.createElement("li");
		item.className = "lfc-calendar-agenda-item";
		item.append(entry.root);
		listItems.push(item);
		if (entry.action !== null) actionReferences.push(Object.freeze({
			action: entry.action,
			eventId: entry.eventId
		}));
	}
	const footerChildren = [];
	let moreButton = null;
	if (input.moreText !== null) {
		moreButton = input.document.createElement("button");
		moreButton.className = "lfc-calendar-agenda-more";
		moreButton.type = "button";
		moreButton.textContent = input.moreText;
		footerChildren.push(moreButton);
	}
	if (input.progressText !== null) {
		const progress = input.document.createElement("p");
		progress.className = "lfc-calendar-agenda-overflow";
		progress.textContent = input.progressText;
		footerChildren.push(progress);
	}
	return freezePresentation(input.titleText, false, listItems, footerChildren, actionReferences, moreButton);
}
function freezePresentation(titleText, listHidden, listItems, footerChildren, actionReferences, moreButton) {
	return Object.freeze({
		actionReferences: Object.freeze(actionReferences),
		footerChildren: Object.freeze(footerChildren),
		listHidden,
		listItems: Object.freeze(listItems),
		moreButton,
		titleText
	});
}
//#endregion
//#region src/internal/dom/event-structure.ts
/** Wires native event controls while leaving action transactions with the coordinator. */
function installEventActionListeners(options) {
	const { action, isCurrent, onActivate, onContext, onGridKeydown } = options;
	const shortcuts = [...options.surface === "grid-summary" ? ["F2"] : [], ...options.hasContextAction ? ["Shift+F10"] : []];
	if (shortcuts.length > 0) action.setAttribute("aria-keyshortcuts", shortcuts.join(" "));
	action.addEventListener("click", (nativeEvent) => {
		if (!isCurrent()) {
			nativeEvent.preventDefault();
			nativeEvent.stopImmediatePropagation();
			return;
		}
		if (onActivate !== null) {
			onActivate(nativeEvent);
			return;
		}
		if (action.tagName === "BUTTON" && onContext !== null) {
			const mouseEvent = nativeEvent;
			onContext(mouseEvent, mouseEvent.clientX, mouseEvent.clientY);
		}
	});
	if (onGridKeydown !== null || onContext !== null) action.addEventListener("keydown", (event) => {
		const nativeEvent = event;
		onGridKeydown?.(nativeEvent);
		if (onContext === null || !isContextMenuKey(nativeEvent)) return;
		nativeEvent.preventDefault();
		if (isCurrent()) {
			const bounds = action.getBoundingClientRect();
			onContext(nativeEvent, bounds.left, bounds.bottom);
		}
	});
	if (onContext === null) return;
	action.addEventListener("contextmenu", (event) => {
		const nativeEvent = event;
		if (!isCurrent()) {
			nativeEvent.preventDefault();
			return;
		}
		if (!nativeEvent.defaultPrevented) {
			nativeEvent.preventDefault();
			onContext(nativeEvent, nativeEvent.clientX, nativeEvent.clientY);
		}
	});
}
function isContextMenuKey(event) {
	return event.key === "ContextMenu" || event.shiftKey && event.key === "F10";
}
//#endregion
//#region src/internal/dom/event-representation.ts
/** Creates a complete native event representation without invoking application code. */
function createEventRepresentation(input) {
	const event = input.event.event;
	const isLink = event.url !== null;
	const isActionable = isLink || input.hasApplicationAction;
	const root = input.document.createElement(isLink ? "a" : isActionable ? "button" : input.surface === "agenda" ? "div" : "span");
	root.className = input.surface === "agenda" ? "lfc-calendar-agenda-event" : "lfc-calendar-event-summary";
	root.setAttribute("data-lfc-date", input.dateString);
	root.setAttribute("data-lfc-event-id", event.id);
	root.setAttribute("data-lfc-surface", input.surface);
	const action = isActionable ? root : null;
	if (action !== null) {
		action.classList.add("lfc-calendar-event-button");
		if (action.tagName === "BUTTON") action.type = "button";
		else if (event.url !== null) action.href = event.url;
		if (input.surface === "grid-summary") {
			action.tabIndex = -1;
			action.setAttribute("aria-label", input.accessibleLabel);
		}
	}
	const leading = input.document.createElement("span");
	leading.className = "lfc-calendar-event-leading";
	const marker = input.document.createElement("span");
	marker.className = "lfc-calendar-event-marker";
	const leadingContent = input.document.createElement("span");
	leadingContent.className = "lfc-calendar-event-leading-content";
	leading.append(marker, leadingContent);
	const time = input.document.createElement("time");
	Object.assign(time, {
		className: "lfc-calendar-time",
		dateTime: event.start,
		dir: "auto",
		textContent: input.timeText
	});
	if (isTimeVisuallyHidden(input.timeDisplay, input.surface)) time.classList.add("lfc-visually-hidden");
	const title = input.document.createElement("span");
	Object.assign(title, {
		className: "lfc-calendar-event-title",
		dir: "auto",
		textContent: event.title
	});
	const details = input.document.createElement("span");
	details.className = "lfc-calendar-event-details";
	const trailing = input.document.createElement("span");
	trailing.className = "lfc-calendar-event-trailing";
	root.append(leading, time, title, details, trailing);
	return Object.freeze({
		elements: Object.freeze({
			action,
			details,
			leading,
			marker,
			root,
			time,
			title,
			trailing
		}),
		slots: Object.freeze({ leadingContent })
	});
}
function isTimeVisuallyHidden(timeDisplay, surface) {
	return timeDisplay === "none" || timeDisplay === "grid" && surface === "agenda" || timeDisplay === "agenda" && surface === "grid-summary";
}
//#endregion
//#region src/internal/dom/event-text.ts
/** Localized text and accessible names shared by native event representations. */
var CalendarEventText = class {
	locale;
	fullDateFormatter;
	messages;
	numberFormatter;
	timeFormatter = null;
	constructor(locale, fullDateFormatter, messages, numberFormatter) {
		this.locale = locale;
		this.fullDateFormatter = fullDateFormatter;
		this.messages = messages;
		this.numberFormatter = numberFormatter;
	}
	formatFullDate(date) {
		return this.fullDateFormatter.format(toUtcDate(date));
	}
	getEventTimeText(event, date) {
		if (event.event.isAllDay) return this.messages.allDay;
		return compareCalendarDates(date, event.startDateTime) === 0 ? this.getTimeFormatter().format(toUtcDateTime(event.startDateTime)) : "";
	}
	getDayAccessibleLabel(fullDateText, eventCount) {
		return formatCalendarMessage(this.messages.dayLabel, {
			count: this.numberFormatter.format(eventCount),
			date: fullDateText,
			eventLabel: eventCount === 1 ? this.messages.event : this.messages.events
		});
	}
	getEventAccessibleLabel(event, timeText, fullDateText) {
		return [
			event.event.title,
			timeText,
			fullDateText
		].filter((part) => part.length > 0).join(", ");
	}
	getTimeFormatter() {
		this.timeFormatter ??= new Intl.DateTimeFormat(this.locale, {
			calendar: "gregory",
			hour: "numeric",
			minute: "2-digit",
			timeZone: "UTC"
		});
		return this.timeFormatter;
	}
};
//#endregion
//#region src/internal/dom/event-accent.ts
/** Creates the built-in decorative accent used by event representations. */
function createEventAccent(document, accentColor) {
	const namespace = "http://www.w3.org/2000/svg";
	const marker = document.createElementNS(namespace, "svg");
	marker.classList.add("lfc-calendar-event-accent");
	marker.setAttribute("aria-hidden", "true");
	marker.setAttribute("focusable", "false");
	marker.setAttribute("viewBox", "0 0 8 8");
	const shape = document.createElementNS(namespace, "circle");
	shape.classList.add("lfc-calendar-event-accent-shape");
	shape.setAttribute("cx", "4");
	shape.setAttribute("cy", "4");
	shape.setAttribute("r", "4");
	if (accentColor === null) marker.classList.add("lfc-uses-token");
	else shape.setAttribute("fill", accentColor);
	marker.append(shape);
	return marker;
}
//#endregion
//#region src/internal/dom/environment.ts
/** Resolves the host's effective text direction with a non-window fallback. */
function resolveTextDirection(window, host) {
	if (window !== null && typeof window.getComputedStyle === "function") return window.getComputedStyle(host).direction === "rtl" ? "rtl" : "ltr";
	return host.closest("[dir]")?.getAttribute("dir")?.toLowerCase() === "rtl" ? "rtl" : "ltr";
}
//#endregion
//#region src/internal/dom/grid-focus.ts
/** Creates a collision-safe identity for one rendered event occurrence. */
function getEventActionKey(surface, dateString, eventId) {
	return JSON.stringify([
		surface,
		dateString,
		eventId
	]);
}
/** Tests a known target in its own document or shadow tree, without realm assumptions. */
function hasElementFocus(element) {
	const root = element.getRootNode();
	return "activeElement" in root && root.activeElement === element;
}
/** Returns focus only when it is still owned by this calendar host. */
function getOwnedActiveElement(document, host) {
	const active = document.activeElement;
	return active !== null && host.contains(active) ? active : null;
}
/** Returns whether a previously owned focus target was detached from this host. */
function wasOwnedFocusRemoved(active, host) {
	return active !== null && (!active.isConnected || !host.contains(active));
}
/** Returns whether an action accepted focus while retaining the day proxy as the grid tab stop. */
function enterGridActions(dateString, elements, host) {
	const actions = elements.gridActionsByDate.get(dateString) ?? [];
	setDayProxyTabStop(dateString, elements);
	return focusFirstEligible(actions, host);
}
/** Handles action-mode movement and returns whether the key was consumed. */
function handleGridActionKeydown(event, dateString, action, elements, host, agendaTitle) {
	const actions = (elements.gridActionsByDate.get(dateString) ?? []).filter((candidate) => candidate.isConnected && host.contains(candidate));
	const actionIndex = actions.indexOf(action);
	if (actionIndex < 0 || !action.isConnected || !host.contains(action)) return false;
	if (event.key === "Escape" || event.key === "F2") {
		event.preventDefault();
		leaveGridActions(dateString, true, elements);
		return true;
	}
	if (event.key === "Tab") {
		event.preventDefault();
		leaveGridActions(dateString, event.shiftKey, elements);
		if (!event.shiftKey) agendaTitle?.focus({ preventScroll: true });
		return true;
	}
	if (event.key !== "ArrowUp" && event.key !== "ArrowDown") return false;
	event.preventDefault();
	focusFirstEligible(event.key === "ArrowDown" ? actions.slice(actionIndex + 1) : actions.slice(0, actionIndex).reverse(), host);
	return true;
}
/** Restores the managed grid tab stop to a day proxy. */
function leaveGridActions(dateString, focusDay, elements) {
	setDayProxyTabStop(dateString, elements);
	if (focusDay) elements.dayButtons.get(dateString)?.focus({ preventScroll: true });
}
/** Captures package-owned focus without retaining a stale element. */
function captureCalendarFocus(active, host, dom, elements) {
	if (dom === null || active === null || !host.contains(active)) return null;
	const stableToken = captureStableFocus(active, dom);
	if (stableToken !== null) return stableToken;
	for (const [date, button] of elements.dayButtons) if (active === button) return {
		date,
		kind: "day"
	};
	const eventToken = captureEventFocus(active, elements.eventActions);
	if (eventToken !== null) return eventToken;
	for (const [date, button] of elements.gridMoreButtons) if (active === button) return {
		date,
		kind: "grid-more"
	};
	return active === elements.agendaMoreButton ? { kind: "agenda-more" } : null;
}
/** Restores focus to the same occurrence, its day, or the calendar's current fallback. */
function restoreCalendarFocus(token, dom, elements, focusedDateString, host, isCurrent = () => true) {
	if (token === null || dom === null || !isCurrent()) return;
	const resolvedElement = resolveFocusElement(token, dom, elements);
	const element = resolvedElement !== null && resolvedElement.isConnected && host.contains(resolvedElement) ? resolvedElement : null;
	const resolvedDateFallback = token.date === void 0 ? null : elements.dayButtons.get(token.date) ?? null;
	const dateFallback = resolvedDateFallback !== null && resolvedDateFallback.isConnected && host.contains(resolvedDateFallback) ? resolvedDateFallback : null;
	const target = element ?? dateFallback ?? elements.dayButtons.get(focusedDateString) ?? dom.titleButton;
	if (token.date !== void 0 && (isGridActionToken(token) || element === null && dateFallback !== null)) setDayProxyTabStop(token.date, elements);
	focusRestorationTarget(target, token.date, elements, host, isCurrent);
}
function focusRestorationTarget(target, date, elements, host, isCurrent) {
	target.focus({ preventScroll: true });
	if (isCurrent() && target.ownerDocument.activeElement !== target && date !== void 0 && !focusFirstEligible(elements.gridActionsByDate.get(date) ?? [], host, isCurrent) && isCurrent()) elements.dayButtons.get(date)?.focus({ preventScroll: true });
}
/** Lets the browser reject CSS-hidden controls without duplicating responsive layout decisions. */
function focusFirstEligible(actions, host, isCurrent = () => true) {
	for (const action of actions) {
		if (!isCurrent()) return false;
		if (!action.isConnected || !host.contains(action)) continue;
		action.focus({ preventScroll: true });
		if (action.ownerDocument.activeElement === action) return true;
	}
	return false;
}
function setDayProxyTabStop(dateString, elements) {
	for (const [candidateDate, button] of elements.dayButtons) button.tabIndex = candidateDate === dateString ? 0 : -1;
	for (const actions of elements.gridActionsByDate.values()) for (const action of actions) action.tabIndex = -1;
}
function captureStableFocus(active, dom) {
	const kind = (/* @__PURE__ */ new Map([
		[dom.retryButton, "retry"],
		[dom.previousButton, "previous"],
		[dom.nextButton, "next"],
		[dom.todayButton, "today"],
		[dom.titleButton, "title"]
	])).get(active);
	return kind === void 0 ? null : { kind };
}
function captureEventFocus(active, actions) {
	for (const action of actions.values()) {
		if (active !== action) continue;
		const date = action.getAttribute("data-lfc-date") ?? void 0;
		const eventId = action.getAttribute("data-lfc-event-id") ?? void 0;
		const surfaceValue = action.getAttribute("data-lfc-surface");
		const surface = surfaceValue === "agenda" || surfaceValue === "grid-summary" ? surfaceValue : void 0;
		return {
			...date === void 0 ? {} : { date },
			...eventId === void 0 ? {} : { eventId },
			kind: "event-action",
			...surface === void 0 ? {} : { surface }
		};
	}
	return null;
}
function resolveFocusElement(token, dom, elements) {
	switch (token.kind) {
		case "day": return token.date === void 0 ? null : elements.dayButtons.get(token.date) ?? null;
		case "event-action": return resolveEventFocusElement(token, elements.eventActions);
		case "grid-more": return token.date === void 0 ? null : elements.gridMoreButtons.get(token.date) ?? null;
		case "retry": return dom.panel.hidden === true ? null : dom.retryButton;
		case "previous": return dom.previousButton;
		case "next": return dom.nextButton;
		case "today": return dom.todayButton;
		case "title": return dom.titleButton;
		case "agenda-more": return elements.agendaMoreButton;
	}
}
function resolveEventFocusElement(token, actions) {
	return token.eventId === void 0 || token.date === void 0 || token.surface === void 0 ? null : actions.get(getEventActionKey(token.surface, token.date, token.eventId)) ?? null;
}
function isGridActionToken(token) {
	return token.kind === "grid-more" || token.kind === "event-action" && token.surface === "grid-summary";
}
//#endregion
//#region src/internal/dom/month-grid.ts
var DAYS_PER_WEEK$1 = 7;
var FORCED_COLORS_QUERY = "(forced-colors: active)";
var SELECTION_ANIMATION_NAME = "lfc-day-selection-reveal";
var SELECTION_MOTION_QUERY = "(prefers-reduced-motion: no-preference)";
/** Creates the structural and semantic elements for one calendar day. */
function createDayCellElements(options) {
	const isSelectionEntry = options.isSelected && options.selectionEntryDate === options.dateString && allowsSelectionMotion(options.document);
	const cell = options.document.createElement("div");
	cell.className = `lfc-calendar-day ${options.isCurrentMonth ? "lfc-is-current-month" : "lfc-is-outside-month"}`;
	cell.classList.toggle("lfc-is-out-of-range", !options.isAllowed);
	cell.classList.toggle("lfc-is-selected", options.isSelected);
	cell.classList.toggle("lfc-is-selection-entry", isSelectionEntry);
	cell.classList.toggle("lfc-is-today", options.isToday);
	if (!options.isAllowed) cell.setAttribute("aria-disabled", "true");
	cell.setAttribute("aria-selected", options.isSelected ? "true" : "false");
	cell.setAttribute("role", "gridcell");
	const button = options.document.createElement("button");
	button.className = "lfc-calendar-day-button";
	button.disabled = !options.isAllowed;
	button.type = "button";
	button.tabIndex = options.isFocused ? 0 : -1;
	button.setAttribute("data-lfc-date", options.dateString);
	button.setAttribute("aria-label", options.accessibleLabel);
	installDirectPressFeedback(button);
	if (options.isToday) button.setAttribute("aria-current", "date");
	const number = options.document.createElement("time");
	number.className = "lfc-calendar-day-number";
	number.dateTime = options.dateString;
	number.textContent = options.dayNumber;
	const badge = options.document.createElement("span");
	badge.className = "lfc-calendar-day-badge";
	badge.setAttribute("aria-hidden", "true");
	const summaries = options.document.createElement("div");
	summaries.className = "lfc-calendar-day-summaries";
	button.append(number, badge);
	cell.append(button, summaries);
	if (isSelectionEntry) clearSelectionEntryAfterAnimation(button, cell);
	return {
		badge,
		button,
		cell,
		number,
		summaries
	};
}
function installDirectPressFeedback(button) {
	let pointerId = null;
	button.addEventListener("pointerdown", (event) => {
		if (!event.isPrimary || event.button !== 0 || button.disabled) return;
		pointerId = event.pointerId;
		button.classList.add("lfc-is-pressed");
	});
	const clear = (event) => {
		if (pointerId !== event.pointerId) return;
		pointerId = null;
		button.classList.remove("lfc-is-pressed");
	};
	button.addEventListener("lostpointercapture", clear);
	button.addEventListener("pointercancel", clear);
	button.addEventListener("pointerleave", clear);
	button.addEventListener("pointerup", clear);
}
function clearSelectionEntryAfterAnimation(button, cell) {
	const clear = (event) => {
		if (event.animationName !== SELECTION_ANIMATION_NAME || event.target !== button || event.pseudoElement !== "") return;
		cell.classList.remove("lfc-is-selection-entry");
		button.removeEventListener("animationcancel", clear);
		button.removeEventListener("animationend", clear);
	};
	button.addEventListener("animationcancel", clear);
	button.addEventListener("animationend", clear);
}
function allowsSelectionMotion(document) {
	const ownerWindow = document.defaultView;
	if (ownerWindow === null) return true;
	const matchMedia = ownerWindow.matchMedia;
	return matchMedia === void 0 || matchMedia.call(ownerWindow, SELECTION_MOTION_QUERY).matches && !matchMedia.call(ownerWindow, FORCED_COLORS_QUERY).matches;
}
/** Replaces the managed grid rows while leaving day-cell behavior with the coordinator. */
function renderMonthWeeks(container, days, createDayCell, isCurrent, beforeCommit) {
	const weeks = [];
	for (let offset = 0; offset < days.length; offset += DAYS_PER_WEEK$1) {
		const week = container.ownerDocument.createElement("div");
		week.className = "lfc-calendar-week";
		week.setAttribute("role", "row");
		for (const date of days.slice(offset, offset + DAYS_PER_WEEK$1)) {
			const cell = createDayCell(date);
			if (!isCurrent()) return false;
			week.append(cell);
		}
		weeks.push(week);
	}
	if (!isCurrent()) return false;
	beforeCommit(Object.freeze(weeks));
	if (!isCurrent()) return false;
	container.replaceChildren(...weeks);
	return true;
}
/** Replaces the column headers with localized short and narrow visual labels. */
function renderWeekdayHeadings(container, options) {
	const sunday = {
		day: 7,
		month: 1,
		year: 2024
	};
	const headings = Array.from({ length: 7 }, (_, index) => {
		const date = addCalendarDays(sunday, options.firstDay + index);
		const nativeDate = toUtcDate(date);
		const shortLabel = options.formatShort(nativeDate);
		const fullName = options.formatFullDate(nativeDate);
		const heading = options.document.createElement("div");
		heading.className = "lfc-calendar-weekday";
		heading.setAttribute("aria-label", fullName);
		heading.setAttribute("role", "columnheader");
		const shortName = options.document.createElement("span");
		shortName.className = "lfc-calendar-weekday-short";
		shortName.setAttribute("aria-hidden", "true");
		shortName.textContent = shortLabel;
		const narrowName = options.document.createElement("span");
		narrowName.className = "lfc-calendar-weekday-narrow";
		narrowName.setAttribute("aria-hidden", "true");
		narrowName.textContent = options.formatNarrow(nativeDate);
		heading.append(shortName, narrowName);
		return heading;
	});
	container.replaceChildren(...headings);
}
//#endregion
//#region src/internal/runtime/day-grid-actions.ts
/** Advertises day shortcuts that stay available in both container presentations. */
function setDayActionShortcuts(button, hasSummaryAction, overflow, hasContext) {
	const compactHasAction = hasSummaryAction || (overflow.compact?.action ?? null) !== null;
	const wideHasAction = hasSummaryAction || (overflow.grid?.wide ?? null) !== null;
	const shortcuts = [...compactHasAction && wideHasAction ? ["F2"] : [], ...hasContext ? ["Shift+F10"] : []];
	if (shortcuts.length > 0) button.setAttribute("aria-keyshortcuts", shortcuts.join(" "));
}
/** Installs package-owned overflow behavior before consumer visual hooks inspect the action. */
function installGridOverflowActionListeners(options) {
	options.action.addEventListener("click", (event) => {
		const isCurrent = options.captureCurrent();
		if (!isCurrent()) return;
		const onActivate = options.onActivate;
		let context = null;
		if (onActivate !== void 0 || options.needsContext) {
			const events = Object.freeze([...options.events()]);
			context = Object.freeze({
				date: Object.freeze({ ...options.date }),
				dateString: formatCalendarDate(options.date),
				element: options.action,
				eventCount: events.length,
				events,
				nativeEvent: event
			});
		}
		const activation = context;
		if (onActivate !== void 0 && activation !== null) options.invokeAction(() => onActivate(activation));
		if (!event.defaultPrevented && isCurrent()) options.onDefault(activation);
	}, { capture: true });
	options.action.addEventListener("keydown", (event) => {
		options.onKeydown(event);
	}, { capture: true });
}
/** Collects one day's grid actions and selects its first actionable compact representation. */
var DayGridActionCollector = class {
	actions = [];
	compactPrimaryValue = null;
	eventActionRegistry;
	constructor(eventActionRegistry) {
		this.eventActionRegistry = eventActionRegistry;
	}
	/** First actionable event representation eligible for compact presentation. */
	get compactPrimary() {
		return this.compactPrimaryValue;
	}
	/** Registers one actionable event representation in keyboard and activation order. */
	registerEvent(actionKey, elements) {
		const { action } = elements;
		if (action === null) return;
		this.actions.push(action);
		this.eventActionRegistry.set(actionKey, action);
		this.compactPrimaryValue ??= elements;
	}
	/** Appends the native day-overflow action after visible event actions. */
	registerOverflow(action) {
		this.actions.push(action);
	}
	/** Returns an immutable focus-order snapshot for the completed day cell. */
	snapshot() {
		return Object.freeze([...this.actions]);
	}
};
//#endregion
//#region src/icons.ts
function createTextIcon(document, text) {
	const icon = document.createElement("span");
	icon.className = "lfc-calendar-navigation-icon";
	icon.dir = "ltr";
	icon.setAttribute("aria-hidden", "true");
	icon.textContent = text;
	return icon;
}
/** Dependency-free default navigation icons. */
var DEFAULT_CALENDAR_ICONS = Object.freeze({
	next: (document) => createTextIcon(document, "›"),
	previous: (document) => createTextIcon(document, "‹")
});
//#endregion
//#region src/internal/runtime/icon-configuration.ts
var CALENDAR_ICON_SCHEMA = Object.freeze({
	next: true,
	previous: true
});
var CALENDAR_ICON_KEY_SET = new Set(Object.keys(CALENDAR_ICON_SCHEMA));
/** Resolves a partial icon set over the dependency-free defaults. */
function resolveCalendarIcons(icons) {
	if (icons === void 0) return DEFAULT_CALENDAR_ICONS;
	if (!isConfigurationRecord(icons)) throw createConfigurationError("icons must be an object when supplied.");
	assertKnownConfigurationKeys(icons, CALENDAR_ICON_KEY_SET, "icons");
	const resolved = {
		next: DEFAULT_CALENDAR_ICONS.next,
		previous: DEFAULT_CALENDAR_ICONS.previous
	};
	for (const direction of ["next", "previous"]) {
		const value = readConfigurationValue(icons, direction, `icons.${direction}`);
		if (value === void 0) continue;
		if (typeof value !== "function") throw createConfigurationError(`icons.${direction} must be a factory function.`);
		resolved[direction] = value;
	}
	return Object.freeze(resolved);
}
//#endregion
//#region src/internal/runtime/node-leases.ts
var NODE_LEASES = /* @__PURE__ */ new WeakMap();
/** Returns whether a node is currently leased by any live package subsystem. */
function hasNodeLease(node) {
	return NODE_LEASES.has(node);
}
/** Returns whether a node remains leased by the supplied owner token. */
function ownsNodeLease(node, owner) {
	return NODE_LEASES.get(node) === owner;
}
/** Claims a previously validated node for one package subsystem. */
function setNodeLease(node, owner) {
	NODE_LEASES.set(node, owner);
}
/** Releases a node only when the supplied subsystem still owns it. */
function releaseNodeLease(node, owner) {
	if (ownsNodeLease(node, owner)) NODE_LEASES.delete(node);
}
/** Removes and releases coordinator-tracked nodes while preserving cleanup failures. */
function releaseLeasedNodes(nodes, owner) {
	const errors = [];
	const trackedNodes = [...nodes];
	nodes.clear();
	for (const [node, expectedParent] of trackedNodes) {
		if (!ownsNodeLease(node, owner)) continue;
		try {
			if (node.parentNode === expectedParent) expectedParent.removeChild(node);
		} catch (cause) {
			errors.push(cause);
		} finally {
			releaseNodeLease(node, owner);
		}
	}
	return errors;
}
//#endregion
//#region src/internal/runtime/integration-nodes.ts
/** Owns reversible leases for application nodes integrated with one calendar instance. */
var IntegrationNodeController = class {
	options;
	parents = /* @__PURE__ */ new Map();
	fallbackLastWrittenHidden = null;
	fallbackWasHidden = null;
	leasedNodes = /* @__PURE__ */ new Set();
	leaseToken = {};
	constructor(options) {
		this.options = options;
	}
	/** Claims all configured integration nodes atomically. */
	claim() {
		const nodes = [
			this.options.iconNodes.previous,
			this.options.iconNodes.next,
			this.options.toolbarEnd,
			this.options.fallbackElement
		].filter((node) => node !== null);
		for (const node of nodes) {
			if (!this.canClaim(node)) {
				this.release();
				throw this.options.createLeaseError();
			}
			setNodeLease(node, this.leaseToken);
			this.leasedNodes.add(node);
		}
		this.fallbackWasHidden = this.options.fallbackElement?.hidden ?? null;
		this.fallbackLastWrittenHidden = this.fallbackWasHidden;
	}
	/** Hides fallback content only after a usable snapshot is committed. */
	updateFallback(hasCurrentSnapshot, hasFatalError) {
		const fallback = this.options.fallbackElement;
		if (fallback === null || this.fallbackWasHidden === null || !ownsNodeLease(fallback, this.leaseToken) || this.fallbackLastWrittenHidden === null || fallback.hidden !== this.fallbackLastWrittenHidden) return;
		const hidden = hasCurrentSnapshot && !hasFatalError ? true : this.fallbackWasHidden;
		this.fallbackLastWrittenHidden = hidden;
		fallback.hidden = hidden;
	}
	/** Restores fallback visibility without overwriting application mutation. */
	restoreFallback() {
		const fallback = this.options.fallbackElement;
		if (fallback !== null && this.fallbackWasHidden !== null && this.fallbackLastWrittenHidden !== null && ownsNodeLease(fallback, this.leaseToken) && fallback.hidden === this.fallbackLastWrittenHidden) fallback.hidden = this.fallbackWasHidden;
		this.fallbackLastWrittenHidden = null;
		this.fallbackWasHidden = null;
	}
	/** Detaches package-mounted nodes that have not been moved by the application. */
	detachMountedNodes() {
		for (const [node, expectedParent] of this.parents) {
			if (!ownsNodeLease(node, this.leaseToken) || node.parentNode !== expectedParent) continue;
			try {
				expectedParent.removeChild(node);
			} catch (cause) {
				this.options.reportDetachError(this.options.createDetachError(cause));
			}
		}
	}
	/** Releases every lease still owned by this controller. */
	release() {
		for (const node of this.leasedNodes) releaseNodeLease(node, this.leaseToken);
		this.leasedNodes.clear();
		this.parents.clear();
	}
	canClaim(node) {
		const isToolbar = node === this.options.toolbarEnd;
		const hasAllowedParent = node === this.options.fallbackElement ? !this.options.host.contains(node) && !node.contains(this.options.host) : node.parentNode === null || isToolbar && this.options.host.contains(node);
		return isSameDocumentNode(this.options.document, node) && isAppendableNode(node) && hasAllowedParent && node !== this.options.host && !node.contains(this.options.host) && !hasNodeLease(node);
	}
};
//#endregion
//#region src/internal/runtime/event-source-lifecycle.ts
/** Mutates busy attributes only while the owning request remains current. */
function setVisibleEventBusyState(host, grid, busy, isCurrent) {
	for (const element of [host, grid]) {
		if (element === null || !isCurrent()) return element === null ? isCurrent() : false;
		if (busy) element.setAttribute("aria-busy", "true");
		else element.removeAttribute("aria-busy");
		if (!isCurrent()) return false;
	}
	return true;
}
/** Attaches both terminal handlers before the coordinator publishes loading callbacks. */
function observeVisibleEventRequest(events, onFulfilled, onRejected, onObserverFailure) {
	try {
		events.then((values) => {
			invokeTerminalObserver(onFulfilled, values, onObserverFailure);
		}, (cause) => {
			invokeTerminalObserver(onRejected, cause, onObserverFailure);
		});
	} catch (cause) {
		reportTerminalObserverFailure(cause, onObserverFailure);
	}
}
function invokeTerminalObserver(observer, value, onObserverFailure) {
	try {
		observer(value);
	} catch (cause) {
		reportTerminalObserverFailure(cause, onObserverFailure);
	}
}
function reportTerminalObserverFailure(cause, onObserverFailure) {
	try {
		onObserverFailure(cause);
	} catch (observerFailure) {
		reportCalendarError(new AggregateError([cause, observerFailure], "An asynchronous event-source terminal callback and its fatal observer both failed."));
	}
}
/** Builds the shared typed error inputs for current and stale source failures. */
function createEventSourceErrorOptions(options) {
	const validationError = isLitefoldCalendarError(options.cause) && (options.cause.code === "event-data-invalid" || options.cause.code === "event-limit-exceeded") ? options.cause : null;
	return Object.freeze({
		cause: options.cause,
		code: validationError?.code ?? "event-source-failed",
		eventIndex: validationError?.eventIndex,
		phase: validationError?.phase ?? "source",
		range: options.range,
		recoverable: true,
		severity: options.retained ? "warning" : "error",
		stale: options.stale,
		userMessage: options.retained ? options.messages.refreshErrorMessage : options.messages.loadErrorMessage,
		userTitle: options.retained ? options.messages.refreshErrorTitle : options.messages.loadErrorTitle
	});
}
//#endregion
//#region src/internal/dom/event-overflow.ts
/** Creates one stable event-overflow visual with package-owned default content. */
function createEventOverflowElements(document, variant, text) {
	const root = document.createElement("span");
	root.className = `lfc-calendar-event-overflow lfc-is-${variant}`;
	root.setAttribute("aria-hidden", "true");
	const content = document.createElement("span");
	content.className = "lfc-calendar-event-overflow-content";
	const defaultContent = document.createElement("span");
	defaultContent.className = "lfc-event-overflow-default-content";
	defaultContent.textContent = text;
	content.append(defaultContent);
	root.append(content);
	return {
		content,
		root
	};
}
//#endregion
//#region src/internal/runtime/event-overflow-presentation.ts
var COMPACT_NUMBER_FORMAT_OPTIONS = Object.freeze({
	compactDisplay: "short",
	maximumFractionDigits: 1,
	notation: "compact",
	useGrouping: false
});
/** Builds and places package-owned overflow visuals without invoking consumer code. */
var CalendarEventOverflowPresenter = class {
	compactNumberFormatter = null;
	options;
	signedCompactNumberFormatter = null;
	constructor(options) {
		this.options = options;
	}
	/** Prepares and places each applicable variant once so CSS can switch without rerendering. */
	prepareAndPlace(options) {
		const compactCount = this.showsCount("compact", options.eventCount);
		const wideCount = this.showsCount("wide", options.eventCount);
		options.summaries.setAttribute("data-lfc-compact-display", compactCount ? "count" : "events");
		options.summaries.setAttribute("data-lfc-wide-display", wideCount ? "count" : "events");
		options.compactPrimary?.root.classList.add("lfc-is-compact-primary");
		const grid = this.createGridOverflow(options);
		const compactAction = compactCount || options.eventCount > this.options.gridEventLimit ? grid?.button ?? null : null;
		const compact = this.createCompactOverflow(options, compactAction);
		if (grid !== null && grid.wide !== null) grid.button.append(grid.wide.root);
		grid?.button.classList.toggle("lfc-has-wide-overflow", grid.wide !== null);
		return Object.freeze({
			compact,
			grid
		});
	}
	showsCount(variant, eventCount) {
		const mode = this.options.gridEventDisplay[variant];
		return eventCount > 0 && (mode === "count" || mode === "count-when-multiple" && eventCount > 1);
	}
	createCompactOverflow(options, gridAction) {
		if (this.showsCount("compact", options.eventCount) && gridAction !== null) {
			const text = this.getCompactNumberFormatter(false).format(options.eventCount);
			const overflow = createEventOverflowElements(this.options.document, "compact", text);
			overflow.root.classList.add("lfc-is-count");
			gridAction.classList.add("lfc-is-compact-primary");
			gridAction.append(overflow.root);
			return Object.freeze({
				action: gridAction,
				content: overflow.content,
				date: options.date,
				dateString: options.dateString,
				display: "count",
				eventCount: options.eventCount,
				overflowCount: options.eventCount,
				placementBoundary: null,
				root: overflow.root,
				text,
				variant: "compact",
				visibleEventCount: 0
			});
		}
		if (options.eventCount <= 1 && (options.eventCount <= this.options.gridEventLimit || options.compactPrimary !== null)) return null;
		const visibleEventCount = options.compactPrimary !== null && options.compactPrimary.marker.childNodes.length > 0 ? 1 : 0;
		const overflowCount = options.eventCount - visibleEventCount;
		const text = visibleEventCount === 0 ? this.getCompactNumberFormatter(false).format(overflowCount) : this.getCompactNumberFormatter(true).format(overflowCount);
		const overflow = createEventOverflowElements(this.options.document, "compact", text);
		this.placeCompactOverflow(options, gridAction, overflow.root, visibleEventCount);
		const action = options.compactPrimary === null ? gridAction : null;
		return Object.freeze({
			action,
			content: overflow.content,
			date: options.date,
			dateString: options.dateString,
			display: "overflow",
			eventCount: options.eventCount,
			overflowCount,
			placementBoundary: action === null ? options.summaries.parentElement ?? options.summaries : null,
			root: overflow.root,
			text,
			variant: "compact",
			visibleEventCount
		});
	}
	createGridOverflow(options) {
		const compactCount = this.showsCount("compact", options.eventCount);
		const wideCount = this.showsCount("wide", options.eventCount);
		const hasOverflow = options.eventCount > this.options.gridEventLimit;
		if (!compactCount && !wideCount && !hasOverflow) return null;
		const button = this.options.document.createElement("button");
		button.className = "lfc-calendar-more lfc-calendar-grid-more";
		button.type = "button";
		button.tabIndex = -1;
		button.setAttribute("aria-keyshortcuts", "F2");
		button.setAttribute("data-lfc-date", options.dateString);
		button.classList.toggle("lfc-is-compact-primary", options.compactPrimary === null);
		button.classList.toggle("lfc-is-wide-count-only", wideCount && !compactCount && !hasOverflow);
		const overflowCount = wideCount ? options.eventCount : Math.max(0, options.eventCount - this.options.gridEventLimit);
		const wide = wideCount || hasOverflow ? this.createWideOverflow(options, button, wideCount, overflowCount) : null;
		const accessibleCount = compactCount || wideCount ? options.eventCount : overflowCount;
		const accessibleLabel = formatCalendarMessage(compactCount || wideCount ? this.options.messages.gridEventCountLabel : this.options.messages.gridMoreLabel, {
			count: this.options.numberFormatter.format(accessibleCount),
			date: options.fullDateText,
			eventLabel: accessibleCount === 1 ? this.options.messages.event : this.options.messages.events
		});
		button.setAttribute("aria-label", compactCount && !wideCount && wide !== null ? `${accessibleLabel}, ${wide.text}` : accessibleLabel);
		return Object.freeze({
			button,
			wide
		});
	}
	createWideOverflow(options, button, wideCount, overflowCount) {
		const text = formatCalendarMessage(wideCount ? this.options.messages.gridEventCount : this.options.messages.gridMore, {
			count: this.options.numberFormatter.format(overflowCount),
			eventLabel: overflowCount === 1 ? this.options.messages.event : this.options.messages.events
		});
		const wide = createEventOverflowElements(this.options.document, "wide", text);
		wide.root.classList.toggle("lfc-is-count", wideCount);
		return Object.freeze({
			action: button,
			content: wide.content,
			date: options.date,
			dateString: options.dateString,
			display: wideCount ? "count" : "overflow",
			eventCount: options.eventCount,
			overflowCount,
			root: wide.root,
			text,
			variant: "wide",
			visibleEventCount: options.eventCount - overflowCount
		});
	}
	getCompactNumberFormatter(signed) {
		if (signed) {
			if (this.signedCompactNumberFormatter !== null) return this.signedCompactNumberFormatter;
			this.signedCompactNumberFormatter ??= new Intl.NumberFormat(this.options.locale, {
				...COMPACT_NUMBER_FORMAT_OPTIONS,
				signDisplay: "always"
			});
			return this.signedCompactNumberFormatter;
		}
		if (this.compactNumberFormatter !== null) return this.compactNumberFormatter;
		this.compactNumberFormatter ??= new Intl.NumberFormat(this.options.locale, COMPACT_NUMBER_FORMAT_OPTIONS);
		return this.compactNumberFormatter;
	}
	placeCompactOverflow(options, gridAction, overflow, visibleEventCount) {
		if (options.compactPrimary !== null) {
			const overflowCluster = this.options.document.createElement("div");
			overflowCluster.className = "lfc-calendar-event-overflow-cluster";
			overflowCluster.classList.toggle("lfc-has-compact-primary-visual", visibleEventCount === 1);
			options.compactPrimary.root.replaceWith(overflowCluster);
			overflowCluster.append(options.compactPrimary.root, overflow);
			return;
		}
		if (gridAction !== null) {
			gridAction.append(overflow);
			return;
		}
		const overflowCluster = this.options.document.createElement("div");
		overflowCluster.className = "lfc-calendar-event-overflow-cluster";
		overflowCluster.append(overflow);
		options.summaries.append(overflowCluster);
	}
};
//#endregion
//#region src/internal/runtime/action-pipeline.ts
/** Runs synchronous action bodies and observes promises with per-hook stale-error ownership. */
var CalendarActionPipeline = class {
	generations = /* @__PURE__ */ new Map();
	options;
	constructor(options) {
		this.options = options;
	}
	/** Invalidates retained asynchronous actions at teardown or fatal failure. */
	clear() {
		this.generations.clear();
	}
	/** Invokes without awaiting; successful current actions clear only their own issue. */
	invoke(name, action) {
		if (!this.options.canInvoke()) return;
		const generation = (this.generations.get(name) ?? 0) + 1;
		this.generations.set(name, generation);
		const isCurrent = () => this.options.isLive() && this.generations.get(name) === generation;
		const succeed = () => {
			if (isCurrent()) this.options.clearIssue(name);
		};
		const fail = (cause) => {
			const messages = this.options.messages();
			this.options.report(name, createInternalError({
				cause,
				code: "action-failed",
				hook: name,
				recoverable: true,
				severity: "error",
				stale: !isCurrent(),
				userMessage: messages.actionErrorMessage,
				userTitle: messages.actionErrorTitle
			}), isCurrent);
		};
		let result;
		try {
			result = action();
		} catch (cause) {
			fail(cause);
			return;
		}
		if (result === void 0) {
			succeed();
			return;
		}
		Promise.resolve(result).then(succeed, fail);
	}
};
//#endregion
//#region src/internal/runtime/overflow-default.ts
/** Focuses only a current committed agenda and reports successful focus synchronously. */
function completeEventOverflowDefault(completion, activation, options) {
	if (completion === null || !options.isCurrent(completion)) return;
	const agendaHeading = completion.dom.agendaTitle;
	const isCurrent = () => options.isCurrent(completion) && completion.dom.agendaTitle === agendaHeading && agendaHeading.isConnected && options.host.contains(agendaHeading);
	if (!isCurrent()) return;
	agendaHeading.focus({ preventScroll: true });
	if (!isCurrent() || !hasElementFocus(agendaHeading)) return;
	const onDefault = options.onDefault;
	if (onDefault === void 0 || activation === null) return;
	const { element: triggerElement, ...snapshot } = activation;
	const context = Object.freeze({
		...snapshot,
		agendaHeading,
		triggerElement
	});
	options.invokeAction(() => onDefault(context));
}
//#endregion
//#region src/internal/runtime/swipe.ts
var CLICK_SUPPRESSION_RELEASE_DELAY = 400;
var REDUCED_MOTION_QUERY = "(prefers-reduced-motion: reduce)";
var SCROLL_IDLE_DELAY = 120;
var SNAP_TOLERANCE = 1;
/** Coordinates native horizontal scroll-snap month paging and its lifecycle state. */
var SwipeGestureController = class {
	options;
	activePointers = /* @__PURE__ */ new Set();
	blockedPointers = /* @__PURE__ */ new Set();
	connectionGeneration = 0;
	connectedDom = null;
	generation = 0;
	gestureInvalidated = false;
	gesturePointerId = null;
	idleTimer = null;
	isRecentering = false;
	isResolving = false;
	lastHorizontalWheelTime = null;
	pagingBlockedUntilTerminal = false;
	resizeObserver = null;
	supportsScrollEnd = false;
	suppressNextClick = false;
	suppressNextClickTimer = null;
	suppressedPointerId = null;
	touchContactCount = 0;
	transactionConsumed = false;
	transactionSequence = 0;
	constructor(options) {
		this.options = options;
	}
	/** Connects the native pager after its stable DOM has been mounted. */
	connect(dom) {
		if (!this.options.enabled) return;
		if (this.connectedDom === dom) {
			this.recenter(dom);
			return;
		}
		this.disconnect(false);
		this.connectedDom = dom;
		const viewport = dom.swipeViewport;
		viewport.addEventListener("pointerdown", this.handlePointerDown, { passive: true });
		viewport.addEventListener("scroll", this.handleScroll, { passive: true });
		this.supportsScrollEnd = "onscrollend" in viewport;
		if (this.supportsScrollEnd) viewport.addEventListener("scrollend", this.handleScrollEnd);
		viewport.addEventListener("touchstart", this.handleTouchStart, { passive: true });
		viewport.addEventListener("wheel", this.handleWheel, { passive: true });
		this.options.host.addEventListener("click", this.handleClickCapture, true);
		this.options.host.addEventListener("pointerdown", this.handleHostPointerDown, {
			capture: true,
			passive: true
		});
		viewport.ownerDocument.addEventListener("pointercancel", this.handlePointerEnd, true);
		viewport.ownerDocument.addEventListener("pointerup", this.handlePointerEnd, true);
		viewport.ownerDocument.addEventListener("touchcancel", this.handleTouchEnd, true);
		viewport.ownerDocument.addEventListener("touchend", this.handleTouchEnd, true);
		const ResizeObserverConstructor = this.options.window?.ResizeObserver;
		if (ResizeObserverConstructor !== void 0) {
			const connectionGeneration = this.connectionGeneration;
			let observer = null;
			observer = new ResizeObserverConstructor((entries) => {
				if (observer !== this.resizeObserver || connectionGeneration !== this.connectionGeneration || this.connectedDom !== dom || this.options.getDom() !== dom || !viewport.isConnected || !entries.some((entry) => entry.target === viewport)) return;
				this.clear();
			});
			this.resizeObserver = observer;
			try {
				observer.observe(viewport);
			} catch (cause) {
				this.disconnect(false);
				throw cause;
			}
		}
		this.recenter(dom);
	}
	/** Suppresses only the touch-generated click associated with a native pan. */
	handleClickCapture = (event) => {
		if (!this.suppressNextClick) return;
		const pointerId = "pointerId" in event ? event.pointerId : void 0;
		const firesTouchEvents = "sourceCapabilities" in event && event.sourceCapabilities?.firesTouchEvents === true;
		if (typeof pointerId === "number" && pointerId >= 0 && this.suppressedPointerId !== null && pointerId !== this.suppressedPointerId) return;
		if ((typeof pointerId !== "number" || pointerId < 0) && !firesTouchEvents && "detail" in event && event.detail === 0) return;
		this.clearClickSuppression();
		event.preventDefault();
		event.stopImmediatePropagation();
	};
	/** Clears active scrolling while retaining the mounted pager listeners. */
	clear(mutateHost = true) {
		const preserveActiveClickGuard = this.suppressNextClick && (this.activePointers.size > 0 || this.blockedPointers.size > 0 || this.touchContactCount > 0 || this.pagingBlockedUntilTerminal);
		this.generation += 1;
		this.transactionSequence += 1;
		this.cancelIdleTimer();
		this.transactionConsumed = true;
		this.blockActiveGesture();
		if (!preserveActiveClickGuard) this.clearClickSuppression();
		if (mutateHost) {
			this.options.host.removeAttribute("data-lfc-swipe-state");
			const dom = this.connectedDom;
			if (dom !== null) this.recenter(dom);
		}
	}
	/** Removes pager listeners and cancels every pending callback. */
	disconnect(mutateHost = true) {
		const dom = this.connectedDom;
		this.connectedDom = null;
		this.connectionGeneration += 1;
		this.generation += 1;
		this.transactionSequence += 1;
		this.cancelIdleTimer();
		this.resetGestureTracking();
		this.lastHorizontalWheelTime = null;
		this.transactionConsumed = false;
		this.clearClickSuppression();
		if (mutateHost) this.options.host.removeAttribute("data-lfc-swipe-state");
		this.resizeObserver?.disconnect();
		this.resizeObserver = null;
		if (dom === null) return;
		const viewport = dom.swipeViewport;
		viewport.removeEventListener("pointerdown", this.handlePointerDown);
		viewport.removeEventListener("scroll", this.handleScroll);
		if (this.supportsScrollEnd) viewport.removeEventListener("scrollend", this.handleScrollEnd);
		this.supportsScrollEnd = false;
		viewport.removeEventListener("touchstart", this.handleTouchStart);
		viewport.removeEventListener("wheel", this.handleWheel);
		this.options.host.removeEventListener("click", this.handleClickCapture, true);
		this.options.host.removeEventListener("pointerdown", this.handleHostPointerDown, true);
		viewport.ownerDocument.removeEventListener("pointercancel", this.handlePointerEnd, true);
		viewport.ownerDocument.removeEventListener("pointerup", this.handlePointerEnd, true);
		viewport.ownerDocument.removeEventListener("touchcancel", this.handleTouchEnd, true);
		viewport.ownerDocument.removeEventListener("touchend", this.handleTouchEnd, true);
	}
	/** Recenters and clears transient state before the live 42-cell grid is rerendered. */
	prepareForRender(dom) {
		if (!this.options.enabled) return;
		if (this.connectedDom !== dom) {
			this.connect(dom);
			return;
		}
		this.clear();
	}
	armClickSuppression(pointerId) {
		this.suppressNextClick = true;
		this.suppressedPointerId = pointerId;
		if (this.suppressNextClickTimer !== null) {
			this.options.window?.clearTimeout(this.suppressNextClickTimer);
			this.suppressNextClickTimer = null;
		}
	}
	cancelIdleTimer() {
		if (this.idleTimer === null) return;
		this.options.window?.clearTimeout(this.idleTimer);
		this.idleTimer = null;
	}
	clearClickSuppression() {
		if (this.suppressNextClickTimer !== null) {
			this.options.window?.clearTimeout(this.suppressNextClickTimer);
			this.suppressNextClickTimer = null;
		}
		this.suppressNextClick = false;
		this.suppressedPointerId = null;
	}
	blockActiveGesture() {
		if (this.activePointers.size > 0 || this.touchContactCount > 0 || this.pagingBlockedUntilTerminal) {
			for (const pointerId of this.activePointers) this.blockedPointers.add(pointerId);
			this.pagingBlockedUntilTerminal = true;
			this.gestureInvalidated = true;
		} else {
			this.blockedPointers.clear();
			this.gestureInvalidated = false;
			this.touchContactCount = 0;
		}
		this.activePointers.clear();
		this.gesturePointerId = null;
	}
	beginTransaction() {
		this.cancelIdleTimer();
		this.transactionSequence += 1;
		this.transactionConsumed = false;
	}
	beginContactTransaction() {
		this.lastHorizontalWheelTime = null;
		this.beginTransaction();
	}
	resetGestureTracking() {
		this.activePointers.clear();
		this.blockedPointers.clear();
		this.gestureInvalidated = false;
		this.gesturePointerId = null;
		this.pagingBlockedUntilTerminal = false;
		this.touchContactCount = 0;
	}
	closestCandidate(dom) {
		const viewport = dom.swipeViewport;
		const centerOffset = this.clampScrollOffset(viewport, this.getStartOffset(dom.grid));
		const maximumOffset = this.getMaximumScrollOffset(viewport);
		const rawOffset = viewport.scrollLeft;
		const observedOffset = this.clampScrollOffset(viewport, rawOffset);
		const centerCandidate = {
			amount: 0,
			offset: centerOffset
		};
		const candidates = [centerCandidate];
		if (!this.gestureInvalidated) {
			if (dom.previousLane.hasAttribute("data-lfc-page-available")) candidates.push({
				amount: -1,
				offset: this.getLaneOffset(dom.previousLane, dom)
			});
			if (dom.nextLane.hasAttribute("data-lfc-page-available")) candidates.push({
				amount: 1,
				offset: this.getLaneOffset(dom.nextLane, dom)
			});
		}
		const closest = candidates.reduce((currentClosest, candidate) => Math.abs(candidate.offset - observedOffset) < Math.abs(currentClosest.offset - observedOffset) ? candidate : currentClosest);
		if (rawOffset < -1 || rawOffset > maximumOffset + SNAP_TOLERANCE) return centerCandidate;
		if (this.prefersReducedMotion() || Math.abs(closest.offset - observedOffset) <= SNAP_TOLERANCE) return closest;
		return centerCandidate;
	}
	getLaneOffset(lane, dom) {
		const viewport = dom.swipeViewport;
		const laneStart = this.getStartOffset(lane);
		const aligned = laneStart < this.getStartOffset(dom.grid) ? laneStart : laneStart + lane.offsetWidth - viewport.clientWidth;
		return this.clampScrollOffset(viewport, aligned);
	}
	getStartOffset(element) {
		return element.offsetLeft;
	}
	prefersReducedMotion() {
		const hostWindow = this.options.window;
		return hostWindow !== null && typeof hostWindow.matchMedia === "function" && hostWindow.matchMedia(REDUCED_MOTION_QUERY).matches;
	}
	clampScrollOffset(viewport, offset) {
		return Math.max(0, Math.min(this.getMaximumScrollOffset(viewport), offset));
	}
	getMaximumScrollOffset(viewport) {
		return Math.max(0, viewport.scrollWidth - viewport.clientWidth);
	}
	handlePointerDown = (event) => {
		if (!this.options.enabled || event.pointerType !== "touch" && event.pointerType !== "pen") return;
		if (this.pagingBlockedUntilTerminal) {
			if (this.blockedPointers.size > 0) {
				this.blockedPointers.add(event.pointerId);
				return;
			}
			const dom = this.connectedDom;
			this.resetGestureTracking();
			if (dom !== null) this.recenter(dom);
		}
		if (this.activePointers.size === 0) {
			this.gestureInvalidated = false;
			this.gesturePointerId = event.pointerId;
			this.beginContactTransaction();
		} else if (!this.activePointers.has(event.pointerId)) this.gestureInvalidated = true;
		this.activePointers.add(event.pointerId);
	};
	handlePointerEnd = (event) => {
		const wasActive = this.activePointers.delete(event.pointerId);
		const wasBlocked = this.blockedPointers.delete(event.pointerId);
		if (!wasActive && !wasBlocked) return;
		if (event.pointerId === this.suppressedPointerId && (event.type === "pointerup" || this.touchContactCount === 0)) this.scheduleClickSuppressionRelease();
		if (this.activePointers.size === 0 && this.blockedPointers.size === 0 && this.touchContactCount === 0) {
			this.pagingBlockedUntilTerminal = false;
			this.scheduleIdleResolution();
		}
	};
	handleHostPointerDown = () => {
		if (this.activePointers.size === 0 && this.blockedPointers.size === 0 && this.touchContactCount === 0) this.clearClickSuppression();
	};
	handleScroll = () => {
		const dom = this.connectedDom;
		if (!this.options.enabled || dom === null || this.isResolving) return;
		const centerOffset = this.clampScrollOffset(dom.swipeViewport, this.getStartOffset(dom.grid));
		const observedOffset = this.clampScrollOffset(dom.swipeViewport, dom.swipeViewport.scrollLeft);
		if (Math.abs(observedOffset - centerOffset) <= SNAP_TOLERANCE) {
			this.isRecentering = false;
			this.options.host.removeAttribute("data-lfc-swipe-state");
			this.cancelIdleTimer();
			return;
		}
		this.isRecentering = false;
		this.options.host.setAttribute("data-lfc-swipe-state", "scrolling");
		if (this.gesturePointerId !== null) this.armClickSuppression(this.gesturePointerId);
		this.scheduleIdleResolution();
	};
	handleScrollEnd = () => {
		this.cancelIdleTimer();
		if (this.pagingBlockedUntilTerminal) {
			const dom = this.connectedDom;
			if (dom !== null) {
				this.options.host.removeAttribute("data-lfc-swipe-state");
				this.recenter(dom);
			}
			return;
		}
		if (this.activePointers.size > 0 || this.touchContactCount > 0) {
			this.scheduleIdleResolution();
			return;
		}
		this.resolveSnap();
	};
	handleTouchStart = (event) => {
		const startsFreshGesture = this.touchContactCount === 0 && event.touches.length === 1 && this.activePointers.size === 0 && this.blockedPointers.size === 0 && !this.pagingBlockedUntilTerminal;
		this.touchContactCount = event.touches.length;
		if (startsFreshGesture) this.beginContactTransaction();
		if (this.pagingBlockedUntilTerminal || event.touches.length > 1) this.gestureInvalidated = true;
	};
	handleTouchEnd = (event) => {
		this.touchContactCount = event.touches.length;
		if (event.type === "touchcancel") this.gestureInvalidated = true;
		if (this.touchContactCount === 0 && this.activePointers.size === 0 && this.blockedPointers.size === 0) {
			this.pagingBlockedUntilTerminal = false;
			this.scheduleClickSuppressionRelease();
			this.scheduleIdleResolution();
		}
	};
	handleWheel = (event) => {
		if (Math.abs(event.deltaX) <= Math.abs(event.deltaY)) return;
		const startsFreshBurst = this.lastHorizontalWheelTime === null || event.timeStamp < this.lastHorizontalWheelTime || event.timeStamp - this.lastHorizontalWheelTime > SCROLL_IDLE_DELAY;
		this.lastHorizontalWheelTime = event.timeStamp;
		if (startsFreshBurst && !this.pagingBlockedUntilTerminal && this.activePointers.size === 0 && this.touchContactCount === 0) this.beginTransaction();
		this.scheduleIdleResolution();
	};
	recenter(dom) {
		if (!this.options.enabled) {
			dom.swipeViewport.scrollLeft = 0;
			return;
		}
		this.isRecentering = true;
		dom.swipeViewport.scrollLeft = this.clampScrollOffset(dom.swipeViewport, this.getStartOffset(dom.grid));
		this.options.host.removeAttribute("data-lfc-swipe-state");
	}
	resolveSnap() {
		const dom = this.connectedDom;
		if (this.isResolving || dom === null) return;
		if (!this.options.enabled || !this.options.canInteract() || this.options.getDom() !== dom) {
			this.clear();
			return;
		}
		if (this.transactionConsumed) {
			this.cancelIdleTimer();
			this.options.host.removeAttribute("data-lfc-swipe-state");
			this.recenter(dom);
			return;
		}
		const candidate = this.closestCandidate(dom);
		if (candidate.amount === 0) {
			this.transactionConsumed = true;
			this.cancelIdleTimer();
			this.options.host.removeAttribute("data-lfc-swipe-state");
			this.recenter(dom);
			if (!this.pagingBlockedUntilTerminal) {
				this.gestureInvalidated = false;
				this.gesturePointerId = null;
			}
			return;
		}
		const restoreSuppression = this.suppressNextClick;
		const pointerId = this.suppressedPointerId;
		this.transactionConsumed = true;
		this.isResolving = true;
		this.cancelIdleTimer();
		this.options.host.removeAttribute("data-lfc-swipe-state");
		try {
			this.options.navigate(candidate.amount);
		} finally {
			this.isResolving = false;
		}
		const currentDom = this.connectedDom;
		if (currentDom !== null && this.options.canInteract() && this.options.getDom() === currentDom) {
			this.recenter(currentDom);
			if (restoreSuppression && pointerId !== null) {
				this.armClickSuppression(pointerId);
				this.scheduleClickSuppressionRelease();
			}
		}
		this.gestureInvalidated = false;
		this.gesturePointerId = null;
	}
	scheduleClickSuppressionRelease() {
		if (!this.suppressNextClick) return;
		if (this.suppressNextClickTimer !== null) this.options.window?.clearTimeout(this.suppressNextClickTimer);
		this.suppressNextClickTimer = this.options.window?.setTimeout(() => {
			this.suppressNextClick = false;
			this.suppressedPointerId = null;
			this.suppressNextClickTimer = null;
		}, CLICK_SUPPRESSION_RELEASE_DELAY) ?? null;
	}
	scheduleIdleResolution() {
		if (this.connectedDom === null || this.isRecentering) return;
		this.cancelIdleTimer();
		const generation = this.generation;
		const transactionSequence = this.transactionSequence;
		const dom = this.connectedDom;
		this.idleTimer = this.options.window?.setTimeout(() => {
			this.idleTimer = null;
			if (generation === this.generation && transactionSequence === this.transactionSequence && dom === this.connectedDom && this.options.getDom() === dom && this.activePointers.size === 0 && this.touchContactCount === 0) this.resolveSnap();
		}, SCROLL_IDLE_DELAY) ?? null;
	}
};
//#endregion
//#region src/internal/runtime/registered-extension-events.ts
var MAXIMUM_EXTENSION_EVENT_PAGE_SIZE = 100;
/** Lazily projects and pages presentation-safe events for registered extensions. */
var RegisteredExtensionEventPager = class {
	cachedEvents = null;
	currentSnapshot = null;
	snapshotRevision = 0;
	getPage(eventsByDate, date, offset, limit, isDateAllowed) {
		if (!Number.isSafeInteger(offset) || offset < 0 || !Number.isSafeInteger(limit) || limit < 1 || limit > MAXIMUM_EXTENSION_EVENT_PAGE_SIZE) throw new RangeError("Extension event paging requested invalid bounds.");
		this.synchronizeSnapshot(eventsByDate);
		const entries = date === null ? this.getVisibleEvents(eventsByDate, isDateAllowed) : isDateAllowed(date) ? eventsByDate.get(formatCalendarDate(date)) ?? [] : [];
		const events = entries.slice(offset, offset + limit).map((entry) => {
			return Object.freeze({
				end: entry.event.end,
				isAllDay: entry.event.isAllDay,
				start: entry.event.start,
				title: entry.event.title
			});
		});
		return Object.freeze({
			events: Object.freeze(events),
			snapshotRevision: this.snapshotRevision,
			totalEvents: entries.length
		});
	}
	synchronizeSnapshot(eventsByDate) {
		if (this.currentSnapshot === eventsByDate) return;
		this.currentSnapshot = eventsByDate;
		this.cachedEvents = null;
		this.snapshotRevision += 1;
	}
	getVisibleEvents(eventsByDate, isDateAllowed) {
		if (this.cachedEvents !== null) return this.cachedEvents;
		const identifiers = /* @__PURE__ */ new Set();
		const visibleEvents = [];
		for (const [dateString, entries] of eventsByDate) {
			const date = parseCalendarDate(dateString);
			if (date === null || !isDateAllowed(date)) continue;
			for (const entry of entries) {
				if (identifiers.has(entry.event.id)) continue;
				identifiers.add(entry.event.id);
				visibleEvents.push(entry);
			}
		}
		this.cachedEvents = Object.freeze(visibleEvents);
		return this.cachedEvents;
	}
};
//#endregion
//#region src/internal/runtime/registered-extensions.ts
/** Generic lifecycle host for configured first-party extensions. */
var RegisteredExtensionManager = class {
	isStateNotificationPending = false;
	isStopped = false;
	options;
	runtimes;
	stateRevision = 0;
	constructor(options) {
		this.options = options;
		this.runtimes = resolveExtensionRuntimes(options.extensions);
	}
	/** Whether this calendar selected at least one extension. */
	get hasExtensions() {
		return this.runtimes.length > 0;
	}
	/** Activates all pending extensions in registration order. */
	activate() {
		if (!this.canContinue()) return;
		for (const runtime of this.runtimes) {
			if (!this.canContinue()) break;
			if (runtime.status !== "pending") continue;
			this.activateRuntime(runtime);
		}
	}
	/** Schedules coalesced state delivery after the consumer callback completes. */
	notifyStateChanged() {
		this.stateRevision += 1;
		if (this.isStopped || this.isStateNotificationPending || !this.runtimes.some((runtime) => runtime.status === "active" && runtime.stateChanged !== null)) return;
		this.isStateNotificationPending = true;
		const dispatch = () => {
			this.isStateNotificationPending = false;
			this.dispatchStateChanged();
		};
		try {
			queueMicrotask(dispatch);
		} catch {
			dispatch();
		}
	}
	/** Aborts and disposes every activated extension in reverse registration order. */
	stop() {
		if (this.isStopped) return;
		this.isStopped = true;
		this.stateRevision += 1;
		for (let index = this.runtimes.length - 1; index >= 0; index -= 1) {
			const runtime = this.runtimes[index];
			if (runtime !== void 0) this.stopRuntime(runtime, true);
		}
	}
	activateRuntime(runtime) {
		runtime.status = "activating";
		const controller = new this.options.abortControllerConstructor();
		runtime.controller = controller;
		let result;
		try {
			result = invokeForUnknownResult(runtime.definition.activate, [this.createActivationContext(runtime, controller)]);
		} catch (cause) {
			this.quarantine(runtime, "activate", cause);
			return;
		}
		if (observeThenable(result, () => void 0)) {
			this.quarantine(runtime, "activate", /* @__PURE__ */ new TypeError("Extension activation must return synchronously."));
			return;
		}
		let instance;
		try {
			instance = normalizeExtensionInstance(result);
		} catch (cause) {
			this.quarantine(runtime, "activate", cause);
			return;
		}
		if (!this.isActivationCurrent(runtime, controller)) {
			this.disposeDetached(runtime, instance?.dispose ?? null);
			return;
		}
		runtime.dispose = instance?.dispose ?? null;
		runtime.stateChanged = instance?.stateChanged ?? null;
		runtime.status = "active";
	}
	createActivationContext(runtime, controller) {
		const context = {
			fail: (cause, hook = "runtime") => {
				this.quarantine(runtime, hook, cause);
			},
			isLive: () => this.isRuntimeLive(runtime),
			signal: controller.signal
		};
		for (const capability of runtime.definition.capabilities) switch (capability) {
			case "document":
				context["document"] = this.options.document;
				break;
			case "navigation":
				context["navigation"] = Object.freeze({ navigate: (target) => {
					this.requireRuntimeLive(runtime);
					return this.options.navigate(target);
				} });
				break;
			case "presentationEvents":
				context["presentationEvents"] = Object.freeze({ getPage: (date, offset, limit) => {
					this.requireRuntimeLive(runtime);
					return this.options.getPresentationEventPage(date, offset, limit);
				} });
				break;
			case "state": context["state"] = Object.freeze({
				getGeneration: () => {
					this.requireRuntimeLive(runtime);
					return this.options.getGeneration();
				},
				getNavigationRevision: () => {
					this.requireRuntimeLive(runtime);
					return this.options.getNavigationRevision();
				},
				getState: () => {
					this.requireRuntimeLive(runtime);
					return this.options.getState();
				},
				hasCurrentSnapshot: () => {
					this.requireRuntimeLive(runtime);
					return this.options.hasCurrentSnapshot();
				}
			});
		}
		return Object.freeze(context);
	}
	dispatchStateChanged() {
		if (!this.canContinue()) return;
		const revision = this.stateRevision;
		for (const runtime of this.runtimes) {
			if (!this.isDispatchCurrent(revision)) break;
			const callback = runtime.status === "active" ? runtime.stateChanged : null;
			if (callback === null) continue;
			let result;
			try {
				result = invokeForUnknownResult(callback, []);
			} catch (cause) {
				this.quarantine(runtime, "stateChanged", cause);
				continue;
			}
			if (observeThenable(result, () => void 0)) this.quarantine(runtime, "stateChanged", /* @__PURE__ */ new TypeError("Extension state hooks must return void synchronously."));
			else if (result !== void 0) this.quarantine(runtime, "stateChanged", /* @__PURE__ */ new TypeError("Extension state hooks must return void."));
		}
		if (this.shouldRedispatch(revision)) this.notifyStateChangedWithoutRevision();
	}
	notifyStateChangedWithoutRevision() {
		if (this.isStateNotificationPending || this.isStopped || !this.runtimes.some((runtime) => runtime.status === "active" && runtime.stateChanged !== null)) return;
		this.isStateNotificationPending = true;
		const dispatch = () => {
			this.isStateNotificationPending = false;
			this.dispatchStateChanged();
		};
		try {
			queueMicrotask(dispatch);
		} catch {
			dispatch();
		}
	}
	quarantine(runtime, hook, cause) {
		if (runtime.status === "quarantined" || runtime.status === "stopped") return;
		runtime.status = "quarantined";
		const controller = runtime.controller;
		runtime.controller = null;
		const dispose = runtime.dispose;
		runtime.dispose = null;
		runtime.stateChanged = null;
		try {
			controller?.abort();
		} catch (abortFailure) {
			cause = new AggregateError([cause, abortFailure], "Extension failure and abort both failed.");
		}
		const cleanupFailure = invokeDispose(dispose);
		if (cleanupFailure !== null) cause = new AggregateError([cause, cleanupFailure], "Extension failure and disposal both failed.");
		this.reportFailure(runtime.definition.id, hook, cause);
	}
	stopRuntime(runtime, reportDisposeFailure) {
		if (runtime.status === "stopped") return;
		runtime.status = "stopped";
		const controller = runtime.controller;
		runtime.controller = null;
		const dispose = runtime.dispose;
		runtime.dispose = null;
		runtime.stateChanged = null;
		let failure = null;
		try {
			controller?.abort();
		} catch (cause) {
			failure = cause;
		}
		const disposeFailure = invokeDispose(dispose);
		if (disposeFailure !== null) failure = failure === null ? disposeFailure : new AggregateError([failure, disposeFailure], "Extension abort and disposal both failed.");
		if (failure !== null && reportDisposeFailure) this.reportFailure(runtime.definition.id, "dispose", failure);
	}
	disposeDetached(runtime, dispose) {
		const failure = invokeDispose(dispose);
		if (failure !== null && runtime.status !== "quarantined") this.reportFailure(runtime.definition.id, "dispose", failure);
	}
	isRuntimeLive(runtime) {
		return !this.isStopped && (runtime.status === "activating" || runtime.status === "active") && runtime.controller?.signal.aborted === false && this.options.isLive();
	}
	canContinue() {
		return !this.isStopped && this.options.isLive();
	}
	isActivationCurrent(runtime, controller) {
		return runtime.status === "activating" && !controller.signal.aborted && this.canContinue();
	}
	isDispatchCurrent(revision) {
		return revision === this.stateRevision && this.canContinue();
	}
	shouldRedispatch(revision) {
		return !this.isStopped && revision !== this.stateRevision;
	}
	requireRuntimeLive(runtime) {
		if (!this.isRuntimeLive(runtime)) throw new Error(`Extension ${runtime.definition.id} is no longer active.`);
	}
	reportFailure(runtimeId, hook, cause) {
		try {
			this.options.reportFailure(runtimeId, hook, cause);
		} catch (reportingFailure) {
			reportCalendarError(new AggregateError([cause, reportingFailure], `Extension ${runtimeId} failure could not be reported.`));
		}
	}
};
function resolveExtensionRuntimes(extensions) {
	if (extensions === void 0) return Object.freeze([]);
	let isArray;
	try {
		isArray = Array.isArray(extensions);
	} catch (cause) {
		throw createConfigurationError("extensions could not be inspected.", cause);
	}
	if (!isArray) throw createConfigurationError("extensions must be an array.");
	const snapshot = snapshotConfigurationArray(extensions, "extensions", false);
	const values = /* @__PURE__ */ new Set();
	const identifiers = /* @__PURE__ */ new Map();
	const runtimes = [];
	for (const [index, value] of snapshot.entries()) {
		let definition;
		try {
			definition = resolveRegisteredExtension(value);
		} catch (cause) {
			throw createConfigurationError(`extensions[${index.toString()}] could not be inspected.`, cause);
		}
		if (definition === null) throw createConfigurationError(`extensions[${index.toString()}] is not an extension issued by this package instance.`);
		if (values.has(value)) throw createConfigurationError(`extensions[${index.toString()}] repeats an earlier configured extension value.`);
		values.add(value);
		const firstIndex = identifiers.get(definition.id);
		if (firstIndex !== void 0) throw createConfigurationError(`extensions[${index.toString()}] repeats extension ID ${definition.id} from extensions[${firstIndex.toString()}].`);
		identifiers.set(definition.id, index);
		runtimes.push({
			controller: null,
			definition,
			dispose: null,
			stateChanged: null,
			status: "pending"
		});
	}
	return Object.freeze(runtimes);
}
function normalizeExtensionInstance(value) {
	if (value === void 0) return null;
	if (typeof value !== "object" && typeof value !== "function" || value === null || Array.isArray(value)) throw new TypeError("Extension activation must return void or a lifecycle object.");
	let keys;
	try {
		keys = Reflect.ownKeys(value);
	} catch (cause) {
		throw new TypeError("An extension lifecycle object could not be inspected.", { cause });
	}
	if (keys.some((key) => key !== "dispose" && key !== "stateChanged")) throw new TypeError("An extension lifecycle object contains an unsupported hook.");
	let dispose;
	let stateChanged;
	try {
		dispose = Reflect.get(value, "dispose");
		stateChanged = Reflect.get(value, "stateChanged");
	} catch (cause) {
		throw new TypeError("An extension lifecycle hook could not be read.", { cause });
	}
	if (dispose !== void 0 && typeof dispose !== "function") throw new TypeError("Extension dispose must be a function.");
	if (stateChanged !== void 0 && typeof stateChanged !== "function") throw new TypeError("Extension stateChanged must be a function.");
	return Object.freeze({
		...dispose === void 0 ? {} : { dispose },
		...stateChanged === void 0 ? {} : { stateChanged }
	});
}
function invokeDispose(dispose) {
	if (dispose === null) return null;
	try {
		const result = invokeForUnknownResult(dispose, []);
		if (observeThenable(result, () => void 0)) return /* @__PURE__ */ new TypeError("Extension disposal must return void synchronously.");
		return result === void 0 ? null : /* @__PURE__ */ new TypeError("Extension disposal must return void.");
	} catch (cause) {
		return cause;
	}
}
//#endregion
//#region src/internal/runtime/navigation-revision.ts
/** Tracks calendar-wide navigation ownership for public and registered-extension navigation. */
var CalendarNavigationRevisionTracker = class {
	currentRevision = 0;
	nextRevision = 0;
	get revision() {
		return this.currentRevision;
	}
	/** Reserves the next revision for a coordinated extension navigation. */
	begin() {
		this.nextRevision += 1;
		return this.nextRevision;
	}
	/** Releases a reservation whose navigation did not commit. */
	cancel(revision) {
		this.nextRevision = Math.max(this.nextRevision, revision);
	}
	/** Claims ownership for an ordinary or explicitly reserved navigation. */
	claim(revision) {
		if (revision === void 0) {
			this.nextRevision += 1;
			this.currentRevision = this.nextRevision;
			return this.currentRevision;
		}
		if (revision < this.currentRevision) return null;
		this.currentRevision = revision;
		return revision;
	}
	/** Whether a committed navigation still owns the newest revision. */
	isCurrent(revision) {
		return revision === this.currentRevision;
	}
	/** Completes a still-current extension navigation, including a valid no-op. */
	complete(revision) {
		if (revision > this.currentRevision) this.currentRevision = revision;
	}
};
//#endregion
//#region src/internal/runtime/registered-extension-host.ts
/** Owns generic extension lifecycle, event projection, and navigation transactions. */
var RegisteredExtensionHost = class {
	eventPager = null;
	manager;
	navigation = new CalendarNavigationRevisionTracker();
	options;
	constructor(options) {
		this.options = options;
		this.manager = new RegisteredExtensionManager({
			abortControllerConstructor: options.abortControllerConstructor,
			document: options.document,
			extensions: options.extensions,
			getGeneration: options.getGeneration,
			getNavigationRevision: () => this.navigation.revision,
			getPresentationEventPage: (date, offset, limit) => {
				this.eventPager ??= new RegisteredExtensionEventPager();
				return this.eventPager.getPage(options.getEventsByDate(), date, offset, limit, options.isDateAllowed);
			},
			getState: options.getState,
			hasCurrentSnapshot: options.hasCurrentSnapshot,
			isLive: options.isLive,
			navigate: (target) => this.commitNavigation(target),
			reportFailure: options.reportFailure
		});
	}
	get hasExtensions() {
		return this.manager.hasExtensions;
	}
	activate() {
		this.manager.activate();
	}
	claimNavigation(navigationRevision) {
		return this.navigation.claim(navigationRevision);
	}
	isNavigationCurrent(navigationRevision) {
		return this.navigation.isCurrent(navigationRevision);
	}
	notifyStateChanged() {
		this.manager.notifyStateChanged();
	}
	stop() {
		this.manager.stop();
	}
	commitNavigation(target) {
		const selectedDateBefore = formatCalendarDate(this.options.getSelectedDate());
		const stateBefore = this.options.getState();
		const generationBefore = this.options.getGeneration();
		const navigationRevision = this.navigation.begin();
		try {
			this.options.performNavigation(target, navigationRevision);
		} catch (cause) {
			this.navigation.cancel(navigationRevision);
			throw cause;
		}
		this.navigation.complete(navigationRevision);
		const generation = this.options.getGeneration();
		const startedLoad = generationBefore !== generation;
		if (this.navigation.isCurrent(navigationRevision) && !startedLoad && this.options.getState() === stateBefore) this.manager.notifyStateChanged();
		return Object.freeze({
			changed: selectedDateBefore !== formatCalendarDate(this.options.getSelectedDate()),
			generation,
			navigationRevision,
			startedLoad
		});
	}
};
/** Creates no persistent host for omitted or empty extension registration. */
function createRegisteredExtensionHost(options) {
	if (options === null) return null;
	const host = new RegisteredExtensionHost(options);
	return host.hasExtensions ? host : null;
}
//#endregion
//#region src/internal/runtime/message-configuration.ts
var CALENDAR_MESSAGE_TOKENS = Object.freeze({
	actionErrorMessage: [],
	actionErrorTitle: [],
	agendaEmpty: [],
	agendaMore: ["count"],
	agendaProgress: ["total", "visible"],
	agendaTitle: ["date"],
	allDay: [],
	cancel: [],
	chooseMonthYear: ["date"],
	dayLabel: [
		"count",
		"date",
		"eventLabel"
	],
	event: [],
	events: [],
	renderHookErrorMessage: [],
	renderHookErrorTitle: [],
	gridMore: ["count"],
	gridEventCount: ["count", "eventLabel"],
	gridEventCountLabel: [
		"count",
		"date",
		"eventLabel"
	],
	gridEventInstructions: [],
	gridMoreLabel: [
		"count",
		"date",
		"eventLabel"
	],
	internalErrorMessage: [],
	internalErrorTitle: [],
	jump: [],
	jumpToMonthYear: [],
	loadErrorMessage: [],
	loadErrorTitle: [],
	month: [],
	navigation: [],
	next: [],
	previous: [],
	recovered: [],
	refreshErrorMessage: [],
	refreshErrorTitle: [],
	retry: [],
	retrying: [],
	today: [],
	year: []
});
var CALENDAR_MESSAGE_KEYS = Object.freeze(Object.keys(CALENDAR_MESSAGE_TOKENS));
var CALENDAR_MESSAGE_KEY_SET = new Set(CALENDAR_MESSAGE_KEYS);
/** Resolves a partial message set over the immutable English defaults. */
function resolveCalendarMessages(messages) {
	if (messages !== void 0 && !isConfigurationRecord(messages)) throw createConfigurationError("messages must be an object when supplied.");
	if (messages !== void 0) assertKnownConfigurationKeys(messages, CALENDAR_MESSAGE_KEY_SET, "messages");
	const resolved = { ...DEFAULT_CALENDAR_MESSAGES };
	for (const key of CALENDAR_MESSAGE_KEYS) {
		const value = messages === void 0 ? void 0 : readConfigurationValue(messages, key, `messages.${key}`);
		if (value === void 0) continue;
		if (typeof value !== "string" || value.trim().length === 0) throw createConfigurationError(`messages.${key} must be a non-empty string.`);
		validateCalendarMessageTokens(key, value);
		resolved[key] = value;
	}
	return Object.freeze(resolved);
}
function validateCalendarMessageTokens(key, template) {
	const supportedTokens = CALENDAR_MESSAGE_TOKENS[key];
	for (const match of template.matchAll(/\{([^{}]+)\}/g)) {
		const token = match[1];
		if (token !== void 0 && !supportedTokens.includes(token)) throw createConfigurationError(`messages.${key} contains unsupported template token "{${token}}".`);
	}
}
//#endregion
//#region src/internal/runtime/render-hook-element-integrity.ts
/** Captures package-owned element topology and markup before consumer render code runs. */
function captureRenderHookElementIntegrity(elements) {
	const uniqueElements = [...new Set(elements.filter((element) => element !== null))];
	const states = [];
	const capturedNodes = /* @__PURE__ */ new Set();
	for (const element of uniqueElements) captureNodeState(element, capturedNodes, states);
	return Object.freeze({ states: Object.freeze(states) });
}
/** Rejects direct mutation of package-owned elements exposed for render-hook inspection. */
function assertRenderHookElementIntegrity(snapshot, hookName) {
	for (const state of snapshot.states) if (state.node.parentNode !== state.parent || !hasIdenticalNodeValueAndAttributes(state) || !hasIdenticalChildren(state.node, state.children)) throw new TypeError(`${hookName} must not mutate package-owned render elements directly.`);
}
/** Rejects package-owned attribute or text changes while allowing an owned slot to receive output. */
function assertRenderHookElementValueIntegrity(snapshot, hookName) {
	if (snapshot.states.some((state) => !hasIdenticalNodeValueAndAttributes(state))) throw new TypeError(`${hookName} output must not change package-owned render attributes or text when mounted.`);
}
/** Captures one package-owned node's attributes and text without traversing its children. */
function captureRenderHookNodeValueIntegrity(node) {
	return Object.freeze({
		attributes: captureAttributes(node),
		nodeValue: node.nodeValue
	});
}
/** Returns whether one package-owned node retains its captured attributes and text. */
function hasRenderHookNodeValueIntegrity(node, snapshot) {
	return node.nodeValue === snapshot.nodeValue && hasIdenticalAttributes(node, snapshot.attributes);
}
/** Returns every public package-owned element in one event representation. */
function getEventRenderHookProtectedElements(elements) {
	return Object.freeze([
		elements.action,
		elements.details,
		elements.leading,
		elements.marker,
		elements.root,
		elements.time,
		elements.title,
		elements.trailing
	]);
}
function captureAttributes(node) {
	if (node.nodeType !== 1) return Object.freeze([]);
	const element = node;
	return Object.freeze(element.getAttributeNames().sort().flatMap((name) => [name, element.getAttribute(name) ?? ""]));
}
function captureNodeState(node, capturedNodes, states) {
	if (capturedNodes.has(node)) return;
	capturedNodes.add(node);
	const children = Object.freeze([...node.childNodes]);
	states.push(Object.freeze({
		...captureRenderHookNodeValueIntegrity(node),
		children,
		node,
		parent: node.parentNode
	}));
	for (const child of children) {
		if (hasNodeLease(child)) continue;
		captureNodeState(child, capturedNodes, states);
	}
}
function hasIdenticalNodeValueAndAttributes(state) {
	return hasRenderHookNodeValueIntegrity(state.node, state);
}
function hasIdenticalAttributes(node, expected) {
	const current = captureAttributes(node);
	return current.length === expected.length && current.every((value, index) => value === expected[index]);
}
function hasIdenticalChildren(node, expected) {
	return node.childNodes.length === expected.length && expected.every((child, index) => node.childNodes.item(index) === child);
}
//#endregion
//#region src/internal/runtime/render-hook-visuals.ts
var CUSTOM_EVENT_OVERFLOW_CLASS = "lfc-has-custom-event-overflow";
var SUPPRESSED_EVENT_OVERFLOW_CLASS = "lfc-is-event-overflow-suppressed";
/** Owns singleton visual render-hook invocation and package-default recovery. */
var RenderHookVisualRenderer = class {
	options;
	constructor(options) {
		this.options = options;
	}
	/** Renders an event marker through its singleton hook or the package default. */
	renderEventMarker(container, accentColor, protectedElements, createContext) {
		if (this.options.isDestroyed()) return;
		const runtime = this.options.renderHooks.find((candidate) => !candidate.quarantined && candidate.definition.renderEventMarker !== void 0);
		if (runtime === void 0) {
			container.append(createEventAccent(this.options.document, accentColor));
			return;
		}
		const hook = runtime.definition.renderEventMarker;
		if (hook === void 0) {
			container.append(createEventAccent(this.options.document, accentColor));
			return;
		}
		const controller = runtime.controller;
		const context = Object.freeze(createContext(controller.signal));
		const surface = context["surface"];
		try {
			const elementIntegrity = captureRenderHookElementIntegrity(protectedElements);
			const result = hook(context);
			const returnedThenable = observeThenable(result, (cause) => {
				this.options.reportLateFailure(runtime, "renderEventMarker", cause, surface);
			});
			if (!this.options.isInvocationCurrent(runtime, controller)) {
				if (returnedThenable) this.options.reportLateFailure(runtime, "renderEventMarker", /* @__PURE__ */ new TypeError("renderEventMarker must return a node or null synchronously."), surface);
				return;
			}
			assertRenderHookElementIntegrity(elementIntegrity, "renderEventMarker");
			if (returnedThenable) throw new TypeError("renderEventMarker must return a node or null synchronously.");
			if (result === null) {
				runtime.markerFallbacks.set(container, accentColor);
				return;
			}
			if (result === void 0) throw new TypeError("renderEventMarker must return a node or null.");
			if (!this.options.appendNode(runtime, "renderEventMarker", container, result, true, surface)) {
				if (this.canRestoreFallback(container)) container.append(createEventAccent(this.options.document, accentColor));
				return;
			}
			assertRenderHookElementValueIntegrity(elementIntegrity, "renderEventMarker");
			runtime.markerFallbacks.set(container, accentColor);
		} catch (cause) {
			if (!this.options.isInvocationCurrent(runtime, controller)) {
				this.options.reportLateFailure(runtime, "renderEventMarker", cause, surface);
				return;
			}
			this.options.quarantine(runtime, "renderEventMarker", cause, surface);
			if (this.canRestoreFallback(container)) container.append(createEventAccent(this.options.document, accentColor));
		}
	}
	/** Renders one pre-rendered compact or wide overflow variant through its singleton hook. */
	renderEventOverflow(options) {
		if (options === null || this.options.isDestroyed()) return;
		const runtime = this.options.renderHooks.find((candidate) => !candidate.quarantined && candidate.definition.renderEventOverflow !== void 0);
		if (runtime === void 0) return;
		const hook = runtime.definition.renderEventOverflow;
		if (hook === void 0) return;
		const controller = runtime.controller;
		const surface = options.variant === "compact" ? "day" : "grid-summary";
		const context = Object.freeze({
			date: Object.freeze({ ...options.date }),
			dateString: options.dateString,
			display: options.display,
			document: this.options.document,
			elements: Object.freeze({
				action: options.action,
				content: options.content,
				root: options.root
			}),
			eventCount: options.eventCount,
			overflowCount: options.overflowCount,
			signal: controller.signal,
			surface,
			text: options.text,
			variant: options.variant,
			visibleEventCount: options.visibleEventCount
		});
		try {
			let fallback = runtime.eventOverflowFallbacks.get(options.content);
			if (fallback === void 0) {
				const packageChildren = Object.freeze([...options.content.childNodes]);
				fallback = Object.freeze({
					content: options.content,
					defaultChildren: Object.freeze(packageChildren.map((node) => node.cloneNode(true))),
					detachedPackageIntegrity: null,
					packageChildren,
					root: options.root,
					surface
				});
				runtime.eventOverflowFallbacks.set(options.content, fallback);
			}
			const elementIntegrity = captureRenderHookElementIntegrity(getEventOverflowProtectedElements(options));
			const packageChildrenIntegrity = captureRenderHookElementIntegrity(fallback.packageChildren);
			const result = hook(context);
			const returnedThenable = observeThenable(result, (cause) => {
				this.options.reportLateFailure(runtime, "renderEventOverflow", cause, surface);
			});
			if (!this.options.isInvocationCurrent(runtime, controller)) {
				if (returnedThenable) this.options.reportLateFailure(runtime, "renderEventOverflow", /* @__PURE__ */ new TypeError("renderEventOverflow must return a node, null, or undefined synchronously."), surface);
				return;
			}
			assertRenderHookElementIntegrity(elementIntegrity, "renderEventOverflow");
			if (returnedThenable) throw new TypeError("renderEventOverflow must return a node, null, or undefined synchronously.");
			if (result === void 0) return;
			if (result === null) {
				if (options.variant === "compact" && options.action === null) {
					options.root.classList.add(SUPPRESSED_EVENT_OVERFLOW_CLASS);
					fallback = detachPackageFallbackChildren(fallback);
					runtime.eventOverflowFallbacks.set(options.content, fallback);
				}
				return;
			}
			if (!this.options.appendNode(runtime, "renderEventOverflow", options.content, result, true, surface)) return;
			assertRenderHookElementIntegrity(packageChildrenIntegrity, "renderEventOverflow");
			assertRenderHookElementValueIntegrity(elementIntegrity, "renderEventOverflow");
			fallback = detachPackageFallbackChildren(fallback);
			runtime.eventOverflowFallbacks.set(options.content, fallback);
			options.root.classList.add(CUSTOM_EVENT_OVERFLOW_CLASS);
		} catch (cause) {
			if (!this.options.isInvocationCurrent(runtime, controller)) {
				this.options.reportLateFailure(runtime, "renderEventOverflow", cause, surface);
				return;
			}
			this.options.quarantine(runtime, "renderEventOverflow", cause, surface);
		}
	}
	/** Clears stale fallback bookkeeping when an ordinary render or teardown releases render-hook nodes. */
	clearFallbackTracking(runtime) {
		const errors = [];
		for (const { root } of runtime.eventOverflowFallbacks.values()) try {
			root.classList.remove(CUSTOM_EVENT_OVERFLOW_CLASS, SUPPRESSED_EVENT_OVERFLOW_CLASS);
		} catch (cause) {
			errors.push(cause);
		}
		runtime.eventOverflowFallbacks.clear();
		runtime.markerFallbacks.clear();
		return errors;
	}
	/** Restores package-owned visual fallbacks after render hooks are quarantined. */
	restoreFallbacks(runtime) {
		const errors = [];
		if (!this.options.isDestroyed()) {
			for (const [container, accentColor] of runtime.markerFallbacks) {
				if (container.childNodes.length > 0) continue;
				try {
					container.append(createEventAccent(this.options.document, accentColor));
				} catch (cause) {
					errors.push(cause);
				}
			}
			for (const fallback of runtime.eventOverflowFallbacks.values()) {
				try {
					fallback.root.classList.remove(CUSTOM_EVENT_OVERFLOW_CLASS, SUPPRESSED_EVENT_OVERFLOW_CLASS);
				} catch (cause) {
					errors.push(cause);
				}
				try {
					if (!hasEquivalentChildren(fallback.content, fallback.defaultChildren)) fallback.content.replaceChildren(...fallback.defaultChildren.map((node) => node.cloneNode(true)));
				} catch (cause) {
					errors.push(cause);
				}
			}
		}
		runtime.eventOverflowFallbacks.clear();
		runtime.markerFallbacks.clear();
		return errors;
	}
	canRestoreFallback(container) {
		return !this.options.isDestroyed() && container.childNodes.length === 0;
	}
};
function hasEquivalentChildren(container, expectedChildren) {
	if (container.childNodes.length !== expectedChildren.length) return false;
	return expectedChildren.every((expected, index) => container.childNodes.item(index).isEqualNode(expected));
}
function detachPackageFallbackChildren(fallback) {
	for (const child of fallback.packageChildren) if (child.parentNode === fallback.content) fallback.content.removeChild(child);
	return Object.freeze({
		...fallback,
		detachedPackageIntegrity: captureRenderHookElementIntegrity(fallback.packageChildren)
	});
}
function getEventOverflowProtectedElements(options) {
	const protectedElements = [
		options.action,
		options.root,
		options.content
	];
	if (options.variant === "compact" && options.action === null) protectedElements.push(options.placementBoundary);
	return Object.freeze(protectedElements);
}
//#endregion
//#region src/internal/runtime/render-hook-nodes.ts
/** Owns render-hook node validation, leasing, append rollback, and mounted revalidation. */
var RenderHookNodeRenderer = class {
	nodeOwners = /* @__PURE__ */ new WeakMap();
	options;
	packageSkeletons = [];
	constructor(options) {
		this.options = options;
	}
	/** Appends one synchronous render-hook result and returns whether it supplies visual content. */
	append(runtime, hookName, container, result, requirePresentationalContent = false, surface) {
		const controller = runtime.controller;
		const output = this.resolveOutput(hookName, result);
		if (requirePresentationalContent && !output.hasPresentationalContent) return false;
		if (!this.options.isInvocationCurrent(runtime, controller)) return false;
		const invocation = Object.freeze({
			controller,
			hookName,
			surface
		});
		this.claimNodes(runtime, container, output.nodes, invocation);
		try {
			container.append(result);
		} catch (cause) {
			this.throwAppendFailure(runtime, container, output.nodes, invocation, hookName, cause);
		}
		const invalidCause = this.getInvalidAppendCause(runtime, container, output.nodes, invocation);
		if (invalidCause === null) return output.hasPresentationalContent;
		const cleanupErrors = this.rollbackNodes(runtime, container, output.nodes, invocation);
		if (cleanupErrors.length > 0) throw new AggregateError(cleanupErrors, `${hookName} output became invalid and cleanup failed.`);
		if (!this.options.isInvocationCurrent(runtime, controller)) return false;
		throw invalidCause;
	}
	/** Clears package topology captured for a previous render attempt. */
	beginRenderPass() {
		this.packageSkeletons.length = 0;
	}
	/** Seals prospective package children before their detached region is connected. */
	sealPackageSkeleton(region, expectedChildren, expectedAncestors, ownerDepth) {
		if (!this.options.enabled) return;
		const ancestry = Object.freeze([region, ...expectedAncestors]);
		if (ancestry.at(-1) !== this.options.host || !hasExpectedAncestry(ancestry)) throw new TypeError("A stable calendar render region was detached or reparented.");
		for (const owner of getNodesAtDepth(expectedChildren, ownerDepth)) this.sealPackageOwner(owner, region, expectedAncestors);
		const entries = [];
		const contributors = /* @__PURE__ */ new Map();
		this.capturePackageSkeleton(region, expectedChildren, entries, contributors);
		this.packageSkeletons.push(Object.freeze({
			ancestry,
			contributors,
			entries: Object.freeze(entries),
			stableShell: true
		}));
	}
	/** Revalidates output after detached render fragments have connected to the document. */
	getMountedValidationFailure(runtime) {
		for (const [node, expectedParent] of runtime.nodes) {
			const invocation = runtime.nodeInvocations.get(node);
			if (invocation === void 0) return Object.freeze({
				cause: /* @__PURE__ */ new TypeError("Render-hook output lost its render ownership."),
				hookName: "render",
				surface: void 0
			});
			if (node.parentNode !== expectedParent || this.nodeOwners.get(node) !== runtime || !ownsNodeLease(node, runtime.leaseToken)) return Object.freeze({
				cause: /* @__PURE__ */ new TypeError("Render-hook output must remain attached to its assigned slot while rendering."),
				hookName: invocation.hookName,
				surface: invocation.surface
			});
			if (containsInteractiveContent(node)) return Object.freeze({
				cause: /* @__PURE__ */ new TypeError("Render-hook output must remain noninteractive when mounted."),
				hookName: invocation.hookName,
				surface: invocation.surface
			});
		}
		for (const fallback of runtime.eventOverflowFallbacks.values()) {
			if (fallback.detachedPackageIntegrity === null) continue;
			try {
				assertRenderHookElementIntegrity(fallback.detachedPackageIntegrity, "renderEventOverflow");
			} catch (cause) {
				return Object.freeze({
					cause: cause instanceof TypeError ? cause : new TypeError("Detached package-owned overflow content could not be validated.", { cause }),
					hookName: "renderEventOverflow",
					surface: fallback.surface
				});
			}
		}
		return null;
	}
	/** Returns the first sealed package tree changed during custom-element connection. */
	getPackageSkeletonValidationFailure() {
		for (const skeleton of this.packageSkeletons.filter((candidate) => candidate.stableShell)) if (!hasExpectedAncestry(skeleton.ancestry)) return Object.freeze({
			cause: /* @__PURE__ */ new TypeError("A stable calendar render region was detached or reparented."),
			contributors: Object.freeze([]),
			stableShellCorrupted: true
		});
		for (const skeleton of this.packageSkeletons) {
			const ancestryChanged = !hasExpectedAncestry(skeleton.ancestry);
			const childrenChanged = skeleton.entries.some((entry) => !hasExpectedChildren(entry));
			const valuesChanged = skeleton.entries.some((entry) => !hasRenderHookNodeValueIntegrity(entry.parent, entry.valueIntegrity));
			if (!ancestryChanged && !childrenChanged && !valuesChanged) continue;
			return Object.freeze({
				cause: createPackageSkeletonMutationError(ancestryChanged, childrenChanged, valuesChanged),
				contributors: Object.freeze([...skeleton.contributors.values()].map((contributor) => resolveSkeletonContributor(contributor))),
				stableShellCorrupted: skeleton.stableShell && ancestryChanged
			});
		}
		return null;
	}
	sealPackageOwner(owner, region, expectedRegionAncestors) {
		const entries = [];
		const contributors = /* @__PURE__ */ new Map();
		this.capturePackageSkeleton(owner, [...owner.childNodes], entries, contributors);
		if (contributors.size === 0) return;
		this.packageSkeletons.push(Object.freeze({
			ancestry: createProspectiveAncestry(owner, region, expectedRegionAncestors),
			contributors,
			entries: Object.freeze(entries),
			stableShell: false
		}));
	}
	/** Collects every runtime implicated by leased-node or package-skeleton validation. */
	getMountedValidationFailures(runtimes) {
		if (!this.options.enabled) return Object.freeze([]);
		const failures = /* @__PURE__ */ new Map();
		for (const runtime of runtimes) {
			if (runtime.quarantined) continue;
			try {
				const failure = this.getMountedValidationFailure(runtime);
				if (failure !== null) failures.set(runtime, Object.freeze({
					...failure,
					runtime
				}));
			} catch (cause) {
				failures.set(runtime, Object.freeze({
					cause,
					hookName: "render",
					runtime,
					surface: void 0
				}));
			}
		}
		const skeletonFailure = this.getPackageSkeletonValidationFailure();
		if (skeletonFailure === null) return Object.freeze([...failures.values()]);
		if (skeletonFailure.stableShellCorrupted || skeletonFailure.contributors.length === 0) throw skeletonFailure.cause;
		for (const contributor of skeletonFailure.contributors) if (!contributor.runtime.quarantined && !failures.has(contributor.runtime)) failures.set(contributor.runtime, Object.freeze({
			...contributor,
			cause: skeletonFailure.cause
		}));
		return Object.freeze([...failures.values()]);
	}
	resolveOutput(hookName, result) {
		if (!isSameDocumentNode(this.options.document, result) || !isAppendableNode(result)) throw new TypeError(`${hookName} must return only appendable nodes owned by the host document.`);
		if (result.parentNode !== null || result.contains(this.options.host) || hasNodeLease(result)) throw new TypeError(`${hookName} must return a detached node that does not contain the calendar host.`);
		const nodes = result.nodeType === 11 ? [...result.childNodes] : [result];
		for (const node of nodes) {
			if (!isSameDocumentNode(this.options.document, node) || !isAppendableNode(node) || hasNodeLease(node)) throw new TypeError(`${hookName} returned a node that is invalid or already leased.`);
			if (containsInteractiveContent(node)) throw new TypeError(`${hookName} must return noninteractive content.`);
		}
		return Object.freeze({
			hasPresentationalContent: nodes.some((node) => containsPresentationalContent(node)),
			nodes: Object.freeze(nodes)
		});
	}
	claimNodes(runtime, container, nodes, invocation) {
		for (const node of nodes) {
			setNodeLease(node, runtime.leaseToken);
			this.nodeOwners.set(node, runtime);
			runtime.nodeInvocations.set(node, invocation);
			runtime.nodes.set(node, container);
		}
	}
	capturePackageSkeleton(parent, children, entries, contributors) {
		const expectedChildren = Object.freeze([...children]);
		entries.push(Object.freeze({
			children: expectedChildren,
			parent,
			valueIntegrity: captureRenderHookNodeValueIntegrity(parent)
		}));
		for (const child of expectedChildren) {
			const runtime = this.nodeOwners.get(child);
			const invocation = runtime?.nodeInvocations.get(child);
			if (runtime !== void 0 && invocation !== void 0 && ownsNodeLease(child, runtime.leaseToken)) {
				let contributor = contributors.get(runtime);
				if (contributor === void 0) {
					contributor = {
						hookNames: /* @__PURE__ */ new Set(),
						runtime,
						surfaces: /* @__PURE__ */ new Set()
					};
					contributors.set(runtime, contributor);
				}
				contributor.hookNames.add(invocation.hookName);
				contributor.surfaces.add(invocation.surface);
				continue;
			}
			this.capturePackageSkeleton(child, [...child.childNodes], entries, contributors);
		}
	}
	getInvalidAppendCause(runtime, container, nodes, invocation) {
		if (!nodes.every((node) => runtime.nodeInvocations.get(node) === invocation && runtime.nodes.get(node) === container && ownsNodeLease(node, runtime.leaseToken) && node.parentNode === container)) return /* @__PURE__ */ new TypeError(`${invocation.hookName} output must remain attached to its assigned slot.`);
		return nodes.every((node) => !containsInteractiveContent(node)) ? null : /* @__PURE__ */ new TypeError(`${invocation.hookName} must return content that remains noninteractive when mounted.`);
	}
	rollbackNodes(runtime, container, nodes, invocation) {
		const cleanupErrors = [];
		for (const node of nodes) {
			if (runtime.nodeInvocations.get(node) !== invocation || runtime.nodes.get(node) !== container || !ownsNodeLease(node, runtime.leaseToken)) continue;
			runtime.nodeInvocations.delete(node);
			runtime.nodes.delete(node);
			try {
				if (node.parentNode === container) container.removeChild(node);
			} catch (cause) {
				cleanupErrors.push(cause);
			} finally {
				releaseNodeLease(node, runtime.leaseToken);
			}
		}
		return cleanupErrors;
	}
	throwAppendFailure(runtime, container, nodes, invocation, hookName, cause) {
		const cleanupErrors = this.rollbackNodes(runtime, container, nodes, invocation);
		if (cleanupErrors.length > 0) throw new AggregateError([cause, ...cleanupErrors], `${hookName} failed while appending render-hook content.`);
		throw cause;
	}
};
function hasExpectedAncestry(ancestry) {
	for (let index = 0; index < ancestry.length - 1; index += 1) if (ancestry[index]?.parentNode !== ancestry[index + 1]) return false;
	return true;
}
function createProspectiveAncestry(owner, region, expectedRegionAncestors) {
	const ancestry = [owner];
	let ancestor = owner.parentNode;
	while (ancestor !== null && ancestor !== region) {
		ancestry.push(ancestor);
		ancestor = ancestor.parentNode;
	}
	ancestry.push(region, ...expectedRegionAncestors);
	return Object.freeze(ancestry);
}
function getNodesAtDepth(children, depth) {
	let nodes = [...children];
	for (let level = 1; level < depth; level += 1) nodes = nodes.flatMap((node) => [...node.childNodes]);
	return nodes;
}
function hasExpectedChildren(entry) {
	if (entry.parent.childNodes.length !== entry.children.length) return false;
	return entry.children.every((child, index) => entry.parent.childNodes.item(index) === child);
}
function createPackageSkeletonMutationError(ancestryChanged, childrenChanged, valuesChanged) {
	if (valuesChanged && !ancestryChanged && !childrenChanged) return /* @__PURE__ */ new TypeError("Render-hook output must not change package-owned render attributes or text when mounted.");
	if (!valuesChanged) return /* @__PURE__ */ new TypeError("Render-hook output must not add, remove, or reparent package-owned render nodes.");
	return /* @__PURE__ */ new TypeError("Render-hook output must not change package-owned render attributes, text, or topology when mounted.");
}
function resolveSkeletonContributor(contributor) {
	return Object.freeze({
		hookName: contributor.hookNames.size === 1 ? contributor.hookNames.values().next().value ?? "render" : "render",
		runtime: contributor.runtime,
		surface: contributor.surfaces.size === 1 ? contributor.surfaces.values().next().value : void 0
	});
}
//#endregion
//#region src/internal/runtime/render-hook-context.ts
/** Creates the stable values retained until an event mount hook is invoked. */
function createEventMountContext(elements, date, dateString, event, surface, timeText) {
	return Object.freeze({
		date: Object.freeze({ ...date }),
		dateString,
		document: elements.root.ownerDocument,
		elements,
		event,
		surface,
		timeText
	});
}
//#endregion
//#region src/internal/runtime/coordinator.ts
var AGENDA_DOM_LIMIT_DEFAULT = 200;
var AGENDA_DOM_LIMIT_MAXIMUM = 500;
var AGENDA_DOM_LIMIT_MINIMUM = 50;
var AGENDA_PAGE_SIZE_DEFAULT = 50;
var AGENDA_PAGE_SIZE_MAXIMUM = 100;
var AGENDA_PAGE_SIZE_MINIMUM = 10;
var DAYS_PER_WEEK = 7;
var GRID_EVENT_LIMIT_DEFAULT = 3;
var GRID_EVENT_LIMIT_MAXIMUM = 10;
var GRID_EVENT_LIMIT_MINIMUM = 0;
var ROOT_CLASS = "litefold-calendar";
var SOURCE_EVENT_LIMIT_DEFAULT = 1e4;
var SOURCE_EVENT_LIMIT_MAXIMUM = 1e4;
var SOURCE_EVENT_LIMIT_MINIMUM = 1;
var instanceSequence = 0;
var HOST_OWNERS = /* @__PURE__ */ new WeakMap();
/**
* A dependency-free, agenda-first month calendar.
*
* Generated CSS classes and data attributes other than the documented root
* selector and tokens are private implementation details.
*/
var MonthCalendar = class {
	abortControllerConstructor;
	agendaDomLimit;
	agendaPageSize;
	bounds;
	dayFormatter;
	document;
	eventBaseUrl;
	eventOverflowPresenter;
	eventText;
	eventSource;
	renderHooks;
	renderHookNodes;
	renderHookVisuals;
	fallbackElement;
	firstDay;
	fullDateFormatter;
	gridEventLimit;
	headingLevel;
	host;
	iconNodes;
	integrationNodes;
	instanceName;
	messages;
	minDate;
	maxDate;
	monthNameFormatter;
	monthPickerController;
	monthTitleRenderer;
	now;
	numberFormatter;
	options;
	registeredExtensions;
	sourceEventLimit;
	sourcePublication = new CalendarEventSourcePublication();
	swipeEnabled;
	swipeGesture;
	timeZone;
	toolbarEnd;
	weekdayFormatter;
	weekdayNarrowFormatter;
	window;
	activeController = null;
	announcementGeneration = 0;
	announcementPresenter = null;
	actionPipeline = new CalendarActionPipeline({
		canInvoke: () => this.canContinueInteraction(),
		isLive: () => !this.isDestroyed && !this.hasFatalError,
		messages: () => this.messages,
		clearIssue: (name) => {
			this.clearIssues((entry) => entry.key === `action-failed:${name}`, true);
		},
		report: (name, error, isCurrent) => {
			if (error.stale) {
				this.deliverError(error);
				return;
			}
			this.acceptError(error, {
				key: `action-failed:${name}`,
				politeness: "assertive",
				retryable: false
			}, true, "default", isCurrent);
		}
	});
	agendaVisibleCount;
	currentEventsByDate = /* @__PURE__ */ new Map();
	currentRange = null;
	dayButtons = /* @__PURE__ */ new Map();
	displayedMonth;
	dom = null;
	palette = null;
	eventReplacementSequence = 0;
	focusedDate;
	generation = 0;
	hasFatalError = false;
	hasCurrentSnapshot = false;
	contextAvailabilityFailureReported = false;
	internalIssues = [];
	isDestroyed = false;
	isRendered = false;
	isRetrying = false;
	loadedRangeKey = null;
	latestAcceptedEventReplacement = 0;
	eventActions = /* @__PURE__ */ new Map();
	gridActionsByDate = /* @__PURE__ */ new Map();
	gridMoreButtons = /* @__PURE__ */ new Map();
	agendaMoreButton = null;
	selectedDate;
	renderGeneration = 0;
	interactionEpoch = 0;
	committedRender = null;
	selectionEntryDate = null;
	state;
	constructor(host, options) {
		if (!isHTMLElementLike(host)) throw createConfigurationError("A valid HTMLElement host is required.");
		const resolvedOptions = snapshotCalendarOptions(options);
		const events = resolveCalendarEvents(resolvedOptions);
		this.host = host;
		try {
			this.document = host.ownerDocument;
			this.window = this.document.defaultView;
			this.eventBaseUrl = this.document.baseURI;
		} catch (cause) {
			throw createConfigurationError("The host document could not be read.", cause);
		}
		this.fallbackElement = resolveFallbackElement(this.document, this.host, resolvedOptions.fallbackElement);
		this.abortControllerConstructor = this.window?.AbortController ?? globalThis.AbortController;
		this.eventSource = events;
		this.sourceEventLimit = normalizeIntegerOption(resolvedOptions.sourceEventLimit, SOURCE_EVENT_LIMIT_DEFAULT, SOURCE_EVENT_LIMIT_MINIMUM, SOURCE_EVENT_LIMIT_MAXIMUM, "sourceEventLimit");
		this.gridEventLimit = normalizeIntegerOption(resolvedOptions.maxGridEventsPerDay, GRID_EVENT_LIMIT_DEFAULT, GRID_EVENT_LIMIT_MINIMUM, GRID_EVENT_LIMIT_MAXIMUM, "maxGridEventsPerDay");
		this.agendaPageSize = normalizeIntegerOption(resolvedOptions.agendaPageSize, AGENDA_PAGE_SIZE_DEFAULT, AGENDA_PAGE_SIZE_MINIMUM, AGENDA_PAGE_SIZE_MAXIMUM, "agendaPageSize");
		this.agendaDomLimit = normalizeIntegerOption(resolvedOptions.agendaDomLimit, AGENDA_DOM_LIMIT_DEFAULT, AGENDA_DOM_LIMIT_MINIMUM, AGENDA_DOM_LIMIT_MAXIMUM, "agendaDomLimit");
		this.agendaVisibleCount = Math.min(this.agendaPageSize, this.agendaDomLimit);
		this.headingLevel = normalizeIntegerOption(resolvedOptions.headingLevel, 2, 1, 6, "headingLevel");
		if (resolvedOptions.swipe !== void 0 && typeof resolvedOptions.swipe !== "boolean") throw createConfigurationError("swipe must be a boolean.");
		this.swipeEnabled = resolvedOptions.swipe ?? true;
		this.swipeGesture = new SwipeGestureController({
			canInteract: () => this.canContinueInteraction() && HOST_OWNERS.get(this.host) === this,
			enabled: this.swipeEnabled,
			getDom: () => this.dom,
			host: this.host,
			navigate: (amount) => this.shiftMonth(amount, true),
			window: this.window
		});
		const locale = normalizeLocale(resolvedOptions.locale);
		this.timeZone = normalizeTimeZone(resolvedOptions.timeZone);
		this.firstDay = resolveFirstDay(resolvedOptions.firstDay, locale);
		this.now = resolvedOptions.now ?? (() => /* @__PURE__ */ new Date());
		this.minDate = this.resolveConfiguredBound(resolvedOptions.minDate, "minDate");
		this.maxDate = this.resolveConfiguredBound(resolvedOptions.maxDate, "maxDate");
		if (this.minDate !== void 0 && this.maxDate !== void 0 && compareCalendarDates(this.minDate, this.maxDate) > 0) throw createConfigurationError("minDate must not follow maxDate.");
		this.bounds = new CalendarBounds(this.firstDay, this.minDate, this.maxDate);
		if (!this.bounds.hasAllowedRenderableMonth()) throw createConfigurationError("minDate and maxDate do not contain a renderable calendar month.");
		this.messages = resolveCalendarMessages(resolvedOptions.messages);
		const icons = resolveCalendarIcons(resolvedOptions.icons);
		this.iconNodes = resolveIconNodes(this.document, this.host, icons);
		this.toolbarEnd = resolveToolbarEnd(this.document, this.host, resolvedOptions.toolbarEnd);
		this.renderHooks = createRenderHookRuntimes(resolvedOptions.renderHooks, this.abortControllerConstructor);
		this.renderHookNodes = new RenderHookNodeRenderer({
			document: this.document,
			enabled: this.renderHooks.length > 0,
			host: this.host,
			isInvocationCurrent: (runtime, controller) => this.isRenderHookInvocationCurrent(runtime, controller)
		});
		this.renderHookVisuals = new RenderHookVisualRenderer({
			appendNode: (runtime, hookName, container, result, requirePresentationalContent, surface) => {
				return this.renderHookNodes.append(runtime, hookName, container, result, requirePresentationalContent, surface);
			},
			document: this.document,
			renderHooks: this.renderHooks,
			isDestroyed: () => this.isDestroyed,
			isInvocationCurrent: (runtime, controller) => this.isRenderHookInvocationCurrent(runtime, controller),
			quarantine: (runtime, hookName, cause, surface) => {
				this.quarantineRenderHook(runtime, hookName, cause, surface);
			},
			reportLateFailure: (runtime, hookName, cause, surface) => {
				this.reportLateRenderHookFailure(runtime, hookName, cause, surface);
			}
		});
		this.options = Object.freeze({
			...resolvedOptions,
			events,
			renderHooks: Object.freeze(this.renderHooks.map((runtime) => runtime.definition)),
			...getFallbackOption(this.fallbackElement),
			icons,
			...this.maxDate === void 0 ? {} : { maxDate: this.maxDate },
			messages: this.messages,
			...this.minDate === void 0 ? {} : { minDate: this.minDate }
		});
		this.integrationNodes = new IntegrationNodeController({
			createDetachError: (cause) => createInternalError({
				cause,
				code: "host-integration-failed",
				hook: "destroy",
				message: "An application integration node could not be detached during destroy.",
				phase: "destroy",
				recoverable: false,
				severity: "warning",
				userMessage: this.messages.internalErrorMessage,
				userTitle: this.messages.internalErrorTitle
			}),
			createLeaseError: () => this.createPublicMethodError("invalid-state", "render", "render() cannot claim integration nodes that are unavailable to this calendar host."),
			document: this.document,
			fallbackElement: this.fallbackElement,
			host: this.host,
			iconNodes: this.iconNodes,
			reportDetachError: (error) => {
				this.deliverError(error);
			},
			toolbarEnd: this.toolbarEnd
		});
		const today = this.getTodayDateForConstruction();
		const initialDate = resolvedOptions.initialDate === void 0 ? this.bounds.resolveImplicitInitialDate(today) : this.projectDateInput(resolvedOptions.initialDate);
		if (initialDate === null) throw createConfigurationError("initialDate must be a valid supported civil date or Date.");
		if (!this.bounds.isDateAllowed(initialDate)) throw createConfigurationError("initialDate must fall within minDate and maxDate.");
		this.displayedMonth = {
			day: 1,
			month: initialDate.month,
			year: initialDate.year
		};
		if (!isRenderableMonth(this.displayedMonth, this.firstDay)) throw createConfigurationError("initialDate falls outside the renderable calendar range.");
		this.selectedDate = initialDate;
		this.focusedDate = initialDate;
		this.instanceName = `lfc-${String(++instanceSequence)}`;
		this.dayFormatter = new Intl.DateTimeFormat(locale, {
			calendar: "gregory",
			day: "numeric",
			timeZone: "UTC"
		});
		this.fullDateFormatter = new Intl.DateTimeFormat(locale, {
			calendar: "gregory",
			day: "numeric",
			month: "long",
			timeZone: "UTC",
			weekday: "long",
			year: "numeric"
		});
		this.numberFormatter = new Intl.NumberFormat(locale);
		this.eventText = new CalendarEventText(locale, this.fullDateFormatter, this.messages, this.numberFormatter);
		this.eventOverflowPresenter = new CalendarEventOverflowPresenter({
			document: this.document,
			gridEventLimit: this.gridEventLimit,
			gridEventDisplay: resolvedOptions.gridEventDisplay,
			locale,
			messages: this.messages,
			numberFormatter: this.numberFormatter
		});
		this.monthNameFormatter = new Intl.DateTimeFormat(locale, {
			calendar: "gregory",
			month: "long",
			timeZone: "UTC"
		});
		this.monthTitleRenderer = new CalendarMonthTitleRenderer({
			chooseMonthYear: this.messages.chooseMonthYear,
			locale
		});
		this.weekdayFormatter = new Intl.DateTimeFormat(locale, {
			calendar: "gregory",
			timeZone: "UTC",
			weekday: "short"
		});
		this.weekdayNarrowFormatter = new Intl.DateTimeFormat(locale, {
			calendar: "gregory",
			timeZone: "UTC",
			weekday: "narrow"
		});
		this.monthPickerController = new CalendarMonthPickerController({
			canContinue: () => this.canContinueInteraction(),
			document: this.document,
			getDisplayedMonth: () => this.displayedMonth,
			getElements: () => this.dom,
			getPreferredDay: () => this.selectedDate.day,
			isMonthAllowed: (month) => this.bounds.isMonthAllowed(month),
			onNavigate: (target) => {
				this.showDate(target, "jumpToMonthYear");
			},
			resolveMonthTarget: (month, preferredDay) => this.bounds.resolveMonthTarget(month, preferredDay)
		});
		this.state = createState("idle", null, [], this.displayedMonth, this.selectedDate);
		this.registeredExtensions = this.createRegisteredExtensionHost(resolvedOptions.extensions);
	}
	/** Adds the calendar to its host and starts loading the visible month. */
	render() {
		if (this.isDestroyed) throw this.createPublicMethodError("invalid-state", "render", "render() cannot be called after destroy().");
		if (this.isRendered) return;
		const existingOwner = HOST_OWNERS.get(this.host);
		if (existingOwner !== void 0 && existingOwner !== this) throw this.createPublicMethodError("invalid-state", "render", "render() cannot claim a host owned by another live calendar instance.");
		HOST_OWNERS.set(this.host, this);
		try {
			this.integrationNodes.claim();
		} catch (cause) {
			HOST_OWNERS.delete(this.host);
			this.integrationNodes.release();
			throw cause;
		}
		const activeBefore = getOwnedActiveElement(this.document, this.host);
		try {
			this.host.classList.add(ROOT_CLASS);
			this.palette = new CalendarPalette(this.host, this.window);
			this.host.setAttribute("data-litefold-calendar", "");
			if (this.swipeEnabled) this.host.setAttribute("data-lfc-swipe-enabled", "true");
			this.dom = this.createStructure();
			this.isRendered = true;
			this.integrationNodes.updateFallback(this.hasCurrentSnapshot, this.hasFatalError);
			this.loadVisibleEvents(false);
			this.registeredExtensions?.activate();
			if (this.activeController === null) this.registeredExtensions?.notifyStateChanged();
		} catch (cause) {
			this.isRendered = true;
			this.handleFatalError(cause, wasOwnedFocusRemoved(activeBefore, this.host));
		}
	}
	/** Aborts pending work, removes listeners, runs render-hook cleanup, and clears the host. */
	destroy() {
		if (this.isDestroyed) return;
		this.isDestroyed = true;
		this.interactionEpoch += 1;
		this.committedRender = null;
		this.isRendered = false;
		this.monthPickerController.hide(false);
		this.palette?.disconnect();
		this.palette = null;
		this.generation += 1;
		this.registeredExtensions?.stop();
		this.actionPipeline.clear();
		this.resetInternalAnnouncement();
		this.activeController?.abort();
		this.activeController = null;
		const ownsHost = HOST_OWNERS.get(this.host) === this;
		this.swipeGesture.disconnect(ownsHost);
		for (const runtime of this.renderHooks) {
			runtime.controller.abort();
			const cleanupErrors = this.runRenderHookCleanups(runtime);
			cleanupErrors.push(...releaseLeasedNodes(runtime.nodes, runtime.leaseToken));
			cleanupErrors.push(...this.renderHookVisuals.clearFallbackTracking(runtime));
			if (cleanupErrors.length > 0) this.reportRenderHookCleanupErrors(runtime, cleanupErrors, false);
		}
		if (ownsHost) {
			this.integrationNodes.detachMountedNodes();
			this.host.replaceChildren();
			this.host.classList.remove(ROOT_CLASS);
			this.host.removeAttribute("data-litefold-calendar");
			this.host.removeAttribute("data-lfc-swipe-enabled");
			this.host.removeAttribute("data-lfc-swipe-state");
			this.host.removeAttribute("aria-busy");
			HOST_OWNERS.delete(this.host);
		}
		this.integrationNodes.restoreFallback();
		this.integrationNodes.release();
		this.dom = null;
		this.announcementPresenter = null;
		this.currentEventsByDate = /* @__PURE__ */ new Map();
		this.currentRange = null;
		this.dayButtons.clear();
		this.eventActions.clear();
		this.gridActionsByDate.clear();
		this.gridMoreButtons.clear();
		this.agendaMoreButton = null;
		this.hasCurrentSnapshot = false;
		this.internalIssues = [];
		this.setState("destroyed");
	}
	/** Replaces the complete event input and loads the current visible range. */
	setEvents(events) {
		this.requireLive("setEvents");
		const replacementSequence = ++this.eventReplacementSequence;
		let resolvedEvents;
		try {
			resolvedEvents = resolveCalendarEvents({ events });
		} catch (cause) {
			throw this.createPublicMethodError("invalid-argument", "setEvents", "setEvents(events) requires a readable static event array or event source function.", cause);
		}
		if (!this.canContinueInteraction() || replacementSequence < this.latestAcceptedEventReplacement) return;
		this.latestAcceptedEventReplacement = replacementSequence;
		this.interactionEpoch += 1;
		this.eventSource = resolvedEvents;
		this.swipeGesture.clear();
		this.loadVisibleEvents(false);
	}
	/** Forces the current visible range to be loaded again. */
	refetchEvents() {
		this.requireLive("refetchEvents");
		this.interactionEpoch += 1;
		this.swipeGesture.clear();
		this.loadVisibleEvents(true);
	}
	/** Moves to the month containing a supported civil date, string, or instant. */
	gotoDate(value) {
		this.requireLive("gotoDate");
		const date = this.projectDateInput(value);
		if (date === null) throw this.createPublicMethodError("invalid-argument", "gotoDate", "gotoDate(date) requires a valid supported civil date or Date.");
		this.showDate(date, "gotoDate");
	}
	/** Selects and focuses a supported civil date, string, or instant. */
	focusDate(value) {
		this.requireLive("focusDate");
		const date = this.projectDateInput(value);
		if (date === null) throw this.createPublicMethodError("invalid-argument", "focusDate", "focusDate(date) requires a valid supported civil date or Date.");
		this.selectDate(date, "focusDate");
	}
	/** Selects and focuses the date returned by the configured clock. */
	focusToday() {
		this.requireLive("focusToday");
		this.navigateToToday(true);
	}
	/** Moves to the previous month. */
	prev() {
		this.requireLive("prev");
		this.shiftMonth(-1);
	}
	/** Moves to the next month. */
	next() {
		this.requireLive("next");
		this.shiftMonth(1);
	}
	/** Moves to the date returned by the configured clock. */
	today() {
		this.requireLive("today");
		this.navigateToToday(false);
	}
	/** Returns an immutable state snapshot without raw error causes. */
	getState() {
		return this.state;
	}
	createRegisteredExtensionHost(extensions) {
		return createRegisteredExtensionHost(extensions === void 0 ? null : {
			abortControllerConstructor: this.abortControllerConstructor,
			document: this.document,
			extensions,
			getEventsByDate: () => this.currentEventsByDate,
			getGeneration: () => this.generation,
			getSelectedDate: () => this.selectedDate,
			getState: () => this.state,
			hasCurrentSnapshot: () => this.hasCurrentSnapshot,
			isDateAllowed: (date) => this.bounds.isDateAllowed(date),
			isLive: () => this.canContinueInteraction(),
			performNavigation: (target, navigationRevision) => {
				this.performExtensionNavigation(target, navigationRevision);
			},
			reportFailure: (extensionId, hook, cause) => {
				this.reportRegisteredExtensionFailure(extensionId, hook, cause);
			}
		});
	}
	performExtensionNavigation(target, navigationRevision) {
		switch (target.target) {
			case "date":
				this.showDate(target.date, "gotoDate", false, navigationRevision);
				break;
			case "today":
				this.navigateToToday(false, navigationRevision);
				break;
			case "previous-month":
				this.shiftMonth(-1, false, navigationRevision);
				break;
			case "next-month": this.shiftMonth(1, false, navigationRevision);
		}
	}
	claimNavigation(navigationRevision) {
		if (!this.canContinueInteraction()) return null;
		const revision = this.registeredExtensions?.claimNavigation(navigationRevision) ?? (this.registeredExtensions === null ? 0 : null);
		if (revision !== null) this.interactionEpoch += 1;
		return revision;
	}
	isNavigationCurrent(navigationRevision) {
		return this.registeredExtensions?.isNavigationCurrent(navigationRevision) ?? true;
	}
	canCompleteNavigation(navigationRevision, interactionEpoch) {
		return this.canContinueInteraction() && this.interactionEpoch === interactionEpoch && this.isNavigationCurrent(navigationRevision);
	}
	createStructure() {
		const dom = createCalendarStructure(this.options, {
			document: this.document,
			headingLevel: this.headingLevel,
			host: this.host,
			iconNodes: this.iconNodes,
			instanceName: this.instanceName,
			integrationParents: this.integrationNodes.parents,
			maxYear: this.maxDate?.year ?? 9999,
			messages: this.messages,
			minYear: this.minDate?.year ?? 1,
			monthNameFormatter: this.monthNameFormatter,
			onMonthPickerBeforeToggle: this.monthPickerController.handleBeforeToggle,
			onMonthPickerCancel: this.monthPickerController.handleCancel,
			onMonthPickerSubmit: this.monthPickerController.handleSubmit,
			onMonthPickerTitleClick: this.monthPickerController.handleTitleClick,
			onMonthPickerToggle: this.monthPickerController.handleToggle,
			onMonthPickerYearInput: this.monthPickerController.handleYearInput,
			onNavigate: (direction) => {
				if (this.canContinueInteraction()) this.shiftMonth(direction === "next" ? 1 : -1);
			},
			onRetry: this.handleRetry,
			onToday: (event) => {
				const target = event.currentTarget;
				if (this.canContinueInteraction() && target?.getAttribute("aria-disabled") !== "true") this.navigateToToday(false);
			},
			toolbarEnd: this.toolbarEnd
		});
		this.announcementPresenter = new CalendarAnnouncementPresenter(dom);
		if (!this.hasFatalError) this.swipeGesture.connect(dom);
		return dom;
	}
	updateMonthTitle(dom) {
		this.monthTitleRenderer.render(dom, this.displayedMonth);
	}
	renderCalendar() {
		if (this.hasFatalError) return false;
		const activeBefore = getOwnedActiveElement(this.document, this.host);
		this.committedRender = null;
		try {
			return this.renderCalendarUnsafe();
		} catch (cause) {
			this.handleFatalError(cause, wasOwnedFocusRemoved(activeBefore, this.host));
			return false;
		}
	}
	renderCalendarUnsafe() {
		const dom = this.dom;
		if (!this.isRendered || this.isDestroyed || dom === null) return false;
		const interactionEpoch = this.interactionEpoch;
		this.swipeGesture.prepareForRender(dom);
		const focus = captureCalendarFocus(this.document.activeElement, this.host, this.dom, this.getGridFocusElements());
		let remainingRecoveryAttempts = this.renderHooks.filter((runtime) => !runtime.quarantined).length;
		while (remainingRecoveryAttempts >= 0) {
			const quarantinedBeforeAttempt = this.getQuarantinedRenderHookCount();
			this.renderHookNodes.beginRenderPass();
			const renderGeneration = ++this.renderGeneration;
			this.prepareRenderHooksForRender(renderGeneration);
			if (this.wasRenderInterrupted(dom, renderGeneration)) return false;
			this.updateMonthTitle(dom);
			dom.titleButton.removeAttribute("aria-disabled");
			const today = this.getTodayDate(false);
			this.updateNavigationAvailability(dom, today);
			this.renderWeekdays(dom.weekdays);
			const dayButtons = /* @__PURE__ */ new Map(), gridMoreButtons = /* @__PURE__ */ new Map();
			const eventActions = /* @__PURE__ */ new Map();
			const gridActionsByDate = /* @__PURE__ */ new Map();
			const dayMounts = this.renderHooks.length === 0 ? null : [];
			const eventMounts = dayMounts === null ? null : [];
			const days = getCalendarMonthRange(this.displayedMonth, this.firstDay).days;
			if (!renderMonthWeeks(dom.weeks, days, (date) => this.createDayCell(date, today, dayButtons, eventActions, gridActionsByDate, gridMoreButtons, dayMounts, eventMounts, renderGeneration), () => !this.wasRenderInterrupted(dom, renderGeneration), (weeks) => {
				this.renderHookNodes.sealPackageSkeleton(dom.weeks, weeks, [
					dom.grid,
					dom.swipeViewport,
					this.host
				], 2);
			}) || this.wasRenderInterrupted(dom, renderGeneration)) return false;
			this.selectionEntryDate = null;
			this.renderAgenda(dom, eventActions, eventMounts, renderGeneration);
			if (this.wasRenderInterrupted(dom, renderGeneration)) return false;
			let newlyQuarantined = this.getQuarantinedRenderHookCount() - quarantinedBeforeAttempt;
			if (newlyQuarantined === 0) newlyQuarantined = this.validateMountedRenderHookNodes();
			if (this.wasRenderInterrupted(dom, renderGeneration)) return false;
			if (newlyQuarantined > 0) {
				remainingRecoveryAttempts -= newlyQuarantined;
				continue;
			}
			this.dayButtons = dayButtons;
			this.eventActions = eventActions;
			this.gridActionsByDate = gridActionsByDate;
			this.gridMoreButtons = gridMoreButtons;
			if (dayMounts !== null && eventMounts !== null) this.runMountHooks(dayMounts, eventMounts);
			if (this.wasRenderInterrupted(dom, renderGeneration)) return false;
			this.renderIssues();
			if (this.wasRenderInterrupted(dom, renderGeneration)) return false;
			restoreCalendarFocus(focus, this.dom, this.getGridFocusElements(), formatCalendarDate(this.focusedDate), this.host, () => this.interactionEpoch === interactionEpoch && !this.wasRenderInterrupted(dom, renderGeneration));
			if (this.wasRenderInterrupted(dom, renderGeneration)) return false;
			this.committedRender = Object.freeze({
				dateString: formatCalendarDate(this.selectedDate),
				dom,
				interactionEpoch,
				renderGeneration
			});
			return true;
		}
		throw new TypeError("Render-hook recovery exceeded the configured hook-set bound.");
	}
	renderWeekdays(container) {
		renderWeekdayHeadings(container, {
			document: this.document,
			firstDay: this.firstDay,
			formatFullDate: (date) => this.fullDateFormatter.formatToParts(date).find((part) => part.type === "weekday")?.value ?? this.weekdayFormatter.format(date),
			formatNarrow: (date) => this.weekdayNarrowFormatter.format(date),
			formatShort: (date) => this.weekdayFormatter.format(date)
		});
	}
	createDayCell(date, today, dayButtons, eventActions, gridActionsByDate, gridMoreButtons, dayMounts, eventMounts, renderGeneration) {
		const isAllowed = this.bounds.isDateAllowed(date);
		const isCurrentMonth = date.year === this.displayedMonth.year && date.month === this.displayedMonth.month;
		const isSelected = compareCalendarDates(date, this.selectedDate) === 0;
		const isToday = today !== null && compareCalendarDates(date, today) === 0;
		const isFocused = isAllowed && compareCalendarDates(date, this.focusedDate) === 0;
		const dateString = formatCalendarDate(date);
		const events = isAllowed ? this.currentEventsByDate.get(dateString) ?? [] : [];
		const fullDateText = this.eventText.formatFullDate(date);
		const { badge, button, cell, number, summaries } = createDayCellElements({
			accessibleLabel: isAllowed ? this.eventText.getDayAccessibleLabel(fullDateText, events.length) : fullDateText,
			dateString,
			dayNumber: this.dayFormatter.format(toUtcDate(date)),
			document: this.document,
			isAllowed,
			isCurrentMonth,
			isFocused,
			isSelected,
			isToday,
			selectionEntryDate: this.selectionEntryDate
		});
		const dayElements = Object.freeze({
			badge,
			button,
			cell,
			number,
			summaries
		});
		this.renderHookSlot("renderDayBadge", badge, (signal) => ({
			date: { ...date },
			dateString,
			document: this.document,
			elements: dayElements,
			isCurrentMonth,
			isSelected,
			isToday,
			signal,
			surface: "day"
		}), Object.values(dayElements));
		if (!this.isRenderGenerationCurrent(renderGeneration)) return cell;
		const gridActions = new DayGridActionCollector(eventActions);
		for (const event of events.slice(0, this.gridEventLimit)) {
			const rendered = this.createEventRepresentation(event, date, "grid-summary", eventMounts, fullDateText, renderGeneration);
			if (rendered === null) return cell;
			gridActions.registerEvent(getEventActionKey("grid-summary", dateString, event.event.id), rendered.elements);
			summaries.append(rendered.elements.root);
		}
		const eventOverflow = this.eventOverflowPresenter.prepareAndPlace({
			compactPrimary: gridActions.compactPrimary,
			date,
			dateString,
			eventCount: events.length,
			fullDateText,
			summaries
		});
		if (eventOverflow.grid !== null) {
			const { button: gridMore } = eventOverflow.grid;
			installGridOverflowActionListeners({
				action: gridMore,
				date,
				events: () => events.map((event) => event.event),
				invokeAction: (action) => {
					this.actionPipeline.invoke("onEventOverflowActivate", action);
				},
				captureCurrent: () => {
					const epoch = this.interactionEpoch;
					return () => epoch === this.interactionEpoch && this.canUseRenderedAction(gridMore, renderGeneration);
				},
				needsContext: this.options.onEventOverflowDefault !== void 0,
				onActivate: this.options.onEventOverflowActivate,
				onDefault: (activation) => {
					if (this.bounds.getDateNavigationFailure(date) !== null) return;
					completeEventOverflowDefault(this.selectDate(date, "gridMore"), activation, {
						host: this.host,
						isCurrent: (completion) => this.interactionEpoch === completion.interactionEpoch && this.isRenderCommitCurrent(completion),
						onDefault: this.options.onEventOverflowDefault,
						invokeAction: (action) => {
							this.actionPipeline.invoke("onEventOverflowDefault", action);
						}
					});
				},
				onKeydown: (event) => {
					this.handleRenderedGridActionKeydown(event, dateString, gridMore, renderGeneration);
				}
			});
		}
		this.renderHookVisuals.renderEventOverflow(eventOverflow.compact);
		if (!this.isRenderGenerationCurrent(renderGeneration)) return cell;
		if (eventOverflow.grid !== null) {
			const { button: gridMore, wide } = eventOverflow.grid;
			this.renderHookVisuals.renderEventOverflow(wide);
			if (!this.isRenderGenerationCurrent(renderGeneration)) return cell;
			gridActions.registerOverflow(gridMore);
			gridMoreButtons.set(dateString, gridMore);
			summaries.append(gridMore);
		}
		const gridActionSnapshot = gridActions.snapshot();
		gridActionsByDate.set(dateString, gridActionSnapshot);
		button.addEventListener("click", (jsEvent) => {
			if (!this.canUseRenderedAction(button, renderGeneration) || !this.bounds.isDateAllowed(date) || !isRenderableMonth({
				day: 1,
				month: date.month,
				year: date.year
			}, this.firstDay)) return;
			this.selectDate(date, "onDaySelect", true);
			if (this.isDestroyed) return;
			const selectedButton = this.dayButtons.get(dateString);
			if (selectedButton === void 0) return;
			const context = createDaySelection(jsEvent, date, selectedButton);
			const onDaySelect = this.options.onDaySelect;
			if (onDaySelect !== void 0) this.actionPipeline.invoke("onDaySelect", () => onDaySelect(context));
		});
		button.addEventListener("keydown", (event) => {
			if (!this.canUseRenderedAction(button, renderGeneration)) return;
			if (event.key === "F2" && gridActionSnapshot.length > 0) {
				if (enterGridActions(dateString, this.getGridFocusElements(), this.host)) event.preventDefault();
				return;
			}
			this.handleDayKeydown(event, date, button);
		});
		setDayActionShortcuts(button, gridActions.compactPrimary !== null, eventOverflow, this.options.onDayContextMenu !== void 0);
		if (this.options.onDayContextMenu !== void 0) button.addEventListener("contextmenu", (jsEvent) => {
			if (jsEvent.defaultPrevented || !this.canUseRenderedAction(button, renderGeneration) || !this.bounds.isDateAllowed(date)) return;
			jsEvent.preventDefault();
			this.invokeDayContextMenu(jsEvent, date, button, jsEvent.clientX, jsEvent.clientY);
		});
		dayButtons.set(dateString, button);
		dayMounts?.push({ context: Object.freeze({
			date: Object.freeze({ ...date }),
			dateString,
			elements: Object.freeze({
				badge,
				button,
				cell,
				number,
				summaries
			}),
			isCurrentMonth,
			isSelected,
			isToday,
			surface: "day"
		}) });
		return cell;
	}
	createEventRepresentation(event, date, surface, eventMounts, fullDateText, renderGeneration) {
		const hasContextAction = this.isEventContextMenuAvailable(event.event, date, surface);
		if (!this.isRenderGenerationCurrent(renderGeneration)) return null;
		const dateString = formatCalendarDate(date);
		const timeText = this.eventText.getEventTimeText(event, date);
		const hasApplicationAction = this.options.onEventActivate !== void 0 || hasContextAction;
		const representation = createEventRepresentation({
			accessibleLabel: surface === "grid-summary" && (event.event.url !== null || hasApplicationAction) ? this.eventText.getEventAccessibleLabel(event, timeText, fullDateText) : "",
			dateString,
			document: this.document,
			event,
			hasApplicationAction,
			surface,
			timeDisplay: this.options.eventTimeDisplay ?? "all",
			timeText
		});
		const { action, details, marker, trailing } = representation.elements;
		if (this.renderHooks.length === 0) marker.append(createEventAccent(this.document, event.event.accentColor));
		else {
			const protectedEventElements = getEventRenderHookProtectedElements(representation.elements);
			const makeContext = (signal) => ({
				date: Object.freeze({ ...date }),
				dateString,
				document: this.document,
				elements: representation.elements,
				event: event.event,
				signal,
				surface,
				timeText
			});
			this.renderHookVisuals.renderEventMarker(marker, event.event.accentColor, protectedEventElements, makeContext);
			if (!this.isRenderGenerationCurrent(renderGeneration)) return null;
			this.renderHookSlot("renderEventLeading", representation.slots.leadingContent, makeContext, protectedEventElements);
			if (!this.isRenderGenerationCurrent(renderGeneration)) return null;
			this.renderHookSlot("renderEventDetails", details, makeContext, protectedEventElements);
			if (!this.isRenderGenerationCurrent(renderGeneration)) return null;
			this.renderHookSlot("renderEventTrailing", trailing, makeContext, protectedEventElements);
		}
		if (!this.isRenderGenerationCurrent(renderGeneration)) return null;
		if (action !== null) this.installEventActionListeners(action, event.event, date, surface, hasContextAction, renderGeneration);
		eventMounts?.push({ context: createEventMountContext(representation.elements, date, dateString, event.event, surface, timeText) });
		return representation;
	}
	installEventActionListeners(action, calendarEvent, date, surface, hasContextAction, renderGeneration) {
		const onEventActivate = this.options.onEventActivate;
		installEventActionListeners({
			action,
			hasContextAction,
			isCurrent: () => this.canUseRenderedAction(action, renderGeneration),
			onActivate: onEventActivate === void 0 ? null : (nativeEvent) => {
				const context = createEventActivation(nativeEvent, date, action, calendarEvent, surface);
				this.actionPipeline.invoke("onEventActivate", () => onEventActivate(context));
			},
			onContext: hasContextAction ? (nativeEvent, clientX, clientY) => {
				this.invokeEventContextMenu(nativeEvent, date, action, calendarEvent, surface, clientX, clientY);
			} : null,
			onGridKeydown: surface === "grid-summary" ? (nativeEvent) => {
				this.handleRenderedGridActionKeydown(nativeEvent, formatCalendarDate(date), action, renderGeneration);
			} : null,
			surface
		});
	}
	isEventContextMenuAvailable(event, date, surface) {
		if (this.options.onEventContextMenu === void 0) return false;
		const predicate = this.options.isEventContextMenuAvailable;
		if (predicate === void 0) return true;
		let result;
		try {
			result = invokeForUnknownResult(predicate, [createEventContextMenuAvailability(date, event, surface)]);
		} catch (cause) {
			this.reportContextAvailabilityFailure(cause);
			return false;
		}
		if (typeof result === "boolean") return result && this.canContinueInteraction();
		if (observeThenable(result, () => void 0)) {
			this.reportContextAvailabilityFailure(/* @__PURE__ */ new TypeError("isEventContextMenuAvailable must return a boolean synchronously; thenables are not supported."));
			return false;
		}
		this.reportContextAvailabilityFailure(/* @__PURE__ */ new TypeError("isEventContextMenuAvailable must return a boolean synchronously."));
		return false;
	}
	reportContextAvailabilityFailure(cause) {
		if (this.contextAvailabilityFailureReported || this.isDestroyed) return;
		this.contextAvailabilityFailureReported = true;
		this.recordHostIntegrationFailure("isEventContextMenuAvailable", cause, true, "default");
	}
	renderAgenda(dom, eventActions, eventMounts, renderGeneration) {
		const { agendaFooter: footer, agendaList: list, agendaTitle: title } = dom;
		const selectedDateString = formatCalendarDate(this.selectedDate);
		const fullDateText = this.eventText.formatFullDate(this.selectedDate);
		const titleText = formatCalendarMessage(this.messages.agendaTitle, { date: fullDateText });
		const events = this.currentEventsByDate.get(selectedDateString) ?? [];
		const visibleCount = this.hasCurrentSnapshot ? Math.min(events.length, this.agendaVisibleCount, this.agendaDomLimit) : 0;
		const entries = [];
		for (const event of this.hasCurrentSnapshot ? events.slice(0, visibleCount) : []) {
			const rendered = this.createEventRepresentation(event, this.selectedDate, "agenda", eventMounts, fullDateText, renderGeneration);
			if (rendered === null) return;
			entries.push(Object.freeze({
				action: rendered.elements.action,
				eventId: event.event.id,
				root: rendered.elements.root
			}));
			if (this.wasRenderInterrupted(dom, renderGeneration)) return;
		}
		const hasOverflow = this.hasCurrentSnapshot && visibleCount < events.length;
		const canRevealMore = hasOverflow && visibleCount < this.agendaDomLimit;
		const revealCount = canRevealMore ? Math.min(this.agendaPageSize, this.agendaDomLimit - visibleCount, events.length - visibleCount) : 0;
		const moreText = canRevealMore ? formatCalendarMessage(this.messages.agendaMore, { count: this.numberFormatter.format(revealCount) }) : null;
		const progressText = hasOverflow ? formatCalendarMessage(this.messages.agendaProgress, {
			total: this.numberFormatter.format(events.length),
			visible: this.numberFormatter.format(visibleCount)
		}) : null;
		const presentation = createAgendaPresentation({
			document: this.document,
			emptyText: this.messages.agendaEmpty,
			entries: Object.freeze(entries),
			hasSnapshot: this.hasCurrentSnapshot,
			moreText,
			progressText,
			titleText,
			totalEventCount: events.length
		});
		if (this.wasRenderInterrupted(dom, renderGeneration)) return;
		const more = presentation.moreButton;
		if (more !== null) more.addEventListener("click", () => {
			if (!this.canUseRenderedAction(more, renderGeneration)) return;
			const firstRevealedEventId = events[visibleCount]?.event.id;
			this.agendaVisibleCount = Math.min(this.agendaVisibleCount + this.agendaPageSize, this.agendaDomLimit);
			this.renderCalendar();
			const visibleAfter = Math.min(events.length, this.agendaVisibleCount, this.agendaDomLimit);
			(firstRevealedEventId === void 0 ? this.dom?.agendaTitle ?? null : this.eventActions.get(getEventActionKey("agenda", selectedDateString, firstRevealedEventId)) ?? this.dom?.agendaTitle ?? null)?.focus({ preventScroll: true });
			this.announce({
				message: formatCalendarMessage(this.messages.agendaProgress, {
					total: this.numberFormatter.format(events.length),
					visible: this.numberFormatter.format(visibleAfter)
				}),
				politeness: "polite"
			});
		});
		for (const reference of presentation.actionReferences) eventActions.set(getEventActionKey("agenda", selectedDateString, reference.eventId), reference.action);
		title.textContent = presentation.titleText;
		list.hidden = presentation.listHidden;
		if (eventMounts !== null) this.renderHookNodes.sealPackageSkeleton(list, presentation.listItems, [dom.agenda, this.host], 1);
		list.replaceChildren(...presentation.listItems);
		footer.replaceChildren(...presentation.footerChildren);
		this.agendaMoreButton = more;
	}
	renderHookSlot(hookName, container, createContext, protectedElements) {
		for (const runtime of this.renderHooks) {
			if (this.wasRuntimeDestroyed()) return;
			if (this.wasRenderHookQuarantined(runtime)) continue;
			const hook = runtime.definition[hookName];
			if (hook === void 0) continue;
			const controller = runtime.controller;
			const context = Object.freeze(createContext(controller.signal));
			const surface = context["surface"];
			try {
				const elementIntegrity = captureRenderHookElementIntegrity(protectedElements);
				const result = hook(context);
				const returnedThenable = observeThenable(result, (cause) => {
					this.reportLateRenderHookFailure(runtime, hookName, cause, surface);
				});
				if (!this.isRenderHookInvocationCurrent(runtime, controller)) {
					if (returnedThenable) this.reportLateRenderHookFailure(runtime, hookName, /* @__PURE__ */ new TypeError(`${hookName} must return a node synchronously.`), surface);
					return;
				}
				assertRenderHookElementIntegrity(elementIntegrity, hookName);
				if (returnedThenable) throw new TypeError(`${hookName} must return a node synchronously.`);
				if (result === null || result === void 0) continue;
				this.renderHookNodes.append(runtime, hookName, container, result, false, surface);
			} catch (cause) {
				if (!this.isRenderHookInvocationCurrent(runtime, controller)) {
					this.reportLateRenderHookFailure(runtime, hookName, cause, surface);
					return;
				}
				this.quarantineRenderHook(runtime, hookName, cause, surface);
			}
		}
	}
	validateMountedRenderHookNodes() {
		const quarantinedBeforeValidation = this.getQuarantinedRenderHookCount();
		for (const failure of this.renderHookNodes.getMountedValidationFailures(this.renderHooks)) this.quarantineRenderHook(failure.runtime, failure.hookName, failure.cause, failure.surface);
		return this.getQuarantinedRenderHookCount() - quarantinedBeforeValidation;
	}
	getQuarantinedRenderHookCount() {
		return this.renderHooks.filter((runtime) => runtime.quarantined).length;
	}
	runMountHooks(dayMounts, eventMounts) {
		for (const runtime of this.renderHooks) {
			if (this.wasRuntimeDestroyed()) return;
			if (this.wasRenderHookQuarantined(runtime)) continue;
			const dayHook = runtime.definition.dayDidMount;
			if (dayHook !== void 0) {
				for (const registration of dayMounts) if (!this.invokeMountHook(runtime, "dayDidMount", dayHook, registration.context)) break;
			}
			if (this.wasRuntimeDestroyed()) return;
			if (this.wasRenderHookQuarantined(runtime)) continue;
			const eventHook = runtime.definition.eventDidMount;
			if (eventHook !== void 0) {
				for (const registration of eventMounts) if (!this.invokeMountHook(runtime, "eventDidMount", eventHook, registration.context)) break;
			}
		}
	}
	invokeMountHook(runtime, hookName, hook, context) {
		const controller = runtime.controller;
		try {
			const cleanup = hook(Object.freeze({
				...context,
				document: this.document,
				signal: controller.signal
			}));
			if (cleanup !== void 0) {
				const returnedThenable = observeThenable(cleanup, (cause) => {
					this.reportLateRenderHookFailure(runtime, hookName, cause, context["surface"]);
				});
				if (!this.isRenderHookInvocationCurrent(runtime, controller)) {
					if (typeof cleanup === "function") this.runDetachedRenderHookCleanup(runtime, cleanup);
					else if (returnedThenable) this.reportLateRenderHookFailure(runtime, hookName, /* @__PURE__ */ new TypeError(`${hookName} must return a cleanup function synchronously.`), context["surface"]);
					return false;
				}
				if (returnedThenable) throw new TypeError(`${hookName} must return a cleanup function synchronously.`);
				if (typeof cleanup !== "function") throw new TypeError(`${hookName} must return a cleanup function or void.`);
				runtime.cleanups.push(cleanup);
			}
			return this.isRenderHookInvocationCurrent(runtime, controller);
		} catch (cause) {
			if (!this.isRenderHookInvocationCurrent(runtime, controller)) {
				this.reportLateRenderHookFailure(runtime, hookName, cause, context["surface"]);
				return false;
			}
			this.quarantineRenderHook(runtime, hookName, cause, context["surface"]);
			return false;
		}
	}
	prepareRenderHooksForRender(renderGeneration) {
		for (const runtime of this.renderHooks) {
			if (!this.isRenderGenerationCurrent(renderGeneration)) return;
			if (runtime.quarantined) continue;
			const previousController = runtime.controller;
			previousController.abort();
			if (!this.isRenderHookPreparationCurrent(runtime, previousController, renderGeneration)) return;
			const controller = runtime.createController();
			runtime.controller = controller;
			const cleanupErrors = this.runRenderHookCleanups(runtime);
			if (!this.isRenderHookPreparationCurrent(runtime, controller, renderGeneration)) {
				this.handleRenderHookPreparationErrors(runtime, cleanupErrors);
				return;
			}
			cleanupErrors.push(...releaseLeasedNodes(runtime.nodes, runtime.leaseToken));
			if (!this.isRenderHookPreparationCurrent(runtime, controller, renderGeneration)) {
				this.handleRenderHookPreparationErrors(runtime, cleanupErrors);
				return;
			}
			if (cleanupErrors.length > 0) this.handleRenderHookPreparationErrors(runtime, cleanupErrors);
			else {
				const fallbackErrors = this.renderHookVisuals.clearFallbackTracking(runtime);
				if (fallbackErrors.length > 0) this.handleRenderHookPreparationErrors(runtime, fallbackErrors);
			}
		}
	}
	handleRenderHookPreparationErrors(runtime, errors) {
		if (errors.length === 0) return;
		if (this.isDestroyed || runtime.quarantined) {
			this.reportRenderHookCleanupErrors(runtime, errors, false);
			return;
		}
		this.quarantineRenderHook(runtime, "cleanup", errors.length === 1 ? errors[0] : new AggregateError(errors), void 0);
	}
	runRenderHookCleanups(runtime) {
		const errors = [];
		const cleanups = runtime.cleanups.splice(0);
		for (const cleanup of cleanups) try {
			if (observeThenable(invokeForUnknownResult(cleanup, []), (cause) => {
				this.reportRenderHookCleanupErrors(runtime, [cause], this.isRendered && !this.isDestroyed);
			})) errors.push(/* @__PURE__ */ new TypeError("Render-hook cleanup callbacks must return void synchronously."));
		} catch (cause) {
			errors.push(cause);
		}
		return errors;
	}
	runDetachedRenderHookCleanup(runtime, cleanup) {
		const cleanupErrors = [];
		try {
			if (observeThenable(invokeForUnknownResult(cleanup, []), (cause) => {
				this.reportRenderHookCleanupErrors(runtime, [cause], false);
			})) cleanupErrors.push(/* @__PURE__ */ new TypeError("Render-hook cleanup callbacks must return void synchronously."));
		} catch (cause) {
			cleanupErrors.push(cause);
		}
		if (cleanupErrors.length > 0) this.reportRenderHookCleanupErrors(runtime, cleanupErrors, false);
	}
	isRenderHookInvocationCurrent(runtime, controller) {
		return !this.isDestroyed && !runtime.quarantined && runtime.controller === controller && !controller.signal.aborted;
	}
	isRenderHookPreparationCurrent(runtime, controller, renderGeneration) {
		return this.isRenderGenerationCurrent(renderGeneration) && !runtime.quarantined && runtime.controller === controller;
	}
	quarantineRenderHook(runtime, hook, cause, surface) {
		if (runtime.quarantined) return;
		runtime.quarantined = true;
		runtime.controller.abort();
		const nodeErrors = releaseLeasedNodes(runtime.nodes, runtime.leaseToken);
		const fallbackErrors = this.renderHookVisuals.restoreFallbacks(runtime);
		const cleanupErrors = this.runRenderHookCleanups(runtime);
		const isolationErrors = [
			...nodeErrors,
			...fallbackErrors,
			...cleanupErrors
		];
		const error = createInternalError({
			cause: isolationErrors.length === 0 ? cause : new AggregateError([cause, ...isolationErrors], "A render hook and its cleanup failed."),
			code: "render-hook-failed",
			renderHookId: runtime.definition.id,
			hook,
			recoverable: true,
			severity: "warning",
			surface: isRenderHookSurface(surface) ? surface : void 0,
			userMessage: this.messages.renderHookErrorMessage,
			userTitle: this.messages.renderHookErrorTitle
		});
		if (this.isDestroyed) this.deliverError(error);
		else this.acceptError(error, {
			key: `render-hook-failed:${runtime.definition.id}`,
			politeness: "polite",
			retryable: false
		});
	}
	handleRenderedGridActionKeydown(event, dateString, action, renderGeneration) {
		if (!this.canUseRenderedAction(action, renderGeneration)) return;
		handleGridActionKeydown(event, dateString, action, this.getGridFocusElements(), this.host, this.dom?.agendaTitle ?? null);
	}
	getGridFocusElements() {
		return {
			agendaMoreButton: this.agendaMoreButton,
			dayButtons: this.dayButtons,
			eventActions: this.eventActions,
			gridActionsByDate: this.gridActionsByDate,
			gridMoreButtons: this.gridMoreButtons
		};
	}
	handleDayKeydown(event, date, button) {
		if (!this.canContinueInteraction() || !this.bounds.isDateAllowed(date)) return;
		if (this.options.onDayContextMenu !== void 0 && (event.key === "ContextMenu" || event.shiftKey && event.key === "F10")) {
			event.preventDefault();
			const bounds = button.getBoundingClientRect();
			this.invokeDayContextMenu(event, date, button, bounds.left, bounds.bottom);
			return;
		}
		const offsetInWeek = positiveModulo(toUtcDate(date).getUTCDay() - this.firstDay, DAYS_PER_WEEK);
		const horizontalStep = resolveTextDirection(this.window, this.host) === "rtl" ? -1 : 1;
		let target = null;
		let changesDisplayedMonth = false;
		try {
			switch (event.key) {
				case "ArrowLeft":
					target = addCalendarDays(date, -horizontalStep);
					break;
				case "ArrowRight":
					target = addCalendarDays(date, horizontalStep);
					break;
				case "ArrowUp":
					target = addCalendarDays(date, -7);
					break;
				case "ArrowDown":
					target = addCalendarDays(date, DAYS_PER_WEEK);
					break;
				case "Home":
					target = addCalendarDays(date, -offsetInWeek);
					break;
				case "End":
					target = addCalendarDays(date, 6 - offsetInWeek);
					break;
				case "PageUp":
					target = addCalendarMonths(date, event.shiftKey ? -12 : -1);
					changesDisplayedMonth = true;
					break;
				case "PageDown":
					target = addCalendarMonths(date, event.shiftKey ? 12 : 1);
					changesDisplayedMonth = true;
					break;
				default: return;
			}
		} catch {
			event.preventDefault();
			return;
		}
		event.preventDefault();
		this.moveFocus(target, changesDisplayedMonth);
	}
	moveFocus(date, changesDisplayedMonth) {
		const target = changesDisplayedMonth ? this.bounds.resolveMonthTarget({
			day: 1,
			month: date.month,
			year: date.year
		}, date.day) : this.bounds.isDateAllowed(date) ? date : null;
		if (target === null || !isRenderableMonth({
			day: 1,
			month: target.month,
			year: target.year
		}, this.firstDay)) return;
		const range = getCalendarMonthRange(this.displayedMonth, this.firstDay);
		const isVisible = compareCalendarDates(target, range.start) >= 0 && compareCalendarDates(target, range.end) < 0;
		if (changesDisplayedMonth) {
			const navigationRevision = this.claimNavigation();
			if (navigationRevision === null) return;
			const interactionEpoch = this.interactionEpoch;
			this.monthPickerController.hide(false);
			this.focusedDate = target;
			this.displayedMonth = {
				day: 1,
				month: target.month,
				year: target.year
			};
			this.selectedDate = target;
			this.agendaVisibleCount = Math.min(this.agendaPageSize, this.agendaDomLimit);
			this.loadVisibleEvents(false);
			if (this.canCompleteNavigation(navigationRevision, interactionEpoch)) this.dayButtons.get(formatCalendarDate(target))?.focus({ preventScroll: true });
			return;
		}
		if (!isVisible) return;
		this.interactionEpoch += 1;
		this.focusedDate = target;
		for (const candidate of this.dayButtons.values()) candidate.tabIndex = candidate.getAttribute("data-lfc-date") === formatCalendarDate(target) ? 0 : -1;
		this.dayButtons.get(formatCalendarDate(target))?.focus({ preventScroll: true });
	}
	invokeEventContextMenu(nativeEvent, date, element, event, surface, clientX, clientY) {
		const onEventContextMenu = this.options.onEventContextMenu;
		if (onEventContextMenu === void 0) return;
		const context = createEventContextMenu(nativeEvent, date, element, event, surface, clientX, clientY);
		this.actionPipeline.invoke("onEventContextMenu", () => onEventContextMenu(context));
	}
	invokeDayContextMenu(nativeEvent, date, element, clientX, clientY) {
		if (!this.bounds.isDateAllowed(date)) return;
		const context = createDayContextMenu(nativeEvent, date, element, clientX, clientY);
		const onDayContextMenu = this.options.onDayContextMenu;
		if (onDayContextMenu !== void 0) this.actionPipeline.invoke("onDayContextMenu", () => onDayContextMenu(context));
	}
	selectDate(date, invalidHook, animateSelection = false, navigationRevision, moveFocus = true) {
		this.assertNavigableDate(date, invalidHook);
		const changesMonth = date.year * 12 + date.month !== this.displayedMonth.year * 12 + this.displayedMonth.month;
		const changesSelection = compareCalendarDates(date, this.selectedDate) !== 0;
		const stateBeforeNavigation = this.state;
		const generationBeforeNavigation = this.generation;
		const claimedNavigationRevision = this.claimNavigation(navigationRevision);
		if (claimedNavigationRevision === null) return null;
		const interactionEpoch = this.interactionEpoch;
		this.swipeGesture.clear();
		this.monthPickerController.hide(false);
		if (!this.canCompleteNavigation(claimedNavigationRevision, interactionEpoch)) return null;
		this.selectionEntryDate = animateSelection && changesSelection && !changesMonth ? formatCalendarDate(date) : null;
		this.selectedDate = date;
		this.focusedDate = date;
		this.agendaVisibleCount = Math.min(this.agendaPageSize, this.agendaDomLimit);
		if (changesMonth) {
			this.displayedMonth = {
				day: 1,
				month: date.month,
				year: date.year
			};
			this.loadVisibleEvents(false);
		} else this.renderCalendar();
		const completion = this.getSelectionCommit(interactionEpoch);
		if (completion === null) return null;
		if (moveFocus && this.canCompleteNavigation(claimedNavigationRevision, interactionEpoch)) this.dayButtons.get(formatCalendarDate(date))?.focus({ preventScroll: true });
		if (!this.isRenderCommitCurrent(completion)) return null;
		if (!changesMonth && compareCalendarDates(date, this.state.selectedDate) !== 0) this.setState(this.derivePhase());
		if (!this.canCompleteNavigation(claimedNavigationRevision, interactionEpoch)) return null;
		if (!changesMonth) this.notifyUnchangedSelection(navigationRevision, stateBeforeNavigation, generationBeforeNavigation);
		return this.canCompleteNavigation(claimedNavigationRevision, interactionEpoch) ? this.getSelectionCommit(interactionEpoch) : null;
	}
	notifyUnchangedSelection(navigationRevision, state, generation) {
		if (navigationRevision === void 0 && this.state === state && this.generation === generation && !this.sourcePublication.isPending(generation)) this.registeredExtensions?.notifyStateChanged();
	}
	getSelectionCommit(interactionEpoch) {
		const completion = this.committedRender;
		return completion?.interactionEpoch === interactionEpoch && this.isRenderCommitCurrent(completion) ? completion : null;
	}
	isRenderCommitCurrent(completion) {
		return this.canContinueInteraction() && this.committedRender === completion && this.renderGeneration === completion.renderGeneration && this.dom === completion.dom && HOST_OWNERS.get(this.host) === this && formatCalendarDate(this.selectedDate) === completion.dateString;
	}
	shiftMonth(amount, fromPager = false, navigationRevision) {
		if (!fromPager) this.swipeGesture.clear();
		try {
			const targetMonth = addCalendarMonths({
				day: 1,
				month: this.displayedMonth.month,
				year: this.displayedMonth.year
			}, amount);
			const target = this.bounds.resolveMonthTarget(targetMonth, this.selectedDate.day);
			if (target === null) return false;
			const dom = this.dom;
			const renderGeneration = this.renderGeneration;
			this.showDate(target, amount < 0 ? "prev" : "next", true, navigationRevision);
			return this.canContinueInteraction() && this.dom === dom && this.renderGeneration > renderGeneration && this.displayedMonth.year === target.year && this.displayedMonth.month === target.month;
		} catch {
			return false;
		}
	}
	navigateToToday(moveFocus, navigationRevision) {
		const today = this.getTodayDate();
		if (today === null || !this.bounds.isDateAllowed(today) || !isRenderableMonth({
			day: 1,
			month: today.month,
			year: today.year
		}, this.firstDay)) return;
		if (moveFocus) this.selectDate(today, "focusToday", false, navigationRevision);
		else this.showDate(today, "today", false, navigationRevision);
	}
	showDate(date, invalidHook, preservePagerTransaction = false, navigationRevision) {
		this.assertNavigableDate(date, invalidHook);
		if (!this.canContinueInteraction()) return;
		if (!(date.year !== this.displayedMonth.year || date.month !== this.displayedMonth.month)) {
			if (compareCalendarDates(date, this.selectedDate) === 0) {
				if (this.claimNavigation(navigationRevision) === null) return;
				this.swipeGesture.clear();
				this.monthPickerController.hide(false);
				if (navigationRevision === void 0 && !this.sourcePublication.isPending(this.generation)) this.registeredExtensions?.notifyStateChanged();
				return;
			}
			this.selectDate(date, invalidHook, false, navigationRevision, false);
			return;
		}
		if (this.claimNavigation(navigationRevision) === null) return;
		if (!preservePagerTransaction) this.swipeGesture.clear();
		this.monthPickerController.hide(false);
		this.displayedMonth = {
			day: 1,
			month: date.month,
			year: date.year
		};
		this.selectedDate = date;
		this.focusedDate = date;
		this.agendaVisibleCount = Math.min(this.agendaPageSize, this.agendaDomLimit);
		this.loadVisibleEvents(false);
	}
	assertNavigableDate(date, invalidHook) {
		const failure = this.bounds.getDateNavigationFailure(date);
		if (failure !== null) throw this.createPublicMethodError("invalid-argument", invalidHook, failure === "out-of-bounds" ? `${invalidHook}(date) must fall within minDate and maxDate.` : `${invalidHook}(date) cannot display a month whose complete six-week grid falls outside years 0001-9999.`);
	}
	loadVisibleEvents(userRetry) {
		if (!this.isRendered || this.isDestroyed || this.dom === null) return;
		this.sourcePublication.run(++this.generation, () => {
			this.evaluateVisibleEvents(userRetry);
		});
	}
	evaluateVisibleEvents(userRetry) {
		const request = this.beginVisibleEventRequest(userRetry, this.generation);
		if (request === null) return;
		let result;
		try {
			result = requestCalendarEvents(this.eventSource, Object.freeze({
				...request.bounds,
				signal: request.controller.signal
			}), this.sourceEventLimit, this.eventBaseUrl);
		} catch (cause) {
			this.handleSourceRequestFailure(cause, request);
			return;
		}
		if (result.timing === "synchronous") {
			if (this.canApplyRequest(request.generation, request.controller)) this.commitSourceRequestSuccess(result.events, request);
			return;
		}
		observeVisibleEventRequest(result.events, (values) => {
			this.sourcePublication.run(request.generation, () => {
				this.commitSourceRequestSuccess(values, request);
			});
		}, (cause) => {
			this.sourcePublication.run(request.generation, () => {
				this.handleSourceRequestFailure(cause, request);
			});
		}, (cause) => {
			this.handleFatalError(cause);
		});
		this.publishSourceLoading(request);
	}
	beginVisibleEventRequest(userRetry, generation) {
		const range = getCalendarMonthRange(this.displayedMonth, this.firstDay);
		const bounds = Object.freeze({
			end: formatCalendarDate(range.end),
			start: formatCalendarDate(range.start)
		});
		const rangeKey = `${bounds.start}/${bounds.end}`;
		const hasRetainedSnapshot = this.loadedRangeKey === rangeKey && this.hasCurrentSnapshot;
		const previousController = this.activeController;
		this.activeController = null;
		previousController?.abort();
		if (!this.canPrepareRequest(generation)) return null;
		const controller = new this.abortControllerConstructor();
		if (!this.canPrepareRequest(generation)) {
			controller.abort();
			return null;
		}
		this.activeController = controller;
		this.currentRange = bounds;
		this.isRetrying = userRetry;
		if (!hasRetainedSnapshot) {
			this.currentEventsByDate = /* @__PURE__ */ new Map();
			this.hasCurrentSnapshot = false;
			this.loadedRangeKey = null;
			this.removeIssues(isSourceIssue);
		}
		this.integrationNodes.updateFallback(this.hasCurrentSnapshot, this.hasFatalError);
		if (!this.canApplyRequest(generation, controller)) return null;
		return Object.freeze({
			bounds,
			controller,
			generation,
			hasRetainedSnapshot,
			rangeKey,
			userRetry
		});
	}
	publishSourceLoading(request) {
		if (!this.canApplyRequest(request.generation, request.controller)) return;
		const dom = this.getDomAfterCallback();
		if (dom === null) return;
		if (!setVisibleEventBusyState(this.host, dom.grid, true, () => this.canApplyRequest(request.generation, request.controller))) return;
		this.setState("loading", request.generation);
		if (!this.canApplyRequest(request.generation, request.controller)) return;
		if (!this.renderCalendar()) return;
		if (!this.canApplyRequest(request.generation, request.controller)) return;
	}
	commitSourceRequestSuccess(events, request) {
		if (!this.canApplyRequest(request.generation, request.controller)) return;
		const retryHadFocus = this.dom?.retryButton === this.document.activeElement;
		const removed = this.removeIssues(isSourceIssue);
		if (!this.canApplyRequest(request.generation, request.controller)) return;
		this.currentEventsByDate = indexCalendarEventsByDate(events, getCalendarMonthRange(this.displayedMonth, this.firstDay).days);
		this.hasCurrentSnapshot = true;
		this.loadedRangeKey = request.rangeKey;
		if (!this.commitSourceReadyState(request)) return;
		if (!this.renderCalendar() || !this.canApplyRequest(request.generation, request.controller)) return;
		this.integrationNodes.updateFallback(this.hasCurrentSnapshot, this.hasFatalError);
		if (!this.canApplyRequest(request.generation, request.controller)) return;
		if (request.userRetry && removed.some((entry) => !entry.handled)) {
			this.announce({
				message: this.messages.recovered,
				politeness: "polite"
			});
			if (!this.canApplyRequest(request.generation, request.controller)) return;
		}
		if (!this.isDestroyed && !this.hasFatalError && retryHadFocus) (this.dayButtons.get(formatCalendarDate(this.selectedDate)) ?? this.dom?.titleButton)?.focus({ preventScroll: true });
	}
	commitSourceReadyState(request) {
		this.activeController = null;
		this.isRetrying = false;
		if (!setVisibleEventBusyState(this.host, this.dom?.grid ?? null, false, () => this.canApplyRequest(request.generation, request.controller))) return false;
		this.setState(this.internalIssues.length > 0 ? "degraded" : "ready", request.generation);
		return this.canApplyRequest(request.generation, request.controller);
	}
	handleSourceRequestFailure(cause, request) {
		if (isAbortError(cause) && request.controller.signal.aborted) return;
		if (!this.canApplyRequest(request.generation, request.controller)) {
			this.deliverError(this.createSourceError(cause, request.hasRetainedSnapshot, request.bounds, true));
			return;
		}
		this.activeController = null;
		this.isRetrying = false;
		if (!setVisibleEventBusyState(this.host, this.dom?.grid ?? null, false, () => this.canApplyRequest(request.generation, request.controller))) return;
		const error = this.createSourceError(cause, request.hasRetainedSnapshot, request.bounds, false);
		this.acceptError(error, {
			key: "event-source",
			politeness: request.hasRetainedSnapshot ? "polite" : "assertive",
			retryable: true,
			sourceGeneration: request.generation
		});
		if (!this.canApplyRequest(request.generation, request.controller)) return;
		if (!this.renderCalendar() || !this.canApplyRequest(request.generation, request.controller)) return;
		this.integrationNodes.updateFallback(this.hasCurrentSnapshot, this.hasFatalError);
	}
	canApplyRequest(generation, controller) {
		return !this.isDestroyed && generation === this.generation && !controller.signal.aborted;
	}
	canPrepareRequest(generation) {
		return this.isRendered && !this.isDestroyed && this.dom !== null && generation === this.generation;
	}
	getDomAfterCallback() {
		return this.dom;
	}
	isCallbackGenerationCurrent(generation) {
		return !this.isDestroyed && this.generation === generation;
	}
	canContinueInteraction() {
		return this.isRendered && !this.isDestroyed && !this.hasFatalError;
	}
	wasRenderInterrupted(dom, renderGeneration) {
		return this.dom !== dom || !this.isRenderGenerationCurrent(renderGeneration);
	}
	isRenderGenerationCurrent(renderGeneration) {
		return !this.isDestroyed && this.renderGeneration === renderGeneration;
	}
	canUseRenderedAction(element, renderGeneration) {
		return this.canContinueInteraction() && this.renderGeneration === renderGeneration && element.isConnected && this.host.contains(element) && HOST_OWNERS.get(this.host) === this;
	}
	wasRuntimeDestroyed() {
		return this.isDestroyed;
	}
	wasRenderHookQuarantined(runtime) {
		return runtime.quarantined;
	}
	createSourceError(cause, retained, range, stale) {
		return createInternalError(createEventSourceErrorOptions({
			cause,
			messages: this.messages,
			range,
			retained,
			stale
		}));
	}
	handleRetry = () => {
		if (!this.canContinueInteraction() || this.isRetrying || this.activeController !== null) return;
		this.interactionEpoch += 1;
		this.isRetrying = true;
		this.renderIssues();
		this.loadVisibleEvents(true);
	};
	acceptError(error, presentation, notifyState = true, announcementMode = "default", isCurrent = () => true) {
		const generation = this.generation;
		const handled = this.deliverError(error);
		if (!this.isCallbackGenerationCurrent(generation) || !isCurrent()) return;
		const entry = Object.freeze({
			handled,
			issue: toCalendarIssue(error),
			key: presentation.key,
			politeness: presentation.politeness,
			retryable: presentation.retryable
		});
		this.resetInternalAnnouncementForIssues(this.internalIssues.filter((candidate) => candidate.key === presentation.key));
		this.internalIssues = Object.freeze([...this.internalIssues.filter((candidate) => candidate.key !== presentation.key), entry].slice(-12));
		if (notifyState) this.setState(this.derivePhase(), presentation.sourceGeneration);
		else if (!this.sourcePublication.isPending(generation)) this.state = createState(this.derivePhase(), this.currentRange, this.internalIssues.map((candidate) => candidate.issue), this.displayedMonth, this.selectedDate);
		if (!this.isCallbackGenerationCurrent(generation) || !isCurrent()) return;
		this.renderIssues();
		if (!handled) {
			const announcement = {
				message: `${error.userTitle}. ${error.userMessage}`,
				politeness: presentation.politeness
			};
			if (announcementMode === "default") this.announce(announcement);
			else if (announcementMode === "internal") this.announceInternally(announcement);
		}
	}
	deliverError(error) {
		const handler = this.options.onError;
		if (handler === void 0) {
			reportCalendarError(error);
			return false;
		}
		try {
			const result = handler(error);
			if (result === "handled") return true;
			if (observeThenable(result, (cause) => {
				reportCalendarError(new AggregateError([error, cause], "The calendar error handler rejected after returning a thenable."));
			}, () => {
				reportCalendarError(new AggregateError([error, /* @__PURE__ */ new TypeError("onError must return synchronously.")], "The calendar error handler returned an unsupported thenable."));
			})) return false;
			return false;
		} catch (handlerFailure) {
			reportCalendarError(new AggregateError([error, handlerFailure], "The calendar error handler failed while observing a calendar error."));
			return false;
		}
	}
	renderIssues() {
		const dom = this.dom;
		if (dom === null || this.isDestroyed) return;
		const visible = [...this.internalIssues].filter((entry) => !entry.handled).sort((left, right) => severityRank(right.issue.severity) - severityRank(left.issue.severity))[0];
		presentCalendarIssue(dom, {
			issue: visible?.issue ?? null,
			retryable: visible?.retryable ?? false,
			retrying: this.isRetrying,
			retryingText: this.messages.retrying,
			retryText: this.messages.retry
		});
	}
	announce(announcement) {
		const announcer = this.options.onAnnounce;
		if (announcer !== void 0) try {
			if (observeThenable(invokeForUnknownResult(announcer, [Object.freeze({ ...announcement })]), (cause) => {
				this.reportLateHostIntegrationFailure("onAnnounce", cause);
			})) throw new TypeError("onAnnounce must return void synchronously.");
			this.resetInternalAnnouncement();
			this.clearIssues((entry) => entry.key === "host-integration:onAnnounce", true);
			return;
		} catch (cause) {
			this.recordHostIntegrationFailure("onAnnounce", cause, false, "none");
		}
		this.announceInternally(announcement);
	}
	announceInternally(announcement) {
		const dom = this.dom;
		const presenter = this.announcementPresenter;
		if (dom === null || presenter === null || this.isDestroyed) return;
		const announcementUpdate = presenter.prepare(announcement);
		if (announcementUpdate === null) return;
		const generation = ++this.announcementGeneration;
		const update = () => {
			if (generation !== this.announcementGeneration || this.isDestroyed || this.dom !== dom || this.announcementPresenter !== presenter) return;
			announcementUpdate();
		};
		try {
			queueMicrotask(update);
		} catch (cause) {
			update();
			this.reportLateHostIntegrationFailure("announce-scheduler", cause);
		}
	}
	resetInternalAnnouncement() {
		this.announcementGeneration += 1;
		this.announcementPresenter?.clear();
	}
	resetInternalAnnouncementForIssues(issues) {
		if (issues.some((entry) => !entry.handled)) this.resetInternalAnnouncement();
	}
	clearIssues(predicate, render) {
		const removed = this.removeIssues(predicate);
		if (removed.length === 0) return removed;
		this.setState(this.derivePhase());
		if (render) this.renderIssues();
		return removed;
	}
	removeIssues(predicate) {
		const removed = this.internalIssues.filter(predicate);
		if (removed.length === 0) return removed;
		this.internalIssues = Object.freeze(this.internalIssues.filter((entry) => !predicate(entry)));
		this.resetInternalAnnouncementForIssues(removed);
		return removed;
	}
	derivePhase() {
		if (this.isDestroyed) return "destroyed";
		if (this.hasFatalError) return "unavailable";
		if (this.activeController !== null) return "loading";
		if (!this.hasCurrentSnapshot && this.internalIssues.some((entry) => isSourceIssue(entry))) return "unavailable";
		if (this.internalIssues.length > 0) return "degraded";
		return this.hasCurrentSnapshot ? "ready" : "idle";
	}
	setState(phase, sourceGeneration) {
		if (sourceGeneration !== this.generation && this.sourcePublication.isPending(this.generation)) return;
		const callback = this.options.onStateChange;
		if (callback !== void 0 && this.internalIssues.some((entry) => entry.key === "host-integration:onStateChange")) {
			const removed = this.internalIssues.filter((entry) => entry.key === "host-integration:onStateChange");
			this.internalIssues = Object.freeze(this.internalIssues.filter((entry) => entry.key !== "host-integration:onStateChange"));
			this.resetInternalAnnouncementForIssues(removed);
			phase = this.derivePhase();
		}
		this.state = createState(phase, this.currentRange, this.internalIssues.map((entry) => entry.issue), this.displayedMonth, this.selectedDate);
		this.sourcePublication.didPublish(sourceGeneration);
		if (callback === void 0) {
			this.registeredExtensions?.notifyStateChanged();
			return;
		}
		try {
			if (observeThenable(invokeForUnknownResult(callback, [this.state]), (cause) => {
				this.reportLateHostIntegrationFailure("onStateChange", cause);
			})) throw new TypeError("onStateChange must return void synchronously.");
		} catch (cause) {
			this.recordHostIntegrationFailure("onStateChange", cause, false, "default");
		}
		this.registeredExtensions?.notifyStateChanged();
	}
	recordHostIntegrationFailure(hook, cause, notifyState, announcementMode) {
		const error = createInternalError({
			cause,
			code: "host-integration-failed",
			hook,
			recoverable: true,
			severity: "warning",
			userMessage: this.messages.internalErrorMessage,
			userTitle: this.messages.internalErrorTitle
		});
		this.acceptError(error, {
			key: `host-integration:${hook}`,
			politeness: "polite",
			retryable: false
		}, notifyState, announcementMode);
	}
	reportLateHostIntegrationFailure(hook, cause) {
		const error = createInternalError({
			cause,
			code: "host-integration-failed",
			hook,
			recoverable: true,
			severity: "warning",
			userMessage: this.messages.internalErrorMessage,
			userTitle: this.messages.internalErrorTitle
		});
		this.deliverError(error);
	}
	reportRegisteredExtensionFailure(extensionId, hook, cause) {
		const error = createInternalError({
			cause,
			code: "extension-failed",
			extensionId,
			hook,
			message: `Extension ${extensionId} failed during ${hook}.`,
			phase: "integration",
			recoverable: true,
			severity: "warning",
			userMessage: this.messages.internalErrorMessage,
			userTitle: this.messages.internalErrorTitle
		});
		this.deliverError(error);
	}
	handleFatalError(cause, focusWasRemoved = false) {
		if (this.isDestroyed) return;
		if (this.hasFatalError) {
			this.deliverError(createInternalError({
				cause,
				code: "internal-error",
				recoverable: false,
				severity: "fatal",
				userMessage: this.messages.internalErrorMessage,
				userTitle: this.messages.internalErrorTitle
			}));
			return;
		}
		this.hasFatalError = true;
		const fatalGeneration = ++this.generation;
		const fatalFocus = this.stopForFatalError(fatalGeneration);
		if (fatalFocus === null || !this.releaseFatalRenderHooks(fatalGeneration)) return;
		const [activeBeforeFallback, focusWasInPicker] = fatalFocus;
		if (this.dom === null) {
			try {
				this.dom = this.createStructure();
			} catch (fallbackFailure) {
				if (!this.isFatalGenerationCurrent(fatalGeneration)) return;
				this.state = createState("unavailable", this.currentRange, [], this.displayedMonth, this.selectedDate);
				reportCalendarError(new AggregateError([cause, fallbackFailure], "The calendar and its unavailable fallback both failed to render."));
				this.integrationNodes.updateFallback(this.hasCurrentSnapshot, this.hasFatalError);
				return;
			}
			if (!this.isFatalGenerationCurrent(fatalGeneration)) return;
		}
		focusWasRemoved = focusWasRemoved || focusWasInPicker || wasOwnedFocusRemoved(activeBeforeFallback, this.host);
		const error = createInternalError({
			cause,
			code: "internal-error",
			recoverable: false,
			severity: "fatal",
			userMessage: this.messages.internalErrorMessage,
			userTitle: this.messages.internalErrorTitle
		});
		this.acceptError(error, {
			key: "internal-error",
			politeness: "assertive",
			retryable: false
		});
		if (!this.isFatalGenerationCurrent(fatalGeneration)) return;
		const dom = this.dom;
		this.monthPickerController.hide(false);
		if (!this.isFatalGenerationCurrent(fatalGeneration)) return;
		dom.navigation.hidden = true;
		dom.titleButton.setAttribute("aria-disabled", "true");
		dom.grid.hidden = true;
		dom.agenda.hidden = true;
		dom.panel.setAttribute("data-lfc-unavailable", "true");
		this.integrationNodes.updateFallback(this.hasCurrentSnapshot, this.hasFatalError);
		if (!this.isFatalGenerationCurrent(fatalGeneration)) return;
		dom.panelTitle.tabIndex = -1;
		if (focusWasRemoved) (dom.panel.hasAttribute("hidden") ? dom.titleButton : dom.panelTitle).focus({ preventScroll: true });
	}
	stopForFatalError(generation) {
		this.registeredExtensions?.stop();
		if (!this.isFatalGenerationCurrent(generation)) return null;
		this.actionPipeline.clear();
		const activeBeforeFallback = getOwnedActiveElement(this.document, this.host);
		const focusWasInPicker = activeBeforeFallback !== null && this.dom?.monthPicker.contains(activeBeforeFallback) === true;
		this.activeController?.abort();
		if (!this.isFatalGenerationCurrent(generation)) return null;
		this.activeController = null;
		const ownsHost = HOST_OWNERS.get(this.host) === this;
		this.swipeGesture.clear(ownsHost);
		if (!this.isFatalGenerationCurrent(generation)) return null;
		this.swipeGesture.disconnect(ownsHost);
		if (!this.isFatalGenerationCurrent(generation)) return null;
		if (ownsHost) {
			this.host.removeAttribute("data-lfc-swipe-enabled");
			if (!this.isFatalGenerationCurrent(generation)) return null;
		}
		if (!setVisibleEventBusyState(this.host, this.dom?.grid ?? null, false, () => this.isFatalGenerationCurrent(generation))) return null;
		return [activeBeforeFallback, focusWasInPicker];
	}
	releaseFatalRenderHooks(generation) {
		for (const runtime of this.renderHooks) {
			runtime.controller.abort();
			if (!this.isFatalGenerationCurrent(generation)) return false;
			const cleanupErrors = this.runRenderHookCleanups(runtime);
			if (!this.isFatalGenerationCurrent(generation)) return false;
			cleanupErrors.push(...releaseLeasedNodes(runtime.nodes, runtime.leaseToken));
			if (!this.isFatalGenerationCurrent(generation)) return false;
			cleanupErrors.push(...this.renderHookVisuals.clearFallbackTracking(runtime));
			if (!this.isFatalGenerationCurrent(generation)) return false;
			if (cleanupErrors.length > 0) {
				this.reportRenderHookCleanupErrors(runtime, cleanupErrors, false);
				if (!this.isFatalGenerationCurrent(generation)) return false;
			}
		}
		return this.isFatalGenerationCurrent(generation);
	}
	isFatalGenerationCurrent(generation) {
		return !this.isDestroyed && this.hasFatalError && this.generation === generation;
	}
	createPublicMethodError(code, hook, message, cause) {
		return createPublicMethodError(code, hook, message, this.messages, !this.isDestroyed && !this.hasFatalError, cause);
	}
	requireLive(hook) {
		if (!this.canContinueInteraction()) throw this.createPublicMethodError("invalid-state", hook, `${hook}() requires a rendered calendar that has not been destroyed and is not unavailable.`);
	}
	resolveConfiguredBound(value, name) {
		if (value === void 0) return;
		const date = this.projectDateInput(value);
		if (date === null) throw createConfigurationError(`${name} must be a valid supported civil date or Date.`);
		return Object.freeze({ ...date });
	}
	updateNavigationAvailability(dom, today) {
		const previousTarget = this.bounds.resolveShiftTarget(this.displayedMonth, this.selectedDate.day, -1);
		const nextTarget = this.bounds.resolveShiftTarget(this.displayedMonth, this.selectedDate.day, 1);
		this.setControlAvailability(dom.previousButton, previousTarget !== null);
		this.setControlAvailability(dom.nextButton, nextTarget !== null);
		this.setPagingLane(dom.previousLane, dom.previousLaneLabelFull, dom.previousLaneLabelCompact, previousTarget);
		this.setPagingLane(dom.nextLane, dom.nextLaneLabelFull, dom.nextLaneLabelCompact, nextTarget);
		this.setControlAvailability(dom.todayButton, today !== null && this.bounds.isDateAllowed(today) && isRenderableMonth({
			day: 1,
			month: today.month,
			year: today.year
		}, this.firstDay));
	}
	setControlAvailability(button, available) {
		if (available) button.removeAttribute("aria-disabled");
		else button.setAttribute("aria-disabled", "true");
	}
	setPagingLane(lane, fullLabel, compactLabel, target) {
		if (!this.swipeEnabled || target === null) {
			lane.removeAttribute("data-lfc-page-available");
			fullLabel.textContent = "";
			compactLabel.textContent = "";
			return;
		}
		lane.setAttribute("data-lfc-page-available", "");
		const month = {
			day: 1,
			month: target.month,
			year: target.year
		};
		fullLabel.textContent = this.monthTitleRenderer.formatFull(month);
		compactLabel.textContent = this.monthTitleRenderer.formatCompact(month);
	}
	getTodayDateForConstruction() {
		let instant;
		try {
			instant = invokeForUnknownResult(this.now, []);
		} catch (cause) {
			throw createConfigurationError("now threw while the initial date was resolved.", cause);
		}
		const projected = this.projectDateInstant(instant);
		if (projected === null) throw createConfigurationError("now must return a valid Date that can be projected.");
		return projected;
	}
	getTodayDate(reportFailure = true) {
		try {
			const result = this.projectDateInstant(invokeForUnknownResult(this.now, []));
			if (result === null) throw new TypeError("now must return a valid Date that can be projected.");
			return result;
		} catch (cause) {
			if (reportFailure) {
				this.handleFatalError(cause);
				return null;
			}
			throw cause;
		}
	}
	projectDateInput(value) {
		if (isDateInstance(value)) return this.projectDateInstant(value);
		return parseCalendarDate(value);
	}
	projectDateInstant(value) {
		const localDate = parseCalendarDate(value);
		if (localDate === null) return null;
		return this.timeZone === null ? localDate : getCalendarDateForTimeZone(value, this.timeZone);
	}
	reportRenderHookCleanupErrors(runtime, causes, present) {
		const error = createInternalError({
			cause: causes.length === 1 ? causes[0] : new AggregateError(causes),
			code: "render-hook-failed",
			renderHookId: runtime.definition.id,
			hook: "cleanup",
			recoverable: false,
			severity: "warning",
			userMessage: this.messages.renderHookErrorMessage,
			userTitle: this.messages.renderHookErrorTitle
		});
		if (present) this.acceptError(error, {
			key: `render-hook-failed:${runtime.definition.id}`,
			politeness: "polite",
			retryable: false
		});
		else this.deliverError(error);
	}
	reportLateRenderHookFailure(runtime, hook, cause, surface) {
		const error = createInternalError({
			cause,
			code: "render-hook-failed",
			renderHookId: runtime.definition.id,
			hook,
			recoverable: false,
			severity: "warning",
			surface: isRenderHookSurface(surface) ? surface : void 0,
			userMessage: this.messages.renderHookErrorMessage,
			userTitle: this.messages.renderHookErrorTitle
		});
		this.deliverError(error);
	}
};
/**
* Creates a consistently configured, dependency-free month calendar.
*
* Construction validates and snapshots configuration but does not modify the
* host. Call {@link Calendar.render} to claim the host and render the calendar.
*
* @param host - The HTML element that will contain the rendered calendar. For the supported
* design contract, its border box must provide at least 320 CSS pixels of inline size;
* narrower hosts receive best-effort graceful degradation.
* @param options - Events, localization, callbacks, limits, and render hooks.
* @returns A calendar instance with explicit render and destroy lifecycle methods.
* @throws {LitefoldCalendarError} When the host or configuration is invalid.
*/
function createCalendar(host, options) {
	return new MonthCalendar(host, options);
}
//#endregion
export { LitefoldCalendarError, createCalendar };

//# sourceMappingURL=index.js.map