import type { CalendarMessages } from "../../messages.js";
import { formatCalendarMessage } from "../../messages.js";
import type { CalendarDate } from "../../types.js";
import { compareCalendarDates, toUtcDate, toUtcDateTime } from "../domain/civil-date.js";
import type { NormalizedCalendarEvent } from "../domain/event-normalization.js";

/** Localized text and accessible names shared by native event representations. */
export class CalendarEventText {
	private readonly numberFormatter: Intl.NumberFormat;
	private readonly timeFormatter: Intl.DateTimeFormat;

	public constructor(
		locale: string | undefined,
		private readonly fullDateFormatter: Intl.DateTimeFormat,
		private readonly messages: Readonly<CalendarMessages>
	) {
		this.numberFormatter = new Intl.NumberFormat(locale);
		this.timeFormatter = new Intl.DateTimeFormat(locale, {
			calendar: "gregory",
			hour: "numeric",
			minute: "2-digit",
			timeZone: "UTC"
		});
	}

	public formatFullDate(date: CalendarDate): string {
		return this.fullDateFormatter.format(toUtcDate(date));
	}

	public getEventTimeText(event: NormalizedCalendarEvent, date: CalendarDate): string {
		if (event.event.isAllDay) {
			return this.messages.allDay;
		}
		return compareCalendarDates(date, event.startDateTime) === 0
			? this.timeFormatter.format(toUtcDateTime(event.startDateTime))
			: "";
	}

	public getDayAccessibleLabel(date: CalendarDate, eventCount: number): string {
		return formatCalendarMessage(this.messages.dayLabel, {
			count: this.numberFormatter.format(eventCount),
			date: this.formatFullDate(date),
			eventLabel: eventCount === 1 ? this.messages.event : this.messages.events
		});
	}

	public getGridEventAccessibleLabel(event: NormalizedCalendarEvent, date: CalendarDate): string {
		const timeText = this.getEventTimeText(event, date);
		return [event.event.title, timeText, this.formatFullDate(date)]
			.filter((part) => part.length > 0)
			.join(", ");
	}
}
