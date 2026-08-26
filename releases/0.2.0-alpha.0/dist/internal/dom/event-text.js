import { formatCalendarMessage } from "../../messages.js";
import { compareCalendarDates, toUtcDate, toUtcDateTime } from "../domain/civil-date.js";
/** Localized text and accessible names shared by native event representations. */
export class CalendarEventText {
    fullDateFormatter;
    messages;
    numberFormatter;
    timeFormatter;
    constructor(locale, fullDateFormatter, messages) {
        this.fullDateFormatter = fullDateFormatter;
        this.messages = messages;
        this.numberFormatter = new Intl.NumberFormat(locale);
        this.timeFormatter = new Intl.DateTimeFormat(locale, {
            calendar: "gregory",
            hour: "numeric",
            minute: "2-digit",
            timeZone: "UTC"
        });
    }
    formatFullDate(date) {
        return this.fullDateFormatter.format(toUtcDate(date));
    }
    getEventTimeText(event, date) {
        if (event.event.isAllDay) {
            return this.messages.allDay;
        }
        return compareCalendarDates(date, event.startDateTime) === 0
            ? this.timeFormatter.format(toUtcDateTime(event.startDateTime))
            : "";
    }
    getDayAccessibleLabel(date, eventCount) {
        return formatCalendarMessage(this.messages.dayLabel, {
            count: this.numberFormatter.format(eventCount),
            date: this.formatFullDate(date),
            eventLabel: eventCount === 1 ? this.messages.event : this.messages.events
        });
    }
    getGridEventAccessibleLabel(event, date) {
        const timeText = this.getEventTimeText(event, date);
        return [event.event.title, timeText, this.formatFullDate(date)]
            .filter((part) => part.length > 0)
            .join(", ");
    }
}
//# sourceMappingURL=event-text.js.map