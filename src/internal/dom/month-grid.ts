import type { CalendarDate } from "../../types.js";
import { addCalendarDays, toUtcDate } from "../domain/civil-date.js";

const DAYS_PER_WEEK = 7;
const FORCED_COLORS_QUERY = "(forced-colors: active)";
const SELECTION_ANIMATION_NAME = "lfc-day-selection-reveal";
const SELECTION_MOTION_QUERY = "(prefers-reduced-motion: no-preference)";

/** Stable package-owned elements for one ARIA gridcell. */
export interface DayCellElements {
	readonly badge: HTMLSpanElement;
	readonly button: HTMLButtonElement;
	readonly cell: HTMLDivElement;
	readonly multipleEventIndicator: HTMLSpanElement;
	readonly number: HTMLTimeElement;
	readonly summaries: HTMLDivElement;
}

interface DayCellOptions {
	readonly accessibleLabel: string;
	readonly dateString: string;
	readonly dayNumber: string;
	readonly document: Document;
	readonly isAllowed: boolean;
	readonly isCurrentMonth: boolean;
	readonly isFocused: boolean;
	readonly isSelected: boolean;
	readonly isToday: boolean;
	readonly selectionEntryDate: string | null;
}

interface WeekdayOptions {
	readonly document: Document;
	readonly firstDay: number;
	readonly formatFullDate: (date: Date) => string;
	readonly formatNarrow: (date: Date) => string;
	readonly formatShort: (date: Date) => string;
}

/** Creates the structural and semantic elements for one calendar day. */
export function createDayCellElements(options: Readonly<DayCellOptions>): DayCellElements {
	const isSelectionEntry = options.isSelected && options.selectionEntryDate === options.dateString &&
		allowsSelectionMotion(options.document);
	const cell = options.document.createElement("div");
	cell.className = `lfc-calendar-day ${options.isCurrentMonth ? "lfc-is-current-month" : "lfc-is-outside-month"}`;
	cell.classList.toggle("lfc-is-out-of-range", !options.isAllowed);
	cell.classList.toggle("lfc-is-selected", options.isSelected);
	cell.classList.toggle("lfc-is-selection-entry", isSelectionEntry);
	cell.classList.toggle("lfc-is-today", options.isToday);
	if (!options.isAllowed) {
		cell.setAttribute("aria-disabled", "true");
	}
	cell.setAttribute("aria-selected", options.isSelected ? "true" : "false");
	cell.setAttribute("role", "gridcell");

	const button = options.document.createElement("button");
	button.className = "lfc-calendar-day-button";
	button.disabled = !options.isAllowed;
	button.type = "button";
	button.tabIndex = options.isFocused ? 0 : -1;
	button.setAttribute("data-lfc-date", options.dateString);
	button.setAttribute("aria-label", options.accessibleLabel);
	installDirectPressFeedback(button);
	if (options.isToday) {
		button.setAttribute("aria-current", "date");
	}
	const number = options.document.createElement("time");
	number.className = "lfc-calendar-day-number";
	number.dateTime = options.dateString;
	number.textContent = options.dayNumber;
	const badge = options.document.createElement("span");
	badge.className = "lfc-calendar-day-badge";
	badge.setAttribute("aria-hidden", "true");
	const summaries = options.document.createElement("div");
	summaries.className = "lfc-calendar-day-summaries";
	const multipleEventIndicator = options.document.createElement("span");
	multipleEventIndicator.className = "lfc-calendar-multiple-event-indicator";
	multipleEventIndicator.setAttribute("aria-hidden", "true");
	summaries.append(multipleEventIndicator);
	button.append(number, badge);
	cell.append(button, summaries);
	if (isSelectionEntry) {
		clearSelectionEntryAfterAnimation(button, cell);
	}
	return { badge, button, cell, multipleEventIndicator, number, summaries };
}

