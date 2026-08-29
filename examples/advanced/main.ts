import {
	createCalendar,
	LitefoldCalendarError,
	type Calendar,
	type CalendarAnnouncement,
	type CalendarEventInput,
	type CalendarEventSource,
	type CalendarMessages,
	type CalendarOptions,
	type CalendarRenderHooks,
	type CalendarState
} from "../../dist/index.js";
import { webMcp } from "../../dist/extensions/webmcp/index.js";

type ScheduleItemType = "appointment" | "milestone" | "task";

interface EventData {
	readonly accessibleLabel: string;
	readonly actionLabel: string;
	readonly itemType: ScheduleItemType;
	readonly statusLabel?: string;
}

interface ScheduleRecord {
	readonly accentCandidate: string | null;
	readonly end: string | null;
	readonly id: number;
	readonly itemType: ScheduleItemType;
	readonly start: string;
	readonly statusLabel: string | null;
	readonly title: string;
	readonly url?: string;
}

/**
 * Repository coverage types: every public key stays required here so a new API surface
 * cannot be added without updating this example.
 */
type CompleteCalendarOptions<TMetadata> = {
	-readonly [TKey in keyof CalendarOptions<TMetadata>]-?: CalendarOptions<TMetadata>[TKey];
};

type CompleteCalendarRenderHooks<TMetadata> = {
	-readonly [TKey in keyof CalendarRenderHooks<TMetadata>]-?: CalendarRenderHooks<TMetadata>[TKey];
};

const OPAQUE_HEX_COLOR = /^#[0-9A-F]{6}$/u;
const DAY_BADGE_RENDERED_DATES = new Set<string>();
const TARGET_DATE_ERROR_MESSAGE = "Choose a date from July 15, 2026 through September 15, 2027.";
const ITEM_TYPE_LABELS: Readonly<Record<ScheduleItemType, string>> = Object.freeze({
	appointment: "Appointment",
	milestone: "Milestone",
	task: "Task"
});
const ITEM_TYPE_MARKERS: Readonly<Record<Exclude<ScheduleItemType, "task">, string>> =
	Object.freeze({
		appointment: "A",
		milestone: "M"
	});
const ADVANCED_MESSAGES = Object.freeze({
	actionErrorMessage: "The requested schedule action could not be completed.",
	actionErrorTitle: "Schedule action failed",
	agendaEmpty: "No schedule items",
	agendaMore: "Load {count} more",
	agendaProgress: "Showing {visible} of {total} items",
	agendaTitle: "Schedule for {date}",
	allDay: "Any time",
	cancel: "Cancel",
	chooseMonthYear: "Choose schedule month and year, currently {date}",
	dayLabel: "{date}, {count} {eventLabel}",
	event: "item",
	events: "items",
	renderHookErrorMessage: "Some schedule details could not be displayed.",
	renderHookErrorTitle: "Some schedule details are unavailable",
	gridEventInstructions: "Use arrow keys to move between dates and Enter or Space to select. Press F2 on a date to move to its visible event actions; use Up and Down Arrow between actions, and Escape or F2 to return.",
	gridMore: "{count} additional",
	gridMoreLabel: "View {count} more {eventLabel} for {date}",
	internalErrorMessage: "The schedule encountered an unexpected error.",
	internalErrorTitle: "Schedule unavailable",
	jump: "Show month",
	jumpToMonthYear: "Jump to schedule month and year",
	loadErrorMessage: "Schedule items could not be loaded. Try again.",
	loadErrorTitle: "Schedule unavailable",
	month: "Month",
	navigation: "Schedule navigation",
	next: "Later month",
	previous: "Earlier month",
	recovered: "Schedule updated",
	refreshErrorMessage: "The displayed schedule may be out of date. Try again.",
	refreshErrorTitle: "Schedule may be out of date",
	retry: "Try again",
	retrying: "Trying again",
	today: "Today",
	year: "Year"
} satisfies CalendarMessages);

