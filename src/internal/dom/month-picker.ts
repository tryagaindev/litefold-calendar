import type { CalendarDate } from "../../types.js";
import { toUtcDate } from "../domain/civil-date.js";
import type { CalendarMessages } from "../../messages.js";
import type { CalendarMonthTitleElements } from "./month-title.js";

/** Stable package-owned elements used to control and render the month-and-year picker. */
export interface CalendarMonthPickerElements extends CalendarMonthTitleElements {
	readonly monthPicker: HTMLDivElement;
	readonly monthPickerCancelButton: HTMLButtonElement;
	readonly monthPickerForm: HTMLFormElement;
	readonly monthPickerMonth: HTMLSelectElement;
	readonly monthPickerYear: HTMLInputElement;
	readonly title: HTMLHeadingElement;
	readonly titleLabel: HTMLSpanElement;
}

interface CalendarMonthPickerOptions {
	readonly document: Document;
	readonly headingLevel: number;
	readonly instanceName: string;
	readonly maxYear: number;
	readonly messages: Readonly<CalendarMessages>;
	readonly minYear: number;
	readonly monthNameFormatter: Intl.DateTimeFormat;
	readonly onCancel: (this: void, event: MouseEvent) => void;
	readonly onBeforeToggle: (this: void, event: Event) => void;
	readonly onSubmit: (this: void, event: SubmitEvent) => void;
	readonly onTitleClick: (this: void, event: MouseEvent) => void;
	readonly onToggle: (this: void, event: Event) => void;
	readonly onYearInput: (this: void, event: Event) => void;
}

interface CalendarMonthPickerControllerOptions {
	readonly canContinue: (this: void) => boolean;
	readonly document: Document;
	readonly getDisplayedMonth: (this: void) => Readonly<CalendarDate>;
	readonly getElements: (this: void) => CalendarMonthPickerElements | null;
	readonly getPreferredDay: (this: void) => number;
	readonly isMonthAllowed: (this: void, month: CalendarDate) => boolean;
	readonly onNavigate: (this: void, target: Readonly<CalendarDate>) => void;
	readonly resolveMonthTarget: (
		this: void,
		month: CalendarDate,
		preferredDay: number
	) => Readonly<CalendarDate> | null;
}

/** Owns native Popover state, validation, synchronization, and focus restoration. */
export class CalendarMonthPickerController {
	private isOpen = false;
	private restoreFocus = false;

	public constructor(private readonly options: Readonly<CalendarMonthPickerControllerOptions>) {}

	public readonly handleBeforeToggle = (event: Event): void => {
		const newState = (event as Event & { readonly newState?: unknown }).newState;
		if (newState !== "open" || event.defaultPrevented) {
			return;
		}
		const elements = this.options.getElements();
		if (!this.options.canContinue() || elements === null) {
			event.preventDefault();
			return;
		}
		this.sync(elements);
		this.isOpen = true;
		elements.titleButton.setAttribute("aria-expanded", "true");
		this.options.document.addEventListener("keydown", this.handleDocumentKeydown, true);
		this.options.document.defaultView?.setTimeout(() => {
			const currentElements = this.options.getElements();
			if (currentElements === null || !this.isPopoverOpen(currentElements)) {
				this.finishClose();
			}
		}, 0);
	};

	public readonly handleCancel = (event: MouseEvent): void => {
		if (event.defaultPrevented || !this.options.canContinue()) {
			return;
		}
		event.preventDefault();
		this.hide(true);
	};

	public readonly handleSubmit = (event: SubmitEvent): void => {
		event.preventDefault();
		const elements = this.options.getElements();
		if (!this.options.canContinue() || elements === null) {
			return;
		}
		if (!elements.monthPickerForm.checkValidity()) {
			elements.monthPickerForm.reportValidity();
			return;
		}
		const month = Number.parseInt(elements.monthPickerMonth.value, 10);
		const year = elements.monthPickerYear.valueAsNumber;
		if (!Number.isInteger(month) || month < 1 || month > 12 ||
			!Number.isInteger(year) || year < 1 || year > 9_999) {
			return;
		}
		const target = this.options.resolveMonthTarget(
			{ day: 1, month, year },
			this.options.getPreferredDay()
		);
		if (target === null) {
			return;
		}
		const displayedMonth = this.options.getDisplayedMonth();
		const changesMonth = target.month !== displayedMonth.month || target.year !== displayedMonth.year;
		this.hide(true);
		if (changesMonth && this.options.canContinue()) {
			this.options.onNavigate(target);
		}
	};

	public readonly handleTitleClick = (event: MouseEvent): void => {
		const elements = this.options.getElements();
		if (event.defaultPrevented || !this.options.canContinue() || elements === null) {
			event.preventDefault();
			return;
		}
		event.preventDefault();
		if (this.isPopoverOpen(elements)) {
			this.hide(false);
			return;
		}
		try {
			elements.monthPicker.showPopover();
		} catch {
			//The supported browser contract provides Popover; a changed host surface remains inert.
		}
	};

