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

/** Wires native event controls while leaving action transactions with the coordinator. */
export function installEventActionListeners(options: Readonly<EventActionListenerOptions>): void {
	const { action, isCurrent, onActivate, onContext, onGridKeydown } = options;
	const shortcuts = [
		...(options.surface === "grid-summary" ? ["F2"] : []),
		...(options.hasContextAction ? ["Shift+F10"] : [])
	];
	if (shortcuts.length > 0) {
		action.setAttribute("aria-keyshortcuts", shortcuts.join(" "));
	}
	action.addEventListener("click", (nativeEvent) => {
		if (!isCurrent()) {
			nativeEvent.preventDefault();
			nativeEvent.stopImmediatePropagation();
			return;
		}
		if (onActivate !== null) {
			onActivate(nativeEvent as MouseEvent);
			return;
		}
		if (action.tagName === "BUTTON" && onContext !== null) {
			const mouseEvent = nativeEvent as MouseEvent;
			onContext(mouseEvent, mouseEvent.clientX, mouseEvent.clientY);
		}
	});
	if (onGridKeydown !== null || onContext !== null) {
		action.addEventListener("keydown", (event) => {
			const nativeEvent = event as KeyboardEvent;
			onGridKeydown?.(nativeEvent);
			if (onContext === null || !isContextMenuKey(nativeEvent)) {
				return;
			}
			nativeEvent.preventDefault();
			if (isCurrent()) {
				const bounds = action.getBoundingClientRect();
				onContext(nativeEvent, bounds.left, bounds.bottom);
			}
		});
	}
	if (onContext === null) {
		return;
	}
	action.addEventListener("contextmenu", (event) => {
		const nativeEvent = event as MouseEvent;
		if (!isCurrent()) {
			nativeEvent.preventDefault();
			return;
		}
		if (!nativeEvent.defaultPrevented) {
			nativeEvent.preventDefault();
			onContext(nativeEvent, nativeEvent.clientX, nativeEvent.clientY);
		}
	});
}

function isContextMenuKey(event: KeyboardEvent): boolean {
	return event.key === "ContextMenu" || (event.shiftKey && event.key === "F10");
}