const REPLACEMENT_EVENTS = Object.freeze([
	Object.freeze({
		accentColor: "#805FC0",
		id: "dynamic-replacement",
		metadata: Object.freeze({
			accessibleLabel: "Dynamically replaced schedule item",
			actionLabel: "Open dynamically replaced schedule item",
			itemType: "milestone",
			statusLabel: "Updated"
		}),
		start: "2026-08-06T13:00",
		title: "Dynamically replaced schedule",
		url: "./?event=dynamic-replacement&from=calendar#advanced-example-calendar-title"
	})
] satisfies readonly CalendarEventInput<EventData>[]);

//The first records demonstrate behavior; the generated records exercise overflow limits.
const FEATURE_SCHEDULE: readonly ScheduleRecord[] = Object.freeze([
	Object.freeze({
		accentCandidate: "#008577",
		end: "2026-08-08",
		id: 3,
		itemType: "milestone",
		start: "2026-08-05",
		statusLabel: "In progress",
		title: "Release window"
	}),
	Object.freeze({
		accentCandidate: null,
		end: null,
		id: 8,
		itemType: "task",
		start: "2026-08-06",
		statusLabel: "Pending",
		title: "Prepare notes"
	}),
	Object.freeze({
		accentCandidate: "#008577",
		end: "2026-08-06T10:15",
		id: 41,
		itemType: "appointment",
		start: "2026-08-06T09:30",
		statusLabel: "Confirmed",
		title: "Design review",
		url: "./?event=design-review&from=calendar#advanced-example-calendar-title"
	}),
	Object.freeze({
		accentCandidate: "#805FC0",
		end: "2026-08-06T12:00",
		id: 12,
		itemType: "milestone",
		start: "2026-08-06T10:00",
		statusLabel: null,
		title: "Launch checkpoint",
		url: "./?event=launch-checkpoint&from=calendar#advanced-example-calendar-title"
	}),
	Object.freeze({
		accentCandidate: "#008577",
		end: null,
		id: 44,
		itemType: "appointment",
		start: "2026-08-06T13:15",
		statusLabel: "Tentative",
		title: "Stakeholder check-in"
	}),
	Object.freeze({
		accentCandidate: null,
		end: "2026-08-06T14:30",
		id: 19,
		itemType: "task",
		start: "2026-08-06T14:00",
		statusLabel: "Ready",
		title: "Quality triage"
	}),
	Object.freeze({
		accentCandidate: "#805FC0",
		end: "2026-08-06T15:30",
		id: 15,
		itemType: "milestone",
		start: "2026-08-06T15:00",
		statusLabel: "Scheduled",
		title: "Publication briefing"
	}),
	Object.freeze({
		accentCandidate: null,
		end: "2026-08-06T17:00",
		id: 21,
		itemType: "task",
		start: "2026-08-06T16:00",
		statusLabel: "Blocked",
		title: "Operations handoff"
	}),
	Object.freeze({
		accentCandidate: "#008577",
		end: "2026-08-07T11:00",
		id: 45,
		itemType: "appointment",
		start: "2026-08-07T10:30",
		statusLabel: "Confirmed",
		title: "Follow-up call"
	}),
	Object.freeze({
		accentCandidate: null,
		end: null,
		id: 99,
		itemType: "task",
		start: "2027-09-16",
		statusLabel: "Outside configured range",
		title: "Post-window archive"
	})
]);

function createOverflowSchedule(): readonly ScheduleRecord[] {
	return Object.freeze(Array.from({ length: 45 }, (_value, index) => Object.freeze({
		accentCandidate: null,
		end: "2026-08-06T17:45",
		id: 1_000 + index,
		itemType: "task" as const,
		start: "2026-08-06T17:30",
		statusLabel: "Queued",
		title: `Overflow item ${String(index + 1).padStart(2, "0")}`
	})));
}

const SCHEDULE: readonly ScheduleRecord[] = Object.freeze([
	...FEATURE_SCHEDULE,
	...createOverflowSchedule()
]);