	public readonly handleToggle = (): void => {
		const elements = this.options.getElements();
		if (elements !== null && this.isPopoverOpen(elements)) {
			this.isOpen = true;
			if (!this.options.canContinue()) {
				this.hide(false);
				return;
			}
			elements.titleButton.setAttribute("aria-expanded", "true");
			this.sync(elements);
			this.options.document.addEventListener("keydown", this.handleDocumentKeydown, true);
			const active = this.options.document.activeElement;
			if (active === null || active === this.options.document.body || active === elements.titleButton) {
				elements.monthPickerMonth.focus({ preventScroll: true });
			}
			return;
		}
		this.finishClose();
	};

	public readonly handleYearInput = (): void => {
		const elements = this.options.getElements();
		if (elements !== null) {
			this.updateMonthOptions(elements);
		}
	};

	public hide(restoreFocus: boolean): void {
		const elements = this.options.getElements();
		if (elements === null) {
			this.finishClose();
			return;
		}
		if (!this.isPopoverOpen(elements)) {
			if (restoreFocus) {
				this.restoreFocus = true;
				this.finishClose();
			}
			return;
		}
		this.restoreFocus = this.restoreFocus || restoreFocus;
		let hideFailed = false;
		try {
			elements.monthPicker.hidePopover();
		} catch {
			hideFailed = true;
			//The supported browser contract provides Popover; teardown remains safe if host state changed first.
		}
		if (!hideFailed && this.isPopoverOpen(elements)) {
			this.restoreFocus = false;
			return;
		}
		this.finishClose();
	}

	private sync(elements: CalendarMonthPickerElements): void {
		const displayedMonth = this.options.getDisplayedMonth();
		elements.monthPickerYear.value = displayedMonth.year.toString();
		elements.monthPickerMonth.value = displayedMonth.month.toString();
		this.updateMonthOptions(elements);
	}

	private updateMonthOptions(elements: CalendarMonthPickerElements): void {
		const year = elements.monthPickerYear.valueAsNumber;
		const validYear = Number.isInteger(year) && year >= 1 && year <= 9_999;
		for (const option of elements.monthPickerMonth.options) {
			const month = Number.parseInt(option.value, 10);
			option.disabled = !validYear || !this.options.isMonthAllowed({ day: 1, month, year });
		}
		const selected = elements.monthPickerMonth.selectedOptions[0];
		if (selected?.disabled !== true) {
			return;
		}
		const selectedMonth = Number.parseInt(selected.value, 10);
		const enabled = [...elements.monthPickerMonth.options].filter((option) => !option.disabled);
		const nearest = enabled.reduce<HTMLOptionElement | null>((candidate, option) => {
			if (candidate === null) {
				return option;
			}
			const candidateDistance = Math.abs(Number.parseInt(candidate.value, 10) - selectedMonth);
			const optionDistance = Math.abs(Number.parseInt(option.value, 10) - selectedMonth);
			return optionDistance < candidateDistance ? option : candidate;
		}, null);
		if (nearest !== null) {
			elements.monthPickerMonth.value = nearest.value;
		}
	}

	private finishClose(): void {
		const shouldRestoreFocus = this.restoreFocus;
		this.restoreFocus = false;
		this.isOpen = false;
		this.options.document.removeEventListener("keydown", this.handleDocumentKeydown, true);
		const titleButton = this.options.getElements()?.titleButton;
		titleButton?.setAttribute("aria-expanded", "false");
		if (shouldRestoreFocus && titleButton !== undefined &&
			this.options.canContinue() && titleButton.isConnected) {
			titleButton.focus({ preventScroll: true });
		}
	}

	private isPopoverOpen(elements: CalendarMonthPickerElements): boolean {
		try {
			return elements.monthPicker.matches(":popover-open");
		} catch {
			return this.isOpen;
		}
	}

	private readonly handleDocumentKeydown = (event: KeyboardEvent): void => {
		if (event.key !== "Escape" || event.defaultPrevented || !this.isOpen) {
			return;
		}
		event.preventDefault();
		this.hide(true);
	};
}

