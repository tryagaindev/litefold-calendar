import { formatCalendarDate } from "../domain/civil-date.js";
/** Creates an immutable public day-selection context. */
export function createDaySelection(nativeEvent, date, element) {
    return Object.freeze({
        date: Object.freeze({ ...date }),
        dateString: formatCalendarDate(date),
        element,
        nativeEvent
    });
}
/** Creates an immutable public day-context-menu context. */
export function createDayContextMenu(nativeEvent, date, element, clientX, clientY) {
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
export function createEventActivation(nativeEvent, date, element, event, surface) {
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
export function createEventContextMenuAvailability(date, event, surface) {
    return Object.freeze({
        date: Object.freeze({ ...date }),
        dateString: formatCalendarDate(date),
        event,
        surface
    });
}
/** Creates an immutable public event-context-menu context. */
export function createEventContextMenu(nativeEvent, date, element, event, surface, clientX, clientY) {
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
//# sourceMappingURL=actions.js.map