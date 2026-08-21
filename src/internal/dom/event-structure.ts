import type {
	CalendarEventActionElement,
	CalendarEventSurface,
	CalendarEventTimeDisplay
} from "../../types.js";

/** Package-owned elements created before extension content is applied. */
export interface EventContentElements {
	readonly details: HTMLSpanElement;
	readonly leading: HTMLSpanElement;
	readonly leadingContent: HTMLSpanElement;
	readonly marker: HTMLSpanElement;
	readonly time: HTMLTimeElement;
	readonly title: HTMLSpanElement;
	readonly trailing: HTMLSpanElement;
}

/** Root and optional native action for one event occurrence. */
export interface EventRootElements {
	readonly action: CalendarEventActionElement | null;
	readonly root: HTMLElement;
}

interface EventRootOptions {
	readonly accessibleLabel: string;
	readonly dateString: string;
	readonly document: Document;
	readonly eventId: string;
	readonly hasApplicationAction: boolean;
	readonly surface: CalendarEventSurface;
	readonly url: string | null;
}

interface EventActionListenerOptions {
	readonly action: CalendarEventActionElement;
	readonly hasContextAction: boolean;
	readonly isCurrent: () => boolean;
	readonly onActivate: ((nativeEvent: MouseEvent) => void) | null;
	readonly onContext: ((
		nativeEvent: MouseEvent | KeyboardEvent,
		clientX: number,
		clientY: number
	) => void) | null;
	readonly onGridKeydown: ((nativeEvent: KeyboardEvent) => void) | null;
	readonly surface: CalendarEventSurface;
}

/** Creates the semantic root for a static, button, or link representation. */
export function createEventRoot(options: Readonly<EventRootOptions>): EventRootElements {
	const isLink = options.url !== null;
	const isActionable = isLink || options.hasApplicationAction;
	const root = options.document.createElement(
		isLink ? "a" : isActionable ? "button" : options.surface === "agenda" ? "div" : "span"
	);
	root.className = options.surface === "agenda"
		? "lfc-calendar-agenda-event"
		: "lfc-calendar-event-summary";
	root.setAttribute("data-lfc-date", options.dateString);
	root.setAttribute("data-lfc-event-id", options.eventId);
	root.setAttribute("data-lfc-surface", options.surface);
	const action = isActionable ? root as CalendarEventActionElement : null;
	if (action === null) {
		return { action, root };
	}
	action.classList.add("lfc-calendar-event-button");
	if (action.tagName === "BUTTON") {
		(action as HTMLButtonElement).type = "button";
	} else if (options.url !== null) {
		(action as HTMLAnchorElement).href = options.url;
	}
	if (options.surface === "grid-summary") {
		action.tabIndex = -1;
		action.setAttribute("aria-label", options.accessibleLabel);
	}
	return { action, root };
}

/** Creates native text and time elements shared by both event surfaces. */
export function createEventContentElements(
	document: Document,
	start: string,
	titleText: string,
	timeText: string,
	timeDisplay: CalendarEventTimeDisplay,
	surface: CalendarEventSurface
): EventContentElements {
	const leading = document.createElement("span");
	leading.className = "lfc-calendar-event-leading";
	const marker = document.createElement("span");
	marker.className = "lfc-calendar-event-marker";
	const leadingContent = document.createElement("span");
	leadingContent.className = "lfc-calendar-event-leading-content";
	const time = document.createElement("time");
	Object.assign(time, { className: "lfc-calendar-time", dateTime: start, dir: "auto", textContent: timeText });
	if (timeDisplay === "none" || (timeDisplay === "grid" && surface === "agenda") ||
		(timeDisplay === "agenda" && surface === "grid-summary")) {
		time.classList.add("lfc-visually-hidden");
	}
	const title = document.createElement("span");
	Object.assign(title, { className: "lfc-calendar-event-title", dir: "auto", textContent: titleText });
	const details = document.createElement("span");
	details.className = "lfc-calendar-event-details";
	const trailing = document.createElement("span");
	trailing.className = "lfc-calendar-event-trailing";
	return { details, leading, leadingContent, marker, time, title, trailing };
}

/** Registers one actionable grid occurrence and selects the first compact representative. */
export function registerGridEventAction(
	root: HTMLElement,
	action: CalendarEventActionElement | null,
	actions: CalendarEventActionElement[],
	actionMap: Map<string, CalendarEventActionElement>,
	actionKey: string,
	compactPrimaryAssigned: boolean
): boolean {
	if (action === null) {
		return compactPrimaryAssigned;
	}
	actions.push(action);
	actionMap.set(actionKey, action);
	if (!compactPrimaryAssigned) {
		root.classList.add("lfc-is-compact-primary");
	}
	return true;
}

/** Wires native event controls while leaving action transactions with the coordinator. */
export function installEventActionListeners(options: Readonly<EventActionListenerOptions>): void {
	const shortcuts = [
		...(options.surface === "grid-summary" ? ["F2"] : []),
		...(options.hasContextAction ? ["Shift+F10"] : [])
	];
	if (shortcuts.length > 0) {
		options.action.setAttribute("aria-keyshortcuts", shortcuts.join(" "));
	}
	options.action.addEventListener("click", (nativeEvent) => {
		if (!options.isCurrent()) {
			nativeEvent.preventDefault();
			nativeEvent.stopImmediatePropagation();
		}
	});
	if (options.onActivate !== null) {
		options.action.addEventListener("click", (event) => {
			if (options.isCurrent()) {
				options.onActivate?.(event as MouseEvent);
			}
		});
	} else if (options.action.tagName === "BUTTON" && options.onContext !== null) {
		options.action.addEventListener("click", (event) => {
			const nativeEvent = event as MouseEvent;
			if (options.isCurrent()) {
				options.onContext?.(nativeEvent, nativeEvent.clientX, nativeEvent.clientY);
			}
		});
	}
	if (options.onGridKeydown !== null) {
		options.action.addEventListener("keydown", (event) => {
			options.onGridKeydown?.(event as KeyboardEvent);
		});
	}
	if (options.onContext === null) {
		return;
	}
	options.action.addEventListener("contextmenu", (event) => {
		const nativeEvent = event as MouseEvent;
		if (!options.isCurrent()) {
			nativeEvent.preventDefault();
			return;
		}
		if (!nativeEvent.defaultPrevented) {
			nativeEvent.preventDefault();
			options.onContext?.(nativeEvent, nativeEvent.clientX, nativeEvent.clientY);
		}
	});
	options.action.addEventListener("keydown", (event) => {
		const nativeEvent = event as KeyboardEvent;
		if (nativeEvent.key !== "ContextMenu" && !(nativeEvent.shiftKey && nativeEvent.key === "F10")) {
			return;
		}
		nativeEvent.preventDefault();
		if (options.isCurrent()) {
			const bounds = options.action.getBoundingClientRect();
			options.onContext?.(nativeEvent, bounds.left, bounds.bottom);
		}
	});
}
