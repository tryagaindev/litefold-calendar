import { formatCalendarDate } from "../domain/civil-date.js";
import type {
	CalendarDate,
	CalendarDayContextMenu,
	CalendarDaySelection,
	CalendarEvent,
	CalendarEventActionElement,
	CalendarEventActivation,
	CalendarEventContextMenu,
	CalendarEventContextMenuAvailability,
	CalendarEventSurface
} from "../../types.js";

/** Creates an immutable public day-selection context. */
export function createDaySelection(
	nativeEvent: MouseEvent,
	date: CalendarDate,
	element: HTMLButtonElement
): Readonly<CalendarDaySelection> {
	return Object.freeze({
		date: Object.freeze({ ...date }),
		dateString: formatCalendarDate(date),
		element,
		nativeEvent
	});
}

/** Creates an immutable public day-context-menu context. */
export function createDayContextMenu(
	nativeEvent: MouseEvent | KeyboardEvent,
	date: CalendarDate,
	element: HTMLButtonElement,
	clientX: number,
	clientY: number
): Readonly<CalendarDayContextMenu> {
	return Object.freeze({
		clientX,
		clientY,
		date: Object.freeze({ ...date }),
		dateString: formatCalendarDate(date),
		element,
		nativeEvent
	});
}

/** Creates an immutable public event-activation context. */
export function createEventActivation<TMetadata>(
	nativeEvent: MouseEvent,
	date: CalendarDate,
	element: CalendarEventActionElement,
	event: CalendarEvent<TMetadata>,
	surface: CalendarEventSurface
): Readonly<CalendarEventActivation<TMetadata>> {
	return Object.freeze({
		date: Object.freeze({ ...date }),
		dateString: formatCalendarDate(date),
		element,
		event,
		nativeEvent,
		surface
	});
}

/** Creates an immutable context-action availability context without exposing DOM or native events. */
export function createEventContextMenuAvailability<TMetadata>(
	date: CalendarDate,
	event: CalendarEvent<TMetadata>,
	surface: CalendarEventSurface
): Readonly<CalendarEventContextMenuAvailability<TMetadata>> {
	return Object.freeze({
		date: Object.freeze({ ...date }),
		dateString: formatCalendarDate(date),
		event,
		surface
	});
}

/** Creates an immutable public event-context-menu context. */
export function createEventContextMenu<TMetadata>(
	nativeEvent: MouseEvent | KeyboardEvent,
	date: CalendarDate,
	element: CalendarEventActionElement,
	event: CalendarEvent<TMetadata>,
	surface: CalendarEventSurface,
	clientX: number,
	clientY: number
): Readonly<CalendarEventContextMenu<TMetadata>> {
	return Object.freeze({
		clientX,
		clientY,
		date: Object.freeze({ ...date }),
		dateString: formatCalendarDate(date),
		element,
		event,
		nativeEvent,
		surface
	});
}
