/** Creates the stable values retained until an event mount hook is invoked. */
export function createEventMountContext(elements, date, dateString, event, surface, timeText) {
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
//# sourceMappingURL=render-hook-context.js.map