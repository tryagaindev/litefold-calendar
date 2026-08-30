/** Installs package-owned overflow behavior before consumer visual hooks inspect the action. */
export function installGridOverflowActionListeners(options) {
    options.action.addEventListener("click", () => {
        if (options.isCurrent()) {
            options.onActivate();
        }
    }, { capture: true });
    options.action.addEventListener("keydown", (event) => {
        options.onKeydown(event);
    }, { capture: true });
}
/** Collects one day's grid actions and selects its first actionable compact representation. */
export class DayGridActionCollector {
    actions = [];
    compactPrimaryValue = null;
    eventActionRegistry;
    constructor(eventActionRegistry) {
        this.eventActionRegistry = eventActionRegistry;
    }
    /** First actionable event representation eligible for compact presentation. */
    get compactPrimary() {
        return this.compactPrimaryValue;
    }
    /** Registers one actionable event representation in keyboard and activation order. */
    registerEvent(actionKey, elements) {
        const { action } = elements;
        if (action === null) {
            return;
        }
        this.actions.push(action);
        this.eventActionRegistry.set(actionKey, action);
        this.compactPrimaryValue ??= elements;
    }
    /** Appends the native day-overflow action after visible event actions. */
    registerOverflow(action) {
        this.actions.push(action);
    }
    /** Returns an immutable focus-order snapshot for the completed day cell. */
    snapshot() {
        return Object.freeze([...this.actions]);
    }
}
//# sourceMappingURL=day-grid-actions.js.map