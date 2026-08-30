import type { CalendarMessages } from "../../messages.js";
import { formatCalendarMessage } from "../../messages.js";
import type { CalendarDate } from "../../types.js";
import { compareCalendarDates, toUtcDate, toUtcDateTime } from "../domain/civil-date.js";
import type { NormalizedCalendarEvent } from "../domain/event-normalization.js";

/** Localized text and accessible names shared by native event representations. */
export class CalendarEventText {
	private timeFormatter: Intl.DateTimeFormat | null = null;

	public constructor(
		private readonly locale: string | undefined,
		private readonly fullDateFormatter: Intl.DateTimeFormat,
		private readonly messages: Readonly<CalendarMessages>,
		private readonly numberFormatter: Intl.NumberFormat
	) {}

	public formatFullDate(date: CalendarDate): string {
		return this.fullDateFormatter.format(toUtcDate(date));
	}

	public getEventTimeText(event: NormalizedCalendarEvent, date: CalendarDate): string {
		if (event.event.isAllDay) {
			return this.messages.allDay;
		}
		return compareCalendarDates(date, event.startDateTime) === 0
			? this.getTimeFormatter().format(toUtcDateTime(event.startDateTime))
			: "";
	}

	public getDayAccessibleLabel(fullDateText: string, eventCount: number): string {
		return formatCalendarMessage(this.messages.dayLabel, {
			count: this.numberFormatter.format(eventCount),
			date: fullDateText,
			eventLabel: eventCount === 1 ? this.messages.event : this.messages.events
		});
	}

	public getEventAccessibleLabel(
		event: NormalizedCalendarEvent,
		timeText: string,
		fullDateText: string
	): string {
		return [event.event.title, timeText, fullDateText]
			.filter((part) => part.length > 0)
			.join(", ");
	}

	private getTimeFormatter(): Intl.DateTimeFormat {
		this.timeFormatter ??= new Intl.DateTimeFormat(this.locale, {
			calendar: "gregory",
			hour: "numeric",
			minute: "2-digit",
			timeZone: "UTC"
		});
		return this.timeFormatter;
	}
}
