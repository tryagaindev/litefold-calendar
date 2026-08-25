import { addCalendarDays, assertCalendarDate, positiveModulo, toUtcDate } from "./civil-date.js";
const GRID_DAY_COUNT = 42;
const DEFAULT_FIRST_DAY = 0;
const DAYS_PER_WEEK = 7;
/** Returns the fixed six-week grid for a month, including its exclusive request end. */
export function getCalendarMonthRange(month, firstDay = DEFAULT_FIRST_DAY) {
    assertCalendarDate(month);
    if (!Number.isInteger(firstDay) || firstDay < 0 || firstDay >= DAYS_PER_WEEK) {
        throw new RangeError("Calendar first day must be an integer from 0 through 6.");
    }
    const firstOfMonth = Object.freeze({ day: 1, month: month.month, year: month.year });
    const leadingDays = positiveModulo(toUtcDate(firstOfMonth).getUTCDay() - firstDay, DAYS_PER_WEEK);
    const start = addCalendarDays(firstOfMonth, -leadingDays);
    const days = Object.freeze(Array.from({ length: GRID_DAY_COUNT }, (_value, index) => addCalendarDays(start, index)));
    return Object.freeze({
        days,
        end: addCalendarDays(start, GRID_DAY_COUNT),
        start
    });
}
/** Resolves a locale-derived or explicit Sunday-through-Saturday week start. */
export function resolveCalendarFirstDay(firstDay, locale) {
    if (firstDay !== "locale") {
        if (!Number.isInteger(firstDay) || firstDay < 0 || firstDay >= DAYS_PER_WEEK) {
            throw new RangeError("Calendar first day must be 'locale' or an integer from 0 through 6.");
        }
        return firstDay;
    }
    const localeValue = new Intl.Locale(locale ?? Intl.DateTimeFormat().resolvedOptions().locale);
    return resolveLocaleFirstDay(localeValue) ?? DEFAULT_FIRST_DAY;
}
/** Returns whether a month can produce its complete six-week grid inside years 0001 through 9999. */
export function isRenderableMonth(month, firstDay) {
    try {
        getCalendarMonthRange(month, firstDay);
        return true;
    }
    catch {
        return false;
    }
}
function resolveLocaleFirstDay(locale) {
    const methodWeekInfo = invokeWeekInfoMethod(locale);
    const methodFirstDay = readWeekInfoFirstDay(methodWeekInfo);
    if (methodFirstDay !== null) {
        return methodFirstDay;
    }
    return readWeekInfoFirstDay(readWeekInfoAccessor(locale));
}
function invokeWeekInfoMethod(locale) {
    try {
        const getWeekInfo = Reflect.get(locale, "getWeekInfo");
        return typeof getWeekInfo === "function"
            ? Reflect.apply(getWeekInfo, locale, [])
            : null;
    }
    catch {
        return null;
    }
}
function readWeekInfoAccessor(locale) {
    try {
        return Reflect.get(locale, "weekInfo");
    }
    catch {
        return null;
    }
}
function readWeekInfoFirstDay(weekInfo) {
    if ((typeof weekInfo !== "object" && typeof weekInfo !== "function") || weekInfo === null) {
        return null;
    }
    let firstDay;
    try {
        firstDay = Reflect.get(weekInfo, "firstDay");
    }
    catch {
        return null;
    }
    return typeof firstDay === "number" && Number.isInteger(firstDay) && firstDay >= 1 && firstDay <= 7
        ? positiveModulo(firstDay, DAYS_PER_WEEK)
        : null;
}
//# sourceMappingURL=grid.js.map