/** Creates one stable event-overflow visual with package-owned default content. */
export function createEventOverflowElements(document, variant, text) {
    const root = document.createElement("span");
    root.className = `lfc-calendar-event-overflow lfc-is-${variant}`;
    root.setAttribute("aria-hidden", "true");
    const content = document.createElement("span");
    content.className = "lfc-calendar-event-overflow-content";
    const defaultContent = document.createElement("span");
    defaultContent.className = "lfc-event-overflow-default-content";
    defaultContent.textContent = text;
    content.append(defaultContent);
    root.append(content);
    return { content, root };
}
//# sourceMappingURL=event-overflow.js.map