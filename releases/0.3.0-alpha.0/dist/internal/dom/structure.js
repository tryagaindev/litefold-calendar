import { createCalendarMonthPicker } from "./month-picker.js";
/** Creates the stable toolbar, status, grid, and agenda structure. */
export function createCalendarStructure(options) {
    options.integrationParents.clear();
    const toolbar = options.document.createElement("div");
    toolbar.className = "lfc-calendar-toolbar";
    const picker = createCalendarMonthPicker({
        document: options.document,
        headingLevel: options.headingLevel,
        instanceName: options.instanceName,
        maxYear: options.maxYear,
        messages: options.messages,
        minYear: options.minYear,
        monthNameFormatter: options.monthNameFormatter,
        onBeforeToggle: options.onMonthPickerBeforeToggle,
        onCancel: options.onMonthPickerCancel,
        onSubmit: options.onMonthPickerSubmit,
        onTitleClick: options.onMonthPickerTitleClick,
        onToggle: options.onMonthPickerToggle,
        onYearInput: options.onMonthPickerYearInput
    });
    const navigation = options.document.createElement("div");
    navigation.className = "lfc-calendar-navigation";
    navigation.setAttribute("aria-label", options.messages.navigation);
    navigation.setAttribute("role", "group");
    const previousButton = createNavigationButton(options, "previous");
    const nextButton = createNavigationButton(options, "next");
    const monthStepper = options.document.createElement("div");
    monthStepper.className = "lfc-calendar-month-stepper";
    monthStepper.append(previousButton, nextButton);
    const todayButton = options.document.createElement("button");
    todayButton.className = "lfc-calendar-nav-button lfc-calendar-today-button";
    todayButton.type = "button";
    todayButton.textContent = options.messages.today;
    todayButton.addEventListener("click", options.onToday);
    navigation.append(monthStepper, picker.title, todayButton);
    toolbar.append(navigation, picker.monthPicker);
    appendToolbarEnd(options, toolbar);
    const statusArea = options.document.createElement("div");
    statusArea.className = "lfc-calendar-status-area";
    const panel = options.document.createElement("div");
    panel.className = "lfc-calendar-status-panel";
    panel.hidden = true;
    const panelIcon = options.document.createElement("span");
    panelIcon.className = "lfc-calendar-status-icon";
    panelIcon.setAttribute("aria-hidden", "true");
    const panelTitle = createHeading(options.document, Math.min(6, options.headingLevel + 1));
    panelTitle.className = "lfc-calendar-status-title";
    const panelMessage = options.document.createElement("p");
    panelMessage.className = "lfc-calendar-status-message";
    const panelActions = options.document.createElement("div");
    panelActions.className = "lfc-calendar-status-actions";
    const retryButton = options.document.createElement("button");
    retryButton.className = "lfc-calendar-retry";
    retryButton.type = "button";
    retryButton.textContent = options.messages.retry;
    retryButton.addEventListener("click", options.onRetry);
    panelActions.append(retryButton);
    panel.append(panelIcon, panelTitle, panelMessage, panelActions);
    const politeLive = createLiveRegion(options.document, "polite", "status");
    politeLive.className = "lfc-visually-hidden lfc-calendar-live-polite";
    const assertiveLive = createLiveRegion(options.document, "assertive", "alert");
    assertiveLive.className = "lfc-visually-hidden lfc-calendar-live-assertive";
    const gridInstructions = options.document.createElement("p");
    gridInstructions.className = "lfc-visually-hidden lfc-calendar-grid-instructions";
    gridInstructions.id = `${options.instanceName}-grid-instructions`;
    gridInstructions.textContent = options.messages.gridEventInstructions;
    statusArea.append(panel, politeLive, assertiveLive, gridInstructions);
    const weekdays = options.document.createElement("div");
    weekdays.className = "lfc-calendar-weekdays";
    weekdays.setAttribute("role", "row");
    const weeks = options.document.createElement("div");
    weeks.className = "lfc-calendar-weeks";
    weeks.setAttribute("role", "rowgroup");
    const grid = options.document.createElement("div");
    grid.className = "lfc-calendar-grid";
    grid.setAttribute("aria-labelledby", picker.titleLabel.id);
    grid.setAttribute("aria-readonly", "true");
    grid.setAttribute("role", "grid");
    const describedBy = options.host.getAttribute("aria-describedby")?.trim().split(/\s+/u)
        .filter((identifier) => identifier.length > 0) ?? [];
    grid.setAttribute("aria-describedby", [...new Set([...describedBy, gridInstructions.id])].join(" "));
    grid.append(weekdays, weeks);
    const { lane: previousLane, label: previousLaneLabel } = createPagingLane(options.document, "previous");
    const { lane: nextLane, label: nextLaneLabel } = createPagingLane(options.document, "next");
    const swipeViewport = options.document.createElement("div");
    swipeViewport.className = "lfc-calendar-swipe-viewport";
    swipeViewport.tabIndex = -1;
    swipeViewport.append(previousLane, grid, nextLane);
    const agenda = options.document.createElement("section");
    agenda.className = "lfc-calendar-agenda";
    const agendaTitle = createHeading(options.document, Math.min(6, options.headingLevel + 1));
    agendaTitle.className = "lfc-calendar-agenda-title";
    agendaTitle.id = `${options.instanceName}-agenda-title`;
    agendaTitle.tabIndex = -1;
    const agendaList = options.document.createElement("ol");
    agendaList.className = "lfc-calendar-agenda-list";
    agendaList.setAttribute("role", "list");
    const agendaFooter = options.document.createElement("div");
    agendaFooter.className = "lfc-calendar-agenda-footer";
    agenda.setAttribute("aria-labelledby", agendaTitle.id);
    agenda.append(agendaTitle, agendaList, agendaFooter);
    options.host.replaceChildren(toolbar, statusArea, swipeViewport, agenda);
    return Object.freeze({
        agenda,
        agendaFooter,
        agendaList,
        agendaTitle,
        assertiveLive,
        grid,
        gridInstructions,
        ...picker,
        monthStepper,
        navigation,
        nextLane,
        nextLaneLabel,
        nextButton,
        panel,
        panelActions,
        panelIcon,
        panelMessage,
        panelTitle,
        politeLive,
        previousLane,
        previousLaneLabel,
        previousButton,
        retryButton,
        statusArea,
        swipeViewport,
        todayButton,
        toolbar,
        weekdays,
        weeks
    });
}
function createPagingLane(document, direction) {
    const lane = document.createElement("div");
    lane.className = `lfc-calendar-swipe-lane lfc-calendar-swipe-lane-${direction}`;
    lane.setAttribute("aria-hidden", "true");
    const content = document.createElement("span");
    content.className = "lfc-calendar-swipe-lane-content";
    const icon = document.createElement("span");
    icon.className = "lfc-calendar-swipe-lane-icon";
    icon.dir = "ltr";
    icon.textContent = direction === "previous" ? "\u2039" : "\u203a";
    const label = document.createElement("span");
    label.className = "lfc-calendar-swipe-lane-label";
    content.append(icon, label);
    lane.append(content);
    return Object.freeze({ label, lane });
}
function createNavigationButton(options, direction) {
    const button = options.document.createElement("button");
    button.className = `lfc-calendar-nav-button lfc-calendar-nav-button-${direction}`;
    button.type = "button";
    button.setAttribute("aria-label", options.messages[direction]);
    const icon = options.iconNodes[direction];
    button.append(icon);
    if (icon.parentNode === button) {
        options.integrationParents.set(icon, button);
    }
    button.addEventListener("click", () => { options.onNavigate(direction); });
    return button;
}
function appendToolbarEnd(options, toolbar) {
    if (options.toolbarEnd === null) {
        return;
    }
    const toolbarEnd = options.document.createElement("div");
    toolbarEnd.className = "lfc-calendar-toolbar-end";
    toolbarEnd.append(options.toolbarEnd);
    if (options.toolbarEnd.parentNode === toolbarEnd) {
        options.integrationParents.set(options.toolbarEnd, toolbarEnd);
    }
    toolbar.append(toolbarEnd);
}
function createHeading(document, level) {
    return document.createElement(`h${level.toString()}`);
}
function createLiveRegion(document, politeness, role) {
    const region = document.createElement("p");
    region.setAttribute("aria-atomic", "true");
    region.setAttribute("aria-live", politeness);
    region.setAttribute("role", role);
    return region;
}
//# sourceMappingURL=structure.js.map