//Resolve integration elements once so markup drift fails during example startup.
function requireElement<TElement extends Element>(
	selector: string,
	constructor: abstract new (...arguments_: never[]) => TElement
): TElement {
	const element = document.querySelector(selector);
	if (!(element instanceof constructor)) {
		throw new Error(`Missing advanced example element: ${selector}`);
	}

	return element;
}

const host = requireElement("[data-example-calendar]", HTMLElement);
const fallbackElement = requireElement("[data-example-fallback]", HTMLElement);
const toolbarEnd = requireElement("[data-example-toolbar-end]", HTMLElement);
const result = requireElement("[data-example-action-result]", HTMLElement);
const targetDate = requireElement("[data-example-target-date]", HTMLInputElement);
const targetDateError = requireElement("[data-example-target-date-error]", HTMLElement);
const direction = requireElement("[data-example-direction]", HTMLInputElement);
const themeControl = requireElement("[data-example-theme-control]", HTMLSelectElement);
const colorSchemeMeta = requireElement("[data-example-color-scheme]", HTMLElement);
const politeAnnouncer = requireElement("[data-example-announcer-polite]", HTMLElement);
const assertiveAnnouncer = requireElement("[data-example-announcer-assertive]", HTMLElement);
const statePhase = requireElement("[data-example-state-phase]", HTMLElement);
const stateMonth = requireElement("[data-example-state-month]", HTMLElement);
const stateSelected = requireElement("[data-example-state-selected]", HTMLElement);
const stateRange = requireElement("[data-example-state-range]", HTMLElement);
const stateIssues = requireElement("[data-example-state-issues]", HTMLElement);
const eventDialog = requireElement("[data-example-event-dialog]", HTMLDialogElement);
const eventDialogTitle = requireElement("[data-example-event-dialog-title]", HTMLElement);
const eventDialogCategory = requireElement("[data-example-event-dialog-category]", HTMLElement);
const eventDialogStatus = requireElement("[data-example-event-dialog-status]", HTMLElement);
const eventDialogOccurrence = requireElement(
	"[data-example-event-dialog-occurrence]",
	HTMLTimeElement
);
const eventDialogStart = requireElement("[data-example-event-dialog-start]", HTMLTimeElement);
const eventDialogEnd = requireElement("[data-example-event-dialog-end]", HTMLTimeElement);
const eventDialogNoEnd = requireElement("[data-example-event-dialog-no-end]", HTMLElement);
const typeInputs = [...document.querySelectorAll<HTMLInputElement>("[data-example-type-filter]")];
const commandButtons = [...document.querySelectorAll<HTMLButtonElement>("[data-example-command]")];

//This cache belongs to the application, not to litefold-calendar.
const rawRangeCache = new Map<string, readonly CalendarEventInput<EventData>[]>();

function toAccentColor(value: string | null): string | undefined {
	if (value === null) {
		return undefined;
	}

	const normalized = value.toUpperCase();
	return OPAQUE_HEX_COLOR.test(normalized) ? normalized : undefined;
}

/** Maps an application record to the public event-input contract. */
function adaptScheduleRecord(item: ScheduleRecord): CalendarEventInput<EventData> {
	const accentColor = toAccentColor(item.accentCandidate);
	const metadata: EventData = Object.freeze({
		accessibleLabel: `${item.itemType}: ${item.title}${item.statusLabel === null ? "" : `, ${item.statusLabel}`}`,
		actionLabel: item.title,
		itemType: item.itemType,
		...(item.statusLabel === null ? {} : { statusLabel: item.statusLabel })
	});

	return Object.freeze({
		id: `${item.itemType}:${String(item.id)}`,
		title: item.title,
		start: item.start,
		...(item.end === null ? {} : { end: item.end }),
		...(accentColor === undefined ? {} : { accentColor }),
		...(item.url === undefined ? {} : { url: item.url }),
		metadata
	});
}

