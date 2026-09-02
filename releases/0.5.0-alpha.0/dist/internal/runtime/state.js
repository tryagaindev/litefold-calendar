import { LitefoldCalendarError } from "../../errors.js";
/** Creates one typed package error from coordinator-owned internal values. */
export function createInternalError(options) {
    const phase = options.phase ?? phaseForCode(options.code);
    const values = {
        ...(options.cause === undefined ? {} : { cause: options.cause }),
        code: options.code,
        ...(options.eventIndex === undefined ? {} : { eventIndex: options.eventIndex }),
        ...(options.extensionId === undefined ? {} : { extensionId: options.extensionId }),
        ...(options.renderHookId === undefined ? {} : { renderHookId: options.renderHookId }),
        ...(options.hook === undefined ? {} : { hook: options.hook }),
        message: options.message ?? `${options.code} during ${phase}.`,
        phase,
        ...(options.range === undefined ? {} : { range: options.range }),
        recoverable: options.recoverable,
        severity: options.severity,
        ...(options.stale === undefined ? {} : { stale: options.stale }),
        ...(options.surface === undefined ? {} : { surface: options.surface }),
        userMessage: options.userMessage,
        userTitle: options.userTitle
    };
    return new LitefoldCalendarError(values);
}
/** Creates a typed error for a rejected public calendar method call. */
export function createPublicMethodError(code, hook, message, messages, isLive, cause) {
    return createInternalError({
        ...(cause === undefined ? {} : { cause }),
        code,
        hook,
        message,
        recoverable: code === "invalid-argument" || isLive,
        severity: "error",
        userMessage: code === "invalid-argument" ? messages.actionErrorMessage : messages.internalErrorMessage,
        userTitle: code === "invalid-argument" ? messages.actionErrorTitle : messages.internalErrorTitle
    });
}
/** Creates an immutable public state snapshot. */
export function createState(phase, range, issues, displayedMonth, selectedDate) {
    return Object.freeze({
        displayedMonth: Object.freeze({ ...displayedMonth }),
        issues: Object.freeze([...issues]),
        phase,
        range: range === null ? null : Object.freeze({ end: range.end, start: range.start }),
        selectedDate: Object.freeze({ ...selectedDate })
    });
}
/** Identifies a supported render-hook surface. */
export function isRenderHookSurface(value) {
    return value === "day" || value === "grid-summary" || value === "agenda";
}
/** Returns whether an issue originated from the event-source pipeline. */
export function isSourceIssue(entry) {
    return entry.issue.code === "event-source-failed" ||
        entry.issue.code === "event-data-invalid" ||
        entry.issue.code === "event-limit-exceeded";
}
/** Maps a public error code to its default operation phase. */
export function phaseForCode(code) {
    switch (code) {
        case "invalid-configuration": return "configuration";
        case "invalid-argument": return "argument";
        case "invalid-state": return "state";
        case "event-source-failed": return "source";
        case "event-data-invalid":
        case "event-limit-exceeded": return "validation";
        case "extension-failed": return "integration";
        case "render-hook-failed": return "render";
        case "action-failed": return "action";
        case "host-integration-failed": return "integration";
        case "internal-error": return "render";
    }
}
/** Returns a sortable rank for public issue severity. */
export function severityRank(severity) {
    switch (severity) {
        case "warning": return 1;
        case "error": return 2;
        case "fatal": return 3;
    }
}
//# sourceMappingURL=state.js.map