/** Registers one actionable grid occurrence and selects the first compact representative. */
export function registerGridEventAction(root, action, actions, actionMap, actionKey, compactPrimaryAssigned) {
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
export function installEventActionListeners(options) {
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
                options.onActivate?.(event);
            }
        });
    }
    else if (options.action.tagName === "BUTTON" && options.onContext !== null) {
        options.action.addEventListener("click", (event) => {
            const nativeEvent = event;
            if (options.isCurrent()) {
                options.onContext?.(nativeEvent, nativeEvent.clientX, nativeEvent.clientY);
            }
        });
    }
    if (options.onGridKeydown !== null) {
        options.action.addEventListener("keydown", (event) => {
            options.onGridKeydown?.(event);
        });
    }
    if (options.onContext === null) {
        return;
    }
    options.action.addEventListener("contextmenu", (event) => {
        const nativeEvent = event;
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
        const nativeEvent = event;
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
//# sourceMappingURL=event-structure.js.map