/** Loads and caches the unfiltered snapshot for one requested 42-day range. */
function loadRawRange(
	start: string,
	end: string,
	signal: AbortSignal
): readonly CalendarEventInput<EventData>[] {
	signal.throwIfAborted();
	const key = `${start}/${end}`;
	const cached = rawRangeCache.get(key);
	if (cached !== undefined) {
		return cached;
	}

	const adapted = Object.freeze(SCHEDULE.map(adaptScheduleRecord));
	rawRangeCache.set(key, adapted);
	return adapted;
}

function getEnabledTypes(): ReadonlySet<ScheduleItemType> {
	return new Set(typeInputs
		.filter((input) => input.checked)
		.map((input) => input.value)
		.filter((value): value is ScheduleItemType =>
			value === "appointment" || value === "milestone" || value === "task"));
}

function formatCivilValue(value: string, isAllDay: boolean): string {
	if (isAllDay) {
		return `${value} (all day)`;
	}

	return value.replace("T", " at ");
}

function formatStateDate(date: CalendarState["selectedDate"]): string {
	return [
		String(date.year).padStart(4, "0"),
		String(date.month).padStart(2, "0"),
		String(date.day).padStart(2, "0")
	].join("-");
}

function updateState(state: Readonly<CalendarState>): undefined {
	document.documentElement.dataset["examplePhase"] = state.phase;
	document.documentElement.dataset["exampleReady"] =
		state.phase === "ready" || state.phase === "degraded" ? "true" : "false";
	statePhase.textContent = state.phase;
	stateMonth.textContent = formatStateDate(state.displayedMonth);
	stateSelected.textContent = formatStateDate(state.selectedDate);
	stateRange.textContent = state.range === null
		? "Not requested"
		: `${state.range.start} to ${state.range.end} (exclusive)`;
	stateIssues.textContent = String(state.issues.length);
}

function announceExternally(announcement: Readonly<CalendarAnnouncement>): undefined {
	const target = announcement.politeness === "assertive" ? assertiveAnnouncer : politeAnnouncer;
	const other = announcement.politeness === "assertive" ? politeAnnouncer : assertiveAnnouncer;
	other.textContent = "";
	target.textContent = "";
	queueMicrotask(() => {
		target.textContent = announcement.message;
	});
}

function reportAction(message: string): void {
	result.textContent = message;
	announceExternally({ message, politeness: "polite" });
}

function clearTargetDateError(): void {
	targetDate.setCustomValidity("");
	targetDate.removeAttribute("aria-invalid");
	targetDateError.hidden = true;
	if (assertiveAnnouncer.textContent === TARGET_DATE_ERROR_MESSAGE) {
		assertiveAnnouncer.textContent = "";
	}
}

function reportTargetDateError(): void {
	targetDate.setCustomValidity(TARGET_DATE_ERROR_MESSAGE);
	targetDate.setAttribute("aria-invalid", "true");
	targetDateError.hidden = false;
	result.textContent = TARGET_DATE_ERROR_MESSAGE;
	announceExternally({ message: TARGET_DATE_ERROR_MESSAGE, politeness: "assertive" });
	targetDate.focus();
}

function reportPublicMethodError(error: LitefoldCalendarError): void {
	const message = `${error.userTitle}. ${error.userMessage}`;
	result.textContent = message;
	announceExternally({ message, politeness: "assertive" });
}

function createNavigationIcon(ownerDocument: Document, text: string): Node {
	const icon = ownerDocument.createElement("span");
	icon.className = "advanced-example-navigation-icon";
	icon.dir = "ltr";
	icon.setAttribute("aria-hidden", "true");
	icon.textContent = text;
	return icon;
}

/** Applies current application filters each time the calendar requests or refetches a range. */
const loadEvents: CalendarEventSource<EventData> = ({ end, signal, start }) => {
	host.dataset["exampleSourceRange"] = `${start} to ${end} (exclusive)`;
	const raw = loadRawRange(start, end, signal);
	const enabled = getEnabledTypes();
	return raw.filter((event) =>
		event.metadata !== undefined && enabled.has(event.metadata.itemType));
};

