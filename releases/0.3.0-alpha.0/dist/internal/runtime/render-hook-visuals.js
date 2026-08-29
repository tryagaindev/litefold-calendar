import { createEventAccent } from "../dom/event-accent.js";
import { createMultipleEventIndicator } from "../dom/multiple-event-indicator.js";
import { observeThenable } from "./safety.js";
/** Owns singleton visual render-hook invocation and package-default recovery. */
export class RenderHookVisualRenderer {
    options;
    constructor(options) {
        this.options = options;
    }
    /** Renders an event marker through its singleton hook or the package default. */
    renderEventMarker(container, accentColor, createContext) {
        if (this.options.isDestroyed()) {
            return;
        }
        const runtime = this.options.renderHooks.find((candidate) => !candidate.quarantined && candidate.definition.renderEventMarker !== undefined);
        if (runtime === undefined) {
            container.append(createEventAccent(this.options.document, accentColor));
            return;
        }
        const hook = runtime.definition.renderEventMarker;
        if (hook === undefined) {
            container.append(createEventAccent(this.options.document, accentColor));
            return;
        }
        const controller = runtime.controller;
        const context = Object.freeze(createContext(controller.signal));
        const surface = context["surface"];
        try {
            const result = hook(context);
            const returnedThenable = observeThenable(result, (cause) => {
                this.options.reportLateFailure(runtime, "renderEventMarker", cause, surface);
            });
            if (!this.options.isInvocationCurrent(runtime, controller)) {
                if (returnedThenable) {
                    this.options.reportLateFailure(runtime, "renderEventMarker", new TypeError("renderEventMarker must return a node or null synchronously."), surface);
                }
                return;
            }
            if (returnedThenable) {
                throw new TypeError("renderEventMarker must return a node or null synchronously.");
            }
            if (result === null) {
                runtime.markerFallbacks.set(container, accentColor);
                return;
            }
            if (result === undefined) {
                throw new TypeError("renderEventMarker must return a node or null.");
            }
            if (!this.options.appendNode(runtime, "renderEventMarker", container, result, true, surface)) {
                if (this.canRestoreFallback(container)) {
                    container.append(createEventAccent(this.options.document, accentColor));
                }
                return;
            }
            runtime.markerFallbacks.set(container, accentColor);
        }
        catch (cause) {
            if (!this.options.isInvocationCurrent(runtime, controller)) {
                this.options.reportLateFailure(runtime, "renderEventMarker", cause, surface);
                return;
            }
            this.options.quarantine(runtime, "renderEventMarker", cause, surface);
            if (this.canRestoreFallback(container)) {
                container.append(createEventAccent(this.options.document, accentColor));
            }
        }
    }
    /** Renders the compact multiple-event cue through its singleton hook or the package default. */
    renderMultipleEventIndicator(container, date, dateString, eventCount) {
        if (this.options.isDestroyed()) {
            return;
        }
        const fallback = createMultipleEventIndicator(this.options.document);
        container.append(fallback);
        const runtime = this.options.renderHooks.find((candidate) => !candidate.quarantined && candidate.definition.renderMultipleEventIndicator !== undefined);
        if (runtime === undefined) {
            return;
        }
        const hook = runtime.definition.renderMultipleEventIndicator;
        if (hook === undefined) {
            return;
        }
        const controller = runtime.controller;
        const surface = "day";
        const context = Object.freeze({
            date: Object.freeze({ ...date }),
            dateString,
            document: this.options.document,
            eventCount,
            signal: controller.signal,
            surface
        });
        try {
            const result = hook(context);
            const returnedThenable = observeThenable(result, (cause) => {
                this.options.reportLateFailure(runtime, "renderMultipleEventIndicator", cause, surface);
            });
            if (!this.options.isInvocationCurrent(runtime, controller)) {
                if (returnedThenable) {
                    this.options.reportLateFailure(runtime, "renderMultipleEventIndicator", new TypeError("renderMultipleEventIndicator must return a node, null, or undefined synchronously."), surface);
                }
                return;
            }
            if (returnedThenable) {
                throw new TypeError("renderMultipleEventIndicator must return a node, null, or undefined synchronously.");
            }
            if (result === undefined) {
                return;
            }
            if (result === null) {
                runtime.multipleEventIndicatorFallbacks.add(container);
                fallback.remove();
                return;
            }
            if (!this.options.appendNode(runtime, "renderMultipleEventIndicator", container, result, true, surface)) {
                return;
            }
            runtime.multipleEventIndicatorFallbacks.add(container);
            fallback.remove();
        }
        catch (cause) {
            if (!this.options.isInvocationCurrent(runtime, controller)) {
                this.options.reportLateFailure(runtime, "renderMultipleEventIndicator", cause, surface);
                return;
            }
            this.options.quarantine(runtime, "renderMultipleEventIndicator", cause, surface);
            if (this.canRestoreFallback(container)) {
                container.append(createMultipleEventIndicator(this.options.document));
            }
        }
    }
    /** Renders optional wide visual content without replacing the native overflow action. */
    renderGridOverflowContent(button, container, date, dateString, eventCount, hiddenEventCount, text) {
        if (this.options.isDestroyed()) {
            return;
        }
        const runtime = this.options.renderHooks.find((candidate) => !candidate.quarantined && candidate.definition.renderGridOverflowContent !== undefined);
        if (runtime === undefined) {
            return;
        }
        const hook = runtime.definition.renderGridOverflowContent;
        if (hook === undefined) {
            return;
        }
        const controller = runtime.controller;
        const surface = "grid-summary";
        const context = Object.freeze({
            date: Object.freeze({ ...date }),
            dateString,
            document: this.options.document,
            eventCount,
            hiddenEventCount,
            signal: controller.signal,
            surface,
            text
        });
        try {
            const result = hook(context);
            const returnedThenable = observeThenable(result, (cause) => {
                this.options.reportLateFailure(runtime, "renderGridOverflowContent", cause, surface);
            });
            if (!this.options.isInvocationCurrent(runtime, controller)) {
                if (returnedThenable) {
                    this.options.reportLateFailure(runtime, "renderGridOverflowContent", new TypeError("renderGridOverflowContent must return a node, null, or undefined synchronously."), surface);
                }
                return;
            }
            if (returnedThenable) {
                throw new TypeError("renderGridOverflowContent must return a node, null, or undefined synchronously.");
            }
            if (result === null || result === undefined) {
                return;
            }
            if (!this.options.appendNode(runtime, "renderGridOverflowContent", container, result, true, surface)) {
                return;
            }
            button.classList.add("lfc-has-custom-grid-overflow-content");
            runtime.gridOverflowContentFallbacks.add(button);
        }
        catch (cause) {
            if (!this.options.isInvocationCurrent(runtime, controller)) {
                this.options.reportLateFailure(runtime, "renderGridOverflowContent", cause, surface);
                return;
            }
            this.options.quarantine(runtime, "renderGridOverflowContent", cause, surface);
        }
    }
    /** Clears stale fallback bookkeeping when an ordinary render or teardown releases render-hook nodes. */
    clearFallbackTracking(runtime) {
        const errors = [];
        for (const button of runtime.gridOverflowContentFallbacks) {
            try {
                button.classList.remove("lfc-has-custom-grid-overflow-content");
            }
            catch (cause) {
                errors.push(cause);
            }
        }
        runtime.gridOverflowContentFallbacks.clear();
        runtime.markerFallbacks.clear();
        runtime.multipleEventIndicatorFallbacks.clear();
        return errors;
    }
    /** Restores package-owned visual fallbacks after render hooks are quarantined. */
    restoreFallbacks(runtime) {
        const errors = [];
        if (!this.options.isDestroyed()) {
            for (const [container, accentColor] of runtime.markerFallbacks) {
                if (container.childNodes.length > 0) {
                    continue;
                }
                try {
                    container.append(createEventAccent(this.options.document, accentColor));
                }
                catch (cause) {
                    errors.push(cause);
                }
            }
            for (const container of runtime.multipleEventIndicatorFallbacks) {
                if (container.childNodes.length > 0) {
                    continue;
                }
                try {
                    container.append(createMultipleEventIndicator(this.options.document));
                }
                catch (cause) {
                    errors.push(cause);
                }
            }
            for (const button of runtime.gridOverflowContentFallbacks) {
                try {
                    button.classList.remove("lfc-has-custom-grid-overflow-content");
                }
                catch (cause) {
                    errors.push(cause);
                }
            }
        }
        runtime.gridOverflowContentFallbacks.clear();
        runtime.markerFallbacks.clear();
        runtime.multipleEventIndicatorFallbacks.clear();
        return errors;
    }
    canRestoreFallback(container) {
        return !this.options.isDestroyed() && container.childNodes.length === 0;
    }
}
//# sourceMappingURL=render-hook-visuals.js.map