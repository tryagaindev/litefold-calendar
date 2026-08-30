const MILLISECONDS_PER_DAY = 86_400_000;
const MINIMUM_YEAR = 1;
const MAXIMUM_YEAR = 9_999;
const CIVIL_DATE_TIME_PATTERN = /^(\d{4})-(\d{2})-(\d{2})(?:T(\d{2}):(\d{2})(?::(\d{2})(?:\.(\d{1,7}))?)?)?$/;
/** Parses the documented Gregorian date or local date-time profile without invoking `Date.parse()`. */
export function parseCalendarDateTime(value) {
    const match = CIVIL_DATE_TIME_PATTERN.exec(value);
    if (match === null) {
        return null;
    }
    const yearText = match[1];
    const monthText = match[2];
    const dayText = match[3];
    if (yearText === undefined || monthText === undefined || dayText === undefined) {
        return null;
    }
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
    const fractionalSecond = fractionText.length === 0
        ? 0
        : Number.parseInt(fractionText.padEnd(7, "0"), 10);
    const date = { day, month, year };
    if (!isValidCalendarDate(date) || hour > 23 || minute > 59 || second > 59) {
        return null;
    }
    return Object.freeze({
        ...date,
        fractionalSecond,
        hasTime: hourText !== undefined,
        hour,
        millisecond: Math.trunc(fractionalSecond / 10_000),
        minute,
        second
    });
}
/** Projects an instant into a Gregorian civil date in an IANA time zone. */
export function getCalendarDateForTimeZone(instant, timeZone) {
    const timeZoneCandidate = timeZone;
    const timestamp = getDateTimestamp(instant);
    if (timestamp === null ||
        typeof timeZoneCandidate !== "string" || timeZoneCandidate.length === 0 ||
        timeZoneCandidate.trim() !== timeZoneCandidate) {
        return null;
    }
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
        if (values.get("era") !== "AD") {
            return null;
        }
        const date = {
            day: Number.parseInt(values.get("day") ?? "", 10),
            month: Number.parseInt(values.get("month") ?? "", 10),
            year: Number.parseInt(values.get("year") ?? "", 10)
        };
        return isValidCalendarDate(date) ? Object.freeze(date) : null;
    }
    catch (error) {
        if (error instanceof RangeError) {
            return null;
        }
        throw error;
    }
}
/** Converts a supported structured date, strict civil string, or `Date` instant into a civil date. */
export function parseCalendarDate(value) {
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
        }
        catch {
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
        return hasNumericCalendarFields(date) && isValidCalendarDate(date)
            ? Object.freeze(date)
            : null;
    }
    catch {
        return null;
    }
}
/** Adds whole civil days without allowing a result outside years 0001-9999. */
export function addCalendarDays(date, days) {
    assertCalendarDate(date);
    if (!Number.isFinite(days)) {
        throw new RangeError("Calendar day offset must be finite.");
    }
    return fromUtcDayNumber(toUtcDayNumber(date) + Math.trunc(days));
}
/** Adds whole calendar months, clamps the day, and retains the supported year range. */
export function addCalendarMonths(date, months) {
    assertCalendarDate(date);
    if (!Number.isFinite(months)) {
        throw new RangeError("Calendar month offset must be finite.");
    }
    const monthIndex = ((date.year - 1) * 12) + date.month - 1 + Math.trunc(months);
    const year = Math.floor(monthIndex / 12) + 1;
    if (year < MINIMUM_YEAR || year > MAXIMUM_YEAR) {
        throw new RangeError("Calendar month result is outside years 0001-9999.");
    }
    const month = positiveModulo(monthIndex, 12) + 1;
    return Object.freeze({
        day: Math.min(date.day, getDaysInMonth(year, month)),
        month,
        year
    });
}
/** Formats a validated civil date as `YYYY-MM-DD`. */
export function formatCalendarDate(date) {
    assertCalendarDate(date);
    return `${date.year.toString().padStart(4, "0")}-${date.month.toString().padStart(2, "0")}-${date.day.toString().padStart(2, "0")}`;
}
/** Compares two validated Gregorian civil dates. */
export function compareCalendarDates(left, right) {
    assertCalendarDate(left);
    assertCalendarDate(right);
    return toUtcDayNumber(left) - toUtcDayNumber(right);
}
/** Compares two civil date-times while retaining seven-digit fractional precision. */
export function compareDateTimes(left, right) {
    const millisecondDifference = toUtcDateTime(left).valueOf() - toUtcDateTime(right).valueOf();
    return millisecondDifference !== 0
        ? millisecondDifference
        : left.fractionalSecond - right.fractionalSecond;
}
/** Returns an immutable date-only copy of a civil date-time value. */
export function toCalendarDate(value) {
    assertCalendarDate(value);
    return Object.freeze({ day: value.day, month: value.month, year: value.year });
}
/** Uses device-local fields to project a valid `Date` into a calendar date. */
export function toCalendarDateFromNow(now) {
    return parseCalendarDate(now) ?? Object.freeze({ day: 1, month: 1, year: 1970 });
}
/** Creates a UTC surrogate used only for locale formatting and civil arithmetic. */
export function toUtcDate(date) {
    assertCalendarDate(date);
    const result = new Date(0);
    result.setUTCHours(0, 0, 0, 0);
    result.setUTCFullYear(date.year, date.month - 1, date.day);
    return result;
}
/** Creates a UTC surrogate for formatting a civil date-time. */
export function toUtcDateTime(date) {
    assertCalendarDateTime(date);
    const result = toUtcDate(date);
    result.setUTCHours(date.hour, date.minute, date.second, date.millisecond);
    return result;
}
/** Identifies an exact civil midnight, including fractional precision. */
export function isMidnight(value) {
    assertCalendarDateTime(value);
    return value.hour === 0 && value.minute === 0 && value.second === 0 && value.fractionalSecond === 0;
}
/** Returns whether a value is a supported Gregorian calendar date. */
export function isValidCalendarDate(date) {
    return Number.isInteger(date.year) && date.year >= MINIMUM_YEAR && date.year <= MAXIMUM_YEAR &&
        Number.isInteger(date.month) && date.month >= 1 && date.month <= 12 &&
        Number.isInteger(date.day) && date.day >= 1 && date.day <= getDaysInMonth(date.year, date.month);
}
/** Returns whether a value is a supported parsed local date-time. */
export function isValidCalendarDateTime(value) {
    return isValidCalendarDate(value) && typeof value.hasTime === "boolean" &&
        isIntegerInRange(value.hour, 0, 23) &&
        isIntegerInRange(value.minute, 0, 59) &&
        isIntegerInRange(value.second, 0, 59) &&
        isValidFractionalSecond(value) &&
        (value.hasTime || isZeroTime(value));
}
export function getDaysInMonth(year, month) {
    if (month === 2) {
        const isLeapYear = year % 4 === 0 && (year % 100 !== 0 || year % 400 === 0);
        return isLeapYear ? 29 : 28;
    }
    return month === 4 || month === 6 || month === 9 || month === 11 ? 30 : 31;
}
export function assertCalendarDate(date) {
    if (!isValidCalendarDate(date)) {
        throw new RangeError("Calendar date must be a valid Gregorian date in years 0001 through 9999.");
    }
}
export function positiveModulo(value, divisor) {
    return ((value % divisor) + divisor) % divisor;
}
function isIntegerInRange(value, minimum, maximum) {
    return Number.isInteger(value) && value >= minimum && value <= maximum;
}
function isValidFractionalSecond(value) {
    return isIntegerInRange(value.fractionalSecond, 0, 9_999_999) &&
        Number.isInteger(value.millisecond) &&
        value.millisecond === Math.trunc(value.fractionalSecond / 10_000);
}
function isZeroTime(value) {
    return value.hour === 0 && value.minute === 0 && value.second === 0 && value.fractionalSecond === 0;
}
function assertCalendarDateTime(value) {
    if (!isValidCalendarDateTime(value)) {
        throw new RangeError("Calendar date-time must use the supported Gregorian local date-time profile.");
    }
}
function toUtcDayNumber(date) {
    return Math.floor(toUtcDate(date).valueOf() / MILLISECONDS_PER_DAY);
}
function fromUtcDayNumber(dayNumber) {
    const date = new Date(dayNumber * MILLISECONDS_PER_DAY);
    const result = {
        day: date.getUTCDate(),
        month: date.getUTCMonth() + 1,
        year: date.getUTCFullYear()
    };
    if (!isValidCalendarDate(result)) {
        throw new RangeError("Calendar day result is outside years 0001-9999.");
    }
    return Object.freeze(result);
}
function hasNumericCalendarFields(value) {
    return typeof value.day === "number" && typeof value.month === "number" && typeof value.year === "number";
}
function getDateTimestamp(value) {
    if (typeof value !== "object" || value === null) {
        return null;
    }
    try {
        const timestamp = Date.prototype.getTime.call(value);
        return Number.isNaN(timestamp) ? null : timestamp;
    }
    catch {
        return null;
    }
}
//# sourceMappingURL=civil-date.js.map