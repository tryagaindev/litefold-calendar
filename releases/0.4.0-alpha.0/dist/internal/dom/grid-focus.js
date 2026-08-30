/** Creates a collision-safe identity for one rendered event occurrence. */
export function getEventActionKey(surface, dateString, eventId) {
    return JSON.stringify([surface, dateString, eventId]);
}
/** Returns focus only when it is still owned by this calendar host. */
export function getOwnedActiveElement(document, host) {
    const active = document.activeElement;
    return active !== null && host.contains(active) ? active : null;
}
/** Returns whether a previously owned focus target was detached from this host. */
export function wasOwnedFocusRemoved(active, host) {
    return active !== null && (!active.isConnected || !host.contains(active));
}
/** Moves focus to the first action while retaining the day proxy as the grid tab stop. */
export function enterGridActions(dateString, elements, host) {
    const actions = elements.gridActionsByDate.get(dateString) ?? [];
    const firstAction = actions.find((action) => action.isConnected && host.contains(action));
    if (firstAction === undefined) {
        return;
    }
    setDayProxyTabStop(dateString, elements);
    firstAction.focus({ preventScroll: true });
}
/** Handles action-mode movement and returns whether the key was consumed. */
export function handleGridActionKeydown(event, dateString, action, elements, host, agendaTitle) {
    const actions = (elements.gridActionsByDate.get(dateString) ?? [])
        .filter((candidate) => candidate.isConnected && host.contains(candidate));
    const actionIndex = actions.indexOf(action);
    if (actionIndex < 0 || !action.isConnected || !host.contains(action)) {
        return false;
    }
    if (event.key === "Escape" || event.key === "F2") {
        event.preventDefault();
        leaveGridActions(dateString, true, elements);
        return true;
    }
    if (event.key === "Tab") {
        event.preventDefault();
        leaveGridActions(dateString, event.shiftKey, elements);
        if (!event.shiftKey) {
            agendaTitle?.focus({ preventScroll: true });
        }
        return true;
    }
    if (event.key !== "ArrowUp" && event.key !== "ArrowDown") {
        return false;
    }
    event.preventDefault();
    const targetIndex = actionIndex + (event.key === "ArrowDown" ? 1 : -1);
    const target = actions[targetIndex];
    if (target !== undefined) {
        target.focus({ preventScroll: true });
    }
    return true;
}
/** Restores the managed grid tab stop to a day proxy. */
export function leaveGridActions(dateString, focusDay, elements) {
    setDayProxyTabStop(dateString, elements);
    if (focusDay) {
        elements.dayButtons.get(dateString)?.focus({ preventScroll: true });
    }
}
/** Captures package-owned focus without retaining a stale element. */
export function captureCalendarFocus(active, host, dom, elements) {
    if (dom === null || active === null || !host.contains(active)) {
        return null;
    }
    const stableToken = captureStableFocus(active, dom);
    if (stableToken !== null) {
        return stableToken;
    }
    for (const [date, button] of elements.dayButtons) {
        if (active === button) {
            return { date, kind: "day" };
        }
    }
    const eventToken = captureEventFocus(active, elements.eventActions);
    if (eventToken !== null) {
        return eventToken;
    }
    for (const [date, button] of elements.gridMoreButtons) {
        if (active === button) {
            return { date, kind: "grid-more" };
        }
    }
    return active === elements.agendaMoreButton ? { kind: "agenda-more" } : null;
}
/** Restores focus to the same occurrence, its day, or the calendar's current fallback. */
export function restoreCalendarFocus(token, dom, elements, focusedDateString, host) {
    if (token === null || dom === null) {
        return;
    }
    const resolvedElement = resolveFocusElement(token, dom, elements);
    const element = resolvedElement !== null && resolvedElement.isConnected && host.contains(resolvedElement)
        ? resolvedElement
        : null;
    const resolvedDateFallback = token.date === undefined ? null : elements.dayButtons.get(token.date) ?? null;
    const dateFallback = resolvedDateFallback !== null && resolvedDateFallback.isConnected &&
        host.contains(resolvedDateFallback) ? resolvedDateFallback : null;
    const target = element ?? dateFallback ?? elements.dayButtons.get(focusedDateString) ?? dom.titleButton;
    if (token.date !== undefined && (isGridActionToken(token) || (element === null && dateFallback !== null))) {
        setDayProxyTabStop(token.date, elements);
    }
    target.focus({ preventScroll: true });
}
function setDayProxyTabStop(dateString, elements) {
    for (const [candidateDate, button] of elements.dayButtons) {
        button.tabIndex = candidateDate === dateString ? 0 : -1;
    }
    for (const actions of elements.gridActionsByDate.values()) {
        for (const action of actions) {
            action.tabIndex = -1;
        }
    }
}
function captureStableFocus(active, dom) {
    const stable = new Map([
        [dom.retryButton, "retry"],
        [dom.previousButton, "previous"],
        [dom.nextButton, "next"],
        [dom.todayButton, "today"],
        [dom.titleButton, "title"]
    ]);
    const kind = stable.get(active);
    return kind === undefined ? null : { kind };
}
function captureEventFocus(active, actions) {
    for (const action of actions.values()) {
        if (active !== action) {
            continue;
        }
        const date = action.getAttribute("data-lfc-date") ?? undefined;
        const eventId = action.getAttribute("data-lfc-event-id") ?? undefined;
        const surfaceValue = action.getAttribute("data-lfc-surface");
        const surface = surfaceValue === "agenda" || surfaceValue === "grid-summary"
            ? surfaceValue
            : undefined;
        return {
            ...(date === undefined ? {} : { date }),
            ...(eventId === undefined ? {} : { eventId }),
            kind: "event-action",
            ...(surface === undefined ? {} : { surface })
        };
    }
    return null;
}
function resolveFocusElement(token, dom, elements) {
    switch (token.kind) {
        case "day": return token.date === undefined ? null : elements.dayButtons.get(token.date) ?? null;
        case "event-action": return resolveEventFocusElement(token, elements.eventActions);
        case "grid-more": return token.date === undefined ? null : elements.gridMoreButtons.get(token.date) ?? null;
        case "retry": return dom.panel.hidden === true ? null : dom.retryButton;
        case "previous": return dom.previousButton;
        case "next": return dom.nextButton;
        case "today": return dom.todayButton;
        case "title": return dom.titleButton;
        case "agenda-more": return elements.agendaMoreButton;
    }
}
function resolveEventFocusElement(token, actions) {
    return token.eventId === undefined || token.date === undefined || token.surface === undefined
        ? null
        : actions.get(getEventActionKey(token.surface, token.date, token.eventId)) ?? null;
}
function isGridActionToken(token) {
    return token.kind === "grid-more" ||
        (token.kind === "event-action" && token.surface === "grid-summary");
}
//# sourceMappingURL=grid-focus.js.map