//Hook output is application-owned DOM; lifecycle hooks undo every mutation they make.
const advancedRenderHooks = Object.freeze({
	id: "advanced-example",
	dayDidMount: ({ dateString, elements, isCurrentMonth, isSelected, isToday }) => {
		elements.cell.toggleAttribute(
			"data-example-day-badge-rendered",
			DAY_BADGE_RENDERED_DATES.delete(dateString)
		);
		elements.cell.classList.toggle("advanced-example-current-month-hook", isCurrentMonth);
		elements.cell.classList.toggle("advanced-example-outside-month-hook", !isCurrentMonth);
		elements.cell.classList.toggle("advanced-example-selected-hook", isSelected);
		elements.cell.classList.toggle("advanced-example-today-hook", isToday);
		return () => {
			elements.cell.removeAttribute("data-example-day-badge-rendered");
			elements.cell.classList.remove(
				"advanced-example-current-month-hook",
				"advanced-example-outside-month-hook",
				"advanced-example-selected-hook"
			);
			elements.cell.classList.remove("advanced-example-today-hook");
		};
	},
	eventDidMount: ({ elements, event, signal, surface, timeText }) => {
		const metadata = event.metadata;
		if (metadata === undefined) {
			return;
		}

		const mountedClass = `advanced-example-event-${metadata.itemType}`;
		const previousLabel = elements.action?.getAttribute("aria-label") ?? null;
		elements.root.classList.add(mountedClass);
		elements.root.setAttribute("data-example-event-id", event.id);
		elements.root.setAttribute("data-example-event-surface", surface);
		elements.root.setAttribute("data-example-time-text", timeText);
		if (surface === "agenda" && elements.action !== null) {
			const accessibleTime = timeText === "" ? "" : `${timeText}, `;
			elements.action.setAttribute(
				"aria-label",
				`${accessibleTime}${metadata.accessibleLabel}. View details.`
			);
		}

		//Cleanup may run from the returned callback or the hook-scoped abort signal.
		let cleaned = false;
		const cleanup = (): undefined => {
			if (cleaned) {
				return;
			}

			cleaned = true;
			signal.removeEventListener("abort", cleanup);
			elements.root.classList.remove(mountedClass);
			elements.root.removeAttribute("data-example-event-id");
			elements.root.removeAttribute("data-example-event-surface");
			elements.root.removeAttribute("data-example-time-text");
			if (elements.action !== null) {
				if (previousLabel === null) {
					elements.action.removeAttribute("aria-label");
				} else {
					elements.action.setAttribute("aria-label", previousLabel);
				}
			}
		};
		signal.addEventListener("abort", cleanup, { once: true });
		return cleanup;
	},
	renderDayBadge: ({ dateString }) => {
		DAY_BADGE_RENDERED_DATES.add(dateString);
		return null;
	},
	renderEventDetails: ({ document: ownerDocument, event }) => {
		if (event.metadata?.statusLabel === undefined) {
			return null;
		}

		const status = ownerDocument.createElement("span");
		status.className = "advanced-example-status";
		status.textContent = event.metadata.statusLabel;
		return status;
	},
	renderEventLeading: ({ document: ownerDocument, event }) => {
		const label = ownerDocument.createElement("span");
		label.className = "advanced-example-item-type";
		label.textContent = event.metadata?.itemType ?? "item";
		return label;
	},
	renderEventMarker: ({ document: ownerDocument, event }) => {
		const itemType = event.metadata?.itemType;
		if (itemType === undefined || itemType === "task") {
			return null;
		}

		const marker = ownerDocument.createElement("span");
		marker.className = `advanced-example-event-marker advanced-example-event-marker-${itemType}`;
		marker.setAttribute("aria-hidden", "true");
		marker.textContent = ITEM_TYPE_MARKERS[itemType];
		return marker;
	},
	renderEventTrailing: ({ document: ownerDocument, surface }) => {
		if (surface !== "agenda") {
			return null;
		}

		const actionHint = ownerDocument.createElement("span");
		actionHint.className = "advanced-example-action-hint";
		actionHint.textContent = "View details";
		return actionHint;
	},
	renderGridOverflowContent: ({
		dateString,
		document: ownerDocument,
		eventCount,
		hiddenEventCount,
		surface,
		text
	}) => {
		const content = ownerDocument.createElement("span");
		content.className = "advanced-example-grid-overflow-content";
		content.dataset["exampleDate"] = dateString;
		content.dataset["exampleEventCount"] = String(eventCount);
		content.dataset["exampleHiddenEventCount"] = String(hiddenEventCount);
		content.dataset["exampleSurface"] = surface;
		content.textContent = text;
		return content;
	},
	//Returning undefined keeps the built-in multiple-event indicator.
	renderMultipleEventIndicator: () => undefined
} satisfies CompleteCalendarRenderHooks<EventData>);