function installDirectPressFeedback(button: HTMLButtonElement): void {
	let pointerId: number | null = null;
	button.addEventListener("pointerdown", (event) => {
		if (!event.isPrimary || event.button !== 0 || button.disabled) {
			return;
		}
		pointerId = event.pointerId;
		button.classList.add("lfc-is-pressed");
	});
	const clear = (event: PointerEvent): void => {
		if (pointerId !== event.pointerId) {
			return;
		}
		pointerId = null;
		button.classList.remove("lfc-is-pressed");
	};
	button.addEventListener("lostpointercapture", clear);
	button.addEventListener("pointercancel", clear);
	button.addEventListener("pointerleave", clear);
	button.addEventListener("pointerup", clear);
}

function clearSelectionEntryAfterAnimation(button: HTMLButtonElement, cell: HTMLDivElement): void {
	const clear = (event: AnimationEvent): void => {
		if (event.animationName !== SELECTION_ANIMATION_NAME ||
			event.target !== button || event.pseudoElement !== "") {
			return;
		}
		cell.classList.remove("lfc-is-selection-entry");
		button.removeEventListener("animationcancel", clear);
		button.removeEventListener("animationend", clear);
	};
	button.addEventListener("animationcancel", clear);
	button.addEventListener("animationend", clear);
}

function allowsSelectionMotion(document: Document): boolean {
	const ownerWindow = document.defaultView;
	if (ownerWindow === null) {
		return true;
	}
	const matchMedia = (ownerWindow as Partial<Window>).matchMedia;
	return matchMedia === undefined || (
		matchMedia.call(ownerWindow, SELECTION_MOTION_QUERY).matches &&
		!matchMedia.call(ownerWindow, FORCED_COLORS_QUERY).matches
	);
}

/** Replaces the managed grid rows while leaving day-cell behavior with the coordinator. */
export function renderMonthWeeks(
	container: HTMLElement,
	days: readonly CalendarDate[],
	createDayCell: (date: CalendarDate) => HTMLDivElement,
	isCurrent: () => boolean,
	beforeCommit: (weeks: readonly HTMLDivElement[]) => void
): boolean {
	const weeks: HTMLDivElement[] = [];
	for (let offset = 0; offset < days.length; offset += DAYS_PER_WEEK) {
		const week = container.ownerDocument.createElement("div");
		week.className = "lfc-calendar-week";
		week.setAttribute("role", "row");
		for (const date of days.slice(offset, offset + DAYS_PER_WEEK)) {
			const cell = createDayCell(date);
			if (!isCurrent()) {
				return false;
			}
			week.append(cell);
		}
		weeks.push(week);
	}
	if (!isCurrent()) {
		return false;
	}
	beforeCommit(Object.freeze(weeks));
	if (!isCurrent()) {
		return false;
	}
	container.replaceChildren(...weeks);
	return true;
}

/** Replaces the column headers with localized short and narrow visual labels. */
export function renderWeekdayHeadings(
	container: HTMLElement,
	options: Readonly<WeekdayOptions>
): void {
	const sunday = { day: 7, month: 1, year: 2024 };
	const headings = Array.from({ length: 7 }, (_, index) => {
		const date = addCalendarDays(sunday, options.firstDay + index);
		const nativeDate = toUtcDate(date);
		const shortLabel = options.formatShort(nativeDate);
		const fullName = options.formatFullDate(nativeDate);
		const heading = options.document.createElement("div");
		heading.className = "lfc-calendar-weekday";
		heading.setAttribute("aria-label", fullName);
		heading.setAttribute("role", "columnheader");
		const shortName = options.document.createElement("span");
		shortName.className = "lfc-calendar-weekday-short";
		shortName.setAttribute("aria-hidden", "true");
		shortName.textContent = shortLabel;
		const narrowName = options.document.createElement("span");
		narrowName.className = "lfc-calendar-weekday-narrow";
		narrowName.setAttribute("aria-hidden", "true");
		narrowName.textContent = options.formatNarrow(nativeDate);
		heading.append(shortName, narrowName);
		return heading;
	});
	container.replaceChildren(...headings);
}