/** Creates the semantic month heading, native trigger, and light-dismiss picker form. */
export function createCalendarMonthPicker(
	options: Readonly<CalendarMonthPickerOptions>
): Readonly<CalendarMonthPickerElements> {
	const title = createHeading(options.document, options.headingLevel);
	title.className = "lfc-calendar-title";
	title.id = `${options.instanceName}-title`;
	const titleButton = options.document.createElement("button");
	titleButton.className = "lfc-calendar-title-button";
	titleButton.type = "button";
	const monthPickerId = `${options.instanceName}-month-picker`;
	titleButton.setAttribute("aria-controls", monthPickerId);
	titleButton.setAttribute("aria-expanded", "false");
	titleButton.setAttribute("aria-haspopup", "dialog");
	titleButton.setAttribute("popovertarget", monthPickerId);
	titleButton.addEventListener("click", options.onTitleClick);
	const titleLabel = options.document.createElement("span");
	titleLabel.className = "lfc-calendar-title-label";
	titleLabel.id = `${options.instanceName}-month-label`;
	titleLabel.setAttribute("aria-atomic", "true");
	titleLabel.setAttribute("aria-live", "polite");
	const titleLabelFull = options.document.createElement("span");
	titleLabelFull.className = "lfc-calendar-title-label-full";
	const titleLabelCompact = options.document.createElement("span");
	titleLabelCompact.className = "lfc-calendar-title-label-compact";
	titleLabelCompact.setAttribute("aria-hidden", "true");
	titleLabel.append(titleLabelFull, titleLabelCompact);
	titleButton.append(titleLabel);
	title.append(titleButton);

	const monthPicker = options.document.createElement("div");
	monthPicker.className = "lfc-calendar-month-picker";
	monthPicker.id = monthPickerId;
	monthPicker.setAttribute("aria-labelledby", `${options.instanceName}-month-picker-title`);
	monthPicker.setAttribute("popover", "auto");
	monthPicker.setAttribute("role", "dialog");
	const monthPickerTitle = createHeading(options.document, Math.min(6, options.headingLevel + 1));
	monthPickerTitle.className = "lfc-calendar-month-picker-title";
	monthPickerTitle.id = `${options.instanceName}-month-picker-title`;
	monthPickerTitle.textContent = options.messages.jumpToMonthYear;
	const monthPickerForm = options.document.createElement("form");
	monthPickerForm.className = "lfc-calendar-month-picker-form";
	const monthPickerFields = options.document.createElement("div");
	monthPickerFields.className = "lfc-calendar-month-picker-fields";

	const monthLabel = options.document.createElement("label");
	monthLabel.className = "lfc-calendar-month-picker-field";
	monthLabel.htmlFor = `${options.instanceName}-month-picker-month`;
	const monthLabelText = options.document.createElement("span");
	monthLabelText.textContent = options.messages.month;
	const monthPickerMonth = options.document.createElement("select");
	monthPickerMonth.id = monthLabel.htmlFor;
	monthPickerMonth.autofocus = true;
	monthPickerMonth.name = "month";
	monthPickerMonth.required = true;
	for (let month = 1; month <= 12; month += 1) {
		const option = options.document.createElement("option");
		option.value = month.toString();
		option.textContent = options.monthNameFormatter.format(toUtcDate({
			day: 1,
			month,
			year: 2000
		}));
		monthPickerMonth.append(option);
	}
	monthLabel.append(monthLabelText, monthPickerMonth);

	const yearLabel = options.document.createElement("label");
	yearLabel.className = "lfc-calendar-month-picker-field";
	yearLabel.htmlFor = `${options.instanceName}-month-picker-year`;
	const yearLabelText = options.document.createElement("span");
	yearLabelText.textContent = options.messages.year;
	const monthPickerYear = options.document.createElement("input");
	monthPickerYear.id = yearLabel.htmlFor;
	monthPickerYear.inputMode = "numeric";
	monthPickerYear.max = options.maxYear.toString();
	monthPickerYear.min = options.minYear.toString();
	monthPickerYear.name = "year";
	monthPickerYear.required = true;
	monthPickerYear.step = "1";
	monthPickerYear.type = "number";
	yearLabel.append(yearLabelText, monthPickerYear);
	monthPickerFields.append(monthLabel, yearLabel);

	const monthPickerActions = options.document.createElement("div");
	monthPickerActions.className = "lfc-calendar-month-picker-actions";
	const jumpButton = options.document.createElement("button");
	jumpButton.className = "lfc-calendar-month-picker-jump";
	jumpButton.type = "submit";
	jumpButton.textContent = options.messages.jump;
	const monthPickerCancelButton = options.document.createElement("button");
	monthPickerCancelButton.className = "lfc-calendar-month-picker-cancel";
	monthPickerCancelButton.type = "button";
	monthPickerCancelButton.setAttribute("popovertarget", monthPickerId);
	monthPickerCancelButton.setAttribute("popovertargetaction", "hide");
	monthPickerCancelButton.textContent = options.messages.cancel;
	monthPickerCancelButton.addEventListener("click", options.onCancel);
	monthPickerActions.append(jumpButton, monthPickerCancelButton);
	monthPickerForm.append(monthPickerFields, monthPickerActions);
	monthPickerForm.addEventListener("submit", options.onSubmit);
	monthPickerYear.addEventListener("input", options.onYearInput);
	monthPicker.addEventListener("beforetoggle", options.onBeforeToggle);
	monthPicker.addEventListener("toggle", options.onToggle);
	monthPicker.append(monthPickerTitle, monthPickerForm);

	return Object.freeze({
		monthPicker,
		monthPickerCancelButton,
		monthPickerForm,
		monthPickerMonth,
		monthPickerYear,
		title,
		titleButton,
		titleLabel,
		titleLabelCompact,
		titleLabelFull
	});
}

function createHeading(document: Document, level: number): HTMLHeadingElement {
	return document.createElement(`h${level.toString()}`) as HTMLHeadingElement;
}
