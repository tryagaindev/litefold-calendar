import { addCalendarMonths, compareCalendarDates, toUtcDate } from "./civil-date.js";
import { isRenderableMonth } from "./grid.js";
import { clampCalendarMonthDate, doesCalendarMonthIntersectBounds, isCalendarDateWithinBounds } from "./ranges.js";
/** Centralized inclusive date and renderable-month policy for one calendar instance. */
export class CalendarBounds {
    firstDay;
    minDate;
    maxDate;
    constructor(firstDay, minDate, maxDate) {
        this.firstDay = firstDay;
        this.minDate = minDate;
        this.maxDate = maxDate;
    }
    hasAllowedRenderableMonth() {
        let month = this.minDate === undefined
            ? { day: 1, month: 1, year: 1 }
            : { day: 1, month: this.minDate.month, year: this.minDate.year };
        const finalMonth = this.maxDate === undefined
            ? { day: 1, month: 12, year: 9_999 }
            : { day: 1, month: this.maxDate.month, year: this.maxDate.year };
        while (compareCalendarDates(month, finalMonth) <= 0) {
            if (this.isMonthAllowed(month)) {
                return true;
            }
            try {
                month = addCalendarMonths(month, 1);
            }
            catch {
                return false;
            }
        }
        return false;
    }
    resolveImplicitInitialDate(today) {
        let boundedToday = today;
        if (this.minDate !== undefined && compareCalendarDates(boundedToday, this.minDate) < 0) {
            boundedToday = this.minDate;
        }
        if (this.maxDate !== undefined && compareCalendarDates(boundedToday, this.maxDate) > 0) {
            boundedToday = this.maxDate;
        }
        const currentMonth = this.resolveMonthTarget(boundedToday, boundedToday.day);
        if (currentMonth !== null) {
            return currentMonth;
        }
        const previous = this.findAllowedDateFromMonth(boundedToday, -1);
        const next = this.findAllowedDateFromMonth(boundedToday, 1);
        if (previous === null) {
            return next;
        }
        if (next === null) {
            return previous;
        }
        return dayDistance(previous, boundedToday) <= dayDistance(next, boundedToday) ? previous : next;
    }
    isDateAllowed(date) {
        return isCalendarDateWithinBounds(date, this.minDate, this.maxDate);
    }
    isMonthAllowed(month) {
        return doesCalendarMonthIntersectBounds(month, this.minDate, this.maxDate) &&
            isRenderableMonth({ day: 1, month: month.month, year: month.year }, this.firstDay);
    }
    resolveMonthTarget(month, preferredDay) {
        if (!this.isMonthAllowed(month)) {
            return null;
        }
        return clampCalendarMonthDate(month, preferredDay, this.minDate, this.maxDate);
    }
    resolveShiftTarget(displayedMonth, preferredDay, amount) {
        try {
            return this.resolveMonthTarget(addCalendarMonths(displayedMonth, amount), preferredDay);
        }
        catch {
            return null;
        }
    }
    findAllowedDateFromMonth(date, direction) {
        let month = { day: 1, month: date.month, year: date.year };
        for (;;) {
            try {
                month = addCalendarMonths(month, direction);
            }
            catch {
                return null;
            }
            if (direction < 0 && this.minDate !== undefined && compareMonth(month, this.minDate) < 0) {
                return null;
            }
            if (direction > 0 && this.maxDate !== undefined && compareMonth(month, this.maxDate) > 0) {
                return null;
            }
            const target = this.resolveMonthTarget(month, direction < 0 ? 31 : 1);
            if (target !== null) {
                return target;
            }
        }
    }
}
function compareMonth(left, right) {
    return ((left.year - right.year) * 12) + left.month - right.month;
}
function dayDistance(left, right) {
    return Math.abs(toUtcDate(left).getTime() - toUtcDate(right).getTime());
}
//# sourceMappingURL=bounds.js.map