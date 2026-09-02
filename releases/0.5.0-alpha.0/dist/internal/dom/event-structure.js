/** Wires native event controls while leaving action transactions with the coordinator. */
export function installEventActionListeners(options) {
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
            onActivate(nativeEvent);
            return;
        }
        if (action.tagName === "BUTTON" && onContext !== null) {
            const mouseEvent = nativeEvent;
            onContext(mouseEvent, mouseEvent.clientX, mouseEvent.clientY);
        }
    });
    if (onGridKeydown !== null || onContext !== null) {
        action.addEventListener("keydown", (event) => {
            const nativeEvent = event;
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
        const nativeEvent = event;
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
function isContextMenuKey(event) {
    return event.key === "ContextMenu" || (event.shiftKey && event.key === "F10");
}
//# sourceMappingURL=event-structure.js.map