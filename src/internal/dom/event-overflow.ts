/** Event-overflow rendering variants pre-rendered by the calendar. */
export type EventOverflowVariant = "compact" | "wide";

/** Stable package-owned elements for one event-overflow visual. */
export interface EventOverflowElements {
	readonly content: HTMLSpanElement;
	readonly root: HTMLSpanElement;
}

/** Creates one stable event-overflow visual with package-owned default content. */
export function createEventOverflowElements(
	document: Document,
	variant: EventOverflowVariant,
	text: string
): EventOverflowElements {
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
