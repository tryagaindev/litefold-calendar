import {
	LitefoldCalendarError,
	type CalendarErrorCode,
	type CalendarErrorPhase,
	type CalendarErrorSeverity,
	type CalendarIssue,
	type CalendarRangeBounds,
	type CalendarSurface,
	type LitefoldCalendarErrorOptions
} from "../../errors.js";
import type {
	CalendarAnnouncement,
	CalendarDate,
	CalendarPhase,
	CalendarState
} from "../../types.js";
import type { CalendarMessages } from "../../messages.js";

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
	readonly renderHookId?: string | undefined;
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

/** Creates one typed package error from coordinator-owned internal values. */
export function createInternalError(options: InternalErrorOptions): LitefoldCalendarError {
	const phase = options.phase ?? phaseForCode(options.code);
	const values: LitefoldCalendarErrorOptions = {
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
export function createPublicMethodError(
	code: "invalid-argument" | "invalid-state",
	hook: string,
	message: string,
	messages: Readonly<CalendarMessages>,
	isLive: boolean,
	cause?: unknown
): LitefoldCalendarError {
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

/** Identifies a supported render-hook surface. */
export function isRenderHookSurface(value: unknown): value is CalendarSurface {
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
		case "extension-failed": return "integration";
		case "render-hook-failed": return "render";
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
