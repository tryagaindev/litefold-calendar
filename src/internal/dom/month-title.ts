import { formatCalendarMessage } from "../../messages.js";
import type { CalendarDate } from "../../types.js";
import { toUtcDate } from "../domain/civil-date.js";

/** Stable title elements whose canonical and responsive text are updated together. */
export interface CalendarMonthTitleElements {
	readonly titleButton: HTMLButtonElement;
	readonly titleLabelCompact: HTMLSpanElement;
	readonly titleLabelFull: HTMLSpanElement;
}

interface CalendarMonthTitleRendererOptions {
	readonly chooseMonthYear: string;
	readonly locale: string | undefined;
}

/** Formats and renders one canonical month title plus an aria-hidden compact presentation. */
export class CalendarMonthTitleRenderer {
	private readonly compactFormatter: Intl.DateTimeFormat;
	private readonly fullFormatter: Intl.DateTimeFormat;
	private readonly triggerLabelTemplate: string;

	public constructor(options: Readonly<CalendarMonthTitleRendererOptions>) {
		this.triggerLabelTemplate = options.chooseMonthYear;
		this.fullFormatter = new Intl.DateTimeFormat(options.locale, {
			calendar: "gregory",
			month: "long",
			timeZone: "UTC",
			year: "numeric"
		});
		this.compactFormatter = new Intl.DateTimeFormat(options.locale, {
			calendar: "gregory",
			month: "short",
			timeZone: "UTC",
			year: "numeric"
		});
	}

	/** Returns the complete localized month-and-year label used by nonvisual consumers. */
	public formatFull(month: Readonly<CalendarDate>): string {
		return this.fullFormatter.format(toUtcDate(month));
	}

	/** Updates the title only when a value changed, avoiding redundant live-region announcements. */
	public render(
		elements: Readonly<CalendarMonthTitleElements>,
		month: Readonly<CalendarDate>
	): void {
		const date = toUtcDate(month);
		const fullTitle = this.fullFormatter.format(date);
		const compactTitle = this.compactFormatter.format(date);
		setTextContent(elements.titleLabelFull, fullTitle);
		setCompactTitle(elements.titleLabelCompact, compactTitle);
		setAccessibleLabel(
			elements.titleButton,
			formatCalendarMessage(this.triggerLabelTemplate, { date: fullTitle })
		);
	}
}

function setAccessibleLabel(element: HTMLButtonElement, value: string): void {
	if (element.getAttribute("aria-label") !== value) {
		element.setAttribute("aria-label", value);
	}
}

function setCompactTitle(element: HTMLSpanElement, value: string): void {
	if (element.getAttribute("data-lfc-compact-title") !== value) {
		element.setAttribute("data-lfc-compact-title", value);
	}
}

function setTextContent(element: Node, value: string): void {
	if (element.textContent !== value) {
		element.textContent = value;
	}
}
