import type { CalendarEventInput, CalendarEventSource, CalendarOptions } from "../../types.js";
import {
	createConfigurationError,
	readConfigurationValue,
	snapshotConfigurationArray
} from "./configuration.js";
import { isLitefoldCalendarError, isRecord } from "./safety.js";

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
