import { formatCalendarMessage } from "../../messages.js";
import { createEventOverflowElements } from "../dom/event-overflow.js";
const COMPACT_NUMBER_FORMAT_OPTIONS = Object.freeze({
    compactDisplay: "short",
    maximumFractionDigits: 1,
    notation: "compact",
    useGrouping: false
});
/** Builds and places package-owned overflow visuals without invoking consumer code. */
export class CalendarEventOverflowPresenter {
    compactNumberFormatter = null;
    options;
    signedCompactNumberFormatter = null;
    constructor(options) {
        this.options = options;
    }
    /** Prepares and places each applicable variant once so CSS can switch without rerendering. */
    prepareAndPlace(options) {
        options.compactPrimary?.root.classList.add("lfc-is-compact-primary");
        const grid = this.createGridOverflow(options);
        const compact = this.createCompactOverflow(options, grid?.button ?? null);
        if (grid !== null) {
            grid.button.append(grid.wide.root);
        }
        return Object.freeze({ compact, grid });
    }
    createCompactOverflow(options, gridAction) {
        if (options.eventCount <= 1 && (gridAction === null || options.compactPrimary !== null)) {
            return null;
        }
        const visibleEventCount = options.compactPrimary !== null &&
            options.compactPrimary.marker.childNodes.length > 0 ? 1 : 0;
        const overflowCount = options.eventCount - visibleEventCount;
        const text = visibleEventCount === 0
            ? this.getCompactNumberFormatter(false).format(overflowCount)
            : this.getCompactNumberFormatter(true).format(overflowCount);
        const overflow = createEventOverflowElements(this.options.document, "compact", text);
        this.placeCompactOverflow(options, gridAction, overflow.root, visibleEventCount);
        const action = options.compactPrimary === null ? gridAction : null;
        return Object.freeze({
            action,
            content: overflow.content,
            date: options.date,
            dateString: options.dateString,
            eventCount: options.eventCount,
            overflowCount,
            placementBoundary: action === null
                ? options.summaries.parentElement ?? options.summaries
                : null,
            root: overflow.root,
            text,
            variant: "compact",
            visibleEventCount
        });
    }
    createGridOverflow(options) {
        if (options.eventCount <= this.options.gridEventLimit) {
            return null;
        }
        const button = this.options.document.createElement("button");
        button.className = "lfc-calendar-more lfc-calendar-grid-more";
        button.type = "button";
        button.tabIndex = -1;
        button.setAttribute("aria-keyshortcuts", "F2");
        button.setAttribute("data-lfc-date", options.dateString);
        button.classList.toggle("lfc-is-compact-primary", options.compactPrimary === null);
        const overflowCount = options.eventCount - this.options.gridEventLimit;
        const formattedCount = this.options.numberFormatter.format(overflowCount);
        const text = formatCalendarMessage(this.options.messages.gridMore, { count: formattedCount });
        const wide = createEventOverflowElements(this.options.document, "wide", text);
        button.setAttribute("aria-label", formatCalendarMessage(this.options.messages.gridMoreLabel, {
            count: formattedCount,
            date: options.fullDateText,
            eventLabel: overflowCount === 1
                ? this.options.messages.event
                : this.options.messages.events
        }));
        return Object.freeze({
            button,
            wide: Object.freeze({
                action: button,
                content: wide.content,
                date: options.date,
                dateString: options.dateString,
                eventCount: options.eventCount,
                overflowCount,
                root: wide.root,
                text,
                variant: "wide",
                visibleEventCount: options.eventCount - overflowCount
            })
        });
    }
    getCompactNumberFormatter(signed) {
        if (signed) {
            if (this.signedCompactNumberFormatter !== null) {
                return this.signedCompactNumberFormatter;
            }
            this.signedCompactNumberFormatter ??= new Intl.NumberFormat(this.options.locale, {
                ...COMPACT_NUMBER_FORMAT_OPTIONS,
                signDisplay: "always"
            });
            return this.signedCompactNumberFormatter;
        }
        if (this.compactNumberFormatter !== null) {
            return this.compactNumberFormatter;
        }
        this.compactNumberFormatter ??= new Intl.NumberFormat(this.options.locale, COMPACT_NUMBER_FORMAT_OPTIONS);
        return this.compactNumberFormatter;
    }
    placeCompactOverflow(options, gridAction, overflow, visibleEventCount) {
        if (options.compactPrimary !== null) {
            const overflowCluster = this.options.document.createElement("div");
            overflowCluster.className = "lfc-calendar-event-overflow-cluster";
            overflowCluster.classList.toggle("lfc-has-compact-primary-visual", visibleEventCount === 1);
            options.compactPrimary.root.replaceWith(overflowCluster);
            overflowCluster.append(options.compactPrimary.root, overflow);
            return;
        }
        if (gridAction !== null) {
            gridAction.append(overflow);
            return;
        }
        const overflowCluster = this.options.document.createElement("div");
        overflowCluster.className = "lfc-calendar-event-overflow-cluster";
        overflowCluster.append(overflow);
        options.summaries.append(overflowCluster);
    }
}
//# sourceMappingURL=event-overflow-presentation.js.map