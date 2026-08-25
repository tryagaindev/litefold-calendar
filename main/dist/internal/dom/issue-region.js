/** Updates the stable issue region without replacing its Retry control. */
export function presentCalendarIssue(elements, presentation) {
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
function clearIssue(elements) {
    elements.panel.hidden = true;
    elements.panel.removeAttribute("data-lfc-code");
    elements.panel.removeAttribute("data-lfc-severity");
    elements.panelIcon.textContent = "";
    elements.panelTitle.textContent = "";
    elements.panelMessage.textContent = "";
}
//# sourceMappingURL=issue-region.js.map