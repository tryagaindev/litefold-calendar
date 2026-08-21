import type { CalendarEventActionElement, CalendarEventSurface } from "../../types.js";
import type { CalendarDom } from "./structure.js";

/** Stable focus identity retained across one calendar rerender. */
export interface CalendarFocusToken {
	readonly date?: string;
	readonly eventId?: string;
	readonly kind:
		| "agenda-more"
		| "day"
		| "event-action"
		| "grid-more"
		| "next"
		| "previous"
		| "retry"
		| "title"
		| "today";
	readonly surface?: CalendarEventSurface;
}

/** Mutable element registries owned by the active calendar render. */
export interface GridFocusElements {
	readonly agendaMoreButton: HTMLButtonElement | null;
	readonly dayButtons: ReadonlyMap<string, HTMLButtonElement>;
	readonly eventActions: ReadonlyMap<string, CalendarEventActionElement>;
	readonly gridActionsByDate: ReadonlyMap<string, readonly CalendarEventActionElement[]>;
	readonly gridMoreButtons: ReadonlyMap<string, HTMLButtonElement>;
}

/** Creates a collision-safe identity for one rendered event occurrence. */
export function getEventActionKey(
	surface: CalendarEventSurface,
	dateString: string,
	eventId: string
): string {
	return JSON.stringify([surface, dateString, eventId]);
}

/** Returns focus only when it is still owned by this calendar host. */
export function getOwnedActiveElement(document: Document, host: HTMLElement): Element | null {
	const active = document.activeElement;
	return active !== null && host.contains(active) ? active : null;
}

/** Returns whether a previously owned focus target was detached from this host. */
export function wasOwnedFocusRemoved(active: Element | null, host: HTMLElement): boolean {
	return active !== null && (!active.isConnected || !host.contains(active));
}

/** Moves focus to the first action while retaining the day proxy as the grid tab stop. */
export function enterGridActions(
	dateString: string,
	elements: Readonly<GridFocusElements>,
	host: HTMLElement
): void {
	const actions = elements.gridActionsByDate.get(dateString) ?? [];
	const firstAction = actions.find((action) => action.isConnected && host.contains(action));
	if (firstAction === undefined) {
		return;
	}
	setDayProxyTabStop(dateString, elements);
	firstAction.focus({ preventScroll: true });
}

/** Handles action-mode movement and returns whether the key was consumed. */
export function handleGridActionKeydown(
	event: KeyboardEvent,
	dateString: string,
	action: CalendarEventActionElement,
	elements: Readonly<GridFocusElements>,
	host: HTMLElement,
	agendaTitle: HTMLHeadingElement | null
): boolean {
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
export function leaveGridActions(
	dateString: string,
	focusDay: boolean,
	elements: Readonly<GridFocusElements>
): void {
	setDayProxyTabStop(dateString, elements);
	if (focusDay) {
		elements.dayButtons.get(dateString)?.focus({ preventScroll: true });
	}
}

/** Captures package-owned focus without retaining a stale element. */
export function captureCalendarFocus(
	active: Element | null,
	host: HTMLElement,
	dom: CalendarDom | null,
	elements: Readonly<GridFocusElements>
): CalendarFocusToken | null {
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
export function restoreCalendarFocus(
	token: CalendarFocusToken | null,
	dom: CalendarDom | null,
	elements: Readonly<GridFocusElements>,
	focusedDateString: string,
	host: HTMLElement
): void {
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

function setDayProxyTabStop(dateString: string, elements: Readonly<GridFocusElements>): void {
	for (const [candidateDate, button] of elements.dayButtons) {
		button.tabIndex = candidateDate === dateString ? 0 : -1;
	}
	for (const actions of elements.gridActionsByDate.values()) {
		for (const action of actions) {
			action.tabIndex = -1;
		}
	}
}

function captureStableFocus(active: Element, dom: CalendarDom): CalendarFocusToken | null {
	const stable = new Map<Element, CalendarFocusToken["kind"]>([
		[dom.retryButton, "retry"],
		[dom.previousButton, "previous"],
		[dom.nextButton, "next"],
		[dom.todayButton, "today"],
		[dom.titleButton, "title"]
	]);
	const kind = stable.get(active);
	return kind === undefined ? null : { kind };
}

function captureEventFocus(
	active: Element,
	actions: ReadonlyMap<string, CalendarEventActionElement>
): CalendarFocusToken | null {
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

function resolveFocusElement(
	token: CalendarFocusToken,
	dom: CalendarDom,
	elements: Readonly<GridFocusElements>
): HTMLElement | null {
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

function resolveEventFocusElement(
	token: CalendarFocusToken,
	actions: ReadonlyMap<string, CalendarEventActionElement>
): CalendarEventActionElement | null {
	return token.eventId === undefined || token.date === undefined || token.surface === undefined
		? null
		: actions.get(getEventActionKey(token.surface, token.date, token.eventId)) ?? null;
}

function isGridActionToken(token: CalendarFocusToken): boolean {
	return token.kind === "grid-more" ||
		(token.kind === "event-action" && token.surface === "grid-summary");
}
