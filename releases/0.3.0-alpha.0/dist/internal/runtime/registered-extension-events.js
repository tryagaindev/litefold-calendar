import { formatCalendarDate, parseCalendarDate } from "../domain/civil-date.js";
const MAXIMUM_EXTENSION_EVENT_PAGE_SIZE = 100;
/** Lazily projects and pages presentation-safe events for registered extensions. */
export class RegisteredExtensionEventPager {
    cachedEvents = null;
    currentSnapshot = null;
    snapshotRevision = 0;
    getPage(eventsByDate, date, offset, limit, isDateAllowed) {
        if (!Number.isSafeInteger(offset) || offset < 0 || !Number.isSafeInteger(limit) ||
            limit < 1 || limit > MAXIMUM_EXTENSION_EVENT_PAGE_SIZE) {
            throw new RangeError("Extension event paging requested invalid bounds.");
        }
        this.synchronizeSnapshot(eventsByDate);
        const entries = date === null
            ? this.getVisibleEvents(eventsByDate, isDateAllowed)
            : isDateAllowed(date)
                ? eventsByDate.get(formatCalendarDate(date)) ?? []
                : [];
        const events = entries.slice(offset, offset + limit).map((entry) => {
            const event = Object.freeze({
                end: entry.event.end,
                isAllDay: entry.event.isAllDay,
                start: entry.event.start,
                title: entry.event.title
            });
            return event;
        });
        return Object.freeze({
            events: Object.freeze(events),
            snapshotRevision: this.snapshotRevision,
            totalEvents: entries.length
        });
    }
    synchronizeSnapshot(eventsByDate) {
        if (this.currentSnapshot === eventsByDate) {
            return;
        }
        this.currentSnapshot = eventsByDate;
        this.cachedEvents = null;
        this.snapshotRevision += 1;
    }
    getVisibleEvents(eventsByDate, isDateAllowed) {
        if (this.cachedEvents !== null) {
            return this.cachedEvents;
        }
        const identifiers = new Set();
        const visibleEvents = [];
        for (const [dateString, entries] of eventsByDate) {
            const date = parseCalendarDate(dateString);
            if (date === null || !isDateAllowed(date)) {
                continue;
            }
            for (const entry of entries) {
                if (identifiers.has(entry.event.id)) {
                    continue;
                }
                identifiers.add(entry.event.id);
                visibleEvents.push(entry);
            }
        }
        this.cachedEvents = Object.freeze(visibleEvents);
        return this.cachedEvents;
    }
}
//# sourceMappingURL=registered-extension-events.js.map