function createTextIcon(document, text) {
    const icon = document.createElement("span");
    icon.className = "lfc-calendar-navigation-icon";
    icon.dir = "ltr";
    icon.setAttribute("aria-hidden", "true");
    icon.textContent = text;
    return icon;
}
/** Dependency-free default navigation icons. */
export const DEFAULT_CALENDAR_ICONS = Object.freeze({
    next: (document) => createTextIcon(document, "\u203a"),
    previous: (document) => createTextIcon(document, "\u2039")
});
//# sourceMappingURL=icons.js.map