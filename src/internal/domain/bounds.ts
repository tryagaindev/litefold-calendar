import type { CalendarDate } from "../../types.js";
import {
	addCalendarMonths,
	compareCalendarDates,
	toUtcDate
} from "./civil-date.js";
import { isRenderableMonth } from "./grid.js";
import {
	clampCalendarMonthDate,
	doesCalendarMonthIntersectBounds,
	isCalendarDateWithinBounds
} from "./ranges.js";

/** Centralized inclusive date and renderable-month policy for one calendar instance. */
export class CalendarBounds {
	public constructor(
		private readonly firstDay: number,
		public readonly minDate: Readonly<CalendarDate> | undefined,
		public readonly maxDate: Readonly<CalendarDate> | undefined
	) {}

	public hasAllowedRenderableMonth(): boolean {
		let month: CalendarDate = this.minDate === undefined
			? { day: 1, month: 1, year: 1 }
			: { day: 1, month: this.minDate.month, year: this.minDate.year };
		const finalMonth: CalendarDate = this.maxDate === undefined
			? { day: 1, month: 12, year: 9_999 }
			: { day: 1, month: this.maxDate.month, year: this.maxDate.year };
		while (compareCalendarDates(month, finalMonth) <= 0) {
			if (this.isMonthAllowed(month)) {
				return true;
			}
			try {
				month = addCalendarMonths(month, 1);
			} catch {
				return false;
			}
		}
		return false;
	}

	public resolveImplicitInitialDate(today: CalendarDate): Readonly<CalendarDate> | null {
		let boundedToday: Readonly<CalendarDate> = today;
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

	public isDateAllowed(date: CalendarDate): boolean {
		return isCalendarDateWithinBounds(date, this.minDate, this.maxDate);
	}

	public getDateNavigationFailure(date: CalendarDate): "out-of-bounds" | "unrenderable" | null {
		if (!this.isDateAllowed(date)) {
			return "out-of-bounds";
		}
		return this.isMonthAllowed({ day: 1, month: date.month, year: date.year })
			? null
			: "unrenderable";
	}

	public isMonthAllowed(month: CalendarDate): boolean {
		return doesCalendarMonthIntersectBounds(month, this.minDate, this.maxDate) &&
			isRenderableMonth({ day: 1, month: month.month, year: month.year }, this.firstDay);
	}

	public resolveMonthTarget(month: CalendarDate, preferredDay: number): Readonly<CalendarDate> | null {
		if (!this.isMonthAllowed(month)) {
			return null;
		}
		return clampCalendarMonthDate(month, preferredDay, this.minDate, this.maxDate);
	}

	public resolveShiftTarget(
		displayedMonth: CalendarDate,
		preferredDay: number,
		amount: -1 | 1
	): Readonly<CalendarDate> | null {
		try {
			return this.resolveMonthTarget(addCalendarMonths(displayedMonth, amount), preferredDay);
		} catch {
			return null;
		}
	}

	private findAllowedDateFromMonth(date: CalendarDate, direction: -1 | 1): Readonly<CalendarDate> | null {
		let month: Readonly<CalendarDate> = { day: 1, month: date.month, year: date.year };
		for (;;) {
			try {
				month = addCalendarMonths(month, direction);
			} catch {
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

function compareMonth(left: CalendarDate, right: CalendarDate): number {
	return ((left.year - right.year) * 12) + left.month - right.month;
}

function dayDistance(left: CalendarDate, right: CalendarDate): number {
	return Math.abs(toUtcDate(left).getTime() - toUtcDate(right).getTime());
}
