import { formatCalendarMessage } from "../../messages.js";
import { toUtcDate } from "../domain/civil-date.js";
/** Formats and renders one canonical month title plus an aria-hidden compact presentation. */
export class CalendarMonthTitleRenderer {
    compactFormatter;
    fullFormatter;
    triggerLabelTemplate;
    constructor(options) {
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
    formatFull(month) {
        return this.fullFormatter.format(toUtcDate(month));
    }
    /** Returns the abbreviated localized month and complete numeric year used by compact visuals. */
    formatCompact(month) {
        return this.compactFormatter.format(toUtcDate(month));
    }
    /** Updates the title only when a value changed, avoiding redundant live-region announcements. */
    render(elements, month) {
        const date = toUtcDate(month);
        const fullTitle = this.fullFormatter.format(date);
        const compactTitle = this.compactFormatter.format(date);
        setTextContent(elements.titleLabelFull, fullTitle);
        setCompactTitle(elements.titleLabelCompact, compactTitle);
        setAccessibleLabel(elements.titleButton, formatCalendarMessage(this.triggerLabelTemplate, { date: fullTitle }));
    }
}
function setAccessibleLabel(element, value) {
    if (element.getAttribute("aria-label") !== value) {
        element.setAttribute("aria-label", value);
    }
}
function setCompactTitle(element, value) {
    if (element.getAttribute("data-lfc-compact-title") !== value) {
        element.setAttribute("data-lfc-compact-title", value);
    }
}
function setTextContent(element, value) {
    if (element.textContent !== value) {
        element.textContent = value;
    }
}
//# sourceMappingURL=month-title.js.map