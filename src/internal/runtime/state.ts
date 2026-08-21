import type {
	CalendarErrorCode,
	CalendarErrorPhase,
	CalendarErrorSeverity,
	CalendarIssue,
	CalendarRangeBounds,
	CalendarSurface
} from "../../errors.js";
import type {
	CalendarAnnouncement,
	CalendarDate,
	CalendarPhase,
	CalendarState
} from "../../types.js";

/** Coordinator-owned issue metadata retained outside the public state snapshot. */
export interface InternalIssue {
	readonly handled: boolean;
	readonly issue: CalendarIssue;
	readonly key: string;
	readonly politeness: CalendarAnnouncement["politeness"];
	readonly retryable: boolean;
}

/** Internal values used to construct one typed package error. */
export interface InternalErrorOptions {
	readonly cause?: unknown;
	readonly code: CalendarErrorCode;
	readonly eventIndex?: number | undefined;
	readonly extensionId?: string | undefined;
	readonly hook?: string | undefined;
	readonly message?: string | undefined;
	readonly phase?: CalendarErrorPhase | undefined;
	readonly range?: CalendarRangeBounds | undefined;
	readonly recoverable: boolean;
	readonly severity: CalendarErrorSeverity;
	readonly stale?: boolean | undefined;
	readonly surface?: CalendarSurface | undefined;
	readonly userMessage: string;
	readonly userTitle: string;
}

/** Creates an immutable public state snapshot. */
export function createState(
	phase: CalendarPhase,
	range: CalendarRangeBounds | null,
	issues: readonly CalendarIssue[],
	displayedMonth: CalendarDate,
	selectedDate: CalendarDate
): CalendarState {
	return Object.freeze({
		displayedMonth: Object.freeze({ ...displayedMonth }),
		issues: Object.freeze([...issues]),
		phase,
		range: range === null ? null : Object.freeze({ end: range.end, start: range.start }),
		selectedDate: Object.freeze({ ...selectedDate })
	});
}

/** Identifies a supported extension/rendering surface. */
export function isExtensionSurface(value: unknown): value is CalendarSurface {
	return value === "day" || value === "grid-summary" || value === "agenda";
}

/** Returns whether an issue originated from the event-source pipeline. */
export function isSourceIssue(entry: InternalIssue): boolean {
	return entry.issue.code === "event-source-failed" ||
		entry.issue.code === "event-data-invalid" ||
		entry.issue.code === "event-limit-exceeded";
}

/** Maps a public error code to its default operation phase. */
export function phaseForCode(code: CalendarErrorCode): CalendarErrorPhase {
	switch (code) {
		case "invalid-configuration": return "configuration";
		case "invalid-argument": return "argument";
		case "invalid-state": return "state";
		case "event-source-failed": return "source";
		case "event-data-invalid":
		case "event-limit-exceeded": return "validation";
		case "extension-failed": return "extension";
		case "action-failed": return "action";
		case "host-integration-failed": return "integration";
		case "internal-error": return "render";
	}
}

/** Returns a sortable rank for public issue severity. */
export function severityRank(severity: CalendarErrorSeverity): number {
	switch (severity) {
		case "warning": return 1;
		case "error": return 2;
		case "fatal": return 3;
	}
}
