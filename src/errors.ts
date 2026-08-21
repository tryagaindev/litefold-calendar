/** Whether error presentation stays with the calendar (`"default"`) or transfers to the application (`"handled"`). */
export type CalendarErrorDisposition = "default" | "handled";

/** Stable machine-readable categories for failures raised by litefold-calendar. */
export type CalendarErrorCode =
	| "invalid-configuration"
	| "invalid-argument"
	| "invalid-state"
	| "event-source-failed"
	| "event-data-invalid"
	| "event-limit-exceeded"
	| "extension-failed"
	| "action-failed"
	| "host-integration-failed"
	| "internal-error";

/** The operation in which a calendar error originated. */
export type CalendarErrorPhase =
	| "configuration"
	| "argument"
	| "state"
	| "source"
	| "validation"
	| "extension"
	| "action"
	| "integration"
	| "render"
	| "destroy";

/** The user-facing importance assigned to a calendar error. */
export type CalendarErrorSeverity = "warning" | "error" | "fatal";

/** A calendar rendering surface used by extensions and contextual errors. */
export type CalendarSurface = "day" | "grid-summary" | "agenda";

/** Inclusive start and exclusive end bounds without request-control state. */
export interface CalendarRangeBounds {
	/** Exclusive strict civil-date end of the range. */
	readonly end: string;
	/** Inclusive strict civil-date start of the range. */
	readonly start: string;
}

/** Immutable construction values for a {@link LitefoldCalendarError}. */
export interface LitefoldCalendarErrorOptions {
	/** Original thrown value retained for trusted diagnostics, when available. */
	readonly cause?: unknown;
	/** Stable machine-readable failure category. */
	readonly code: CalendarErrorCode;
	/** Zero-based source-event index associated with validation, when known. */
	readonly eventIndex?: number;
	/** Trusted extension identifier associated with the failure, when applicable. */
	readonly extensionId?: string;
	/** Trusted lifecycle or action hook name associated with the failure, when applicable. */
	readonly hook?: string;
	/** Developer-facing diagnostic message that must not be rendered to end users. */
	readonly message: string;
	/** Operation in which the failure originated. */
	readonly phase: CalendarErrorPhase;
	/** Inclusive/exclusive request range associated with the failure, when applicable. */
	readonly range?: CalendarRangeBounds;
	/** Whether this instance may remain usable or recover through a later valid operation; this does not promise Retry UI. */
	readonly recoverable: boolean;
	/** User-facing importance of the failure. */
	readonly severity: CalendarErrorSeverity;
	/** Whether the failure belongs to work superseded by a newer request. */
	readonly stale?: boolean;
	/** Rendering surface associated with the failure, when applicable. */
	readonly surface?: CalendarSurface;
	/** Localized message safe to present to an end user. */
	readonly userMessage: string;
	/** Localized heading safe to present to an end user. */
	readonly userTitle: string;
}

/** A safe issue summary exposed through {@link CalendarState}. */
export interface CalendarIssue {
	/** Stable machine-readable failure category. */
	readonly code: CalendarErrorCode;
	/** Localized message safe to present to an end user. */
	readonly message: string;
	/** Whether this instance may remain usable or recover through a later valid operation; this does not promise Retry UI. */
	readonly recoverable: boolean;
	/** User-facing importance of the issue. */
	readonly severity: CalendarErrorSeverity;
	/** Localized heading safe to present to an end user. */
	readonly title: string;
}

/**
 * A typed calendar failure containing separate diagnostic and user-safe text.
 *
 * The original failure remains available through `cause` for trusted application diagnostics. Causes, stack traces,
 * extension identifiers, and hook names must never be copied into rendered output or calendar state.
 */
export class LitefoldCalendarError extends Error {
	/** Stable machine-readable failure category. */
	public readonly code: CalendarErrorCode;

	/** Zero-based source-event index associated with validation, when known. */
	public readonly eventIndex: number | undefined;

	/** Trusted extension identifier associated with the failure, when applicable. */
	public readonly extensionId: string | undefined;

	/** Trusted lifecycle or action hook name associated with the failure, when applicable. */
	public readonly hook: string | undefined;

	/** Operation in which the failure originated. */
	public readonly phase: CalendarErrorPhase;

	/** Inclusive/exclusive request range associated with the failure, when applicable. */
	public readonly range: Readonly<CalendarRangeBounds> | undefined;

	/** Whether this instance may remain usable or recover through a later valid operation; this does not promise Retry UI. */
	public readonly recoverable: boolean;

	/** User-facing importance of the failure. */
	public readonly severity: CalendarErrorSeverity;

	/** Whether the failure belongs to work superseded by a newer request. */
	public readonly stale: boolean;

	/** Rendering surface associated with the failure, when applicable. */
	public readonly surface: CalendarSurface | undefined;

	/** Localized text safe to present to an end user. */
	public readonly userMessage: string;

	/** Localized heading safe to present to an end user. */
	public readonly userTitle: string;

	/** Creates an immutable typed calendar error. */
	public constructor(options: Readonly<LitefoldCalendarErrorOptions>) {
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
export function toCalendarIssue(error: LitefoldCalendarError): Readonly<CalendarIssue> {
	return Object.freeze({
		code: error.code,
		message: error.userMessage,
		recoverable: error.recoverable,
		severity: error.severity,
		title: error.userTitle
	});
}

/** Identifies abort failures without depending on a realm-specific `DOMException` constructor. */
export function isAbortError(error: unknown): boolean {
	if (typeof error !== "object" || error === null) {
		return false;
	}

	try {
		return Reflect.get(error, "name") === "AbortError";
	} catch {
		//Hostile proxies and throwing accessors are ordinary non-abort failures.
		return false;
	}
}

/** Converts an arbitrary thrown value into an `Error` while preserving the original value as its cause. */
export function toError(error: unknown, message = "An unknown calendar error occurred."): Error {
	try {
		if (error instanceof Error) {
			return error;
		}
	} catch {
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
export function reportCalendarError(error: unknown): void {
	const reportedError = toError(error);
	let reportErrorCandidate: unknown;
	try {
		reportErrorCandidate = Reflect.get(globalThis, "reportError");
	} catch (reporterLookupFailure: unknown) {
		queueReportedError(new AggregateError(
			[reportedError, reporterLookupFailure],
			"The platform error reporter could not be resolved."
		));
		return;
	}
	if (typeof reportErrorCandidate === "function") {
		try {
			Reflect.apply(reportErrorCandidate, globalThis, [reportedError]);
		} catch (reporterFailure: unknown) {
			queueReportedError(new AggregateError(
				[reportedError, reporterFailure],
				"The platform error reporter failed while reporting a calendar error."
			));
		}
		return;
	}

	queueReportedError(reportedError);
}

function queueReportedError(error: Error): void {
	try {
		queueMicrotask(() => {
			throw error;
		});
	} catch {
		//Do not allow a replaced or failing queueMicrotask implementation to break package UI synchronously.
		try {
			void Promise.resolve().then(() => {
				throw error;
			});
		} catch {
			//Both platform reporting mechanisms are hostile; error presentation must still remain intact.
		}
	}
}
