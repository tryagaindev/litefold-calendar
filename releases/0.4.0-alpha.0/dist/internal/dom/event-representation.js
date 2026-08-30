/** Creates a complete native event representation without invoking application code. */
export function createEventRepresentation(input) {
    const event = input.event.event;
    const isLink = event.url !== null;
    const isActionable = isLink || input.hasApplicationAction;
    const root = input.document.createElement(isLink ? "a" : isActionable ? "button" : input.surface === "agenda" ? "div" : "span");
    root.className = input.surface === "agenda"
        ? "lfc-calendar-agenda-event"
        : "lfc-calendar-event-summary";
    root.setAttribute("data-lfc-date", input.dateString);
    root.setAttribute("data-lfc-event-id", event.id);
    root.setAttribute("data-lfc-surface", input.surface);
    const action = isActionable ? root : null;
    if (action !== null) {
        action.classList.add("lfc-calendar-event-button");
        if (action.tagName === "BUTTON") {
            action.type = "button";
        }
        else if (event.url !== null) {
            action.href = event.url;
        }
        if (input.surface === "grid-summary") {
            action.tabIndex = -1;
            action.setAttribute("aria-label", input.accessibleLabel);
        }
    }
    const leading = input.document.createElement("span");
    leading.className = "lfc-calendar-event-leading";
    const marker = input.document.createElement("span");
    marker.className = "lfc-calendar-event-marker";
    const leadingContent = input.document.createElement("span");
    leadingContent.className = "lfc-calendar-event-leading-content";
    leading.append(marker, leadingContent);
    const time = input.document.createElement("time");
    Object.assign(time, {
        className: "lfc-calendar-time",
        dateTime: event.start,
        dir: "auto",
        textContent: input.timeText
    });
    if (isTimeVisuallyHidden(input.timeDisplay, input.surface)) {
        time.classList.add("lfc-visually-hidden");
    }
    const title = input.document.createElement("span");
    Object.assign(title, {
        className: "lfc-calendar-event-title",
        dir: "auto",
        textContent: event.title
    });
    const details = input.document.createElement("span");
    details.className = "lfc-calendar-event-details";
    const trailing = input.document.createElement("span");
    trailing.className = "lfc-calendar-event-trailing";
    root.append(leading, time, title, details, trailing);
    return Object.freeze({
        elements: Object.freeze({ action, details, leading, marker, root, time, title, trailing }),
        slots: Object.freeze({ leadingContent })
    });
}
function isTimeVisuallyHidden(timeDisplay, surface) {
    return timeDisplay === "none" ||
        (timeDisplay === "grid" && surface === "agenda") ||
        (timeDisplay === "agenda" && surface === "grid-summary");
}
//# sourceMappingURL=event-representation.js.map