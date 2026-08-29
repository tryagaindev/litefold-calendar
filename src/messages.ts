/** Localizable text rendered or announced by the calendar. */
export interface CalendarMessages {
	/** Body text for a failed application action. */
	readonly actionErrorMessage: string;
	/** Heading for a failed application action. */
	readonly actionErrorTitle: string;
	/** Empty-agenda message. */
	readonly agendaEmpty: string;
	/** Agenda paging-button template. Supports `{count}`. */
	readonly agendaMore: string;
	/** Agenda visible-count template. Supports `{visible}` and `{total}`. */
	readonly agendaProgress: string;
	/** Agenda heading template. Supports `{date}`. */
	readonly agendaTitle: string;
	/** Label for an all-day event. */
	readonly allDay: string;
	/** Label for dismissing the month-and-year chooser without navigating. */
	readonly cancel: string;
	/** Accessible month-title action template. Supports `{date}`. */
	readonly chooseMonthYear: string;
	/** Accessible day label template. Supports `{date}`, `{count}`, and `{eventLabel}`. */
	readonly dayLabel: string;
	/** Singular event noun. */
	readonly event: string;
	/** Plural event noun. */
	readonly events: string;
	/** Body text for quarantined consumer render hooks. */
	readonly renderHookErrorMessage: string;
	/** Heading for quarantined consumer render hooks. */
	readonly renderHookErrorTitle: string;
	/** Grid overflow template. Supports `{count}`. */
	readonly gridMore: string;
	/** Instructions for entering and leaving visible event actions in the managed grid. */
	readonly gridEventInstructions: string;
	/** Accessible grid-overflow label. Supports `{count}`, `{date}`, and `{eventLabel}`. */
	readonly gridMoreLabel: string;
	/** Body text for an unexpected package or host-integration failure. */
	readonly internalErrorMessage: string;
	/** Heading for an unexpected package or host-integration failure. */
	readonly internalErrorTitle: string;
	/** Label for confirming month-and-year navigation. */
	readonly jump: string;
	/** Heading for the month-and-year chooser. */
	readonly jumpToMonthYear: string;
	/** Body text when the current range could not load. */
	readonly loadErrorMessage: string;
	/** Heading when the current range could not load. */
	readonly loadErrorTitle: string;
	/** Label for the month field in the month-and-year chooser. */
	readonly month: string;
	/** Accessible name for the month-navigation controls. */
	readonly navigation: string;
	/** Accessible label for the next-month control. */
	readonly next: string;
	/** Accessible label for the previous-month control. */
	readonly previous: string;
	/** Polite announcement after a successful Retry. */
	readonly recovered: string;
	/** Body text when retained events may be stale. */
	readonly refreshErrorMessage: string;
	/** Heading when retained events may be stale. */
	readonly refreshErrorTitle: string;
	/** Label for the source Retry control. */
	readonly retry: string;
	/** Disabled label while Retry is running. */
	readonly retrying: string;
	/** Label for the Today control. */
	readonly today: string;
	/** Label for the year field in the month-and-year chooser. */
	readonly year: string;
}

/** Values accepted by the documented calendar message templates. */
export interface CalendarMessageValues {
	readonly count?: number | string;
	readonly date?: string;
	readonly eventLabel?: string;
	readonly total?: number | string;
	readonly visible?: number | string;
}

/** Immutable English defaults used when an application does not override a message. */
export const DEFAULT_CALENDAR_MESSAGES: Readonly<CalendarMessages> = Object.freeze({
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
	renderHookErrorMessage: "Some calendar details could not be displayed.",
	renderHookErrorTitle: "Some details are unavailable",
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
export function formatCalendarMessage(
	template: string,
	values: Readonly<CalendarMessageValues>
): string {
	const replacements: Readonly<Record<string, string>> = {
		count: values.count?.toString() ?? "",
		date: values.date ?? "",
		eventLabel: values.eventLabel ?? "",
		total: values.total?.toString() ?? "",
		visible: values.visible?.toString() ?? ""
	};

	return template.replace(
		/\{(count|date|eventLabel|total|visible)\}/g,
		(_match: string, token: string) => replacements[token] ?? ""
	);
}
