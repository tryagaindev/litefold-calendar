/** Immutable English defaults used when an application does not override a message. */
export const DEFAULT_CALENDAR_MESSAGES = Object.freeze({
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
    extensionErrorMessage: "Some calendar details could not be displayed.",
    extensionErrorTitle: "Some details are unavailable",
    gridMore: "{count} more",
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
export function formatCalendarMessage(template, values) {
    const replacements = {
        count: values.count?.toString() ?? "",
        date: values.date ?? "",
        eventLabel: values.eventLabel ?? "",
        total: values.total?.toString() ?? "",
        visible: values.visible?.toString() ?? ""
    };
    return template.replace(/\{(count|date|eventLabel|total|visible)\}/g, (_match, token) => replacements[token] ?? "");
}
//# sourceMappingURL=messages.js.map