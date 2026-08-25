import type { CalendarIssue } from "../../errors.js";

/** Stable elements used to present one accepted calendar issue. */
export interface CalendarIssueRegionElements {
	readonly panel: HTMLDivElement;
	readonly panelActions: HTMLDivElement;
	readonly panelIcon: HTMLSpanElement;
	readonly panelMessage: HTMLParagraphElement;
	readonly panelTitle: HTMLHeadingElement;
	readonly retryButton: HTMLButtonElement;
}

/** Coordinator-selected issue and Retry state for one presentation update. */
export interface CalendarIssuePresentation {
	readonly issue: Readonly<CalendarIssue> | null;
	readonly retryable: boolean;
	readonly retrying: boolean;
	readonly retryingText: string;
	readonly retryText: string;
}

/** Updates the stable issue region without replacing its Retry control. */
export function presentCalendarIssue(
	elements: Readonly<CalendarIssueRegionElements>,
	presentation: Readonly<CalendarIssuePresentation>
): void {
	const { issue } = presentation;
	const showRetry = issue !== null && presentation.retryable;
	elements.panelActions.hidden = !showRetry;
	elements.retryButton.hidden = !showRetry;
	elements.retryButton.setAttribute("aria-disabled", presentation.retrying ? "true" : "false");
	elements.retryButton.textContent = presentation.retrying
		? presentation.retryingText
		: presentation.retryText;

	if (issue === null) {
		clearIssue(elements);
		return;
	}

	elements.panel.hidden = false;
	elements.panel.setAttribute("data-lfc-code", issue.code);
	elements.panel.setAttribute("data-lfc-severity", issue.severity);
	elements.panelIcon.textContent = "!";
	elements.panelTitle.textContent = issue.title;
	elements.panelMessage.textContent = issue.message;
}

function clearIssue(elements: Readonly<CalendarIssueRegionElements>): void {
	elements.panel.hidden = true;
	elements.panel.removeAttribute("data-lfc-code");
	elements.panel.removeAttribute("data-lfc-severity");
	elements.panelIcon.textContent = "";
	elements.panelTitle.textContent = "";
	elements.panelMessage.textContent = "";
}
