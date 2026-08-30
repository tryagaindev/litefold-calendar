import { normalizeCalendarEvents, type NormalizedCalendarEvent } from "../domain/event-normalization.js";
import type {
	CalendarEventInput,
	CalendarEvents,
	CalendarEventSource,
	CalendarOptions,
	CalendarRange
} from "../../types.js";
import {
	createConfigurationError,
	readConfigurationValue,
	snapshotConfigurationArray
} from "./configuration.js";
import { isLitefoldCalendarError, isRecord } from "./safety.js";

/** The independently classified result of one event-source invocation. */
export type CalendarEventRequest<TMetadata> =
	| {
		readonly events: readonly Readonly<NormalizedCalendarEvent<TMetadata>>[];
		readonly timing: "synchronous";
	}
	| {
		readonly events: Promise<readonly Readonly<NormalizedCalendarEvent<TMetadata>>[]>;
		readonly timing: "asynchronous";
	};

const EVENT_INPUT_KEYS = Object.freeze([
	"accentColor",
	"end",
	"id",
	"metadata",
	"start",
	"title",
	"url"
] as const satisfies readonly (keyof CalendarEventInput)[]);

/** Resolves a static source snapshot or provider from validated calendar options. */
export function resolveCalendarEvents<TMetadata>(
	options: Record<PropertyKey, unknown>
): CalendarOptions<TMetadata>["events"] {
	const value = readConfigurationValue(options, "events", "events");

	let isArray: boolean;
	try {
		isArray = Array.isArray(value);
	} catch (cause: unknown) {
		throw createConfigurationError("events could not be inspected.", cause);
	}
	if (!isArray) {
		if (typeof value !== "function") {
			throw createConfigurationError("events must be an array or function.");
		}
		return value as CalendarEventSource<TMetadata>;
	}

	try {
		const events = snapshotConfigurationArray(
			value as readonly CalendarEventInput<TMetadata>[],
			"events",
			true
		);
		return Object.freeze(events.map((event, index) =>
			snapshotStaticEvent<TMetadata>(event, `events[${index.toString()}]`)
		));
	} catch (cause: unknown) {
		if (isLitefoldCalendarError(cause)) {
			throw cause;
		}
		throw createConfigurationError("events array could not be snapshotted.", cause);
	}
}

/** Invokes and normalizes one source result without changing its synchronous or asynchronous timing. */
export function requestCalendarEvents<TMetadata>(
	events: CalendarEvents<TMetadata>,
	range: Readonly<CalendarRange>,
	maximum: number,
	baseUrl: string
): Readonly<CalendarEventRequest<TMetadata>> {
	const result = typeof events === "function"
		? invokeCalendarEventSource(events, range)
		: events;
	let isArray: boolean;
	try {
		isArray = Array.isArray(result);
	} catch {
		return Object.freeze({
			events: normalizeCalendarEvents<TMetadata>(result, maximum, baseUrl),
			timing: "synchronous" as const
		});
	}
	if (isArray) {
		return Object.freeze({
			events: normalizeCalendarEvents<TMetadata>(result, maximum, baseUrl),
			timing: "synchronous" as const
		});
	}

	const then = readThen(result);
	if (then === null) {
		return Object.freeze({
			events: normalizeCalendarEvents<TMetadata>(result, maximum, baseUrl),
			timing: "synchronous" as const
		});
	}

	const pending = observeSourceThenable(result, then).then((values) =>
		normalizeCalendarEvents<TMetadata>(values, maximum, baseUrl)
	);
	return Object.freeze({ events: pending, timing: "asynchronous" as const });
}

/** Snapshots supported event fields while preserving opaque metadata by reference. */
function snapshotStaticEvent<TMetadata>(
	value: unknown,
	path: string
): CalendarEventInput<TMetadata> {
	if (!isRecord(value)) {
		return value as CalendarEventInput<TMetadata>;
	}

	const snapshot: Partial<Record<keyof CalendarEventInput<TMetadata>, unknown>> = {};
	for (const key of EVENT_INPUT_KEYS) {
		const field = readConfigurationValue(value, key, `${path}.${key}`);
		if (field !== undefined) {
			snapshot[key] = field;
		}
	}
	return Object.freeze(snapshot) as CalendarEventInput<TMetadata>;
}

function invokeCalendarEventSource<TMetadata>(
	source: CalendarEventSource<TMetadata>,
	range: Readonly<CalendarRange>
): unknown {
	return Reflect.apply(source, undefined, [range]);
}

function readThen(value: unknown): ((...argumentsList: unknown[]) => unknown) | null {
	if ((typeof value !== "object" || value === null) && typeof value !== "function") {
		return null;
	}
	const then = Reflect.get(value, "then") as unknown;
	return typeof then === "function"
		? then as (...argumentsList: unknown[]) => unknown
		: null;
}

function observeSourceThenable(
	value: unknown,
	then: (...argumentsList: unknown[]) => unknown
): Promise<unknown> {
	return new Promise((resolve, reject) => {
		try {
			Reflect.apply(then, value, [resolve, reject]);
		} catch (cause: unknown) {
			//eslint-disable-next-line @typescript-eslint/prefer-promise-reject-errors -- Preserve arbitrary source rejection values as the public error cause.
			reject(cause);
		}
	});
}
