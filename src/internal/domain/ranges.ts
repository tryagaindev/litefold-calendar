import type { CalendarDate } from "../../types.js";
import {
	assertCalendarDate,
	compareCalendarDates,
	getDaysInMonth
} from "./civil-date.js";

/** Tests a supported civil date against independently optional inclusive bounds. */
export function isCalendarDateWithinBounds(
	date: CalendarDate,
	minDate?: CalendarDate | null,
	maxDate?: CalendarDate | null
): boolean {
	assertCalendarDate(date);
	assertCalendarDateBounds(minDate, maxDate);
	return (minDate === null || minDate === undefined || compareCalendarDates(date, minDate) >= 0) &&
		(maxDate === null || maxDate === undefined || compareCalendarDates(date, maxDate) <= 0);
}

/** Returns whether a Gregorian month contains at least one date inside optional inclusive bounds. */
export function doesCalendarMonthIntersectBounds(
	month: CalendarDate,
	minDate?: CalendarDate | null,
	maxDate?: CalendarDate | null
): boolean {
	assertCalendarDate(month);
	assertCalendarDateBounds(minDate, maxDate);
	const start = { day: 1, month: month.month, year: month.year };
	const end = {
		day: getDaysInMonth(month.year, month.month),
		month: month.month,
		year: month.year
	};
	return (minDate === null || minDate === undefined || compareCalendarDates(end, minDate) >= 0) &&
		(maxDate === null || maxDate === undefined || compareCalendarDates(start, maxDate) <= 0);
}

/** Resolves a preferred day inside a Gregorian month and optional inclusive bounds. */
export function clampCalendarMonthDate(
	month: CalendarDate,
	preferredDay: number,
	minDate?: CalendarDate | null,
	maxDate?: CalendarDate | null
): Readonly<CalendarDate> | null {
	assertCalendarDate(month);
	if (!Number.isInteger(preferredDay) || preferredDay < 1 || preferredDay > 31) {
		throw new RangeError("Preferred calendar day must be an integer from 1 through 31.");
	}
	assertCalendarDateBounds(minDate, maxDate);
	if (!doesCalendarMonthIntersectBounds(month, minDate, maxDate)) {
		return null;
	}

	let result: CalendarDate = {
		day: Math.min(preferredDay, getDaysInMonth(month.year, month.month)),
		month: month.month,
		year: month.year
	};
	if (minDate !== null && minDate !== undefined && compareCalendarDates(result, minDate) < 0) {
		result = { ...minDate };
	}
	if (maxDate !== null && maxDate !== undefined && compareCalendarDates(result, maxDate) > 0) {
		result = { ...maxDate };
	}
	return Object.freeze(result);
}

/** Tests two formatted inclusive/exclusive date ranges for overlap. */
export function rangesOverlap(leftStart: string, leftEnd: string, rightStart: string, rightEnd: string): boolean {
	return leftStart < rightEnd && leftEnd > rightStart;
}

function assertCalendarDateBounds(
	minDate: CalendarDate | null | undefined,
	maxDate: CalendarDate | null | undefined
): void {
	if (minDate !== null && minDate !== undefined) {
		assertCalendarDate(minDate);
	}
	if (maxDate !== null && maxDate !== undefined) {
		assertCalendarDate(maxDate);
	}
	if (minDate !== null && minDate !== undefined &&
		maxDate !== null && maxDate !== undefined &&
		compareCalendarDates(minDate, maxDate) > 0) {
		throw new RangeError("Calendar minimum date must not follow the maximum date.");
	}
}
