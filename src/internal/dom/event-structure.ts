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
	listen(action, "click", (nativeEvent) => {
		if (!isCurrent()) {
			nativeEvent.preventDefault();
			nativeEvent.stopImmediatePropagation();
			return;
		}
		if (onActivate !== null) {
			onActivate(nativeEvent);
			return;
		}
		if (action.tagName === "BUTTON" && onContext !== null) {
			onContext(nativeEvent, nativeEvent.clientX, nativeEvent.clientY);
		}
	});
	if (onGridKeydown !== null || onContext !== null) {
		listen(action, "keydown", (nativeEvent) => {
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
	listen(action, "contextmenu", (nativeEvent) => {
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

/** Preserves the native event map shared by anchor and button controls. */
function listen<TType extends keyof HTMLElementEventMap>(
	element: HTMLElement,
	type: TType,
	listener: (event: HTMLElementEventMap[TType]) => void
): void {
	element.addEventListener(type, listener);
}

function isContextMenuKey(event: KeyboardEvent): boolean {
	return event.key === "ContextMenu" || (event.shiftKey && event.key === "F10");
}
