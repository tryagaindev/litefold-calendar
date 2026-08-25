/**
 * A typed calendar failure containing separate diagnostic and user-safe text.
 *
 * The original failure remains available through `cause` for trusted application diagnostics. Causes, stack traces,
 * extension identifiers, and hook names must never be copied into rendered output or calendar state.
 */
export class LitefoldCalendarError extends Error {
    /** Stable machine-readable failure category. */
    code;
    /** Zero-based source-event index associated with validation, when known. */
    eventIndex;
    /** Trusted extension identifier associated with the failure, when applicable. */
    extensionId;
    /** Trusted lifecycle or action hook name associated with the failure, when applicable. */
    hook;
    /** Operation in which the failure originated. */
    phase;
    /** Inclusive/exclusive request range associated with the failure, when applicable. */
    range;
    /** Whether this instance may remain usable or recover through a later valid operation; this does not promise Retry UI. */
    recoverable;
    /** User-facing importance of the failure. */
    severity;
    /** Whether the failure belongs to work superseded by a newer request. */
    stale;
    /** Rendering surface associated with the failure, when applicable. */
    surface;
    /** Localized text safe to present to an end user. */
    userMessage;
    /** Localized heading safe to present to an end user. */
    userTitle;
    /** Creates an immutable typed calendar error. */
    constructor(options) {
        super(options.message, { cause: options.cause });
        this.name = "LitefoldCalendarError";
        this.code = options.code;
        this.eventIndex = options.eventIndex;
        this.extensionId = options.extensionId;
        this.hook = options.hook;
        this.phase = options.phase;
        this.range = options.range === undefined
            ? undefined
            : Object.freeze({ end: options.range.end, start: options.range.start });
        this.recoverable = options.recoverable;
        this.severity = options.severity;
        this.stale = options.stale ?? false;
        this.surface = options.surface;
        this.userMessage = options.userMessage;
        this.userTitle = options.userTitle;
        Object.freeze(this);
    }
}
/** Returns an immutable, presentation-safe issue derived from a diagnostic error. */
export function toCalendarIssue(error) {
    return Object.freeze({
        code: error.code,
        message: error.userMessage,
        recoverable: error.recoverable,
        severity: error.severity,
        title: error.userTitle
    });
}
/** Identifies abort failures without depending on a realm-specific `DOMException` constructor. */
export function isAbortError(error) {
    if (typeof error !== "object" || error === null) {
        return false;
    }
    try {
        return Reflect.get(error, "name") === "AbortError";
    }
    catch {
        //Hostile proxies and throwing accessors are ordinary non-abort failures.
        return false;
    }
}
/** Converts an arbitrary thrown value into an `Error` while preserving the original value as its cause. */
export function toError(error, message = "An unknown calendar error occurred.") {
    try {
        if (error instanceof Error) {
            return error;
        }
    }
    catch {
        //A proxy can throw from the `instanceof` prototype lookup. Preserve it as the cause instead.
    }
    return new Error(message, { cause: error });
}
/**
 * Reports an otherwise-unhandled failure through the platform error-reporting channel.
 *
 * `reportError()` is preferred when present. The microtask throw retains visibility on platforms that do not
 * implement it without introducing a runtime dependency or touching the DOM during module evaluation.
 */
export function reportCalendarError(error) {
    const reportedError = toError(error);
    let reportErrorCandidate;
    try {
        reportErrorCandidate = Reflect.get(globalThis, "reportError");
    }
    catch (reporterLookupFailure) {
        queueReportedError(new AggregateError([reportedError, reporterLookupFailure], "The platform error reporter could not be resolved."));
        return;
    }
    if (typeof reportErrorCandidate === "function") {
        try {
            Reflect.apply(reportErrorCandidate, globalThis, [reportedError]);
        }
        catch (reporterFailure) {
            queueReportedError(new AggregateError([reportedError, reporterFailure], "The platform error reporter failed while reporting a calendar error."));
        }
        return;
    }
    queueReportedError(reportedError);
}
function queueReportedError(error) {
    try {
        queueMicrotask(() => {
            throw error;
        });
    }
    catch {
        //Do not allow a replaced or failing queueMicrotask implementation to break package UI synchronously.
        try {
            void Promise.resolve().then(() => {
                throw error;
            });
        }
        catch {
            //Both platform reporting mechanisms are hostile; error presentation must still remain intact.
        }
    }
}
//# sourceMappingURL=errors.js.map