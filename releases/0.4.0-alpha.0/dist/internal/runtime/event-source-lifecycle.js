import { reportCalendarError } from "../../errors.js";
import { isLitefoldCalendarError } from "./safety.js";
/** Mutates busy attributes only while the owning request remains current. */
export function setVisibleEventBusyState(host, grid, busy, isCurrent) {
    for (const element of [host, grid]) {
        if (element === null || !isCurrent()) {
            return element === null ? isCurrent() : false;
        }
        if (busy) {
            element.setAttribute("aria-busy", "true");
        }
        else {
            element.removeAttribute("aria-busy");
        }
        if (!isCurrent()) {
            return false;
        }
    }
    return true;
}
/** Attaches both terminal handlers before the coordinator publishes loading callbacks. */
export function observeVisibleEventRequest(events, onFulfilled, onRejected, onObserverFailure) {
    try {
        void events.then((values) => { invokeTerminalObserver(onFulfilled, values, onObserverFailure); }, (cause) => { invokeTerminalObserver(onRejected, cause, onObserverFailure); });
    }
    catch (cause) {
        reportTerminalObserverFailure(cause, onObserverFailure);
    }
}
function invokeTerminalObserver(observer, value, onObserverFailure) {
    try {
        observer(value);
    }
    catch (cause) {
        reportTerminalObserverFailure(cause, onObserverFailure);
    }
}
function reportTerminalObserverFailure(cause, onObserverFailure) {
    try {
        onObserverFailure(cause);
    }
    catch (observerFailure) {
        reportCalendarError(new AggregateError([cause, observerFailure], "An asynchronous event-source terminal callback and its fatal observer both failed."));
    }
}
/** Builds the shared typed error inputs for current and stale source failures. */
export function createEventSourceErrorOptions(options) {
    const validationError = isLitefoldCalendarError(options.cause) &&
        (options.cause.code === "event-data-invalid" || options.cause.code === "event-limit-exceeded")
        ? options.cause
        : null;
    return Object.freeze({
        cause: options.cause,
        code: validationError?.code ?? "event-source-failed",
        eventIndex: validationError?.eventIndex,
        phase: validationError?.phase ?? "source",
        range: options.range,
        recoverable: true,
        severity: options.retained ? "warning" : "error",
        stale: options.stale,
        userMessage: options.retained
            ? options.messages.refreshErrorMessage
            : options.messages.loadErrorMessage,
        userTitle: options.retained
            ? options.messages.refreshErrorTitle
            : options.messages.loadErrorTitle
    });
}
//# sourceMappingURL=event-source-lifecycle.js.map