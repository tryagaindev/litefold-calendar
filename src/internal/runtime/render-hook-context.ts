import type { EventRepresentationElements } from "../dom/event-representation.js";
import type { CalendarDate, CalendarEvent, CalendarEventSurface } from "../../types.js";

/** Creates the stable values retained until an event mount hook is invoked. */
export function createEventMountContext<TMetadata>(
	elements: Readonly<EventRepresentationElements>,
	date: CalendarDate,
	dateString: string,
	event: CalendarEvent<TMetadata>,
	surface: CalendarEventSurface,
	timeText: string
): Readonly<Record<string, unknown>> & { readonly event: CalendarEvent<TMetadata> } {
	return Object.freeze({
		date: Object.freeze({ ...date }),
		dateString,
		document: elements.root.ownerDocument,
		elements,
		event,
		surface,
		timeText
	});
}
