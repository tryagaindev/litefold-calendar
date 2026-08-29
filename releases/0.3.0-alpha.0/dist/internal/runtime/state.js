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