import { createCalendar, LitefoldCalendarError } from "../../dist/index.js";
import { webMcp } from "../../dist/extensions/webmcp/index.js";
const OPAQUE_HEX_COLOR = /^#[0-9A-F]{6}$/u;
const COMPLETE_GRID_DAY_COUNT = 42;
const DAY_BADGE_RENDERED_DATES = new Set();
const PHASE_HISTORY_LIMIT = 8;
const TARGET_DATE_ERROR_MESSAGE = "Choose a date from July 15, 2026 through September 15, 2027.";
const ITEM_TYPE_LABELS = Object.freeze({
    appointment: "Appointment",
    milestone: "Milestone",
    task: "Task"
});
const ITEM_TYPE_MARKERS = Object.freeze({
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
});
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
        url: "./?event=dynamic-replacement&from=calendar#my-calendar-title"
    })
]);
//The first records demonstrate behavior; the generated records exercise overflow limits.
const FEATURE_SCHEDULE = Object.freeze([
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
        end: "2026-08-06T12:23",
        id: 41,
        itemType: "appointment",
        start: "2026-08-06T11:38",
        statusLabel: "Confirmed",
        title: "Design review",
        url: "./?event=design-review&from=calendar#my-calendar-title"
    }),
    Object.freeze({
        accentCandidate: "#805FC0",
        end: "2026-08-06T12:00",
        id: 12,
        itemType: "milestone",
        start: "2026-08-06T10:00",
        statusLabel: null,
        title: "Launch checkpoint",
        url: "./?event=launch-checkpoint&from=calendar#my-calendar-title"
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
function createOverflowSchedule() {
    return Object.freeze(Array.from({ length: 45 }, (_value, index) => Object.freeze({
        accentCandidate: null,
        end: "2026-08-06T17:45",
        id: 1_000 + index,
        itemType: "task",
        start: "2026-08-06T17:30",
        statusLabel: "Queued",
        title: `Overflow item ${String(index + 1).padStart(2, "0")}`
    })));
}
const SCHEDULE = Object.freeze([
    ...FEATURE_SCHEDULE,
    ...createOverflowSchedule()
]);
//Resolve integration elements once so markup drift fails during example startup.
function requireElement(selector, constructor) {
    const element = document.querySelector(selector);
    if (!(element instanceof constructor)) {
        throw new Error(`Missing advanced example element: ${selector}`);
    }
    return element;
}
const host = requireElement("[data-my-calendar]", HTMLElement);
const fallbackElement = requireElement("[data-my-fallback]", HTMLElement);
const toolbarEnd = requireElement("[data-my-toolbar-end]", HTMLElement);
const result = requireElement("[data-my-action-result]", HTMLElement);
const targetDate = requireElement("[data-my-target-date]", HTMLInputElement);
const targetDateError = requireElement("[data-my-target-date-error]", HTMLElement);
const direction = requireElement("[data-my-direction]", HTMLInputElement);
const themeControl = requireElement("[data-my-theme-control]", HTMLSelectElement);
const sourceTimingControl = requireElement("[data-my-source-timing]", HTMLSelectElement);
const completePendingButton = requireElement("[data-my-complete-pending]", HTMLButtonElement);
const colorSchemeMeta = requireElement("[data-my-color-scheme]", HTMLElement);
const politeAnnouncer = requireElement("[data-my-announcer-polite]", HTMLElement);
const assertiveAnnouncer = requireElement("[data-my-announcer-assertive]", HTMLElement);
const statePhase = requireElement("[data-my-state-phase]", HTMLElement);
const statePhaseHistory = requireElement("[data-my-state-phase-history]", HTMLElement);
const stateBusy = requireElement("[data-my-state-busy]", HTMLElement);
const stateGridRenders = requireElement("[data-my-state-grid-renders]", HTMLElement);
const stateMonth = requireElement("[data-my-state-month]", HTMLElement);
const stateSelected = requireElement("[data-my-state-selected]", HTMLElement);
const stateRange = requireElement("[data-my-state-range]", HTMLElement);
const stateIssues = requireElement("[data-my-state-issues]", HTMLElement);
const eventDialog = requireElement("[data-my-event-dialog]", HTMLDialogElement);
const eventDialogTitle = requireElement("[data-my-event-dialog-title]", HTMLElement);
const eventDialogCategory = requireElement("[data-my-event-dialog-category]", HTMLElement);
const eventDialogStatus = requireElement("[data-my-event-dialog-status]", HTMLElement);
const eventDialogOccurrence = requireElement("[data-my-event-dialog-occurrence]", HTMLTimeElement);
const eventDialogStart = requireElement("[data-my-event-dialog-start]", HTMLTimeElement);
const eventDialogEnd = requireElement("[data-my-event-dialog-end]", HTMLTimeElement);
const eventDialogNoEnd = requireElement("[data-my-event-dialog-no-end]", HTMLElement);
const typeInputs = [...document.querySelectorAll("[data-my-type-filter]")];
const commandButtons = [...document.querySelectorAll("[data-my-command]")];
//This cache belongs to the application, not to litefold-calendar.
const rawRangeCache = new Map();
const phaseHistory = [];
let completedGridRenderCount = 0;
let mountedDaysInCurrentGrid = 0;
let pendingSourceRequest = null;
let sourceTiming = "immediate";
function toAccentColor(value) {
    if (value === null) {
        return undefined;
    }
    const normalized = value.toUpperCase();
    return OPAQUE_HEX_COLOR.test(normalized) ? normalized : undefined;
}
/** Maps an application record to the public event-input contract. */
function adaptScheduleRecord(item) {
    const accentColor = toAccentColor(item.accentCandidate);
    const metadata = Object.freeze({
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
function loadRawRange(start, end, signal) {
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
function getEnabledTypes() {
    return new Set(typeInputs
        .filter((input) => input.checked)
        .map((input) => input.value)
        .filter((value) => value === "appointment" || value === "milestone" || value === "task"));
}
function formatCivilValue(value, isAllDay) {
    if (isAllDay) {
        return `${value} (all day)`;
    }
    return value.replace("T", " at ");
}
function formatStateDate(date) {
    return [
        String(date.year).padStart(4, "0"),
        String(date.month).padStart(2, "0"),
        String(date.day).padStart(2, "0")
    ].join("-");
}
function displayState(state) {
    statePhase.textContent = state.phase;
    stateMonth.textContent = formatStateDate(state.displayedMonth);
    stateSelected.textContent = formatStateDate(state.selectedDate);
    stateRange.textContent = state.range === null
        ? "Not requested"
        : `${state.range.start} to ${state.range.end} (exclusive)`;
    stateIssues.textContent = String(state.issues.length);
}
function updateState(state) {
    document.documentElement.dataset["testPhase"] = state.phase;
    document.documentElement.dataset["testReady"] =
        state.phase === "ready" || state.phase === "degraded" ? "true" : "false";
    phaseHistory.push(state.phase);
    phaseHistory.splice(0, Math.max(0, phaseHistory.length - PHASE_HISTORY_LIMIT));
    statePhaseHistory.textContent = phaseHistory.join(" → ");
    displayState(state);
}
function updateBusyObservation() {
    stateBusy.textContent = String(host.getAttribute("aria-busy") === "true");
}
const busyObserver = new MutationObserver(updateBusyObservation);
busyObserver.observe(host, { attributeFilter: ["aria-busy"], attributes: true });
updateBusyObservation();
function announceExternally(announcement) {
    const target = announcement.politeness === "assertive" ? assertiveAnnouncer : politeAnnouncer;
    const other = announcement.politeness === "assertive" ? politeAnnouncer : assertiveAnnouncer;
    other.textContent = "";
    target.textContent = "";
    queueMicrotask(() => {
        target.textContent = announcement.message;
    });
}
function reportAction(message) {
    result.textContent = message;
    announceExternally({ message, politeness: "polite" });
}
function clearTargetDateError() {
    targetDate.setCustomValidity("");
    targetDate.removeAttribute("aria-invalid");
    targetDateError.hidden = true;
    if (assertiveAnnouncer.textContent === TARGET_DATE_ERROR_MESSAGE) {
        assertiveAnnouncer.textContent = "";
    }
}
function reportTargetDateError() {
    targetDate.setCustomValidity(TARGET_DATE_ERROR_MESSAGE);
    targetDate.setAttribute("aria-invalid", "true");
    targetDateError.hidden = false;
    result.textContent = TARGET_DATE_ERROR_MESSAGE;
    announceExternally({ message: TARGET_DATE_ERROR_MESSAGE, politeness: "assertive" });
    targetDate.focus();
}
function reportPublicMethodError(error) {
    const message = `${error.userTitle}. ${error.userMessage}`;
    result.textContent = message;
    announceExternally({ message, politeness: "assertive" });
}
function createNavigationIcon(ownerDocument, text) {
    const icon = ownerDocument.createElement("span");
    icon.className = "my-navigation-icon";
    icon.dir = "ltr";
    icon.setAttribute("aria-hidden", "true");
    icon.textContent = text;
    return icon;
}
function updatePendingControl() {
    completePendingButton.disabled = pendingSourceRequest === null;
}
function createControlledSourceResult(events, signal) {
    return new Promise((resolve, reject) => {
        let settled = false;
        const releaseRequest = () => {
            if (pendingSourceRequest === request) {
                pendingSourceRequest = null;
                updatePendingControl();
            }
        };
        const abort = () => {
            if (settled) {
                return;
            }
            settled = true;
            signal.removeEventListener("abort", abort);
            releaseRequest();
            try {
                signal.throwIfAborted();
            }
            catch (error) {
                reject(error instanceof Error
                    ? error
                    : new DOMException("The controlled source request was aborted.", "AbortError"));
                return;
            }
            reject(new DOMException("The controlled source request was aborted.", "AbortError"));
        };
        const request = Object.freeze({
            complete() {
                if (settled) {
                    return;
                }
                if (signal.aborted) {
                    abort();
                    return;
                }
                settled = true;
                signal.removeEventListener("abort", abort);
                releaseRequest();
                resolve(events);
            }
        });
        signal.addEventListener("abort", abort, { once: true });
        if (signal.aborted) {
            abort();
            return;
        }
        pendingSourceRequest = request;
        updatePendingControl();
    });
}
function recordGridDayMount() {
    mountedDaysInCurrentGrid += 1;
    if (mountedDaysInCurrentGrid !== COMPLETE_GRID_DAY_COUNT) {
        return;
    }
    mountedDaysInCurrentGrid = 0;
    completedGridRenderCount += 1;
    stateGridRenders.textContent = String(completedGridRenderCount);
}
/** Applies current application filters each time the calendar requests or refetches a range. */
const loadEvents = ({ end, signal, start }) => {
    host.dataset["testSourceRange"] = `${start} to ${end} (exclusive)`;
    const raw = loadRawRange(start, end, signal);
    const enabled = getEnabledTypes();
    const events = Object.freeze(raw.filter((event) => event.metadata !== undefined && enabled.has(event.metadata.itemType)));
    return sourceTiming === "immediate"
        ? events
        : createControlledSourceResult(events, signal);
};
//Hook output is application-owned DOM; lifecycle hooks undo every mutation they make.
const advancedRenderHooks = Object.freeze({
    id: "my-advanced",
    dayDidMount: ({ dateString, elements, isCurrentMonth, isSelected, isToday }) => {
        recordGridDayMount();
        elements.cell.toggleAttribute("data-test-day-badge-rendered", DAY_BADGE_RENDERED_DATES.delete(dateString));
        elements.cell.classList.toggle("my-current-month-hook", isCurrentMonth);
        elements.cell.classList.toggle("my-outside-month-hook", !isCurrentMonth);
        elements.cell.classList.toggle("my-selected-hook", isSelected);
        elements.cell.classList.toggle("my-today-hook", isToday);
        return () => {
            elements.cell.removeAttribute("data-test-day-badge-rendered");
            elements.cell.classList.remove("my-current-month-hook", "my-outside-month-hook", "my-selected-hook");
            elements.cell.classList.remove("my-today-hook");
        };
    },
    eventDidMount: ({ elements, event, signal, surface, timeText }) => {
        const metadata = event.metadata;
        if (metadata === undefined) {
            return;
        }
        const mountedClass = `my-event-${metadata.itemType}`;
        const previousLabel = elements.action?.getAttribute("aria-label") ?? null;
        elements.root.classList.add(mountedClass);
        elements.root.setAttribute("data-test-event-id", event.id);
        elements.root.setAttribute("data-test-event-surface", surface);
        elements.root.setAttribute("data-test-time-text", timeText);
        if (surface === "agenda" && elements.action !== null) {
            const accessibleTime = timeText === "" ? "" : `${timeText}, `;
            elements.action.setAttribute("aria-label", `${accessibleTime}${metadata.accessibleLabel}. View details.`);
        }
        //Cleanup may run from the returned callback or the hook-scoped abort signal.
        let cleaned = false;
        const cleanup = () => {
            if (cleaned) {
                return;
            }
            cleaned = true;
            signal.removeEventListener("abort", cleanup);
            elements.root.classList.remove(mountedClass);
            elements.root.removeAttribute("data-test-event-id");
            elements.root.removeAttribute("data-test-event-surface");
            elements.root.removeAttribute("data-test-time-text");
            if (elements.action !== null) {
                if (previousLabel === null) {
                    elements.action.removeAttribute("aria-label");
                }
                else {
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
        status.className = "my-status";
        status.textContent = event.metadata.statusLabel;
        return status;
    },
    renderEventLeading: ({ document: ownerDocument, event }) => {
        const label = ownerDocument.createElement("span");
        label.className = "my-item-type";
        label.textContent = event.metadata?.itemType ?? "item";
        return label;
    },
    renderEventMarker: ({ document: ownerDocument, event }) => {
        const itemType = event.metadata?.itemType;
        if (itemType === undefined || itemType === "task") {
            return null;
        }
        const marker = ownerDocument.createElement("span");
        marker.className = `my-event-marker my-event-marker-${itemType}`;
        marker.setAttribute("aria-hidden", "true");
        marker.textContent = ITEM_TYPE_MARKERS[itemType];
        return marker;
    },
    renderEventTrailing: ({ document: ownerDocument, surface }) => {
        if (surface !== "agenda") {
            return null;
        }
        const actionHint = ownerDocument.createElement("span");
        actionHint.className = "my-action-hint";
        actionHint.textContent = "View details";
        return actionHint;
    },
    renderEventOverflow: ({ dateString, document: ownerDocument, elements, eventCount, overflowCount, surface, text, variant, visibleEventCount }) => {
        const content = ownerDocument.createElement("span");
        content.className = `my-event-overflow-${variant}`;
        content.dataset["testDate"] = dateString;
        content.dataset["testEventCount"] = String(eventCount);
        content.dataset["testOverflowCount"] = String(overflowCount);
        content.dataset["testSurface"] = surface;
        content.dataset["testVariant"] = variant;
        content.dataset["testVisibleEventCount"] = String(visibleEventCount);
        content.dataset["testActionBacked"] = String(elements.action !== null);
        if (variant === "compact") {
            //Reuse Litefold Calendar's locale-aware social number and apply only application styling.
            content.textContent = text;
            return content;
        }
        //The wide branch demonstrates structured DOM while retaining the localized package text.
        const defaultText = ownerDocument.createElement("strong");
        defaultText.className = "my-event-overflow-wide-count";
        defaultText.textContent = text;
        const destination = ownerDocument.createElement("span");
        destination.className = "my-event-overflow-wide-destination";
        destination.textContent = "in agenda";
        content.append(defaultText, destination);
        return content;
    }
});
//EventData is inferred from the typed source and render hooks; `satisfies` keeps every option checked.
const calendarOptions = {
    agendaDomLimit: 50,
    agendaPageSize: 10,
    events: loadEvents,
    eventTimeDisplay: "agenda",
    extensions: [webMcp({ toolNamePrefix: "my-schedule" })],
    fallbackElement,
    firstDay: 1,
    gridEventPlacement: "bottom",
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
        reportAction(`Day menu for ${dateString} from ${nativeEvent.type} on ${element.localName} at ${clientX}, ${clientY}.`);
    },
    onDaySelect: ({ dateString, element, nativeEvent }) => {
        reportAction(`Selected ${dateString} with ${nativeEvent.type} on ${element.localName}.`);
    },
    onError: (error) => {
        const diagnostic = error;
        console.error(diagnostic instanceof LitefoldCalendarError
            ? "Observed typed calendar error"
            : "Observed unexpected error", diagnostic);
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
        }
        else {
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
        reportAction(`Event menu for ${event.title} on ${dateString} from ${surface} with ${nativeEvent.type} on ${element.localName} at ${clientX}, ${clientY}.`);
    },
    onStateChange: updateState,
    renderHooks: [advancedRenderHooks],
    sourceEventLimit: 100,
    swipe: true,
    timeZone: "America/Los_Angeles",
    toolbarEnd,
    weekRowSizing: "content"
};
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
    setEvents: () => {
        sourceTiming = "immediate";
        sourceTimingControl.value = sourceTiming;
        calendar.setEvents(REPLACEMENT_EVENTS);
    },
    today: () => { calendar.today(); }
};
function runCommand(command) {
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
        displayState(state);
        reportAction(`Read ${state.phase} state for ${formatStateDate(state.selectedDate)}.`);
        return true;
    }
    try {
        calendarMethods[command]();
    }
    catch (error) {
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
    const command = button.dataset["myCommand"];
    if (command === undefined) {
        throw new Error("An advanced example command is missing its name.");
    }
    button.addEventListener("click", () => {
        runCommand(command);
    });
}
targetDate.addEventListener("input", clearTargetDateError);
sourceTimingControl.addEventListener("change", () => {
    if (sourceTimingControl.value !== "controlled" && sourceTimingControl.value !== "immediate") {
        throw new Error(`Unknown source timing: ${sourceTimingControl.value}`);
    }
    sourceTiming = sourceTimingControl.value;
    calendar.setEvents(loadEvents);
    reportAction(sourceTiming === "immediate"
        ? "Restored the provider with an immediate array result."
        : "Started a controlled PromiseLike request.");
});
completePendingButton.addEventListener("click", () => {
    const request = pendingSourceRequest;
    if (request === null) {
        return;
    }
    request.complete();
    reportAction("Completed the controlled source request.");
});
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
        document.documentElement.removeAttribute("data-my-theme");
        colorSchemeMeta.setAttribute("content", "light dark");
    }
    else if (theme === "light" || theme === "dark") {
        document.documentElement.setAttribute("data-my-theme", theme);
        colorSchemeMeta.setAttribute("content", theme);
    }
    else {
        throw new Error(`Unknown advanced example theme: ${theme}`);
    }
    reportAction(`Changed example theme to ${theme}.`);
});
//Rendering is explicit; this standalone page owns teardown on a non-cached page exit.
calendarMethods.render();
window.addEventListener("pagehide", (event) => {
    if (!event.persisted) {
        if (eventDialog.open) {
            eventDialog.close();
        }
        calendarMethods.destroy();
        busyObserver.disconnect();
    }
});
