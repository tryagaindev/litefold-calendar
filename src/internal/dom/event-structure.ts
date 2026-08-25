import type {
	CalendarEventActionElement,
	CalendarEventSurface
} from "../../types.js";

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
