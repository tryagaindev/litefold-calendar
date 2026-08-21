/** Creates a fresh, detached, noninteractive icon node owned by the supplied host document. */
export type CalendarIconFactory = (this: void, document: Document) => Node;

/** Configurable navigation-button icon factories. */
export interface CalendarIcons {
	/** Creates decorative content for the next-month button. */
	readonly next: CalendarIconFactory;
	/** Creates decorative content for the previous-month button. */
	readonly previous: CalendarIconFactory;
}

function createTextIcon(document: Document, text: string): HTMLSpanElement {
	const icon = document.createElement("span");
	icon.className = "lfc-calendar-navigation-icon";
	icon.dir = "ltr";
	icon.setAttribute("aria-hidden", "true");
	icon.textContent = text;
	return icon;
}

/** Dependency-free default navigation icons. */
export const DEFAULT_CALENDAR_ICONS: Readonly<CalendarIcons> = Object.freeze({
	next: (document: Document) => createTextIcon(document, "\u203a"),
	previous: (document: Document) => createTextIcon(document, "\u2039")
});
