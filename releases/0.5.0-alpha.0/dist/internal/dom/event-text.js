import { formatCalendarMessage } from "../../messages.js";
import { compareCalendarDates, toUtcDate, toUtcDateTime } from "../domain/civil-date.js";
/** Localized text and accessible names shared by native event representations. */
export class CalendarEventText {
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
        if (event.event.isAllDay) {
            return this.messages.allDay;
        }
        return compareCalendarDates(date, event.startDateTime) === 0
            ? this.getTimeFormatter().format(toUtcDateTime(event.startDateTime))
            : "";
    }
    getDayAccessibleLabel(fullDateText, eventCount) {
        return formatCalendarMessage(this.messages.dayLabel, {
            count: this.numberFormatter.format(eventCount),
            date: fullDateText,
            eventLabel: eventCount === 1 ? this.messages.event : this.messages.events
        });
    }
    getEventAccessibleLabel(event, timeText, fullDateText) {
        return [event.event.title, timeText, fullDateText]
            .filter((part) => part.length > 0)
            .join(", ");
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
}
//# sourceMappingURL=event-text.js.map