//EventData is inferred from the typed source and render hooks; `satisfies` keeps every option checked.
const calendarOptions = {
	agendaDomLimit: 50,
	agendaPageSize: 10,
	events: loadEvents,
	eventTimeDisplay: "agenda",
	extensions: [webMcp({ toolNamePrefix: "litefold-advanced" })],
	fallbackElement,
	firstDay: 1,
	headingLevel: 3,
	icons: {
		next: (ownerDocument) => createNavigationIcon(ownerDocument, "\u2192"),
		previous: (ownerDocument) => createNavigationIcon(ownerDocument, "\u2190")
	},
	initialDate: { day: 6, month: 8, year: 2026 },
	isEventContextMenuAvailable: ({ event }) => event.metadata?.itemType === "appointment",
	locale: "en-US",
	maxDate: "2027-09-15",
	maxGridEventsPerDay: 2,
	messages: ADVANCED_MESSAGES,
	minDate: "2026-07-15",
	now: () => new Date("2026-08-07T02:00:00.000Z"),
	onAnnounce: announceExternally,
	onDayContextMenu: async ({ clientX, clientY, dateString, element, nativeEvent }) => {
		await Promise.resolve();
		reportAction(
			`Day menu for ${dateString} from ${nativeEvent.type} on ${element.localName} at ${clientX}, ${clientY}.`
		);
	},
	onDaySelect: ({ dateString, element, nativeEvent }) => {
		reportAction(`Selected ${dateString} with ${nativeEvent.type} on ${element.localName}.`);
	},
	onError: (error) => {
		const diagnostic: unknown = error;
		console.error(
			diagnostic instanceof LitefoldCalendarError
				? "Observed typed calendar error"
				: "Observed unexpected error",
			diagnostic
		);
		return "default";
	},
	onEventActivate: async ({ dateString, element, event, nativeEvent, surface }) => {
		if (element instanceof HTMLAnchorElement) {
			nativeEvent.preventDefault();
		}
		await Promise.resolve();
		const metadata = event.metadata;
		if (metadata === undefined) {
			throw new Error("Expected event data was absent.");
		}

		eventDialogTitle.textContent = metadata.actionLabel;
		eventDialogCategory.textContent = ITEM_TYPE_LABELS[metadata.itemType];
		eventDialogStatus.textContent = metadata.statusLabel ?? "Not specified";
		eventDialogOccurrence.dateTime = dateString;
		eventDialogOccurrence.textContent = dateString;
		eventDialogStart.dateTime = event.start;
		eventDialogStart.textContent = formatCivilValue(event.start, event.isAllDay);

		if (event.end === null) {
			eventDialogEnd.removeAttribute("datetime");
			eventDialogEnd.textContent = "";
			eventDialogEnd.hidden = true;
			eventDialogNoEnd.hidden = false;
		} else {
			eventDialogEnd.dateTime = event.end;
			eventDialogEnd.textContent = formatCivilValue(event.end, event.isAllDay);
			eventDialogEnd.hidden = false;
			eventDialogNoEnd.hidden = true;
		}

		result.textContent = `Opened ${event.title} from ${surface} with ${nativeEvent.type} on ${element.localName}.`;
		if (!eventDialog.open) {
			eventDialog.showModal();
		}
	},
	onEventContextMenu: ({ clientX, clientY, dateString, element, event, nativeEvent, surface }) => {
		reportAction(
			`Event menu for ${event.title} on ${dateString} from ${surface} with ${nativeEvent.type} on ${element.localName} at ${clientX}, ${clientY}.`
		);
	},
	onStateChange: updateState,
	renderHooks: [advancedRenderHooks],
	sourceEventLimit: 100,
	swipe: true,
	timeZone: "America/Los_Angeles",
	toolbarEnd
} satisfies CompleteCalendarOptions<EventData>;

