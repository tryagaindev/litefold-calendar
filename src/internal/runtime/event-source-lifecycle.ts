import { reportCalendarError, type CalendarRangeBounds } from "../../errors.js";
import type { CalendarMessages } from "../../messages.js";
import type { NormalizedCalendarEvent } from "../domain/event-normalization.js";
import type { InternalErrorOptions } from "./state.js";
import { isLitefoldCalendarError } from "./safety.js";

/** Immutable ownership token for one visible-range source request. */
export interface VisibleEventRequest {
	readonly bounds: Readonly<CalendarRangeBounds>;
	readonly controller: AbortController;
	readonly generation: number;
	readonly hasRetainedSnapshot: boolean;
	readonly rangeKey: string;
	readonly userRetry: boolean;
}

/** Mutates busy attributes only while the owning request remains current. */
export function setVisibleEventBusyState(
	host: HTMLElement,
	grid: HTMLElement | null,
	busy: boolean,
	isCurrent: () => boolean
): boolean {
	for (const element of [host, grid]) {
		if (element === null || !isCurrent()) {
			return element === null ? isCurrent() : false;
		}
		if (busy) {
			element.setAttribute("aria-busy", "true");
		} else {
			element.removeAttribute("aria-busy");
		}
		if (!isCurrent()) {
			return false;
		}
	}
	return true;
}

/** Attaches both terminal handlers before the coordinator publishes loading callbacks. */
export function observeVisibleEventRequest<TMetadata>(
	events: Promise<readonly Readonly<NormalizedCalendarEvent<TMetadata>>[]>,
	onFulfilled: (events: readonly Readonly<NormalizedCalendarEvent<TMetadata>>[]) => void,
	onRejected: (cause: unknown) => void,
	onObserverFailure: (cause: unknown) => void
): void {
	try {
		void events.then(
			(values) => { invokeTerminalObserver(onFulfilled, values, onObserverFailure); },
			(cause: unknown) => { invokeTerminalObserver(onRejected, cause, onObserverFailure); }
		);
	} catch (cause: unknown) {
		reportTerminalObserverFailure(cause, onObserverFailure);
	}
}

function invokeTerminalObserver<TValue>(
	observer: (value: TValue) => void,
	value: TValue,
	onObserverFailure: (cause: unknown) => void
): void {
	try {
		observer(value);
	} catch (cause: unknown) {
		reportTerminalObserverFailure(cause, onObserverFailure);
	}
}

function reportTerminalObserverFailure(
	cause: unknown,
	onObserverFailure: (cause: unknown) => void
): void {
	try {
		onObserverFailure(cause);
	} catch (observerFailure: unknown) {
		reportCalendarError(new AggregateError(
			[cause, observerFailure],
			"An asynchronous event-source terminal callback and its fatal observer both failed."
		));
	}
}

/** Builds the shared typed error inputs for current and stale source failures. */
export function createEventSourceErrorOptions(options: {
	readonly cause: unknown;
	readonly messages: Readonly<CalendarMessages>;
	readonly range: Readonly<CalendarRangeBounds>;
	readonly retained: boolean;
	readonly stale: boolean;
}): Readonly<InternalErrorOptions> {
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
