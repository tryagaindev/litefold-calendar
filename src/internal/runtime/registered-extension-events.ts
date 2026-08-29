import type { CalendarDate } from "../../types.js";
import { formatCalendarDate, parseCalendarDate } from "../domain/civil-date.js";
import type { NormalizedCalendarEvent } from "../domain/event-normalization.js";
import type {
	RegisteredExtensionPresentationEvent,
	RegisteredExtensionPresentationEventPage
} from "./registered-extension-contract.js";

const MAXIMUM_EXTENSION_EVENT_PAGE_SIZE = 100;

/** Lazily projects and pages presentation-safe events for registered extensions. */
export class RegisteredExtensionEventPager<TMetadata> {
	private cachedEvents: readonly NormalizedCalendarEvent<TMetadata>[] | null = null;
	private currentSnapshot: ReadonlyMap<
		string,
		readonly NormalizedCalendarEvent<TMetadata>[]
	> | null = null;
	private snapshotRevision = 0;

	public getPage(
		eventsByDate: ReadonlyMap<string, readonly NormalizedCalendarEvent<TMetadata>[]>,
		date: Readonly<CalendarDate> | null,
		offset: number,
		limit: number,
		isDateAllowed: (this: void, candidate: Readonly<CalendarDate>) => boolean
	): Readonly<RegisteredExtensionPresentationEventPage> {
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
			const event: Readonly<RegisteredExtensionPresentationEvent> = Object.freeze({
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

	private synchronizeSnapshot(
		eventsByDate: ReadonlyMap<string, readonly NormalizedCalendarEvent<TMetadata>[]>
	): void {
		if (this.currentSnapshot === eventsByDate) {
			return;
		}
		this.currentSnapshot = eventsByDate;
		this.cachedEvents = null;
		this.snapshotRevision += 1;
	}

	private getVisibleEvents(
		eventsByDate: ReadonlyMap<string, readonly NormalizedCalendarEvent<TMetadata>[]>,
		isDateAllowed: (this: void, candidate: Readonly<CalendarDate>) => boolean
	): readonly NormalizedCalendarEvent<TMetadata>[] {
		if (this.cachedEvents !== null) {
			return this.cachedEvents;
		}
		const identifiers = new Set<string>();
		const visibleEvents: NormalizedCalendarEvent<TMetadata>[] = [];
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