const calendar = createCalendar(host, calendarOptions);

//This exhaustive map doubles as the UI command dispatcher and public-method coverage check.
const calendarMethods = {
	destroy: () => { calendar.destroy(); },
	focusDate: () => { calendar.focusDate(targetDate.value); },
	focusToday: () => { calendar.focusToday(); },
	getState: () => calendar.getState(),
	//Use an instant here to demonstrate projection through the configured time zone.
	gotoDate: () => { calendar.gotoDate(new Date(`${targetDate.value}T19:00:00.000Z`)); },
	next: () => { calendar.next(); },
	prev: () => { calendar.prev(); },
	refetchEvents: () => { calendar.refetchEvents(); },
	render: () => { calendar.render(); },
	setEvents: () => { calendar.setEvents(REPLACEMENT_EVENTS); },
	today: () => { calendar.today(); }
} satisfies Record<keyof Calendar<EventData>, () => unknown>;

function runCommand(command: string): boolean {
	if (!Object.hasOwn(calendarMethods, command)) {
		throw new Error(`Unknown advanced example command: ${command}`);
	}
	const isTargetDateCommand = command === "focusDate" || command === "gotoDate";
	if (isTargetDateCommand) {
		clearTargetDateError();
		if (!targetDate.checkValidity()) {
			reportTargetDateError();
			return false;
		}
	}

	if (command === "getState") {
		const state = calendarMethods.getState();
		updateState(state);
		reportAction(`Read ${state.phase} state for ${formatStateDate(state.selectedDate)}.`);
		return true;
	}

	try {
		calendarMethods[command as Exclude<keyof Calendar<EventData>, "getState">]();
	} catch (error: unknown) {
		if (!(error instanceof LitefoldCalendarError)) {
			throw error;
		}
		if (isTargetDateCommand && error.code === "invalid-argument") {
			reportTargetDateError();
			return false;
		}
		reportPublicMethodError(error);
		return false;
	}
	return true;
}

//Connect application controls only after the calendar and its immutable options exist.
for (const button of commandButtons) {
	const command = button.dataset["exampleCommand"];
	if (command === undefined) {
		throw new Error("An advanced example command is missing its name.");
	}

	button.addEventListener("click", () => {
		runCommand(command);
	});
}

targetDate.addEventListener("input", clearTargetDateError);

for (const input of typeInputs) {
	input.addEventListener("change", () => {
		if (runCommand("refetchEvents")) {
			reportAction("Updated event-category filters.");
		}
	});
}

direction.addEventListener("change", () => {
	host.dir = direction.checked ? "rtl" : "ltr";
	reportAction(`Changed calendar direction to ${host.dir}.`);
});

themeControl.addEventListener("change", () => {
	const theme = themeControl.value;
	if (theme === "system") {
		document.documentElement.removeAttribute("data-example-theme");
		colorSchemeMeta.setAttribute("content", "light dark");
	} else if (theme === "light" || theme === "dark") {
		document.documentElement.setAttribute("data-example-theme", theme);
		colorSchemeMeta.setAttribute("content", theme);
	} else {
		throw new Error(`Unknown advanced example theme: ${theme}`);
	}
	reportAction(`Changed example theme to ${theme}.`);
});

//Rendering is explicit; non-cached page exit owns teardown for this standalone page.
calendarMethods.render();
updateState(calendarMethods.getState());

window.addEventListener("pagehide", (event) => {
	if (!event.persisted) {
		if (eventDialog.open) {
			eventDialog.close();
		}
		calendarMethods.destroy();
	}
});
